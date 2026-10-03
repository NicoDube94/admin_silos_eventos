import { getDueNotifications } from './notificationSchedule.js'

const defaultSettings = {
  dias_anticipacion: 60,
  cantidad_notificaciones: 3,
  plazos_dias: 15,
}

export async function generateDueNotifications(database, today) {
  const [settingsRows] = await database.execute(
    'SELECT dias_anticipacion, cantidad_notificaciones, plazos_dias FROM configuracion_sistema WHERE id = 1 LIMIT 1',
  )
  const settings = settingsRows[0] || defaultSettings
  const [clients] = await database.execute(
    "SELECT id, DATE_FORMAT(fecha_nacimiento, '%Y-%m-%d') AS fecha_nacimiento FROM clientes WHERE activo = 1",
  )
  const [templates] = await database.execute(
    'SELECT id, numero_aviso, cuerpo_mensaje FROM plantillas_mensajes WHERE activa = 1 AND eliminada = 0 ORDER BY id DESC',
  )
  const templateByNotice = new Map()
  for (const template of templates) {
    if (!templateByNotice.has(Number(template.numero_aviso))) {
      templateByNotice.set(Number(template.numero_aviso), template)
    }
  }
  let created = 0

  for (const client of clients) {
    const dueNotifications = getDueNotifications(client, settings, today)
    for (const notification of dueNotifications) {
      const template = templateByNotice.get(notification.numeroNotificacion)
      const [result] = await database.execute(
        `INSERT IGNORE INTO historial_notificaciones
          (cliente_id, anio_festejo, numero_notificacion, fecha_programada, plantilla_id, mensaje_enviado, estado)
         VALUES (?, ?, ?, ?, ?, ?, 'pendiente')`,
        [
          client.id,
          notification.anioFestejo,
          notification.numeroNotificacion,
          notification.fechaProgramada,
          template?.id ?? null,
          template?.cuerpo_mensaje ?? null,
        ],
      )
      created += Number(result.affectedRows || 0)
    }
  }

  return { evaluated: clients.length, created }
}