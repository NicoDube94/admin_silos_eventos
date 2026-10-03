const apiVersion = process.env.WHATSAPP_API_VERSION || 'v22.0'

function normalizePhoneNumber(value) {
  const digits = String(value || '').replace(/\D/g, '')
  if (digits.length < 8 || digits.length > 15) {
    const error = new Error('El número de WhatsApp debe incluir el código de país y tener entre 8 y 15 dígitos.')
    error.status = 400
    throw error
  }
  return digits
}

function summarizeRequest(payload) {
  const summary = { type: payload.type }
  if (payload.type !== 'template') return summary

  return {
    ...summary,
    template: {
      name: payload.template.name,
      language: payload.template.language.code,
      components: (payload.template.components || []).map((component) => ({
        type: component.type,
        parameterTypes: (component.parameters || []).map((parameter) => parameter.type),
      })),
    },
  }
}

function createMetaError(result, fallbackMessage, request) {
  const metaError = result?.error || {}
  const error = new Error(metaError.message || fallbackMessage)
  error.status = 502
  error.meta = {
    code: metaError.code ?? null,
    subcode: metaError.error_subcode ?? null,
    type: metaError.type ?? null,
    details: metaError.error_data?.details ?? null,
    fbtraceId: metaError.fbtrace_id ?? null,
    request,
  }
  return error
}

async function sendWhatsAppPayload(to, payload, options = {}) {
  const accessToken = options.accessToken ?? process.env.WHATSAPP_ACCESS_TOKEN
  const phoneNumberId = options.phoneNumberId ?? process.env.WHATSAPP_PHONE_NUMBER_ID
  const fetchImpl = options.fetchImpl ?? fetch

  if (!accessToken || !phoneNumberId) {
    const error = new Error('Faltan WHATSAPP_ACCESS_TOKEN o WHATSAPP_PHONE_NUMBER_ID en .env.')
    error.status = 503
    throw error
  }

  const recipient = normalizePhoneNumber(to)
  const response = await fetchImpl(
    `https://graph.facebook.com/${apiVersion}/${encodeURIComponent(phoneNumberId)}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to: recipient, ...payload }),
    },
  )

  let result
  try {
    result = await response.json()
  } catch {
    result = {}
  }

  if (!response.ok) {
    throw createMetaError(result, 'Meta rechazó el envío del mensaje.', summarizeRequest(payload))
  }

  return {
    messageId: result.messages?.[0]?.id ?? null,
  }
}

export function sendWhatsAppText(to, message, options = {}) {
  return sendWhatsAppPayload(to, {
    type: 'text',
    text: { preview_url: false, body: message },
  }, options)
}

export async function uploadWhatsAppMedia(fileBuffer, fileName, mimeType, options = {}) {
  const accessToken = options.accessToken ?? process.env.WHATSAPP_ACCESS_TOKEN
  const phoneNumberId = options.phoneNumberId ?? process.env.WHATSAPP_PHONE_NUMBER_ID
  const fetchImpl = options.fetchImpl ?? fetch

  if (!accessToken || !phoneNumberId) {
    const error = new Error('Faltan WHATSAPP_ACCESS_TOKEN o WHATSAPP_PHONE_NUMBER_ID en .env.')
    error.status = 503
    throw error
  }
  if (!Buffer.isBuffer(fileBuffer) || fileBuffer.length === 0 || fileBuffer.length > 5 * 1024 * 1024) {
    const error = new Error('La imagen debe tener contenido y pesar como máximo 5 MB.')
    error.status = 400
    throw error
  }
  if (!['image/jpeg', 'image/png'].includes(mimeType)) {
    const error = new Error('La imagen debe ser JPEG o PNG.')
    error.status = 400
    throw error
  }

  const formData = new FormData()
  formData.set('messaging_product', 'whatsapp')
  formData.set('type', mimeType)
  formData.set('file', new Blob([fileBuffer], { type: mimeType }), fileName)
  const response = await fetchImpl(
    `https://graph.facebook.com/${apiVersion}/${encodeURIComponent(phoneNumberId)}/media`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: formData,
    },
  )

  let result
  try {
    result = await response.json()
  } catch {
    result = {}
  }
  if (!response.ok || !result.id) {
    throw createMetaError(result, 'Meta no devolvió un identificador para la imagen.', {
      type: 'media_upload',
      mimeType,
    })
  }
  return { mediaId: result.id }
}

export function sendWhatsAppTemplate(to, templateName, language = 'es_AR', options = {}) {
  if (!templateName) {
    const error = new Error('Falta el nombre de una plantilla de WhatsApp aprobada.')
    error.status = 503
    throw error
  }

  const template = {
    name: templateName,
    language: { code: language },
  }
  const components = []
  if (options.headerImage) {
    const { id, link } = options.headerImage
    if ((Boolean(id) === Boolean(link)) || (link && !link.startsWith('https://'))) {
      const error = new Error('La imagen de cabecera debe incluir un media ID o un enlace HTTPS público.')
      error.status = 400
      throw error
    }
    components.push({
      type: 'header',
      parameters: [{ type: 'image', image: id ? { id } : { link } }],
    })
  }
  if (options.parameters?.length) {
    components.push({
      type: 'body',
      parameters: options.parameters.map((value) => ({ type: 'text', text: value })),
    })
  }
  if (components.length) template.components = components

  return sendWhatsAppPayload(to, {
    type: 'template',
    template,
  }, options)
}
