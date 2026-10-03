import assert from 'node:assert/strict'
import test from 'node:test'
import { generateDueNotifications } from './notificationEngine.js'

function createDatabase() {
  const records = new Set()
  return {
    records,
    async execute(query, values = []) {
      if (query.startsWith('SELECT dias_anticipacion')) {
        return [[{ dias_anticipacion: 60, cantidad_notificaciones: 3, plazos_dias: 15 }]]
      }
      if (query.startsWith('SELECT id, DATE_FORMAT')) {
        return [[{ id: 17, fecha_nacimiento: '2010-12-30' }]]
      }
      if (query.startsWith('SELECT id, numero_aviso')) {
        return [[{ id: 9, numero_aviso: 1, cuerpo_mensaje: 'Hola {{nombre_cumpleanero}}' }]]
      }
      if (query.startsWith('INSERT IGNORE')) {
        const key = values.join(':')
        if (records.has(key)) return [{ affectedRows: 0 }]
        records.add(key)
        return [{ affectedRows: 1 }]
      }
      throw new Error(`Consulta inesperada: ${query}`)
    },
  }
}

test('creates due notifications as pending records', async () => {
  const database = createDatabase()

  assert.deepEqual(await generateDueNotifications(database, '2026-10-31'), {
    evaluated: 1,
    created: 1,
  })
  assert.deepEqual([...database.records], ['17:2026:1:2026-10-31:9:Hola {{nombre_cumpleanero}}'])
})

test('does not duplicate a notification when the daily job runs twice', async () => {
  const database = createDatabase()

  await generateDueNotifications(database, '2026-10-31')
  assert.deepEqual(await generateDueNotifications(database, '2026-10-31'), {
    evaluated: 1,
    created: 0,
  })
})