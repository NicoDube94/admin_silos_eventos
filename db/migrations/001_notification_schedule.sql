ALTER TABLE historial_notificaciones
  ADD COLUMN numero_notificacion SMALLINT UNSIGNED NULL AFTER anio_festejo;

ALTER TABLE historial_notificaciones
  ADD COLUMN fecha_programada DATE NULL AFTER numero_notificacion;

UPDATE historial_notificaciones AS historial
JOIN (
  SELECT
    actual.id,
    COUNT(anterior.id) AS numero_notificacion,
    COALESCE(DATE(actual.fecha_envio), CURRENT_DATE()) AS fecha_programada
  FROM historial_notificaciones AS actual
  JOIN historial_notificaciones AS anterior
    ON anterior.cliente_id = actual.cliente_id
    AND anterior.anio_festejo = actual.anio_festejo
    AND (
      IFNULL(UNIX_TIMESTAMP(anterior.fecha_envio), 0) < IFNULL(UNIX_TIMESTAMP(actual.fecha_envio), 0)
      OR (
        IFNULL(UNIX_TIMESTAMP(anterior.fecha_envio), 0) = IFNULL(UNIX_TIMESTAMP(actual.fecha_envio), 0)
        AND anterior.id <= actual.id
      )
    )
  GROUP BY actual.id, actual.fecha_envio
) AS migracion ON migracion.id = historial.id
SET historial.numero_notificacion = migracion.numero_notificacion,
    historial.fecha_programada = migracion.fecha_programada;

ALTER TABLE historial_notificaciones
  MODIFY COLUMN numero_notificacion SMALLINT UNSIGNED NOT NULL;

ALTER TABLE historial_notificaciones
  MODIFY COLUMN fecha_programada DATE NOT NULL;

ALTER TABLE historial_notificaciones
  ADD UNIQUE KEY historial_notificaciones_cliente_anio_aviso_unique
    (cliente_id, anio_festejo, numero_notificacion);