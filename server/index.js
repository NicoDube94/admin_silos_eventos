import 'dotenv/config'
import app from './app.js'
import { getPool } from './db.js'
import { startDailyScheduler } from './scheduler.js'

const port = Number(process.env.API_PORT || 3001)

app.listen(port, '127.0.0.1', () => {
  console.log(`Silos Eventos API disponible en http://127.0.0.1:${port}`)
  startDailyScheduler(getPool)
})
