import cron from 'node-cron'
import { generateDueNotifications } from './notificationEngine.js'

function dateInTimezone(date, timezone) {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
  return `${values.year}-${values.month}-${values.day}`
}

export function startDailyScheduler(getDatabase) {
  const expression = process.env.NOTIFICATION_CRON || '0 9 * * *'
  const timezone = process.env.NOTIFICATION_TIMEZONE || 'America/Argentina/Buenos_Aires'
  if (!cron.validate(expression)) throw new Error('NOTIFICATION_CRON no contiene una expresión válida.')

  async function run() {
    try {
      const result = await generateDueNotifications(getDatabase(), dateInTimezone(new Date(), timezone))
      console.info(`Motor de avisos: ${result.created} pendientes nuevos; ${result.evaluated} clientes evaluados.`)
    } catch (error) {
      console.error('No se pudo ejecutar el motor de avisos:', error.code || error.message)
    }
  }

  const task = cron.schedule(expression, () => void run(), { timezone })
  void run()
  console.info(`Motor de avisos programado: ${expression} (${timezone}).`)
  return task
}