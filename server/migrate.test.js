import assert from 'node:assert/strict'
import test from 'node:test'
import { applyMigrations } from './migrate.js'

test('applies the checked-in idempotent manual follow-up migration', async () => {
  const executed = []
  await applyMigrations({
    async query(sql) {
      executed.push(sql)
    },
  })

  assert.equal(executed.length, 1)
  assert.match(executed[0], /CREATE TABLE IF NOT EXISTS whatsapp_manual_followups/)
  assert.match(executed[0], /status_index/)
})

test('allows supplying migration SQL to the migration runner', async () => {
  const executed = []
  await applyMigrations({
    async query(sql) {
      executed.push(sql)
    },
  }, 'SELECT 1')

  assert.deepEqual(executed, ['SELECT 1'])
})
