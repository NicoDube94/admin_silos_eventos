import assert from 'node:assert/strict'
import test from 'node:test'
import { applyMigrations } from './migrate.js'

function createDatabase({ applied = [], schemaState = () => 0 } = {}) {
  const recordedMigrations = new Set(applied)
  const migrationStatements = []

  return {
    migrationStatements,
    recordedMigrations,
    async query(sql, values = []) {
      if (sql.includes('information_schema')) {
        return [[{ count: schemaState(sql, values) }], []]
      }
      if (sql.startsWith('SELECT version FROM schema_migrations')) {
        return [recordedMigrations.has(values[0]) ? [{ version: values[0] }] : [], []]
      }
      if (sql.startsWith('INSERT INTO schema_migrations')) {
        recordedMigrations.add(values[0])
        return [{ affectedRows: 1 }, []]
      }
      if (/^(ALTER TABLE|UPDATE|CREATE INDEX|CREATE TABLE IF NOT EXISTS (?:whatsapp_|usuarios_admin)|INSERT IGNORE INTO usuarios_admin)/.test(sql.trim())) {
        migrationStatements.push(sql.trim())
      }
      return [[], []]
    },
  }
}

test('applies all numbered migrations in order and skips them on subsequent runs', async () => {
  const database = createDatabase()

  await applyMigrations(database)

  assert.equal(database.recordedMigrations.size, 9)
  assert.equal(database.migrationStatements.length, 23)
  assert.match(database.migrationStatements[0], /^ALTER TABLE historial_notificaciones/)
  assert.match(database.migrationStatements.at(-2), /^CREATE TABLE IF NOT EXISTS usuarios_admin/)
  assert.match(database.migrationStatements.at(-1), /^INSERT IGNORE INTO usuarios_admin/)

  const firstRunStatementCount = database.migrationStatements.length
  await applyMigrations(database)
  assert.equal(database.migrationStatements.length, firstRunStatementCount)
})

test('records migrations whose schema changes are already present', async () => {
  const database = createDatabase({ schemaState: () => 1 })

  await applyMigrations(database)

  assert.equal(database.recordedMigrations.size, 9)
  assert.deepEqual(database.migrationStatements, [])
})

test('stops when a migration has only some of its schema changes', async () => {
  const database = createDatabase({
    schemaState: (_sql, values) => Number(values.includes('numero_notificacion')),
  })

  await assert.rejects(
    applyMigrations(database),
    /001_notification_schedule\.sql está aplicada parcialmente/,
  )
  assert.deepEqual(database.migrationStatements, [])
})
