ALTER TABLE plantillas_mensajes
  ADD COLUMN numero_aviso SMALLINT UNSIGNED NOT NULL DEFAULT 1 AFTER cuerpo_mensaje;

ALTER TABLE historial_notificaciones
  ADD COLUMN plantilla_id INT DEFAULT NULL AFTER fecha_programada;

ALTER TABLE historial_notificaciones
  ADD COLUMN mensaje_enviado TEXT DEFAULT NULL AFTER plantilla_id;

ALTER TABLE historial_notificaciones
  ADD KEY historial_notificaciones_plantilla_id_index (plantilla_id);

UPDATE historial_notificaciones AS historial
JOIN (
  SELECT numero_aviso, MAX(id) AS id
  FROM plantillas_mensajes
  WHERE activa = 1
  GROUP BY numero_aviso
) AS ultima ON ultima.numero_aviso = historial.numero_notificacion
JOIN plantillas_mensajes AS plantilla ON plantilla.id = ultima.id
SET historial.plantilla_id = plantilla.id,
    historial.mensaje_enviado = plantilla.cuerpo_mensaje
WHERE historial.estado = 'enviado'
  AND historial.plantilla_id IS NULL;