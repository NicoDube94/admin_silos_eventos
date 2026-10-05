import { createHmac, timingSafeEqual } from 'node:crypto'
import { sendWhatsAppText } from './whatsapp.js'
import { recordWhatsAppStatus } from './whatsappStatus.js'

const processedMessageIds = new Set()
const maxProcessedMessageIds = 1000

function normalizePhoneNumber(value) {
  return String(value || '').replace(/\D/g, '')
}

function rememberMessage(messageId) {
  if (!messageId) return true
  if (processedMessageIds.has(messageId)) return false
  processedMessageIds.add(messageId)
  if (processedMessageIds.size > maxProcessedMessageIds) {
    processedMessageIds.delete(processedMessageIds.values().next().value)
  }
  return true
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
  const normalizedPhone = normalizePhoneNumber(phoneNumber)
  const [clients] = await database.execute(
    'SELECT id, telefono_whatsapp, nombre_tutor, nombre_cumpleanero FROM clientes WHERE activo = 1',
  )
  return clients.find((client) => normalizePhoneNumber(client.telefono_whatsapp) === normalizedPhone) || null
}

async function getAvisoTest(database) {
  const [offers] = await database.execute(
    `SELECT nombre_oferta, cuerpo_mensaje
     FROM plantillas_mensajes
    WHERE activa = 1 AND eliminada = 0 AND LOWER(TRIM(nombre_oferta)) = ?
     ORDER BY id DESC
     LIMIT 1`,
    ['aviso test'],
  )
  return offers[0] || null
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
  if (!rememberMessage(message.id)) return { processed: false, reason: 'duplicate' }
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

  if (!reply || !isAffirmativeReply(reply)) {
    return { processed: false, reason: 'unsupported_reply' }
  }

  if (!client) {
    await sendText(phoneNumber, '¡Gracias por tu interés! Un integrante del equipo del salón se comunicará contigo.')
    return { processed: true, action: 'unknown_client' }
  }

  const offer = await getAvisoTest(database)
  const messageText = offer
    ? renderMessage(offer.cuerpo_mensaje, client)
    : 'Gracias por tu interés. En este momento no encontramos la oferta solicitada; pronto nos comunicaremos contigo.'
  const result = await sendText(phoneNumber, messageText)
  return {
    processed: true,
    action: offer ? 'offer_sent' : 'offer_not_found',
    clientId: client.id,
    offerName: offer?.nombre_oferta ?? null,
    messageId: result.messageId,
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
        results.push(await processIncomingMessage(message, database, sendText))
      }
      for (const status of change.value?.statuses || []) {
        results.push(await processMessageStatus(status, database))
      }
    }
  }
  return results
}
