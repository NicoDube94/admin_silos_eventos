import assert from 'node:assert/strict'
import { once } from 'node:events'
import test from 'node:test'
import app from './app.js'
import { sendWhatsAppTemplate, sendWhatsAppText, uploadWhatsAppMedia } from './whatsapp.js'

const originalFetch = globalThis.fetch

function mockResponse(body, ok = true) {
  return {
    ok,
    async json() {
      return body
    },
  }
}

test('sends a WhatsApp text message through the Cloud API', async () => {
  let requestUrl
  let requestOptions
  const result = await sendWhatsAppText('+54 9 11 1234-5678', 'Mensaje de prueba', {
    accessToken: 'test-token',
    phoneNumberId: '12345',
    fetchImpl: async (url, options) => {
      requestUrl = url
      requestOptions = options
      return mockResponse({ messages: [{ id: 'wamid.test' }] })
    },
  })

  assert.match(requestUrl, /\/12345\/messages$/)
  assert.equal(requestOptions.method, 'POST')
  assert.equal(requestOptions.headers.Authorization, 'Bearer test-token')
  assert.deepEqual(JSON.parse(requestOptions.body), {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: '5491112345678',
    type: 'text',
    text: { preview_url: false, body: 'Mensaje de prueba' },
  })
  assert.deepEqual(result, { messageId: 'wamid.test' })
})

test('uploads a JPEG to Meta and returns its media ID', async () => {
  let requestUrl
  let requestOptions
  const image = Buffer.from('test-image-bytes')
  const result = await uploadWhatsAppMedia(image, 'silos_1.jpg', 'image/jpeg', {
    accessToken: 'test-token',
    phoneNumberId: '12345',
    fetchImpl: async (url, options) => {
      requestUrl = url
      requestOptions = options
      return mockResponse({ id: 'media-123' })
    },
  })

  assert.match(requestUrl, /\/12345\/media$/)
  assert.equal(requestOptions.method, 'POST')
  assert.equal(requestOptions.headers.Authorization, 'Bearer test-token')
  assert.equal(requestOptions.body.get('messaging_product'), 'whatsapp')
  assert.equal(requestOptions.body.get('type'), 'image/jpeg')
  assert.equal(requestOptions.body.get('file').name, 'silos_1.jpg')
  assert.deepEqual(Buffer.from(await requestOptions.body.get('file').arrayBuffer()), image)
  assert.deepEqual(result, { mediaId: 'media-123' })
})

test('sends an approved WhatsApp template with its language code', async () => {
  let requestOptions
  await sendWhatsAppTemplate('5491112345678', 'PLANTILLA_WHATSAPP', 'es_AR', {
    accessToken: 'test-token',
    phoneNumberId: '12345',
    fetchImpl: async (_url, options) => {
      requestOptions = options
      return mockResponse({ messages: [{ id: 'wamid.template' }] })
    },
  })

  assert.deepEqual(JSON.parse(requestOptions.body), {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: '5491112345678',
    type: 'template',
    template: {
      name: 'PLANTILLA_WHATSAPP',
      language: { code: 'es_AR' },
    },
  })
})

test('adds ordered text parameters to the approved template body', async () => {
  let requestBody
  await sendWhatsAppTemplate('5491112345678', 'cumple_aviso', 'es_AR', {
    accessToken: 'test-token',
    phoneNumberId: '12345',
    parameters: ['Tutor de prueba', 'Cumpleañero de prueba'],
    fetchImpl: async (_url, options) => {
      requestBody = JSON.parse(options.body)
      return mockResponse({ messages: [{ id: 'wamid.params' }] })
    },
  })

  assert.deepEqual(requestBody.template.components, [{
    type: 'body',
    parameters: [
      { type: 'text', text: 'Tutor de prueba' },
      { type: 'text', text: 'Cumpleañero de prueba' },
    ],
  }])
})

test('rejects invalid recipients without making a request', async () => {
  let called = false
  await assert.rejects(
    sendWhatsAppText('123', 'Mensaje', {
      accessToken: 'test-token',
      phoneNumberId: '12345',
      fetchImpl: async () => {
        called = true
        return mockResponse({})
      },
    }),
    { status: 400 },
  )
  assert.equal(called, false)
})

test('returns Meta errors without leaking credentials', async () => {
  await assert.rejects(
    sendWhatsAppText('5491112345678', 'Mensaje', {
      accessToken: 'private-token',
      phoneNumberId: '12345',
      fetchImpl: async () => mockResponse({
        error: {
          message: 'Invalid parameter',
          type: 'OAuthException',
          code: 132012,
          error_subcode: 2494102,
          error_data: { details: 'Body parameter format mismatch' },
          fbtrace_id: 'trace-123',
        },
      }, false),
    }),
    (error) => {
      assert.equal(error.status, 502)
      assert.equal(error.message, 'Invalid parameter')
      assert.deepEqual(error.meta, {
        code: 132012,
        subcode: 2494102,
        type: 'OAuthException',
        details: 'Body parameter format mismatch',
        fbtraceId: 'trace-123',
        request: { type: 'text' },
      })
      assert.doesNotMatch(JSON.stringify(error.meta), /private-token|5491112345678|Mensaje/)
      return true
    },
  )
})

test('test-template endpoint returns and logs structured Meta diagnostics', async () => {
  const names = [
    'WHATSAPP_ACCESS_TOKEN',
    'WHATSAPP_PHONE_NUMBER_ID',
    'WHATSAPP_TO',
    'PLANTILLA_WHATSAPP',
    'WHATSAPP_TEMPLATE_LANGUAGE',
  ]
  const previousValues = new Map(names.map((name) => [name, process.env[name]]))
  const previousFetch = globalThis.fetch
  const previousConsoleError = console.error
  const logs = []
  process.env.WHATSAPP_ACCESS_TOKEN = 'private-token'
  process.env.WHATSAPP_PHONE_NUMBER_ID = '12345'
  process.env.WHATSAPP_TO = '+54 9 11 1234-5678'
  process.env.PLANTILLA_WHATSAPP = 'PLANTILLA_WHATSAPP'
  process.env.WHATSAPP_TEMPLATE_LANGUAGE = 'es_AR'
  globalThis.fetch = async () => mockResponse({
    error: {
      message: '(#132012) Parameter format does not match format in the created template',
      type: 'OAuthException',
      code: 132012,
      error_subcode: 2494102,
      error_data: { details: 'Body parameters do not match template' },
      fbtrace_id: 'trace-template-123',
    },
  }, false)
  console.error = (...values) => logs.push(values.join(' '))
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const baseUrl = `http://127.0.0.1:${server.address().port}`

  try {
    const response = await originalFetch(`${baseUrl}/api/whatsapp/test-template`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parameters: ['Tutor privado', 'Cumpleañera privada'] }),
    })
    assert.equal(response.status, 502)
    const body = await response.json()
    assert.match(body.error, /132012/)
    assert.equal(body.metaError.code, 132012)
    assert.equal(body.metaError.subcode, 2494102)
    assert.equal(body.metaError.details, 'Body parameters do not match template')
    assert.equal(body.metaError.fbtraceId, 'trace-template-123')
    assert.deepEqual(body.metaError.request.template, {
      name: 'PLANTILLA_WHATSAPP',
      language: 'es_AR',
      components: [{ type: 'body', parameterTypes: ['text', 'text'] }],
    })
    assert.match(logs.join('\n'), /trace-template-123/)
    assert.doesNotMatch(JSON.stringify(body.metaError) + logs.join('\n'), /private-token|5491112345678|Tutor privado|Cumpleañera privada/)
  } finally {
    server.close()
    await once(server, 'close')
    globalThis.fetch = previousFetch ?? originalFetch
    console.error = previousConsoleError
    for (const [name, value] of previousValues) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  }
})

test('test endpoint sends only to WHATSAPP_TO and validates the message', async () => {
  const names = ['WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_TO']
  const previousValues = new Map(names.map((name) => [name, process.env[name]]))
  const previousFetch = globalThis.fetch
  process.env.WHATSAPP_ACCESS_TOKEN = 'test-token'
  process.env.WHATSAPP_PHONE_NUMBER_ID = '12345'
  process.env.WHATSAPP_TO = '+54 9 11 1234-5678'
  let sentBody
  globalThis.fetch = async (_url, options) => {
    sentBody = JSON.parse(options.body)
    return mockResponse({ messages: [{ id: 'wamid.test' }] })
  }
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const baseUrl = `http://127.0.0.1:${server.address().port}`

  try {
    const invalidResponse = await originalFetch(`${baseUrl}/api/whatsapp/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mensaje: ' ' }),
    })
    assert.equal(invalidResponse.status, 400)

    const response = await originalFetch(`${baseUrl}/api/whatsapp/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mensaje: 'Hola desde test' }),
    })
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { enviado: true, messageId: 'wamid.test' })
    assert.equal(sentBody.to, '5491112345678')
    assert.equal(sentBody.text.body, 'Hola desde test')
  } finally {
    server.close()
    await once(server, 'close')
    globalThis.fetch = previousFetch ?? originalFetch
    for (const [name, value] of previousValues) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  }
})

test('template test endpoint uses the configured template and fixed recipient', async () => {
  const names = [
    'WHATSAPP_ACCESS_TOKEN',
    'WHATSAPP_PHONE_NUMBER_ID',
    'WHATSAPP_TO',
    'PLANTILLA_WHATSAPP',
    'WHATSAPP_TEMPLATE_LANGUAGE',
  ]
  const previousValues = new Map(names.map((name) => [name, process.env[name]]))
  const previousFetch = globalThis.fetch
  process.env.WHATSAPP_ACCESS_TOKEN = 'test-token'
  process.env.WHATSAPP_PHONE_NUMBER_ID = '12345'
  process.env.WHATSAPP_TO = '5491112345678'
  process.env.PLANTILLA_WHATSAPP = 'PLANTILLA_WHATSAPP'
  process.env.WHATSAPP_TEMPLATE_LANGUAGE = 'es_AR'
  let sentBody
  globalThis.fetch = async (_url, options) => {
    sentBody = JSON.parse(options.body)
    return mockResponse({ messages: [{ id: 'wamid.template' }] })
  }
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const baseUrl = `http://127.0.0.1:${server.address().port}`

  try {
    const response = await originalFetch(`${baseUrl}/api/whatsapp/test-template`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: '5490000000000',
        parameters: ['Prueba', 'Prueba'],
        headerImage: { link: 'https://example.com/header.png' },
      }),
    })
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { enviado: true, tipo: 'plantilla', messageId: 'wamid.template' })
    assert.equal(sentBody.to, '5491112345678')
    assert.deepEqual(sentBody.template, {
      name: 'PLANTILLA_WHATSAPP',
      language: { code: 'es_AR' },
      components: [{
        type: 'header',
        parameters: [{ type: 'image', image: { link: 'https://example.com/header.png' } }],
      }, {
        type: 'body',
        parameters: [
          { type: 'text', text: 'Prueba' },
          { type: 'text', text: 'Prueba' },
        ],
      }],
    })
  } finally {
    server.close()
    await once(server, 'close')
    globalThis.fetch = previousFetch ?? originalFetch
    for (const [name, value] of previousValues) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  }
})
