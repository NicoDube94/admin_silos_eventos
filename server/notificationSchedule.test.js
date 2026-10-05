import assert from 'node:assert/strict'
import test from 'node:test'
import { getDueNotifications } from './notificationSchedule.js'

const settings = {
  dias_anticipacion: 60,
  cantidad_notificaciones: 3,
  plazos_dias: 15,
}

test('schedules due notices on configured dates and preserves any overdue notice', () => {
  const client = { fecha_nacimiento: '2010-12-30' }

  assert.deepEqual(getDueNotifications(client, settings, '2026-10-31'), [
    { numeroNotificacion: 1, anioFestejo: 2026, fechaProgramada: '2026-10-31' },
  ])
  assert.deepEqual(getDueNotifications(client, settings, '2026-11-15'), [
    { numeroNotificacion: 1, anioFestejo: 2026, fechaProgramada: '2026-10-31' },
    { numeroNotificacion: 2, anioFestejo: 2026, fechaProgramada: '2026-11-15' },
  ])
  assert.deepEqual(getDueNotifications(client, settings, '2026-11-30'), [
    { numeroNotificacion: 1, anioFestejo: 2026, fechaProgramada: '2026-10-31' },
    { numeroNotificacion: 2, anioFestejo: 2026, fechaProgramada: '2026-11-15' },
    { numeroNotificacion: 3, anioFestejo: 2026, fechaProgramada: '2026-11-30' },
  ])
})

test('uses the upcoming birthday year across New Year', () => {
  assert.deepEqual(
    getDueNotifications({ fecha_nacimiento: '2012-01-10' }, {
      dias_anticipacion: 10,
      cantidad_notificaciones: 1,
      plazos_dias: 5,
    }, '2026-12-31'),
    [{ numeroNotificacion: 1, anioFestejo: 2027, fechaProgramada: '2026-12-31' }],
  )
})

test('uses February 28 as the non-leap-year date for a February 29 birthday', () => {
  assert.deepEqual(
    getDueNotifications({ fecha_nacimiento: '2020-02-29' }, {
      dias_anticipacion: 3,
      cantidad_notificaciones: 1,
      plazos_dias: 1,
    }, '2026-02-25'),
    [{ numeroNotificacion: 1, anioFestejo: 2026, fechaProgramada: '2026-02-25' }],
  )
})

test('does not schedule notices before the first configured date', () => {
  assert.deepEqual(
    getDueNotifications({ fecha_nacimiento: '2010-12-30' }, settings, '2026-10-30'),
    [],
  )
})

test('returns every notification that became due while the scheduler was offline', () => {
  assert.deepEqual(
    getDueNotifications({ fecha_nacimiento: '2010-12-30' }, {
      dias_anticipacion: 7,
      cantidad_notificaciones: 2,
      plazos_dias: 3,
    }, '2026-12-27'),
    [
      { numeroNotificacion: 1, anioFestejo: 2026, fechaProgramada: '2026-12-23' },
      { numeroNotificacion: 2, anioFestejo: 2026, fechaProgramada: '2026-12-26' },
    ],
  )
})