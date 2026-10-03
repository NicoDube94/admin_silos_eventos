CREATE TABLE IF NOT EXISTS whatsapp_message_statuses (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  message_id VARCHAR(255) NOT NULL,
  recipient_id VARCHAR(32) NOT NULL,
  status VARCHAR(20) NOT NULL,
  source VARCHAR(16) NOT NULL,
  event_timestamp VARCHAR(32) NOT NULL,
  template_name VARCHAR(255) DEFAULT NULL,
  error_code VARCHAR(32) DEFAULT NULL,
  error_title VARCHAR(255) DEFAULT NULL,
  error_message TEXT DEFAULT NULL,
  error_details TEXT DEFAULT NULL,
  error_href VARCHAR(512) DEFAULT NULL,
  received_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY whatsapp_message_status_event_unique (message_id, status, source, event_timestamp),
  KEY whatsapp_message_status_received_index (received_at),
  KEY whatsapp_message_status_recipient_index (recipient_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;