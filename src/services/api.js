async function request(path, options = {}) {
  let response
  try {
    response = await fetch(`/api${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
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

  if (!response.ok) throw new Error(body.error || `Error HTTP ${response.status}`)
  return body
}

function jsonBody(value) {
  return { method: 'PUT', body: JSON.stringify(value) }
}

export const api = {
  health: () => request('/health'),
  clients: () => request('/clients'),
  notifications: () => request('/notifications'),
  createClient: (client) => request('/clients', { method: 'POST', body: JSON.stringify(client) }),
  updateClient: (id, client) => request(`/clients/${id}`, { ...jsonBody(client), method: 'PUT' }),
  deactivateClient: (id) => request(`/clients/${id}/deactivate`, { method: 'PATCH' }),
  settings: () => request('/settings'),
  saveSettings: (settings) => request('/settings', jsonBody(settings)),
  saveTheme: (tema) => request('/settings/theme', { method: 'PATCH', body: JSON.stringify({ tema }) }),
  templates: () => request('/templates'),
  createTemplate: (template) => request('/templates', { method: 'POST', body: JSON.stringify(template) }),
  updateTemplate: (id, template) => request(`/templates/${id}`, jsonBody(template)),
  setTemplateActive: (id, activa) => request(`/templates/${id}/active`, {
    method: 'PATCH',
    body: JSON.stringify({ activa }),
  }),
  deleteTemplate: (id) => request(`/templates/${id}`, { method: 'DELETE' }),
}
