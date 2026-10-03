import assert from 'node:assert/strict'
import test from 'node:test'
import { deleteTemplate, saveTemplate, setTemplateActive } from './templateService.js'

function createDatabase(initialTemplates = []) {
  const templates = initialTemplates.map((template) => ({ ...template }))
  let nextId = Math.max(0, ...templates.map((template) => template.id)) + 1
  let snapshot
  const queries = []

  const connection = {
    async beginTransaction() {
      snapshot = templates.map((template) => ({ ...template }))
    },
    async commit() {
      snapshot = null
    },
    async rollback() {
      templates.splice(0, templates.length, ...snapshot.map((template) => ({ ...template })))
    },
    release() {},
    async execute(query, values = []) {
      queries.push(query)
      if (query.startsWith('SELECT id FROM plantillas_mensajes WHERE id =')) {
        return [templates.filter((template) => template.id === Number(values[0])).map((template) => ({ id: template.id }))]
      }
      if (query.includes('WHERE numero_aviso = ? AND activa = 1 AND eliminada = 0 AND id <> ?')) {
        return [templates
          .filter((template) => template.numero_aviso === Number(values[0]) && template.activa && !template.eliminada && template.id !== Number(values[1]))
          .map((template) => ({ id: template.id, nombre_oferta: template.nombre_oferta }))]
      }
      if (query.startsWith('SELECT id, nombre_oferta, numero_aviso FROM plantillas_mensajes')) {
        return [templates.filter((template) => template.id === Number(values[0])).map((template) => ({
          id: template.id,
          nombre_oferta: template.nombre_oferta,
          numero_aviso: template.numero_aviso,
        }))]
      }
      if (query.startsWith('UPDATE plantillas_mensajes') && query.includes('WHERE id IN')) {
        for (const id of values) {
          const template = templates.find((item) => item.id === Number(id))
          if (template) {
            template.activa = 0
            template.aviso_activo = null
          }
        }
        return [{ affectedRows: values.length }]
      }
      if (query.startsWith('UPDATE plantillas_mensajes SET activa = 0, aviso_activo = NULL, eliminada = 1')) {
        const template = templates.find((item) => item.id === Number(values[0]))
        Object.assign(template, { activa: false, aviso_activo: null, eliminada: true })
        return [{ affectedRows: 1 }]
      }
      if (query.startsWith('UPDATE plantillas_mensajes') && query.includes('SET nombre_oferta')) {
        const [nombreOferta, cuerpoMensaje, numeroAviso, activa, avisoActivo, id] = values
        const template = templates.find((item) => item.id === Number(id))
        Object.assign(template, {
          nombre_oferta: nombreOferta,
          cuerpo_mensaje: cuerpoMensaje,
          numero_aviso: Number(numeroAviso),
          activa: Boolean(activa),
          aviso_activo: avisoActivo,
        })
        return [{ affectedRows: 1 }]
      }
      if (query.startsWith('INSERT INTO plantillas_mensajes')) {
        const [nombreOferta, cuerpoMensaje, numeroAviso, activa, avisoActivo] = values
        const template = {
          id: nextId++,
          nombre_oferta: nombreOferta,
          cuerpo_mensaje: cuerpoMensaje,
          numero_aviso: Number(numeroAviso),
          activa: Boolean(activa),
          aviso_activo: avisoActivo,
        }
        templates.push(template)
        return [{ insertId: template.id }]
      }
      if (query.startsWith('UPDATE plantillas_mensajes SET activa')) {
        const [activa, avisoActivo, id] = values
        const template = templates.find((item) => item.id === Number(id))
        Object.assign(template, { activa: Boolean(activa), aviso_activo: avisoActivo })
        return [{ affectedRows: 1 }]
      }
      if (query.startsWith('SELECT id, nombre_oferta, cuerpo_mensaje')) {
        return [templates.filter((template) => template.id === Number(values[0])).map((template) => ({ ...template }))]
      }
      throw new Error(`Consulta inesperada: ${query}`)
    },
  }

  return {
    templates,
    queries,
    async getConnection() {
      return connection
    },
  }
}

const newTemplate = (overrides = {}) => ({
  nombreOferta: 'Nueva oferta',
  cuerpoMensaje: 'Texto nuevo',
  numeroAviso: 2,
  activa: true,
  ...overrides,
})

test('creating an active template deactivates the active template for the same notice', async () => {
  const database = createDatabase([{
    id: 3,
    nombre_oferta: 'Oferta anterior',
    cuerpo_mensaje: 'Texto anterior',
    numero_aviso: 2,
    activa: true,
    aviso_activo: 2,
  }])

  const result = await saveTemplate(database, null, newTemplate())

  assert.equal(result.template.activa, true)
  assert.equal(result.template.numeroAviso, 2)
  assert.deepEqual(result.desactivadas, [{ id: 3, nombreOferta: 'Oferta anterior' }])
  assert.equal(Boolean(database.templates.find((template) => template.id === 3).activa), false)
  assert.equal(database.templates.filter((template) => template.activa && template.numero_aviso === 2).length, 1)
})

test('activating a template deactivates conflicts and reports the change', async () => {
  const database = createDatabase([
    { id: 2, nombre_oferta: 'Oferta vieja', cuerpo_mensaje: 'Texto', numero_aviso: 1, activa: true, aviso_activo: 1 },
    { id: 5, nombre_oferta: 'Oferta nueva', cuerpo_mensaje: 'Texto', numero_aviso: 1, activa: false, aviso_activo: null },
  ])

  const result = await setTemplateActive(database, 5, true)

  assert.equal(result.plantilla.activa, true)
  assert.deepEqual(result.desactivadas, [{ id: 2, nombreOferta: 'Oferta vieja' }])
  assert.equal(database.templates.filter((template) => template.activa && template.numero_aviso === 1).length, 1)
})

test('creating an inactive template leaves the current active template unchanged', async () => {
  const database = createDatabase([
    { id: 1, nombre_oferta: 'Activa', cuerpo_mensaje: 'Texto', numero_aviso: 3, activa: true, aviso_activo: 3 },
  ])

  const result = await saveTemplate(database, null, newTemplate({ numeroAviso: 3, activa: false }))

  assert.deepEqual(result.desactivadas, [])
  assert.equal(database.templates.find((template) => template.id === 1).activa, true)
  assert.equal(result.template.activa, false)
})

test('soft-deleting a template deactivates it without physically deleting its history reference', async () => {
  const database = createDatabase([{
    id: 7,
    nombre_oferta: 'Plantilla activa',
    cuerpo_mensaje: 'Mensaje guardado',
    numero_aviso: 1,
    activa: true,
    aviso_activo: 1,
    eliminada: false,
  }])

  const result = await deleteTemplate(database, 7)

  assert.deepEqual(result, {
    id: 7,
    nombreOferta: 'Plantilla activa',
    numeroAviso: 1,
    eliminada: true,
  })
  assert.equal(database.templates[0].eliminada, true)
  assert.equal(Boolean(database.templates[0].activa), false)
  assert.equal(database.templates[0].aviso_activo, null)
  assert.equal(database.queries.some((query) => /^DELETE\s/i.test(query)), false)
})
