import assert from 'node:assert/strict'
import { once } from 'node:events'
import test from 'node:test'
import app from './app.js'

test('health and data routes report missing database configuration', async () => {
  const variableNames = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME']
  const previousValues = new Map(variableNames.map((name) => [name, process.env[name]]))
  for (const name of variableNames) process.env[name] = ''

  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const baseUrl = `http://127.0.0.1:${server.address().port}`

  try {
    const healthResponse = await fetch(`${baseUrl}/api/health`)
    assert.equal(healthResponse.status, 503)
    assert.deepEqual(await healthResponse.json(), { status: 'disconnected', configured: false })

    const clientsResponse = await fetch(`${baseUrl}/api/clients`)
    assert.equal(clientsResponse.status, 401)
    assert.match((await clientsResponse.json()).error, /sesión/i)

    const notificationsResponse = await fetch(`${baseUrl}/api/notifications`)
    assert.equal(notificationsResponse.status, 401)

    const sessionResponse = await fetch(`${baseUrl}/api/auth/session`)
    assert.equal(sessionResponse.status, 401)

    const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'Mariano_1', password: 'admin123#' }),
    })
    assert.equal(loginResponse.status, 503)

    const loginThemeResponse = await fetch(`${baseUrl}/api/auth/theme`)
    assert.equal(loginThemeResponse.status, 503)

    const themeResponse = await fetch(`${baseUrl}/api/settings/theme`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tema: 'dark' }),
    })
    assert.equal(themeResponse.status, 401)

    const missingRoute = await fetch(`${baseUrl}/api/missing`)
    assert.equal(missingRoute.status, 401)
  } finally {
    server.close()
    await once(server, 'close')
    for (const [name, value] of previousValues) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  }
})
