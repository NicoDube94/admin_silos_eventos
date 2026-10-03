ALTER TABLE plantillas_mensajes
  ADD COLUMN eliminada TINYINT(1) NOT NULL DEFAULT 0 AFTER aviso_activo;
