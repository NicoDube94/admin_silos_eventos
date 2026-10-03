import 'dotenv/config'
import mysql from 'mysql2/promise'

const requiredVariables = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME']
let pool

export function isDatabaseConfigured() {
  return requiredVariables.every((name) => Boolean(process.env[name]?.trim()))
}

export function getPool() {
  if (!isDatabaseConfigured()) {
    const error = new Error('Base de datos no configurada. Revisa las variables DB_* del archivo .env.')
    error.code = 'DATABASE_NOT_CONFIGURED'
    throw error
  }

  if (!pool) {
    pool = mysql.createPool({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 4000),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      ssl: process.env.DB_SSL?.toLowerCase() === 'false' ? undefined : { rejectUnauthorized: true },
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      dateStrings: true,
      timezone: 'Z',
    })
  }

  return pool
}
