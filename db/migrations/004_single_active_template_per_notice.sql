ALTER TABLE plantillas_mensajes
  ADD COLUMN aviso_activo SMALLINT UNSIGNED NULL AFTER activa;

UPDATE plantillas_mensajes AS plantilla
LEFT JOIN (
  SELECT numero_aviso, MAX(id) AS id
  FROM plantillas_mensajes
  WHERE activa = 1
  GROUP BY numero_aviso
) AS ultima ON ultima.numero_aviso = plantilla.numero_aviso
SET plantilla.activa = 0
WHERE plantilla.activa = 1
  AND plantilla.id <> ultima.id;

UPDATE plantillas_mensajes
SET aviso_activo = CASE WHEN activa = 1 THEN numero_aviso ELSE NULL END;

ALTER TABLE plantillas_mensajes
  ADD UNIQUE KEY plantillas_mensajes_aviso_activo_unique (aviso_activo);
