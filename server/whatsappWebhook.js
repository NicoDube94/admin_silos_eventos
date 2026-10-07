import { createHmac, timingSafeEqual } from 'node:crypto'
import { sendWhatsAppText } from './whatsapp.js'
import { recordWhatsAppStatus } from './whatsappStatus.js'

const processedMessageIds = new Set()
const processingMessageIds = new Set()
const maxProcessedMessageIds = 1000

function normalizePhoneNumber(value) {
  return String(value || '').replace(/\D/g, '')
}

function normalizeArgentinePhoneNumber(value) {
  let digits = normalizePhoneNumber(value)
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (digits.length === 13 && digits.startsWith('549')) return digits.slice(3)
  if (digits.length === 12 && digits.startsWith('54')) return digits.slice(2)
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1)
  return digits
}

function rememberMessage(messageId) {
  if (!messageId) return
  processedMessageIds.add(messageId)
  if (processedMessageIds.size > maxProcessedMessageIds) {
    processedMessageIds.delete(processedMessageIds.values().next().value)
  }
}

export function verifyWebhookSignature(rawBody, signature, appSecret = process.env.WHATSAPP_APP_SECRET) {
  if (!appSecret) return false
  if (!signature?.startsWith('sha256=')) return false
  const expected = createHmac('sha256', appSecret).update(rawBody).digest('hex')
  const received = signature.slice('sha256='.length)
  const expectedBuffer = Buffer.from(expected, 'utf8')
  const receivedBuffer = Buffer.from(received, 'utf8')
  return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer)
}

function extractButtonReply(message) {
  if (message.type === 'interactive' && message.interactive?.type === 'button_reply') {
    return {
      id: message.interactive.button_reply.id,
      title: message.interactive.button_reply.title,
    }
  }
  if (message.type === 'button') {
    return {
      id: message.button?.payload,
      title: message.button?.text,
    }
  }
  return null
}

function normalizeReply(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function getReplyText(reply) {
  return normalizeReply(`${reply?.id || ''} ${reply?.title || ''}`)
}

function isAffirmativeReply(reply) {
  const value = getReplyText(reply)
  return value.includes('quiero saber mas')
    || value.includes('saber mas')
    || value.includes('mas informacion')
    || /\b(si|yes|aceptar|acepto|confirmar|confirmo)\b/.test(value)
}

function isInterestReply(message, reply) {
  const text = message.type === 'text' ? message.text?.body : ''
  return normalizeReply(`${getReplyText(reply)} ${text}`).includes('quiero saber mas')
}

function isNegativeReply(reply) {
  const value = getReplyText(reply)
  return value.includes('no gracias')
    || /\b(no|cancelar|cancel|rechazar)\b/.test(value)
}

function isNegativeTextMessage(message) {
  if (message.type !== 'text') return false
  const value = normalizeReply(message.text?.body)
  return /^(no|no gracias|no me interesa|no quiero|stop|cancelar)(\b|$)/.test(value)
}

function renderMessage(template, client) {
  return template
    .replaceAll('{{nombre_tutor}}', client.nombre_tutor)
    .replaceAll('{{nombre_cumpleanero}}', client.nombre_cumpleanero)
}

async function getClientByPhone(database, phoneNumber) {
  const normalizedPhone = normalizeArgentinePhoneNumber(phoneNumber)
  const [clients] = await database.execute(
    'SELECT id, telefono_whatsapp, nombre_tutor, nombre_cumpleanero FROM clientes WHERE activo = 1',
  )
  return clients.find((client) => normalizeArgentinePhoneNumber(client.telefono_whatsapp) === normalizedPhone) || null
}

async function getSentNotification(database, client, contextMessageId) {
  const [notifications] = await database.execute(
    `SELECT h.numero_notificacion, h.fecha_envio,
      DATE_FORMAT(h.fecha_envio, '%d/%m/%Y') AS fecha_envio_formateada,
      c.nombre_tutor, s.telefono_admin, s.cantidad_notificaciones,
      COALESCE(oferta.nombre_oferta, CONCAT('Aviso ', h.numero_notificacion)) AS nombre_oferta,
      oferta.cuerpo_mensaje
     FROM historial_notificaciones h
     JOIN clientes c ON c.id = h.cliente_id
     LEFT JOIN configuracion_sistema s ON s.id = 1
     LEFT JOIN plantillas_mensajes oferta ON oferta.id = h.plantilla_id
     WHERE h.cliente_id = ? AND h.estado = 'enviado'
       AND (? IS NULL OR h.whatsapp_message_id = ?)
     ORDER BY h.fecha_envio DESC, h.id DESC
     LIMIT 1`,
    [client.id, contextMessageId || null, contextMessageId || null],
  )
  return notifications[0] || null
}

async function notifyAdminOfInterest(database, notification, sendText) {
  if (!notification.telefono_admin) {
    throw new Error('Falta configurar el teléfono del administrador para notificar el interés del cliente.')
  }
  if (!notification.fecha_envio_formateada) {
    throw new Error('No se pudo obtener la fecha del aviso enviado para notificar al administrador.')
  }
  const noticeCount = Number(notification.cantidad_notificaciones) || notification.numero_notificacion
  const message = `Mensaje enviado a ${notification.nombre_tutor} con el aviso ${notification.numero_notificacion}/${noticeCount} con la promoción de ${notification.nombre_oferta}. Fecha de envío: ${notification.fecha_envio_formateada}`
  const result = await sendText(notification.telefono_admin, message)
  if (!result.messageId) throw new Error('Meta aceptó el aviso al administrador sin devolver un identificador de mensaje.')
  await recordWhatsAppStatus(database, {
    messageId: result.messageId,
    recipientId: notification.telefono_admin,
    status: 'accepted',
    source: 'cloud_api',
    timestamp: new Date().toISOString(),
  })
}

async function sendPendingManualFollowup(database, client, phoneNumber, sendText) {
  const [followups] = await database.execute(
    `SELECT template_name, message_body
     FROM whatsapp_manual_followups
     WHERE client_id = ? AND status = 'pending'
     LIMIT 1`,
    [client.id],
  )
  const followup = followups[0]
  if (!followup) return null

  const [claim] = await database.execute(
    `UPDATE whatsapp_manual_followups
     SET status = 'processing'
     WHERE client_id = ? AND status = 'pending'`,
    [client.id],
  )
  if (!claim.affectedRows) return null

  try {
    const result = await sendText(phoneNumber, followup.message_body)
    await database.execute(
      `UPDATE whatsapp_manual_followups
       SET status = 'sent', completed_at = CURRENT_TIMESTAMP
       WHERE client_id = ? AND status = 'processing'`,
      [client.id],
    )
    return {
      processed: true,
      action: 'manual_followup_sent',
      clientId: Number(client.id),
      templateName: followup.template_name,
      messageId: result.messageId,
    }
  } catch (error) {
    await database.execute(
      `UPDATE whatsapp_manual_followups
       SET status = 'failed', error_details = ?, completed_at = CURRENT_TIMESTAMP
       WHERE client_id = ? AND status = 'processing'`,
      [JSON.stringify({ message: error.message, meta: error.meta ?? null }), client.id],
    )
    throw error
  }
}

async function processIncomingMessage(message, database, sendText) {
  const reply = extractButtonReply(message)
  const phoneNumber = message.from
  const client = await getClientByPhone(database, phoneNumber)

  if (isNegativeReply(reply) || isNegativeTextMessage(message)) {
    if (client) {
      await database.execute(
        `UPDATE whatsapp_manual_followups
         SET status = 'cancelled', completed_at = CURRENT_TIMESTAMP
         WHERE client_id = ? AND status = 'pending'`,
        [client.id],
      )
    }
    await sendText(phoneNumber, 'Gracias por avisarnos. ¡Que tengas un hermoso día! Si cambias de opinión, puedes comunicarte al 2657287394.')
    return { processed: true, action: 'declined', clientId: client?.id ?? null }
  }

  if (client) {
    const followup = await sendPendingManualFollowup(database, client, phoneNumber, sendText)
    if (followup) return followup
  }

  const interestReply = isInterestReply(message, reply)
  if ((!reply || !isAffirmativeReply(reply)) && !interestReply) {
    return { processed: false, reason: 'unsupported_reply' }
  }

  if (!client) {
    await sendText(phoneNumber, '¡Gracias por tu interés! Un integrante del equipo del salón se comunicará contigo.')
    return { processed: true, action: 'unknown_client' }
  }

  const sentNotification = await getSentNotification(database, client, message.context?.id)
  const offer = sentNotification?.cuerpo_mensaje
    ? {
      nombre_oferta: sentNotification.nombre_oferta,
      cuerpo_mensaje: sentNotification.cuerpo_mensaje,
    }
    : null
  const messageText = offer
    ? renderMessage(offer.cuerpo_mensaje, client)
    : 'Gracias por tu interés. En este momento no encontramos la oferta solicitada; pronto nos comunicaremos contigo.'
  const result = await sendText(phoneNumber, messageText)
  if (interestReply && sentNotification && offer) {
    await notifyAdminOfInterest(database, { ...sentNotification, nombre_tutor: client.nombre_tutor }, sendText)
  }
  return {
    processed: true,
    action: offer ? 'offer_sent' : 'offer_not_found',
    clientId: client.id,
    offerName: offer?.nombre_oferta ?? null,
    messageId: result.messageId,
    adminNotified: Boolean(interestReply && sentNotification && offer),
  }
}

async function processIncomingMessageOnce(message, database, sendText) {
  if (!message.id) return processIncomingMessage(message, database, sendText)
  if (processedMessageIds.has(message.id) || processingMessageIds.has(message.id)) {
    return { processed: false, reason: 'duplicate' }
  }
  processingMessageIds.add(message.id)
  try {
    const result = await processIncomingMessage(message, database, sendText)
    rememberMessage(message.id)
    return result
  } finally {
    processingMessageIds.delete(message.id)
  }
}

async function processMessageStatus(status, database) {
  if (!status.id || !status.status) {
    return { processed: false, reason: 'invalid_status' }
  }

  const metaError = status.errors?.[0]
  await recordWhatsAppStatus(database, {
    messageId: status.id,
    recipientId: normalizePhoneNumber(status.recipient_id),
    status: status.status,
    source: 'webhook',
    timestamp: String(status.timestamp || ''),
    error: metaError ? {
      code: metaError.code,
      title: metaError.title,
      message: metaError.message,
      details: metaError.error_data?.details,
      href: metaError.href,
    } : null,
  })
  if (status.status === 'failed') {
    await database.execute(
      `UPDATE historial_notificaciones
       SET estado = 'fallido', detalle_error = ?
       WHERE whatsapp_message_id = ?`,
      [JSON.stringify(metaError || {}), status.id],
    )
    await database.execute(
      `UPDATE whatsapp_manual_followups
       SET status = 'failed', error_details = ?, completed_at = CURRENT_TIMESTAMP
       WHERE primary_message_id = ? AND status = 'pending'`,
      [JSON.stringify(metaError || {}), status.id],
    )
  }

  return {
    processed: true,
    action: 'status_recorded',
    messageId: status.id,
    status: status.status,
  }
}

export async function handleWhatsAppWebhook(payload, database, options = {}) {
  const sendText = options.sendText || sendWhatsAppText
  const results = []
  for (const entry of payload?.entry || []) {
    for (const change of entry.changes || []) {
      for (const message of change.value?.messages || []) {
        results.push(await processIncomingMessageOnce(message, database, sendText))
      }
      for (const status of change.value?.statuses || []) {
        results.push(await processMessageStatus(status, database))
      }
    }
  }
  return results
}
