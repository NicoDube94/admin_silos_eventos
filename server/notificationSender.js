import { readFile } from 'node:fs/promises'
import { sendWhatsAppTemplate, uploadWhatsAppMedia } from './whatsapp.js'
import { recordWhatsAppStatus } from './whatsappStatus.js'

export async function dispatchDueNotifications(database, today, options = {}) {
  const enabled = options.enabled ?? process.env.WHATSAPP_AUTOMATED_SENDING_ENABLED === 'true'

  if (!enabled) {
    return { enabled: false, attempted: 0, accepted: 0, failed: 0 }
  }

  const [notifications] = await database.execute(
    `SELECT h.id AS historial_id, h.cliente_id, h.numero_notificacion,
      c.nombre_tutor, c.telefono_whatsapp, c.nombre_cumpleanero
     FROM historial_notificaciones h
     JOIN clientes c ON c.id = h.cliente_id
     WHERE h.fecha_programada <= ? AND h.estado = 'pendiente'
       AND c.activo = 1
       AND h.anio_festejo = CASE
         WHEN DATE_FORMAT(c.fecha_nacimiento, '%m-%d') < DATE_FORMAT(?, '%m-%d')
         THEN YEAR(?) + 1
         ELSE YEAR(?)
       END
     ORDER BY h.fecha_programada, h.id`,
    [today, today, today, today],
  )

  if (!notifications.length) {
    return { enabled: true, attempted: 0, accepted: 0, failed: 0 }
  }

  const templateName = options.templateName ?? process.env.PLANTILLA_WHATSAPP
  const language = options.language ?? process.env.WHATSAPP_TEMPLATE_LANGUAGE
  const image = options.imageBuffer ?? await readFile(new URL('../silos_1.jpg', import.meta.url))
  const upload = options.uploadMedia ?? uploadWhatsAppMedia
  const sendTemplate = options.sendTemplate ?? sendWhatsAppTemplate
  const media = options.headerImageId
    ? { mediaId: options.headerImageId }
    : await upload(image, 'silos_1.jpg', 'image/jpeg')
  const outcomes = []

  for (const notification of notifications) {
    const [claim] = await database.execute(
      "UPDATE historial_notificaciones SET estado = 'enviando' WHERE id = ? AND estado = 'pendiente'",
      [notification.historial_id],
    )
    if (!claim.affectedRows) continue

    const parameters = [notification.nombre_tutor, notification.nombre_cumpleanero]
    let clientResult
    let clientError
    try {
      clientResult = await sendTemplate(notification.telefono_whatsapp, templateName, language, {
        parameters,
        headerImage: { id: media.mediaId },
      })
    } catch (error) {
      clientError = error
    }

    if (clientError) {
      const details = JSON.stringify({ message: clientError.message, meta: clientError.meta ?? null })
      await database.execute(
        `UPDATE historial_notificaciones SET estado = 'fallido', detalle_error = ?
         WHERE id = ? AND estado = 'enviando'`,
        [details, notification.historial_id],
      )
      outcomes.push({ clientId: Number(notification.cliente_id), status: 'failed', error: clientError.message })
    } else {
      if (!clientResult.messageId) throw new Error('Meta aceptó el envío sin devolver un identificador de mensaje.')
      await recordWhatsAppStatus(database, {
        messageId: clientResult.messageId,
        recipientId: notification.telefono_whatsapp,
        status: 'accepted',
        source: 'cloud_api',
        timestamp: new Date().toISOString(),
        templateName,
      })
      await database.execute(
        `UPDATE historial_notificaciones
         SET estado = 'enviado', fecha_envio = CURRENT_TIMESTAMP,
           whatsapp_message_id = ?, detalle_error = NULL
         WHERE id = ? AND estado = 'enviando'`,
        [clientResult.messageId, notification.historial_id],
      )
      outcomes.push({ clientId: Number(notification.cliente_id), status: 'accepted', messageId: clientResult.messageId })
    }

  }

  return {
    enabled: true,
    attempted: outcomes.length,
    accepted: outcomes.filter((outcome) => outcome.status === 'accepted').length,
    failed: outcomes.filter((outcome) => outcome.status === 'failed').length,
    outcomes,
  }
}