import assert from 'node:assert/strict'
import test from 'node:test'
import { sendManualWhatsAppMessage } from './manualMessage.js'

function createDatabase() {
  const statements = []
  return {
    statements,
    async execute(query, parameters) {
      statements.push({ query, parameters })
      if (query.includes('FROM clientes')) {
        return [[{
          id: 7,
          telefono_whatsapp: '+5491112345678',
          nombre_tutor: 'Ana',
          nombre_cumpleanero: 'Sofía',
        }]]
      }
      if (query.includes('FROM plantillas_mensajes')) {
        return [[{
          id: 3,
          nombre_oferta: 'Oferta especial',
          cuerpo_mensaje: 'Hola {{nombre_tutor}}, {{nombre_cumpleanero}} tiene una propuesta.',
        }]]
      }
      return [{ affectedRows: 1 }]
    },
  }
}

test('sends the configured approved template and arms the selected system follow-up', async () => {
  const database = createDatabase()
  const sent = []
  const uploaded = []
  const result = await sendManualWhatsAppMessage(database, 7, 3, {
    templateName: 'primer_aviso_cumple',
    language: 'es_AR',
    imageBuffer: Buffer.from('test-image'),
    uploadMedia: async (...args) => {
      uploaded.push(args)
      return { mediaId: 'media-1' }
    },
    sendTemplate: async (...args) => {
      sent.push(args)
      return { messageId: 'wamid.manual-1' }
    },
  })

  assert.deepEqual(result, {
    clientId: 7,
    templateName: 'primer_aviso_cumple',
    messageId: 'wamid.manual-1',
    followupTemplate: 'Oferta especial',
  })
  assert.deepEqual(uploaded, [[Buffer.from('test-image'), 'silos_1.jpg', 'image/jpeg']])
  assert.deepEqual(sent, [[
    '+5491112345678',
    'primer_aviso_cumple',
    'es_AR',
    {
      parameters: ['Ana', 'Sofía'],
      headerImage: { id: 'media-1' },
    },
  ]])
  assert.ok(database.statements.some(({ query }) => query.includes("status = 'pending'")))
})

test('rejects unavailable clients or templates without sending', async () => {
  const database = createDatabase()
  database.execute = async (query) => {
    if (query.includes('FROM clientes')) return [[]]
    throw new Error(`Unexpected query: ${query}`)
  }
  await assert.rejects(
    sendManualWhatsAppMessage(database, 7, 3, { templateName: 'approved' }),
    { status: 404, message: 'No se encontró un cliente activo con ese identificador.' },
  )
})

test('does not send the primary template when the personalized follow-up is too long', async () => {
  const database = createDatabase()
  database.execute = async (query) => {
    if (query.includes('FROM clientes')) return [[{
      id: 7,
      telefono_whatsapp: '5491112345678',
      nombre_tutor: 'Ana',
      nombre_cumpleanero: 'Sofía',
    }]]
    if (query.includes('FROM plantillas_mensajes')) return [[{
      id: 3,
      nombre_oferta: 'Oferta',
      cuerpo_mensaje: 'x'.repeat(1025),
    }]]
    throw new Error(`Unexpected query: ${query}`)
  }
  await assert.rejects(
    sendManualWhatsAppMessage(database, 7, 3, { templateName: 'approved' }),
    { status: 400 },
  )
})

test('reports a missing manual follow-up migration before uploading or sending', async () => {
  const database = createDatabase()
  database.execute = async (query) => {
    if (query.includes('FROM clientes')) {
      return [[{
        id: 7,
        telefono_whatsapp: '5491112345678',
        nombre_tutor: 'Ana',
        nombre_cumpleanero: 'Sofía',
      }]]
    }
    if (query.includes('FROM plantillas_mensajes')) {
      return [[{
        id: 3,
        nombre_oferta: 'Oferta especial',
        cuerpo_mensaje: 'Hola {{nombre_tutor}}',
      }]]
    }
    if (query.includes('FROM whatsapp_manual_followups')) {
      const error = new Error("Table 'database.whatsapp_manual_followups' doesn't exist")
      error.code = 'ER_NO_SUCH_TABLE'
      throw error
    }
    throw new Error(`Unexpected query: ${query}`)
  }

  await assert.rejects(
    sendManualWhatsAppMessage(database, 7, 3, {
      templateName: 'approved',
      uploadMedia: async () => {
        throw new Error('No se debe subir media cuando falta la migración')
      },
    }),
    {
      status: 503,
      message: 'Falta la tabla de seguimientos manuales. Aplica db/migrations/008_manual_message_followups.sql en la base de datos y vuelve a intentar.',
    },
  )
})
