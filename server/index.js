import 'dotenv/config'
import app from './app.js'
import { getPool } from './db.js'
import { startDailyScheduler } from './scheduler.js'

const port = Number(process.env.PORT || process.env.API_PORT || 3001)
const host = process.env.HOST || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1')

app.listen(port, host, () => {
  console.log(`Silos Eventos disponible en http://${host}:${port}`)
  startDailyScheduler(getPool)
})
