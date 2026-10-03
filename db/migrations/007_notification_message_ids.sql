ALTER TABLE historial_notificaciones
  ADD COLUMN whatsapp_message_id VARCHAR(255) DEFAULT NULL AFTER mensaje_enviado;

CREATE INDEX historial_notificaciones_whatsapp_message_index
  ON historial_notificaciones (whatsapp_message_id);