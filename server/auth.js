import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import { ApiError } from './validation.js'

const issuer = 'silos-eventos'
const audience = 'silos-eventos-admin'
const dummyPasswordHash = '$2b$12$Oby8GFYl7PpbG6RrH7RVl.RS0nRDGIKM1LSafNrPDvYTtQzu4hZq2'
const usernameSchema = z.string()
  .trim()
  .min(3, 'El nombre de usuario debe tener al menos 3 caracteres.')
  .max(50, 'El nombre de usuario no puede superar 50 caracteres.')
  .regex(/^[\w.-]+$/, 'El nombre de usuario solo puede contener letras, números, puntos, guiones y guiones bajos.')
const passwordSchema = z.string()
  .min(8, 'La contraseña debe tener al menos 8 caracteres.')
  .max(72, 'La contraseña no puede superar 72 caracteres.')
  .refine((password) => Buffer.byteLength(password, 'utf8') <= 72, 'La contraseña supera el límite admitido.')
const loginSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
})
const createUserSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
})
const updateUserSchema = z.object({
  username: usernameSchema,
  password: z.union([passwordSchema, z.literal('')]).optional(),
})

function parseSchema(schema, value) {
  const result = schema.safeParse(value)
  if (!result.success) throw new ApiError(400, result.error.issues[0].message)
  return result.data
}

function getJwtSecret() {
  const secret = process.env.JWT_SECRET
  if (!secret || Buffer.byteLength(secret, 'utf8') < 32) {
    throw new ApiError(503, 'JWT_SECRET debe configurarse con al menos 32 bytes aleatorios.')
  }
  return secret
}

function mapUser(row) {
  return {
    id: Number(row.id),
    username: row.username,
    isPrincipal: Boolean(row.is_principal),
  }
}

export async function loginUser(database, credentials) {
  const { username, password } = parseSchema(loginSchema, credentials)
  const [rows] = await database.execute(
    'SELECT id, username, password_hash, is_principal FROM usuarios_admin WHERE username = ? LIMIT 1',
    [username],
  )
  const user = rows[0]
  const passwordMatches = await bcrypt.compare(password, user?.password_hash || dummyPasswordHash)
  if (!user || !passwordMatches) {
    throw new ApiError(401, 'Usuario o contraseña incorrectos.')
  }
  const token = jwt.sign(
    { username: user.username },
    getJwtSecret(),
    {
      algorithm: 'HS256',
      subject: String(user.id),
      issuer,
      audience,
      expiresIn: '8h',
    },
  )
  return { token, user: mapUser(user) }
}

export function createAuthMiddleware(getDatabase) {
  return async (request, _response, next) => {
    try {
      const authorization = request.get('authorization') || ''
      const bearerMatch = authorization.match(/^Bearer ([^\s]+)$/i)
      if (!bearerMatch) throw new ApiError(401, 'La sesión no es válida. Inicia sesión nuevamente.')

      const secret = getJwtSecret()
      let claims
      try {
        claims = jwt.verify(bearerMatch[1], secret, {
          algorithms: ['HS256'],
          issuer,
          audience,
        })
      } catch {
        throw new ApiError(401, 'La sesión venció o no es válida. Inicia sesión nuevamente.')
      }

      const [rows] = await getDatabase().execute(
        'SELECT id, username, is_principal FROM usuarios_admin WHERE id = ? LIMIT 1',
        [claims.sub],
      )
      if (!rows[0]) throw new ApiError(401, 'La cuenta ya no existe. Inicia sesión nuevamente.')
      request.authUser = mapUser(rows[0])
      next()
    } catch (error) {
      next(error)
    }
  }
}

export async function listUsers(database) {
  const [rows] = await database.execute(
    'SELECT id, username, is_principal FROM usuarios_admin ORDER BY is_principal DESC, username',
  )
  return rows.map(mapUser)
}

export async function createUser(database, input) {
  const { username, password } = parseSchema(createUserSchema, input)
  const passwordHash = await bcrypt.hash(password, 12)
  const [result] = await database.execute(
    'INSERT INTO usuarios_admin (username, password_hash, is_principal) VALUES (?, ?, 0)',
    [username, passwordHash],
  )
  return { id: Number(result.insertId), username, isPrincipal: false }
}

export async function updateUser(database, id, input) {
  const { username, password } = parseSchema(updateUserSchema, input)
  const [existingRows] = await database.execute(
    'SELECT id, is_principal FROM usuarios_admin WHERE id = ? LIMIT 1',
    [id],
  )
  if (!existingRows[0]) throw new ApiError(404, 'No se encontró el usuario.')

  if (password) {
    const passwordHash = await bcrypt.hash(password, 12)
    await database.execute(
      'UPDATE usuarios_admin SET username = ?, password_hash = ? WHERE id = ?',
      [username, passwordHash, id],
    )
  } else {
    await database.execute(
      'UPDATE usuarios_admin SET username = ? WHERE id = ?',
      [username, id],
    )
  }

  return { id: Number(id), username, isPrincipal: Boolean(existingRows[0].is_principal) }
}

export async function deleteUser(database, id) {
  const [rows] = await database.execute(
    'SELECT id, is_principal FROM usuarios_admin WHERE id = ? LIMIT 1',
    [id],
  )
  if (!rows[0]) throw new ApiError(404, 'No se encontró el usuario.')
  if (rows[0].is_principal) throw new ApiError(409, 'No se puede eliminar el usuario principal.')

  const [countRows] = await database.execute('SELECT COUNT(*) AS total FROM usuarios_admin')
  if (Number(countRows[0]?.total) <= 1) throw new ApiError(409, 'Debe quedar al menos un usuario.')

  await database.execute('DELETE FROM usuarios_admin WHERE id = ? AND is_principal = 0', [id])
  return { id: Number(id), deleted: true }
}
