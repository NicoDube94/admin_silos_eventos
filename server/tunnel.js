import 'dotenv/config'
import ngrok from '@ngrok/ngrok'

const port = Number(process.env.API_PORT || 3001)

if (!process.env.NGROK_AUTHTOKEN) {
  console.error('Falta NGROK_AUTHTOKEN en .env. Créalo desde el dashboard de ngrok.')
  process.exit(1)
}

let listener
let closing = false

async function closeTunnel() {
  if (closing) return
  closing = true
  if (listener) await listener.close()
  process.exit(0)
}

try {
  listener = await ngrok.forward({
    addr: `127.0.0.1:${port}`,
    proto: 'http',
    authtoken_from_env: true,
  })
  const publicUrl = listener.url()
  console.log(`Túnel ngrok activo: ${publicUrl}`)
  console.log(`Webhook para Meta: ${publicUrl}/api/webhooks/whatsapp`)
  console.log('Mantén esta terminal abierta. Presiona Ctrl+C para cerrar el túnel.')
  process.stdin.resume()
  process.on('SIGINT', closeTunnel)
  process.on('SIGTERM', closeTunnel)
} catch (error) {
  console.error(`No se pudo iniciar ngrok: ${error.message}`)
  process.exit(1)
}
