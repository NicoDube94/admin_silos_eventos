export class ApiError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

function requiredString(value, field, maxLength) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ApiError(400, `${field} es obligatorio.`)
  }
  const normalized = value.trim()
  if (normalized.length > maxLength) {
    throw new ApiError(400, `${field} no puede superar ${maxLength} caracteres.`)
  }
  return normalized
}

export function parseId(value) {
  if (!/^\d+$/.test(String(value)) || Number(value) < 1) {
    throw new ApiError(400, 'El identificador no es válido.')
  }
  return Number(value)
}

export function validateClient(body = {}) {
  const fechaNacimiento = requiredString(body.fechaNacimiento, 'La fecha de nacimiento', 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaNacimiento)) {
    throw new ApiError(400, 'La fecha debe usar el formato AAAA-MM-DD.')
  }

  const [year, month, day] = fechaNacimiento.split('-').map(Number)
  const parsedDate = new Date(Date.UTC(year, month - 1, day))
  if (parsedDate.getUTCFullYear() !== year || parsedDate.getUTCMonth() !== month - 1 || parsedDate.getUTCDate() !== day) {
    throw new ApiError(400, 'La fecha de nacimiento no existe.')
  }
  if (parsedDate > new Date(new Date().toISOString().slice(0, 10))) {
    throw new ApiError(400, 'La fecha de nacimiento no puede estar en el futuro.')
  }

  return {
    tutor: requiredString(body.tutor, 'El nombre del tutor', 100),
    telefono: requiredString(body.telefono, 'El teléfono', 20),
    cumpleanero: requiredString(body.cumpleanero, 'El nombre del cumpleañero', 100),
    fechaNacimiento,
  }
}

export function validateSettings(body = {}) {
  const numericFields = [
    ['diasAnticipacion', 1, 365, 'Los días de anticipación'],
    ['cantidadNotificaciones', 1, 3, 'La cantidad de notificaciones'],
    ['plazosDias', 1, 90, 'El intervalo entre avisos'],
  ]
  const settings = {}

  for (const [field, minimum, maximum, label] of numericFields) {
    const value = Number(body[field])
    if (!Number.isInteger(value) || value < minimum || value > maximum) {
      throw new ApiError(400, `${label} debe ser un entero entre ${minimum} y ${maximum}.`)
    }
    settings[field] = value
  }

  if (settings.diasAnticipacion <= settings.plazosDias * (settings.cantidadNotificaciones - 1)) {
    throw new ApiError(400, 'Los días de anticipación deben ser mayores que los intervalos acumulados entre avisos.')
  }

  settings.telefonoAdmin = requiredString(body.telefonoAdmin, 'El teléfono de administración', 20)
  return settings
}

export function validateTheme(body = {}) {
  if (body.tema !== 'light' && body.tema !== 'dark') {
    throw new ApiError(400, 'El tema debe ser light o dark.')
  }
  return body.tema
}

export function validateTemplate(body = {}) {
  if (typeof body.activa !== 'boolean') {
    throw new ApiError(400, 'El campo activa debe ser verdadero o falso.')
  }
  const numeroAviso = Number(body.numeroAviso)
  if (!Number.isInteger(numeroAviso) || numeroAviso < 1 || numeroAviso > 3) {
    throw new ApiError(400, 'El número de aviso debe ser 1, 2 o 3.')
  }
  return {
    nombreOferta: requiredString(body.nombreOferta, 'El nombre de la oferta', 100),
    cuerpoMensaje: requiredString(body.cuerpoMensaje, 'El cuerpo del mensaje', 10000),
    numeroAviso,
    activa: body.activa,
  }
}
