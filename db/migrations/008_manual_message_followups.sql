CREATE TABLE IF NOT EXISTS whatsapp_manual_followups (
  client_id INT NOT NULL,
  template_id INT NOT NULL,
  template_name VARCHAR(100) NOT NULL,
  message_body TEXT NOT NULL,
  primary_message_id VARCHAR(255) DEFAULT NULL,
  status ENUM('sending', 'pending', 'processing', 'sent', 'cancelled', 'failed') NOT NULL,
  error_details TEXT DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP DEFAULT NULL,
  PRIMARY KEY (client_id),
  KEY whatsapp_manual_followups_status_index (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
