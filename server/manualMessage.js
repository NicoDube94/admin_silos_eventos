import { readFile } from 'node:fs/promises'
import { sendWhatsAppTemplate, uploadWhatsAppMedia } from './whatsapp.js'
import { recordWhatsAppStatus } from './whatsappStatus.js'

function renderMessage(template, client) {
  return template
    .replaceAll('{{nombre_tutor}}', client.nombre_tutor)
    .replaceAll('{{nombre_cumpleanero}}', client.nombre_cumpleanero)
}

function createError(status, message) {
  const error = new Error(message)
  error.status = status
  return error
}

export async function sendManualWhatsAppMessage(database, clientId, templateId, options = {}) {
  const [clients] = await database.execute(
    `SELECT id, telefono_whatsapp, nombre_tutor, nombre_cumpleanero
     FROM clientes WHERE id = ? AND activo = 1 LIMIT 1`,
    [clientId],
  )
  const client = clients[0]
  if (!client) throw createError(404, 'No se encontró un cliente activo con ese identificador.')

  const [templates] = await database.execute(
    `SELECT id, nombre_oferta, cuerpo_mensaje
     FROM plantillas_mensajes
     WHERE id = ? AND eliminada = 0 LIMIT 1`,
    [templateId],
  )
  const template = templates[0]
  if (!template) throw createError(404, 'No se encontró una plantilla disponible con ese identificador.')

  const templateName = options.templateName ?? process.env.PLANTILLA_WHATSAPP
  if (!templateName) throw createError(503, 'Falta PLANTILLA_WHATSAPP en .env.')
  const language = options.language ?? process.env.WHATSAPP_TEMPLATE_LANGUAGE ?? 'es_AR'
  const messageBody = renderMessage(template.cuerpo_mensaje, client)
  if (messageBody.length > 1024) {
    throw createError(400, 'El mensaje de seguimiento personalizado supera el límite de 1024 caracteres de WhatsApp.')
  }

  try {
    await database.execute(
      'SELECT client_id FROM whatsapp_manual_followups WHERE client_id = ? LIMIT 1',
      [client.id],
    )
  } catch (error) {
    if (error.code !== 'ER_NO_SUCH_TABLE') throw error
    throw createError(
      503,
      'Falta la tabla de seguimientos manuales. Aplica db/migrations/008_manual_message_followups.sql en la base de datos y vuelve a intentar.',
    )
  }

  const image = options.imageBuffer ?? await readFile(new URL('../silos_1.jpg', import.meta.url))
  const upload = options.uploadMedia ?? uploadWhatsAppMedia
  const sendTemplate = options.sendTemplate ?? sendWhatsAppTemplate
  const media = await upload(image, 'silos_1.jpg', 'image/jpeg')

  await database.execute(
    `INSERT INTO whatsapp_manual_followups
      (client_id, template_id, template_name, message_body, status)
     VALUES (?, ?, ?, ?, 'sending')
     ON DUPLICATE KEY UPDATE
       template_id = VALUES(template_id),
       template_name = VALUES(template_name),
       message_body = VALUES(message_body),
       primary_message_id = NULL,
       status = 'sending',
       error_details = NULL,
       created_at = CURRENT_TIMESTAMP,
       completed_at = NULL`,
    [client.id, template.id, template.nombre_oferta, messageBody],
  )

  let result
  try {
    result = await sendTemplate(client.telefono_whatsapp, templateName, language, {
      parameters: [client.nombre_tutor, client.nombre_cumpleanero],
      headerImage: { id: media.mediaId },
    })
    if (!result.messageId) throw new Error('Meta aceptó el envío sin devolver un identificador de mensaje.')

    await recordWhatsAppStatus(database, {
      messageId: result.messageId,
      recipientId: client.telefono_whatsapp,
      status: 'accepted',
      source: 'cloud_api',
      timestamp: new Date().toISOString(),
      templateName,
    })
    await database.execute(
      `UPDATE whatsapp_manual_followups
       SET primary_message_id = ?, status = 'pending'
       WHERE client_id = ? AND status = 'sending'`,
      [result.messageId, client.id],
    )
  } catch (error) {
    await database.execute(
      `UPDATE whatsapp_manual_followups
       SET status = 'failed', error_details = ?, completed_at = CURRENT_TIMESTAMP
       WHERE client_id = ? AND status = 'sending'`,
      [JSON.stringify({ message: error.message, meta: error.meta ?? null }), client.id],
    )
    throw error
  }

  return {
    clientId: Number(client.id),
    templateName,
    messageId: result.messageId,
    followupTemplate: template.nombre_oferta,
  }
}
