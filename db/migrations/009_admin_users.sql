CREATE TABLE IF NOT EXISTS usuarios_admin (
  id INT NOT NULL AUTO_INCREMENT,
  username VARCHAR(50) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  is_principal TINYINT(1) NOT NULL DEFAULT 0,
  creado_el TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY usuarios_admin_username_unique (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

INSERT IGNORE INTO usuarios_admin (username, password_hash, is_principal)
VALUES ('Mariano_1', '$2b$12$Oby8GFYl7PpbG6RrH7RVl.RS0nRDGIKM1LSafNrPDvYTtQzu4hZq2', 1);
