import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { once } from 'node:events'
import test from 'node:test'
import app from './app.js'
import { handleWhatsAppWebhook, verifyWebhookSignature } from './whatsappWebhook.js'

function createDatabase(sentNotification = null) {
  const statusRecords = []
  const failedHistoryRecords = []
  const notificationLookups = []
  return {
    statusRecords,
    failedHistoryRecords,
    notificationLookups,
    async execute(query, parameters) {
      if (query.startsWith('SELECT h.numero_notificacion')) {
        notificationLookups.push(parameters)
        return [sentNotification ? [sentNotification] : []]
      }
      if (query.startsWith('SELECT id, telefono_whatsapp')) {
        return [[{ id: 8, telefono_whatsapp: '+54 9 11 1234-5678', nombre_tutor: 'Ana', nombre_cumpleanero: 'Sofia' }]]
      }
      if (query.includes('FROM whatsapp_manual_followups')) return [[]]
      if (query.startsWith('INSERT INTO whatsapp_message_statuses')) {
        statusRecords.push(parameters)
        return [{ affectedRows: 1 }]
      }
      if (query.includes('UPDATE historial_notificaciones')) {
        failedHistoryRecords.push(parameters)
        return [{ affectedRows: 1 }]
      }
      if (query.includes('UPDATE whatsapp_manual_followups')) return [{ affectedRows: 1 }]
      throw new Error(`Consulta inesperada: ${query}`)
    },
  }
}

function payload(message) {
  return { entry: [{ changes: [{ value: { messages: [message] } }] }] }
}

test('Meta GET verification returns the raw challenge only for the exact verify token', async () => {
  const previousToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN
  process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = 'local-test-token'
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/webhooks/whatsapp`

  try {
    const validUrl = new URL(baseUrl)
    validUrl.searchParams.set('hub.mode', 'subscribe')
    validUrl.searchParams.set('hub.verify_token', 'local-test-token')
    validUrl.searchParams.set('hub.challenge', 'challenge-12345')
    const validResponse = await fetch(validUrl)
    assert.equal(validResponse.status, 200)
    assert.equal(await validResponse.text(), 'challenge-12345')
    assert.doesNotMatch(validResponse.headers.get('content-type'), /application\/json/)

    const invalidTokenUrl = new URL(validUrl)
    invalidTokenUrl.searchParams.set('hub.verify_token', 'wrong-token')
    const invalidTokenResponse = await fetch(invalidTokenUrl)
    assert.equal(invalidTokenResponse.status, 403)

    const invalidModeUrl = new URL(validUrl)
    invalidModeUrl.searchParams.set('hub.mode', 'unsubscribe')
    const invalidModeResponse = await fetch(invalidModeUrl)
    assert.equal(invalidModeResponse.status, 403)
  } finally {
    server.close()
    await once(server, 'close')
    if (previousToken === undefined) delete process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN
    else process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = previousToken
  }
})

test('verifies Meta webhook signatures', () => {
  const body = Buffer.from('{"entry":[]}')
  const signature = `sha256=${createHmac('sha256', 'secret').update(body).digest('hex')}`
  assert.equal(verifyWebhookSignature(body, signature, 'secret'), true)
  assert.equal(verifyWebhookSignature(body, 'sha256=invalid', 'secret'), false)
})

test('persists WhatsApp delivery statuses and Meta failure details', async () => {
  const database = createDatabase()
  const results = await handleWhatsAppWebhook({
    entry: [{ changes: [{ value: { statuses: [{
      id: 'wamid.failed',
      status: 'failed',
      timestamp: '1790961300',
      recipient_id: '5491234567890',
      errors: [{
        code: 131047,
        title: 'Re-engagement message',
        message: 'Message failed',
        error_data: { details: 'Recipient is not available on WhatsApp' },
        href: 'https://example.test/meta-error',
      }],
    }] } }] }],
  }, database)

  assert.deepEqual(results, [{
    processed: true,
    action: 'status_recorded',
    messageId: 'wamid.failed',
    status: 'failed',
  }])
  assert.deepEqual(database.statusRecords, [[
    'wamid.failed',
    '5491234567890',
    'failed',
    'webhook',
    '1790961300',
    null,
    '131047',
    'Re-engagement message',
    'Message failed',
    'Recipient is not available on WhatsApp',
    'https://example.test/meta-error',
  ]])
  assert.deepEqual(database.failedHistoryRecords, [[
    JSON.stringify({
      code: 131047,
      title: 'Re-engagement message',
      message: 'Message failed',
      error_data: { details: 'Recipient is not available on WhatsApp' },
      href: 'https://example.test/meta-error',
    }),
    'wamid.failed',
  ]])
})

test('sends the notice-specific offer and notifies the admin after “Quiero saber más”', async () => {
  const sent = []
  const database = createDatabase({
    numero_notificacion: 1,
    fecha_envio_formateada: '05/10/2026',
    nombre_tutor: 'Ana',
    telefono_admin: '5492222222222',
    cantidad_notificaciones: 2,
    nombre_oferta: 'Celebración anticipada',
    cuerpo_mensaje: 'Hola {{nombre_tutor}}, {{nombre_cumpleanero}} tiene una oferta.',
  })
  const results = await handleWhatsAppWebhook(payload({
    id: 'message-yes',
    from: '5491112345678',
    type: 'button',
    button: { payload: 'quiero_saber_mas', text: 'Quiero saber más' },
    context: { id: 'wamid-notice-1' },
  }), database, {
    sendText: async (to, message) => {
      sent.push({ to, message })
      return { messageId: 'reply-1' }
    },
  })

  assert.deepEqual(results, [{
    processed: true,
    action: 'offer_sent',
    clientId: 8,
    offerName: 'Celebración anticipada',
    messageId: 'reply-1',
    adminNotified: true,
  }])
  assert.deepEqual(sent, [{
    to: '5491112345678',
    message: 'Hola Ana, Sofia tiene una oferta.',
  }, {
    to: '5492222222222',
    message: 'Mensaje enviado a Ana con el aviso 1/2 con la promoción de Celebración anticipada. Fecha de envío: 05/10/2026',
  }])
  assert.deepEqual(database.notificationLookups, [[8, 'wamid-notice-1', 'wamid-notice-1']])
  assert.equal(database.statusRecords.at(-1)[0], 'reply-1')
})

test('recognizes a typed interest reply and uses the latest sent offer when no context is included', async () => {
  const sent = []
  const database = createDatabase({
    numero_notificacion: 2,
    fecha_envio_formateada: '06/10/2026',
    nombre_tutor: 'Ana',
    telefono_admin: '5492222222222',
    cantidad_notificaciones: 2,
    nombre_oferta: 'Últimos lugares',
    cuerpo_mensaje: 'Hola {{nombre_tutor}}, promoción para {{nombre_cumpleanero}}.',
  })
  const results = await handleWhatsAppWebhook(payload({
    id: 'message-typed-interest',
    from: '5491112345678',
    type: 'text',
    text: { body: 'Quiero saber más' },
  }), database, {
    sendText: async (to, message) => {
      sent.push({ to, message })
      return { messageId: `reply-${sent.length}` }
    },
  })

  assert.equal(results[0].adminNotified, true)
  assert.deepEqual(sent, [{
    to: '5491112345678',
    message: 'Hola Ana, promoción para Sofia.',
  }, {
    to: '5492222222222',
    message: 'Mensaje enviado a Ana con el aviso 2/2 con la promoción de Últimos lugares. Fecha de envío: 06/10/2026',
  }])
})

test('does not notify admin for a generic affirmative reply', async () => {
  const database = createDatabase({
    numero_notificacion: 1,
    fecha_envio_formateada: '05/10/2026',
    nombre_tutor: 'Ana',
    telefono_admin: '5492222222222',
    cantidad_notificaciones: 2,
    nombre_oferta: 'Celebración anticipada',
    cuerpo_mensaje: 'Oferta para {{nombre_cumpleanero}}.',
  })
  const sent = []
  const results = await handleWhatsAppWebhook(payload({
    id: 'message-generic-yes',
    from: '5491112345678',
    type: 'button',
    button: { payload: 'si', text: 'Sí' },
  }), database, {
    sendText: async (to, message) => {
      sent.push({ to, message })
      return { messageId: `reply-${sent.length}` }
    },
  })

  assert.equal(results[0].adminNotified, false)
  assert.deepEqual(sent, [{ to: '5491112345678', message: 'Oferta para Sofia.' }])
})

test('sends a polite goodbye and admin contact after “No, Gracias”, and ignores duplicates', async () => {
  const sent = []
  const message = {
    id: 'message-no',
    from: '5491112345678',
    type: 'button',
    button: { payload: 'no_gracias', text: 'No, Gracias' },
  }
  const options = { sendText: async (to, text) => {
    sent.push({ to, text })
    return { messageId: 'reply-2' }
  } }
  const first = await handleWhatsAppWebhook(payload(message), createDatabase(), options)
  const second = await handleWhatsAppWebhook(payload(message), createDatabase(), options)

  assert.deepEqual(first, [{ processed: true, action: 'declined', clientId: 8 }])
  assert.deepEqual(second, [{ processed: false, reason: 'duplicate' }])
  assert.deepEqual(sent, [{
    to: '5491112345678',
    text: 'Gracias por avisarnos. ¡Que tengas un hermoso día! Si cambias de opinión, puedes comunicarte al 2657287394.',
  }])
})

test('sends a selected manual follow-up once after any customer response', async () => {
  const statements = []
  const database = {
    async execute(query, parameters) {
      statements.push({ query, parameters })
      if (query.startsWith('SELECT id, telefono_whatsapp')) {
        return [[{ id: 8, telefono_whatsapp: '+54 9 11 1234-5678', nombre_tutor: 'Ana', nombre_cumpleanero: 'Sofia' }]]
      }
      if (query.includes('FROM whatsapp_manual_followups')) {
        return [[{ template_name: 'Oferta familiar', message_body: 'Hola Ana, oferta para Sofia' }]]
      }
      if (query.includes('UPDATE whatsapp_manual_followups')) return [{ affectedRows: 1 }]
      if (query.startsWith('INSERT INTO whatsapp_message_statuses')) return [{ affectedRows: 1 }]
      throw new Error(`Consulta inesperada: ${query}`)
    },
  }
  const sent = []
  const messagePayload = payload({
    id: 'message-manual-followup',
    from: '5491112345678',
    type: 'text',
    text: { body: 'Hola, quisiera más información' },
  })
  const options = {
    sendText: async (to, text) => {
      sent.push({ to, text })
      return { messageId: 'reply-manual-1' }
    },
  }
  const result = await handleWhatsAppWebhook(messagePayload, database, options)
  const duplicate = await handleWhatsAppWebhook(messagePayload, database, options)

  assert.deepEqual(result, [{
    processed: true,
    action: 'manual_followup_sent',
    clientId: 8,
    templateName: 'Oferta familiar',
    messageId: 'reply-manual-1',
  }])
  assert.deepEqual(sent, [{ to: '5491112345678', text: 'Hola Ana, oferta para Sofia' }])
  assert.deepEqual(duplicate, [{ processed: false, reason: 'duplicate' }])
  assert.ok(statements.some(({ query }) => query.includes("SET status = 'processing'")))
  assert.ok(statements.some(({ query }) => query.includes("SET status = 'sent'")))
})

test('does not send the manual follow-up after a negative text response', async () => {
  const statements = []
  const database = {
    async execute(query, parameters) {
      statements.push({ query, parameters })
      if (query.startsWith('SELECT id, telefono_whatsapp')) {
        return [[{ id: 8, telefono_whatsapp: '+54 9 11 1234-5678', nombre_tutor: 'Ana', nombre_cumpleanero: 'Sofia' }]]
      }
      if (query.includes('UPDATE whatsapp_manual_followups')) return [{ affectedRows: 1 }]
      throw new Error(`Consulta inesperada: ${query}`)
    },
  }
  const sent = []
  const result = await handleWhatsAppWebhook(payload({
    id: 'message-manual-negative',
    from: '5491112345678',
    type: 'text',
    text: { body: 'No, gracias' },
  }), database, {
    sendText: async (to, text) => {
      sent.push({ to, text })
      return { messageId: 'reply-manual-no' }
    },
  })

  assert.deepEqual(result, [{ processed: true, action: 'declined', clientId: 8 }])
  assert.deepEqual(sent, [{
    to: '5491112345678',
    text: 'Gracias por avisarnos. ¡Que tengas un hermoso día! Si cambias de opinión, puedes comunicarte al 2657287394.',
  }])
  assert.ok(statements.some(({ query }) => query.includes("SET status = 'cancelled'")))
  assert.ok(statements.every(({ query }) => !query.includes("SET status = 'processing'")))
})
