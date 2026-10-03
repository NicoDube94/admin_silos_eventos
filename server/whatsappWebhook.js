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

async function processIncomingMessage(message, database, sendText) {
  if (!rememberMessage(message.id)) return { processed: false, reason: 'duplicate' }
  const reply = extractButtonReply(message)
  if (!reply || (!isAffirmativeReply(reply) && !isNegativeReply(reply))) {
    return { processed: false, reason: 'unsupported_reply' }
  }

  const phoneNumber = message.from
  const client = await getClientByPhone(database, phoneNumber)

  if (isNegativeReply(reply)) {
    await sendText(phoneNumber, 'Gracias por avisarnos. ¡Que tengas un hermoso día! Si cambias de opinión, puedes comunicarte al 2657287394.')
    return { processed: true, action: 'declined', clientId: client?.id ?? null }
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
