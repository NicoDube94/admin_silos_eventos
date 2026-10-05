import assert from 'node:assert/strict'
import test from 'node:test'
import { dispatchDueNotifications } from './notificationSender.js'

function createDatabase() {
  const historyUpdates = []
  const statusRecords = []
  const notifications = [
    { historial_id: 10, cliente_id: 1, nombre_tutor: 'Jazmin', telefono_whatsapp: '5491111111111', nombre_cumpleanero: 'Fatima', telefono_admin: '5492222222222' },
    { historial_id: 11, cliente_id: 60001, nombre_tutor: 'Nicolas', telefono_whatsapp: '5493333333333', nombre_cumpleanero: 'Francisco', telefono_admin: '5492222222222' },
  ]

  return {
    historyUpdates,
    statusRecords,
    async execute(query, parameters) {
      if (query.startsWith('SELECT h.id AS historial_id')) return [notifications]
      if (query.startsWith('INSERT INTO whatsapp_message_statuses')) {
        statusRecords.push(parameters)
        return [{ affectedRows: 1 }]
      }
      if (query.startsWith('UPDATE historial_notificaciones')) {
        historyUpdates.push({ query, parameters })
        return [{ affectedRows: 1 }]
      }
      throw new Error(`Consulta inesperada: ${query}`)
    },
  }
}

test('dispatches only the selected clients on the configured test date and alerts the admin', async () => {
  const database = createDatabase()
  const sent = []
  const result = await dispatchDueNotifications(database, '2026-10-04', {
    enabled: true,
    sendDate: '2026-10-04',
    clientIds: [1, 60001],
    templateName: 'primer_aviso_cumple',
    language: 'es_AR',
    imageBuffer: Buffer.from('test-image'),
    uploadMedia: async () => ({ mediaId: 'media-test' }),
    sendTemplate: async (to, name, language, options) => {
      sent.push({ to, name, language, options })
      return { messageId: `wamid.${sent.length}` }
    },
  })

  assert.deepEqual(result, {
    enabled: true,
    attempted: 2,
    accepted: 2,
    failed: 0,
    outcomes: [
      { clientId: 1, status: 'accepted', messageId: 'wamid.1' },
      { clientId: 60001, status: 'accepted', messageId: 'wamid.3' },
    ],
  })
  assert.equal(sent.length, 4)
  assert.deepEqual(sent.map((message) => message.to), [
    '5491111111111', '5492222222222', '5493333333333', '5492222222222',
  ])
  assert.ok(sent.every((message) => message.name === 'primer_aviso_cumple'))
  assert.equal(database.statusRecords.length, 4)
  assert.equal(database.historyUpdates.filter(({ query }) => query.includes("estado = 'enviado'")).length, 2)
})

test('records a 131049 failure and continues with the next client', async () => {
  const database = createDatabase()
  const attemptedRecipients = []
  const previousConsoleError = console.error
  console.error = () => {}
  let messageNumber = 0
  let result

  try {
    result = await dispatchDueNotifications(database, '2026-10-04', {
      enabled: true,
      sendDate: '2026-10-04',
      clientIds: [1, 60001],
      templateName: 'primer_aviso_cumple',
      language: 'es_AR',
      imageBuffer: Buffer.from('test-image'),
      uploadMedia: async () => ({ mediaId: 'media-test' }),
      sendTemplate: async (to) => {
        attemptedRecipients.push(to)
        if (to === '5491111111111') {
          const error = new Error('Healthy ecosystem engagement restriction')
          error.status = 502
          error.meta = { code: 131049, title: 'Healthy ecosystem engagement' }
          throw error
        }
        messageNumber += 1
        return { messageId: `wamid.success-${messageNumber}` }
      },
    })
  } finally {
    console.error = previousConsoleError
  }

  assert.deepEqual(result, {
    enabled: true,
    attempted: 2,
    accepted: 1,
    failed: 1,
    outcomes: [
      { clientId: 1, status: 'failed', error: 'Healthy ecosystem engagement restriction' },
      { clientId: 60001, status: 'accepted', messageId: 'wamid.success-2' },
    ],
  })
  assert.deepEqual(attemptedRecipients, [
    '5491111111111',
    '5492222222222',
    '5493333333333',
    '5492222222222',
  ])
  const failedUpdate = database.historyUpdates.find(({ query }) => query.includes("estado = 'fallido'"))
  assert.deepEqual(JSON.parse(failedUpdate.parameters[0]), {
    message: 'Healthy ecosystem engagement restriction',
    meta: { code: 131049, title: 'Healthy ecosystem engagement' },
  })
})

test('does not dispatch outside the configured one-day window', async () => {
  const database = createDatabase()
  const result = await dispatchDueNotifications(database, '2026-10-03', {
    enabled: true,
    sendDate: '2026-10-04',
    clientIds: [1, 60001],
  })

  assert.deepEqual(result, { enabled: false, attempted: 0, accepted: 0, failed: 0 })
  assert.equal(database.historyUpdates.length, 0)
})