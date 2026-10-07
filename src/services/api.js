const authTokenStorageKey = 'silos-eventos-auth-token'

export function getAuthToken() {
  try {
    return window.localStorage.getItem(authTokenStorageKey)
  } catch {
    return null
  }
}

export function saveAuthToken(token) {
  window.localStorage.setItem(authTokenStorageKey, token)
}

export function clearAuthToken() {
  window.localStorage.removeItem(authTokenStorageKey)
}

async function request(path, options = {}) {
  let response
  try {
    const token = getAuthToken()
    response = await fetch(`/api${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token && path !== '/auth/login' ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    })
  } catch {
    throw new Error('No se pudo contactar la API. Comprueba que el servidor esté iniciado.')
  }

  let body
  try {
    body = await response.json()
  } catch {
    throw new Error('La API devolvió una respuesta no válida.')
  }

  if (!response.ok) {
    if (response.status === 401 && path !== '/auth/login') {
      window.dispatchEvent(new CustomEvent('auth:unauthorized'))
    }
    const error = new Error(body.error || `Error HTTP ${response.status}`)
    error.status = response.status
    throw error
  }
  return body
}

function jsonBody(value) {
  return { method: 'PUT', body: JSON.stringify(value) }
}

export const api = {
  login: (credentials) => request('/auth/login', { method: 'POST', body: JSON.stringify(credentials) }),
  session: () => request('/auth/session'),
  health: () => request('/health'),
  clients: () => request('/clients'),
  notifications: () => request('/notifications'),
  users: () => request('/users'),
  createUser: (user) => request('/users', { method: 'POST', body: JSON.stringify(user) }),
  updateUser: (id, user) => request(`/users/${id}`, jsonBody(user)),
  deleteUser: (id) => request(`/users/${id}`, { method: 'DELETE' }),
  createClient: (client) => request('/clients', { method: 'POST', body: JSON.stringify(client) }),
  updateClient: (id, client) => request(`/clients/${id}`, { ...jsonBody(client), method: 'PUT' }),
  deactivateClient: (id) => request(`/clients/${id}/deactivate`, { method: 'PATCH' }),
  settings: () => request('/settings'),
  saveSettings: (settings) => request('/settings', jsonBody(settings)),
  saveTheme: (tema) => request('/settings/theme', { method: 'PATCH', body: JSON.stringify({ tema }) }),
  templates: () => request('/templates'),
  sendManualWhatsAppMessage: (clientId, templateId) => request('/whatsapp/manual', {
    method: 'POST',
    body: JSON.stringify({ clientId, templateId }),
  }),
  createTemplate: (template) => request('/templates', { method: 'POST', body: JSON.stringify(template) }),
  updateTemplate: (id, template) => request(`/templates/${id}`, jsonBody(template)),
  setTemplateActive: (id, activa) => request(`/templates/${id}/active`, {
    method: 'PATCH',
    body: JSON.stringify({ activa }),
  }),
  deleteTemplate: (id) => request(`/templates/${id}`, { method: 'DELETE' }),
}
