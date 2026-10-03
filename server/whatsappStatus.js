export async function recordWhatsAppStatus(database, status) {
  if (!status.messageId || !status.status) {
    throw new Error('El estado de WhatsApp requiere messageId y status.')
  }

  await database.execute(
    `INSERT INTO whatsapp_message_statuses
      (message_id, recipient_id, status, source, event_timestamp, template_name,
       error_code, error_title, error_message, error_details, error_href)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       recipient_id = VALUES(recipient_id),
       template_name = VALUES(template_name),
       error_code = VALUES(error_code),
       error_title = VALUES(error_title),
       error_message = VALUES(error_message),
       error_details = VALUES(error_details),
       error_href = VALUES(error_href)`,
    [
      status.messageId,
      status.recipientId || '',
      status.status,
      status.source,
      status.timestamp,
      status.templateName || null,
      status.error?.code == null ? null : String(status.error.code),
      status.error?.title || null,
      status.error?.message || null,
      status.error?.details || null,
      status.error?.href || null,
    ],
  )
}