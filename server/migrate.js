import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { getPool, isDatabaseConfigured } from './db.js'

const manualFollowupMigration = new URL('../db/migrations/008_manual_message_followups.sql', import.meta.url)

export async function applyMigrations(database, migrationSql) {
  const sql = migrationSql ?? await readFile(manualFollowupMigration, 'utf8')
  await database.query(sql)
}

async function main() {
  if (!isDatabaseConfigured()) {
    throw new Error('Faltan variables DB_* para ejecutar las migraciones.')
  }

  const database = getPool()
  try {
    await applyMigrations(database)
    console.log('Migración 008 aplicada correctamente.')
  } finally {
    await database.end()
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    console.error('No se pudieron aplicar las migraciones:', error.message)
    process.exitCode = 1
  })
}
