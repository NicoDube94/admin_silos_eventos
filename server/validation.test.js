import assert from 'node:assert/strict'
import test from 'node:test'
import { parseId, validateClient, validateManualMessage, validateSettings, validateTemplate, validateTheme } from './validation.js'

test('parseId only accepts positive integer identifiers', () => {
  assert.equal(parseId('42'), 42)
  assert.throws(() => parseId('0'), { status: 400 })
  assert.throws(() => parseId('12abc'), { status: 400 })
})

test('validateClient normalizes the required fields', () => {
  assert.deepEqual(validateClient({
    tutor: '  Ana Pérez ',
    telefono: '+54 9 11 5555 0101',
    cumpleanero: '  Tomás ',
    fechaNacimiento: '2020-02-29',
  }), {
    tutor: 'Ana Pérez',
    telefono: '+54 9 11 5555 0101',
    cumpleanero: 'Tomás',
    fechaNacimiento: '2020-02-29',
  })
})

test('validateClient rejects impossible and future birthdays', () => {
  const client = {
    tutor: 'Ana Pérez',
    telefono: '+54 9 11 5555 0101',
    cumpleanero: 'Tomás',
    fechaNacimiento: '2021-02-29',
  }
  assert.throws(() => validateClient(client), { status: 400 })
  assert.throws(() => validateClient({ ...client, fechaNacimiento: '2999-01-01' }), { status: 400 })
})

test('validateSettings enforces the supported ranges', () => {
  assert.equal(validateSettings({
    diasAnticipacion: 60,
    telefonoAdmin: '+54 9 11 5555 0000',
    cantidadNotificaciones: 3,
    plazosDias: 15,
  }).cantidadNotificaciones, 3)
  assert.throws(() => validateSettings({
    diasAnticipacion: 0,
    telefonoAdmin: '+54 9 11 5555 0000',
    cantidadNotificaciones: 3,
    plazosDias: 15,
  }), { status: 400 })
  assert.throws(() => validateSettings({
    diasAnticipacion: 60,
    telefonoAdmin: '+54 9 11 5555 0000',
    cantidadNotificaciones: 4,
    plazosDias: 15,
  }), { status: 400 })
  assert.throws(() => validateSettings({
    diasAnticipacion: 30,
    telefonoAdmin: '+54 9 11 5555 0000',
    cantidadNotificaciones: 3,
    plazosDias: 15,
  }), { status: 400 })
})

test('validateTemplate requires an explicit boolean active state', () => {
  assert.deepEqual(validateTemplate({ nombreOferta: 'Oferta', cuerpoMensaje: 'Hola', numeroAviso: 2, activa: false }), {
    nombreOferta: 'Oferta',
    cuerpoMensaje: 'Hola',
    numeroAviso: 2,
    activa: false,
  })
  assert.throws(() => validateTemplate({ nombreOferta: 'Oferta', cuerpoMensaje: 'Hola', numeroAviso: 4, activa: true }), { status: 400 })
  assert.throws(() => validateTemplate({ nombreOferta: 'Oferta', cuerpoMensaje: 'Hola', numeroAviso: 1, activa: 'false' }), { status: 400 })
})

test('validateTheme accepts only light and dark', () => {
  assert.equal(validateTheme({ tema: 'dark' }), 'dark')
  assert.equal(validateTheme({ tema: 'light' }), 'light')
  assert.throws(() => validateTheme({ tema: 'blue' }), { status: 400 })
})

test('validateManualMessage requires positive client and template identifiers', () => {
  assert.deepEqual(validateManualMessage({ clientId: '8', templateId: 12 }), {
    clientId: 8,
    templateId: 12,
  })
  assert.throws(() => validateManualMessage({ clientId: 0, templateId: 12 }), { status: 400 })
  assert.throws(() => validateManualMessage({ clientId: 8, templateId: 'invalid' }), { status: 400 })
})
