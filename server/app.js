import express from 'express'
import { getPool, isDatabaseConfigured } from './db.js'
import { ApiError, parseId, validateClient, validateSettings, validateTemplate, validateTheme } from './validation.js'
import { sendWhatsAppTemplate, sendWhatsAppText } from './whatsapp.js'
import { handleWhatsAppWebhook, verifyWebhookSignature } from './whatsappWebhook.js'
import { deleteTemplate, saveTemplate as saveTemplateRecord, setTemplateActive } from './templateService.js'

const app = express()
const asyncRoute = (handler) => (request, response, next) => {
  Promise.resolve(handler(request, response, next)).catch(next)
}

const clientQuery = `
  SELECT
    c.id,
    c.nombre_tutor,
    c.telefono_whatsapp,
    c.nombre_cumpleanero,
    DATE_FORMAT(c.fecha_nacimiento, '%Y-%m-%d') AS fecha_nacimiento,
    c.activo,
    COALESCE(h.aviso_1_enviado, 0) AS aviso_1_enviado,
    COALESCE(h.aviso_2_enviado, 0) AS aviso_2_enviado,
    COALESCE(h.aviso_3_enviado, 0) AS aviso_3_enviado,
    COALESCE(cs.cantidad_notificaciones, 3) AS cantidad_notificaciones
  FROM clientes c
  LEFT JOIN (
    SELECT
      cliente_id,
      anio_festejo,
      MAX(CASE WHEN numero_notificacion = 1 AND estado = 'enviado' THEN 1 ELSE 0 END) AS aviso_1_enviado,
      MAX(CASE WHEN numero_notificacion = 2 AND estado = 'enviado' THEN 1 ELSE 0 END) AS aviso_2_enviado,
      MAX(CASE WHEN numero_notificacion = 3 AND estado = 'enviado' THEN 1 ELSE 0 END) AS aviso_3_enviado
    FROM historial_notificaciones
    GROUP BY cliente_id, anio_festejo
  ) h ON h.cliente_id = c.id
    AND h.anio_festejo = CASE
      WHEN DATE_FORMAT(c.fecha_nacimiento, '%m-%d') < DATE_FORMAT(CURRENT_DATE(), '%m-%d')
      THEN YEAR(CURRENT_DATE()) + 1
      ELSE YEAR(CURRENT_DATE())
    END
  LEFT JOIN configuracion_sistema cs ON cs.id = 1
`

function mapClient(row) {
  const notificationCount = Number(row.cantidad_notificaciones)
  return {
    id: Number(row.id),
    tutor: row.nombre_tutor,
    telefono: row.telefono_whatsapp,
    cumpleanero: row.nombre_cumpleanero,
    fechaNacimiento: row.fecha_nacimiento,
    avisos: Array.from({ length: notificationCount }, (_, index) => (
      Number(row[`aviso_${index + 1}_enviado`]) === 1 ? 'enviado' : 'pendiente'
    )),
    activo: Boolean(row.activo),
  }
}

async function getClientById(database, id) {
  const [rows] = await database.execute(`${clientQuery} WHERE c.id = ? LIMIT 1`, [id])
  return rows[0] ? mapClient(rows[0]) : null
}

function requireDatabase() {
  if (!isDatabaseConfigured()) {
    throw new ApiError(503, 'La API está activa, pero faltan credenciales DB_* en el archivo .env.')
  }
  return getPool()
}

app.use(express.json({
  limit: '32kb',
  verify: (request, _response, buffer) => {
    request.rawBody = buffer
  },
}))

app.get('/api/health', asyncRoute(async (_request, response) => {
  if (!isDatabaseConfigured()) {
    return response.status(503).json({ status: 'disconnected', configured: false })
  }
  await getPool().query('SELECT 1')
  return response.json({ status: 'connected', configured: true })
}))

app.post('/api/whatsapp/test', asyncRoute(async (request, response) => {
  const message = typeof request.body?.mensaje === 'string' ? request.body.mensaje.trim() : ''
  if (!message || message.length > 1024) {
    throw new ApiError(400, 'El mensaje de prueba debe tener entre 1 y 1024 caracteres.')
  }
  if (!process.env.WHATSAPP_TO) {
    throw new ApiError(503, 'Falta WHATSAPP_TO en .env para definir el destinatario de prueba.')
  }
  const result = await sendWhatsAppText(process.env.WHATSAPP_TO, message)
  response.json({ enviado: true, ...result })
}))

app.post('/api/whatsapp/test-template', asyncRoute(async (request, response) => {
  if (!process.env.WHATSAPP_TO) {
    throw new ApiError(503, 'Falta WHATSAPP_TO en .env para definir el destinatario de prueba.')
  }
  const parameters = request.body?.parameters || []
  if (!Array.isArray(parameters) || parameters.length > 10 || parameters.some((value) => typeof value !== 'string' || !value.trim())) {
    throw new ApiError(400, 'Los parámetros de plantilla deben ser una lista de hasta 10 textos no vacíos.')
  }
  const headerImage = request.body?.headerImage
  if (headerImage !== undefined && (!headerImage || typeof headerImage !== 'object' || Array.isArray(headerImage))) {
    throw new ApiError(400, 'headerImage debe ser un objeto con link o id.')
  }
  const templateName = process.env.PLANTILLA_WHATSAPP || 'PLANTILLA_WHATSAPP'
  const language = process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'es_AR'
  const result = await sendWhatsAppTemplate(process.env.WHATSAPP_TO, templateName, language, { parameters, headerImage })
  response.json({ enviado: true, tipo: 'plantilla', ...result })
}))

app.get('/api/webhooks/whatsapp', (request, response) => {
  const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN
  const mode = request.query['hub.mode']
  const token = request.query['hub.verify_token']
  const challenge = request.query['hub.challenge']
  if (mode === 'subscribe' && verifyToken && token === verifyToken) {
    return response.status(200).send(challenge)
  }
  return response.sendStatus(403)
})

app.post('/api/webhooks/whatsapp', asyncRoute(async (request, response) => {
  if (!verifyWebhookSignature(request.rawBody || Buffer.from(''), request.get('x-hub-signature-256'))) {
    throw new ApiError(403, 'Firma de webhook inválida.')
  }
  const results = await handleWhatsAppWebhook(request.body, requireDatabase())
  response.json({ received: true, results })
}))

app.get('/api/clients', asyncRoute(async (request, response) => {
  const database = requireDatabase()
  const includeInactive = request.query.includeInactive === 'true'
  const [rows] = await database.execute(
    `${clientQuery} WHERE (? = 1 OR c.activo = 1) ORDER BY DATE_FORMAT(c.fecha_nacimiento, '%m-%d'), c.id`,
    [includeInactive ? 1 : 0],
  )
  response.json(rows.map(mapClient))
}))

app.get('/api/notifications', asyncRoute(async (_request, response) => {
  const database = requireDatabase()
  const [rows] = await database.execute(
    `SELECT
      h.id,
      h.cliente_id,
      c.nombre_tutor,
      c.nombre_cumpleanero,
      h.numero_notificacion,
      DATE_FORMAT(h.fecha_envio, '%Y-%m-%dT%H:%i:%sZ') AS fecha_envio,
      COALESCE(h.plantilla_id, plantilla_actual.id) AS plantilla_id,
      COALESCE(plantilla_guardada.nombre_oferta, plantilla_actual.nombre_oferta, CONCAT('Aviso ', h.numero_notificacion)) AS nombre_plantilla,
      COALESCE(h.mensaje_enviado, plantilla_guardada.cuerpo_mensaje, plantilla_actual.cuerpo_mensaje, '') AS cuerpo_mensaje
    FROM historial_notificaciones h
    JOIN clientes c ON c.id = h.cliente_id
    LEFT JOIN plantillas_mensajes plantilla_guardada ON plantilla_guardada.id = h.plantilla_id
    LEFT JOIN (
      SELECT plantilla.*
      FROM plantillas_mensajes plantilla
      JOIN (
        SELECT numero_aviso, MAX(id) AS id
        FROM plantillas_mensajes
        WHERE activa = 1
        GROUP BY numero_aviso
      ) ultima ON ultima.id = plantilla.id
    ) plantilla_actual ON plantilla_actual.numero_aviso = h.numero_notificacion
    WHERE h.estado = 'enviado'
    ORDER BY h.fecha_envio DESC, h.id DESC
    LIMIT 100`,
  )
  response.json(rows.map((row) => ({
    id: Number(row.id),
    clienteId: Number(row.cliente_id),
    tutor: row.nombre_tutor,
    cumpleanero: row.nombre_cumpleanero,
    numeroAviso: Number(row.numero_notificacion),
    fechaEnvio: row.fecha_envio,
    plantillaId: row.plantilla_id ? Number(row.plantilla_id) : null,
    nombrePlantilla: row.nombre_plantilla,
    cuerpoMensaje: row.cuerpo_mensaje,
  })))
}))

app.get('/api/whatsapp/statuses', asyncRoute(async (_request, response) => {
  const database = requireDatabase()
  const [rows] = await database.execute(
    `SELECT id, message_id, RIGHT(recipient_id, 4) AS recipient_last_four,
      status, source, event_timestamp, template_name, error_code, error_title,
      error_message, error_details, error_href,
      DATE_FORMAT(received_at, '%Y-%m-%dT%H:%i:%sZ') AS received_at
     FROM whatsapp_message_statuses
     ORDER BY received_at DESC, id DESC
     LIMIT 100`,
  )
  response.json(rows.map((row) => ({
    id: Number(row.id),
    messageId: row.message_id,
    recipientLastFour: row.recipient_last_four,
    status: row.status,
    source: row.source,
    timestamp: row.event_timestamp,
    templateName: row.template_name,
    errorCode: row.error_code,
    errorTitle: row.error_title,
    errorMessage: row.error_message,
    errorDetails: row.error_details,
    errorHref: row.error_href,
    receivedAt: row.received_at,
  })))
}))

app.post('/api/clients', asyncRoute(async (request, response) => {
  const database = requireDatabase()
  const client = validateClient(request.body)
  const [result] = await database.execute(
    'INSERT INTO clientes (nombre_tutor, telefono_whatsapp, nombre_cumpleanero, fecha_nacimiento, activo) VALUES (?, ?, ?, ?, 1)',
    [client.tutor, client.telefono, client.cumpleanero, client.fechaNacimiento],
  )
  response.status(201).json(await getClientById(database, result.insertId))
}))

app.put('/api/clients/:id', asyncRoute(async (request, response) => {
  const database = requireDatabase()
  const id = parseId(request.params.id)
  const client = validateClient(request.body)
  await database.execute(
    'UPDATE clientes SET nombre_tutor = ?, telefono_whatsapp = ?, nombre_cumpleanero = ?, fecha_nacimiento = ? WHERE id = ? AND activo = 1',
    [client.tutor, client.telefono, client.cumpleanero, client.fechaNacimiento, id],
  )
  const updatedClient = await getClientById(database, id)
  if (!updatedClient?.activo) throw new ApiError(404, 'No se encontró un cliente activo con ese identificador.')
  response.json(updatedClient)
}))

app.patch('/api/clients/:id/deactivate', asyncRoute(async (request, response) => {
  const database = requireDatabase()
  const id = parseId(request.params.id)
  const [result] = await database.execute('UPDATE clientes SET activo = 0 WHERE id = ? AND activo = 1', [id])
  if (!result.affectedRows) throw new ApiError(404, 'No se encontró un cliente activo con ese identificador.')
  response.json({ id, activo: false })
}))

app.get('/api/settings', asyncRoute(async (_request, response) => {
  const database = requireDatabase()
  const [rows] = await database.execute(
    'SELECT dias_anticipacion, telefono_admin, cantidad_notificaciones, plazos_dias, tema FROM configuracion_sistema WHERE id = 1 LIMIT 1',
  )
  if (!rows[0]) {
    return response.json({ diasAnticipacion: 60, telefonoAdmin: '', cantidadNotificaciones: 3, plazosDias: 15, tema: 'light' })
  }
  const row = rows[0]
  response.json({
    diasAnticipacion: Number(row.dias_anticipacion),
    telefonoAdmin: row.telefono_admin,
    cantidadNotificaciones: Number(row.cantidad_notificaciones),
    plazosDias: Number(row.plazos_dias),
    tema: row.tema === 'dark' ? 'dark' : 'light',
  })
}))

app.patch('/api/settings/theme', asyncRoute(async (request, response) => {
  const database = requireDatabase()
  const theme = validateTheme(request.body)
  await database.execute(
    `INSERT INTO configuracion_sistema
      (id, dias_anticipacion, telefono_admin, cantidad_notificaciones, plazos_dias, tema)
     VALUES (1, 60, '', 3, 15, ?)
     ON DUPLICATE KEY UPDATE tema = VALUES(tema)`,
    [theme],
  )
  response.json({ tema: theme })
}))

app.put('/api/settings', asyncRoute(async (request, response) => {
  const database = requireDatabase()
  const settings = validateSettings(request.body)
  await database.execute(
    `INSERT INTO configuracion_sistema (id, dias_anticipacion, telefono_admin, cantidad_notificaciones, plazos_dias)
     VALUES (1, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE dias_anticipacion = VALUES(dias_anticipacion), telefono_admin = VALUES(telefono_admin), cantidad_notificaciones = VALUES(cantidad_notificaciones), plazos_dias = VALUES(plazos_dias)`,
    [settings.diasAnticipacion, settings.telefonoAdmin, settings.cantidadNotificaciones, settings.plazosDias],
  )
  response.json(settings)
}))

app.get('/api/templates', asyncRoute(async (_request, response) => {
  const database = requireDatabase()
  const [rows] = await database.execute(
    'SELECT id, nombre_oferta, cuerpo_mensaje, numero_aviso, activa FROM plantillas_mensajes WHERE eliminada = 0 ORDER BY creado_el DESC, id DESC',
  )
  response.json(rows.map((row) => ({
    id: Number(row.id),
    nombreOferta: row.nombre_oferta,
    cuerpoMensaje: row.cuerpo_mensaje,
    numeroAviso: Number(row.numero_aviso),
    activa: Boolean(row.activa),
  })))
}))

app.post('/api/templates', asyncRoute(async (request, response) => {
  const database = requireDatabase()
  const template = validateTemplate(request.body)
  const result = await saveTemplateRecord(database, null, template)
  response.status(201).json({ ...result.template, desactivadas: result.desactivadas })
}))

app.put('/api/templates/:id', asyncRoute(async (request, response) => {
  const database = requireDatabase()
  const id = parseId(request.params.id)
  const template = validateTemplate(request.body)
  const result = await saveTemplateRecord(database, id, template)
  response.json({ ...result.template, desactivadas: result.desactivadas })
}))

app.patch('/api/templates/:id/active', asyncRoute(async (request, response) => {
  const database = requireDatabase()
  const id = parseId(request.params.id)
  if (typeof request.body?.activa !== 'boolean') {
    throw new ApiError(400, 'El campo activa debe ser verdadero o falso.')
  }
  const result = await setTemplateActive(database, id, request.body.activa)
  response.json({ ...result.plantilla, desactivadas: result.desactivadas })
}))

app.delete('/api/templates/:id', asyncRoute(async (request, response) => {
  const database = requireDatabase()
  const id = parseId(request.params.id)
  response.json(await deleteTemplate(database, id))
}))

app.use((_request, _response, next) => next(new ApiError(404, 'No se encontró el recurso solicitado.')))

app.use((error, _request, response, _next) => {
  if (error.meta) {
    console.error('Meta rechazó una solicitud de WhatsApp:', JSON.stringify(error.meta))
  } else if (!error.status) {
    console.error('Error de API:', error.code || error.name)
  }
  const connectionErrorCodes = new Set([
    'DATABASE_NOT_CONFIGURED',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'EHOSTUNREACH',
    'ENOTFOUND',
    'ER_ACCESS_DENIED_ERROR',
    'PROTOCOL_CONNECTION_LOST',
  ])
  const status = error.status || (connectionErrorCodes.has(error.code) ? 503 : 500)
  const message = error.status
    ? error.message
    : status === 503
      ? 'No se pudo conectar con la base de datos. Revisa la configuración DB_* y el esquema SQL.'
      : 'Ocurrió un error interno en la API.'
  response.status(status).json({
    error: message,
    ...(error.meta ? { metaError: error.meta } : {}),
  })
})

export default app
