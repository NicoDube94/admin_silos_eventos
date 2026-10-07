import assert from 'node:assert/strict'
import jwt from 'jsonwebtoken'
import test from 'node:test'
import {
  createAuthMiddleware,
  createUser,
  deleteUser,
  loginUser,
  updateUser,
} from './auth.js'

const seedHash = '$2b$12$Oby8GFYl7PpbG6RrH7RVl.RS0nRDGIKM1LSafNrPDvYTtQzu4hZq2'

function withJwtSecret(callback) {
  const original = process.env.JWT_SECRET
  process.env.JWT_SECRET = 'test-jwt-secret-that-is-long-enough-123456'
  return Promise.resolve()
    .then(callback)
    .finally(() => {
      if (original === undefined) delete process.env.JWT_SECRET
      else process.env.JWT_SECRET = original
    })
}

test('authenticates the seeded admin with bcrypt and signs an expiring JWT', async () => {
  await withJwtSecret(async () => {
    const database = {
      async execute(query) {
        assert.match(query, /FROM usuarios_admin/)
        return [[{
          id: 1,
          username: 'Mariano_1',
          password_hash: seedHash,
          is_principal: 1,
        }]]
      },
    }

    const result = await loginUser(database, { username: 'Mariano_1', password: 'admin123#' })
    const claims = jwt.verify(result.token, process.env.JWT_SECRET, { algorithms: ['HS256'] })
    assert.equal(result.user.username, 'Mariano_1')
    assert.equal(result.user.isPrincipal, true)
    assert.equal(claims.sub, '1')
    assert.equal(claims.iss, 'silos-eventos')
    await assert.rejects(
      loginUser(database, { username: 'Mariano_1', password: 'incorrecta' }),
      { status: 401 },
    )
  })
})

test('auth middleware rejects invalid tokens and verifies the account still exists', async () => {
  await withJwtSecret(async () => {
    const middleware = createAuthMiddleware(() => ({
      async execute() {
        return [[{ id: 1, username: 'Mariano_1', is_principal: 1 }]]
      },
    }))
    const token = jwt.sign({}, process.env.JWT_SECRET, {
      algorithm: 'HS256',
      subject: '1',
      issuer: 'silos-eventos',
      audience: 'silos-eventos-admin',
      expiresIn: '1h',
    })
    const request = { get: () => `Bearer ${token}` }
    let nextError
    await middleware(request, {}, (error) => { nextError = error })
    assert.equal(nextError, undefined)
    assert.deepEqual(request.authUser, { id: 1, username: 'Mariano_1', isPrincipal: true })

    const invalidRequest = { get: () => 'Bearer invalid' }
    await middleware(invalidRequest, {}, (error) => { nextError = error })
    assert.equal(nextError.status, 401)
  })
})

test('creates and edits users with hashed passwords, and protects the principal account', async () => {
  const statements = []
  const database = {
    async execute(query, values) {
      statements.push({ query, values })
      if (query.startsWith('INSERT INTO usuarios_admin')) return [{ insertId: 2 }]
      if (query.startsWith('SELECT id, is_principal')) return [[{ id: values[0], is_principal: values[0] === 1 ? 1 : 0 }]]
      if (query.startsWith('SELECT COUNT(*)')) return [[{ total: 2 }]]
      return [{ affectedRows: 1 }]
    },
  }

  const created = await createUser(database, { username: 'operador', password: 'clave-segura-1' })
  assert.deepEqual(created, { id: 2, username: 'operador', isPrincipal: false })
  assert.match(statements[0].values[1], /^\$2[aby]\$/)
  const updated = await updateUser(database, 2, { username: 'operador2', password: '' })
  assert.deepEqual(updated, { id: 2, username: 'operador2', isPrincipal: false })
  await assert.rejects(deleteUser(database, 1), { status: 409 })
  assert.deepEqual(await deleteUser(database, 2), { id: 2, deleted: true })
  assert.ok(statements.some(({ query }) => query.startsWith('DELETE FROM usuarios_admin')))
})

test('rejects weak new user passwords and names', async () => {
  const database = { execute: async () => { throw new Error('No debe consultar la base') } }
  await assert.rejects(
    createUser(database, { username: 'a', password: '123' }),
    { status: 400 },
  )
})
