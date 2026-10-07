import { readdir, readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { getPool, isDatabaseConfigured } from './db.js'

const migrationsDirectory = new URL('../db/migrations/', import.meta.url)
const migrationChecks = {
  '001_notification_schedule.sql': [
    ['column', 'historial_notificaciones', 'numero_notificacion'],
    ['column', 'historial_notificaciones', 'fecha_programada'],
    ['index', 'historial_notificaciones', 'historial_notificaciones_cliente_anio_aviso_unique'],
  ],
  '002_admin_theme.sql': [
    ['column', 'configuracion_sistema', 'tema'],
  ],
  '003_sent_notification_templates.sql': [
    ['column', 'plantillas_mensajes', 'numero_aviso'],
    ['column', 'historial_notificaciones', 'plantilla_id'],
    ['column', 'historial_notificaciones', 'mensaje_enviado'],
    ['index', 'historial_notificaciones', 'historial_notificaciones_plantilla_id_index'],
  ],
  '004_single_active_template_per_notice.sql': [
    ['column', 'plantillas_mensajes', 'aviso_activo'],
    ['index', 'plantillas_mensajes', 'plantillas_mensajes_aviso_activo_unique'],
  ],
  '005_soft_delete_templates.sql': [
    ['column', 'plantillas_mensajes', 'eliminada'],
  ],
  '006_whatsapp_message_statuses.sql': [
    ['table', 'whatsapp_message_statuses'],
  ],
  '007_notification_message_ids.sql': [
    ['column', 'historial_notificaciones', 'whatsapp_message_id'],
    ['index', 'historial_notificaciones', 'historial_notificaciones_whatsapp_message_index'],
  ],
  '008_manual_message_followups.sql': [
    ['table', 'whatsapp_manual_followups'],
  ],
  '009_admin_users.sql': [
    ['table', 'usuarios_admin'],
  ],
}

async function listMigrations() {
  const entries = await readdir(migrationsDirectory, { withFileTypes: true })
  const migrations = entries
    .filter((entry) => entry.isFile() && /^\d+_[\w-]+\.sql$/.test(entry.name))
    .map((entry) => ({
      filename: entry.name,
      number: Number(entry.name.match(/^\d+/)[0]),
    }))
    .sort((left, right) => left.number - right.number)

  for (let index = 1; index < migrations.length; index += 1) {
    if (migrations[index - 1].number === migrations[index].number) {
      throw new Error(`Hay más de una migración con el número ${migrations[index].number}.`)
    }
  }

  for (const migration of migrations) {
    if (!migrationChecks[migration.filename]) {
      throw new Error(`Falta definir la verificación de ${migration.filename}.`)
    }
  }

  return migrations
}

async function schemaObjectExists(database, [type, tableName, objectName]) {
  const queries = {
    column: [
      `SELECT COUNT(*) AS count
       FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
      [tableName, objectName],
    ],
    index: [
      `SELECT COUNT(*) AS count
       FROM information_schema.statistics
       WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?`,
      [tableName, objectName],
    ],
    table: [
      `SELECT COUNT(*) AS count
       FROM information_schema.tables
       WHERE table_schema = DATABASE() AND table_name = ?`,
      [tableName],
    ],
  }
  const [rows] = await database.query(...queries[type])
  return Number(rows[0]?.count) > 0
}

async function migrationAlreadyExists(database, filename) {
  const checks = migrationChecks[filename]
  const results = await Promise.all(checks.map((check) => schemaObjectExists(database, check)))
  const existingCount = results.filter(Boolean).length

  if (existingCount === checks.length) return true
  if (existingCount > 0) {
    throw new Error(
      `La migración ${filename} está aplicada parcialmente (${existingCount}/${checks.length} cambios detectados); revisa el esquema antes de continuar.`,
    )
  }
  return false
}

export async function applyMigrations(database) {
  await database.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(255) NOT NULL,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (version)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  const migrations = await listMigrations()
  for (const { filename } of migrations) {
    const [rows] = await database.query(
      'SELECT version FROM schema_migrations WHERE version = ?',
      [filename],
    )
    if (rows.length > 0) continue

    if (await migrationAlreadyExists(database, filename)) {
      await database.query(
        'INSERT INTO schema_migrations (version) VALUES (?)',
        [filename],
      )
      console.log(`Migración ${filename} ya estaba aplicada; se registró.`)
      continue
    }

    const sql = await readFile(new URL(filename, migrationsDirectory), 'utf8')
    for (const statement of sql.split(';').map((part) => part.trim()).filter(Boolean)) {
      await database.query(statement)
    }
    await database.query(
      'INSERT INTO schema_migrations (version) VALUES (?)',
      [filename],
    )
    console.log(`Migración ${filename} aplicada correctamente.`)
  }
}

async function main() {
  if (!isDatabaseConfigured()) {
    throw new Error('Faltan variables DB_* para ejecutar las migraciones.')
  }

  const database = getPool()
  try {
    await applyMigrations(database)
    console.log('Todas las migraciones están aplicadas.')
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
