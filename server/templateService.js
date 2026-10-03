function mapTemplate(row) {
  return {
    id: Number(row.id),
    nombreOferta: row.nombre_oferta,
    cuerpoMensaje: row.cuerpo_mensaje,
    numeroAviso: Number(row.numero_aviso),
    activa: Boolean(row.activa),
  }
}

async function begin(database) {
  const connection = await database.getConnection()
  await connection.beginTransaction()
  return connection
}

async function lockActiveTemplates(connection, numeroAviso, exceptId = 0) {
  const [rows] = await connection.execute(
    `SELECT id, nombre_oferta
     FROM plantillas_mensajes
    WHERE numero_aviso = ? AND activa = 1 AND eliminada = 0 AND id <> ?
     ORDER BY id DESC
     FOR UPDATE`,
    [numeroAviso, exceptId],
  )
  return rows
}

async function deactivateTemplates(connection, rows) {
  if (rows.length === 0) return
  const ids = rows.map((row) => Number(row.id))
  const placeholders = ids.map(() => '?').join(', ')
  await connection.execute(
    `UPDATE plantillas_mensajes
     SET activa = 0, aviso_activo = NULL
     WHERE id IN (${placeholders})`,
    ids,
  )
}

async function readTemplate(connection, id) {
  const [rows] = await connection.execute(
    'SELECT id, nombre_oferta, cuerpo_mensaje, numero_aviso, activa FROM plantillas_mensajes WHERE id = ? AND eliminada = 0 LIMIT 1',
    [id],
  )
  return rows[0] ? mapTemplate(rows[0]) : null
}

export async function saveTemplate(database, id, template) {
  const connection = await begin(database)
  try {
    if (id) {
      const [existingRows] = await connection.execute(
        'SELECT id FROM plantillas_mensajes WHERE id = ? AND eliminada = 0 LIMIT 1 FOR UPDATE',
        [id],
      )
      if (!existingRows[0]) {
        const error = new Error('No se encontró una plantilla con ese identificador.')
        error.status = 404
        throw error
      }
    }

    const desactivadas = template.activa
      ? await lockActiveTemplates(connection, template.numeroAviso, id || 0)
      : []
    await deactivateTemplates(connection, desactivadas)

    let templateId = id
    if (id) {
      await connection.execute(
        `UPDATE plantillas_mensajes
         SET nombre_oferta = ?, cuerpo_mensaje = ?, numero_aviso = ?, activa = ?, aviso_activo = ?
         WHERE id = ?`,
        [template.nombreOferta, template.cuerpoMensaje, template.numeroAviso, template.activa ? 1 : 0, template.activa ? template.numeroAviso : null, id],
      )
    } else {
      const [result] = await connection.execute(
        `INSERT INTO plantillas_mensajes
          (nombre_oferta, cuerpo_mensaje, numero_aviso, activa, aviso_activo)
         VALUES (?, ?, ?, ?, ?)`,
        [template.nombreOferta, template.cuerpoMensaje, template.numeroAviso, template.activa ? 1 : 0, template.activa ? template.numeroAviso : null],
      )
      templateId = result.insertId
    }

    const savedTemplate = await readTemplate(connection, templateId)
    await connection.commit()
    return { template: savedTemplate, desactivadas: desactivadas.map((row) => ({ id: Number(row.id), nombreOferta: row.nombre_oferta })) }
  } catch (error) {
    await connection.rollback()
    if (error.code === 'ER_DUP_ENTRY') {
      error.status = 409
      error.message = 'Ya hay una plantilla activa para ese aviso. Actualiza la lista e inténtalo nuevamente.'
    }
    throw error
  } finally {
    connection.release()
  }
}

export async function setTemplateActive(database, id, activa) {
  const connection = await begin(database)
  try {
    const [rows] = await connection.execute(
      'SELECT id, nombre_oferta, numero_aviso FROM plantillas_mensajes WHERE id = ? AND eliminada = 0 LIMIT 1 FOR UPDATE',
      [id],
    )
    const current = rows[0]
    if (!current) {
      const error = new Error('No se encontró una plantilla con ese identificador.')
      error.status = 404
      throw error
    }

    const desactivadas = activa
      ? await lockActiveTemplates(connection, Number(current.numero_aviso), Number(id))
      : []
    await deactivateTemplates(connection, desactivadas)
    await connection.execute(
      'UPDATE plantillas_mensajes SET activa = ?, aviso_activo = ? WHERE id = ?',
      [activa ? 1 : 0, activa ? Number(current.numero_aviso) : null, id],
    )

    const plantilla = await readTemplate(connection, id)
    await connection.commit()
    return { plantilla, desactivadas: desactivadas.map((row) => ({ id: Number(row.id), nombreOferta: row.nombre_oferta })) }
  } catch (error) {
    await connection.rollback()
    if (error.code === 'ER_DUP_ENTRY') {
      error.status = 409
      error.message = 'Ya hay una plantilla activa para ese aviso. Actualiza la lista e inténtalo nuevamente.'
    }
    throw error
  } finally {
    connection.release()
  }
}

export async function deleteTemplate(database, id) {
  const connection = await begin(database)
  try {
    const [rows] = await connection.execute(
      'SELECT id, nombre_oferta, numero_aviso FROM plantillas_mensajes WHERE id = ? AND eliminada = 0 LIMIT 1 FOR UPDATE',
      [id],
    )
    const current = rows[0]
    if (!current) {
      const error = new Error('No se encontró una plantilla disponible con ese identificador.')
      error.status = 404
      throw error
    }

    await connection.execute(
      'UPDATE plantillas_mensajes SET activa = 0, aviso_activo = NULL, eliminada = 1 WHERE id = ?',
      [id],
    )
    await connection.commit()
    return {
      id: Number(current.id),
      nombreOferta: current.nombre_oferta,
      numeroAviso: Number(current.numero_aviso),
      eliminada: true,
    }
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}
