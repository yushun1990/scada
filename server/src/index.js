import crypto from 'node:crypto'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import pg from 'pg'

const { Pool } = pg

const host = process.env.HOST ?? '0.0.0.0'
const port = Number(process.env.PORT ?? 3000)
const databaseUrl = process.env.DATABASE_URL
const adminToken = process.env.SCADA_ADMIN_TOKEN
const allowedOrigins = new Set(
  (process.env.CORS_ORIGINS ?? 'https://yushun1990.github.io,http://localhost:5173,http://127.0.0.1:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
)

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required')
}

if (!adminToken) {
  throw new Error('SCADA_ADMIN_TOKEN is required')
}

const app = Fastify({ logger: true })
const pool = new Pool({ connectionString: databaseUrl })

await app.register(cors, {
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) {
      callback(null, true)
      return
    }

    callback(new Error('Origin is not allowed'), false)
  },
})

function requireAdmin(request, reply, done) {
  const authorization = request.headers.authorization
  if (authorization !== `Bearer ${adminToken}`) {
    reply.code(401).send({ error: 'unauthorized' })
    return
  }

  done()
}

function normalizeComponentInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return null
  }

  const { type, title, status = 'draft', package: componentPackage } = body
  if (typeof type !== 'string' || !type.trim()) return null
  if (typeof title !== 'string' || !title.trim()) return null
  if (typeof status !== 'string' || !status.trim()) return null
  if (!componentPackage || typeof componentPackage !== 'object' || Array.isArray(componentPackage)) return null

  return {
    type: type.trim(),
    title: title.trim(),
    status: status.trim(),
    package: componentPackage,
  }
}

async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS components (
      id uuid PRIMARY KEY,
      type text NOT NULL,
      title text NOT NULL,
      status text NOT NULL DEFAULT 'draft',
      revision integer NOT NULL DEFAULT 1,
      package jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS components_updated_at_idx
      ON components (updated_at DESC)
  `)
}

async function connectDatabase() {
  let lastError

  for (let attempt = 1; attempt <= 30; attempt += 1) {
    try {
      await pool.query('SELECT 1')
      await ensureSchema()
      return
    } catch (error) {
      lastError = error
      app.log.warn({ attempt, error }, 'database is not ready')
      await new Promise((resolve) => setTimeout(resolve, 2000))
    }
  }

  throw lastError
}

app.get('/health', async () => {
  await pool.query('SELECT 1')
  return { ok: true, service: 'scada-api' }
})

app.get('/api/components', async () => {
  const result = await pool.query(`
    SELECT id, type, title, status, revision, package,
           created_at AS "createdAt", updated_at AS "updatedAt"
      FROM components
     ORDER BY updated_at DESC
  `)

  return { items: result.rows }
})

app.get('/api/components/:id', async (request, reply) => {
  const result = await pool.query(`
    SELECT id, type, title, status, revision, package,
           created_at AS "createdAt", updated_at AS "updatedAt"
      FROM components
     WHERE id = $1
  `, [request.params.id])

  if (result.rowCount === 0) {
    return reply.code(404).send({ error: 'component_not_found' })
  }

  return result.rows[0]
})

app.post('/api/components', { preHandler: requireAdmin }, async (request, reply) => {
  const input = normalizeComponentInput(request.body)
  if (!input) {
    return reply.code(400).send({ error: 'invalid_component' })
  }

  const id = crypto.randomUUID()
  const result = await pool.query(`
    INSERT INTO components (id, type, title, status, package)
    VALUES ($1, $2, $3, $4, $5::jsonb)
    RETURNING id, type, title, status, revision, package,
              created_at AS "createdAt", updated_at AS "updatedAt"
  `, [id, input.type, input.title, input.status, JSON.stringify(input.package)])

  return reply.code(201).send(result.rows[0])
})

app.put('/api/components/:id', { preHandler: requireAdmin }, async (request, reply) => {
  const input = normalizeComponentInput(request.body)
  if (!input) {
    return reply.code(400).send({ error: 'invalid_component' })
  }

  const result = await pool.query(`
    UPDATE components
       SET type = $2,
           title = $3,
           status = $4,
           package = $5::jsonb,
           revision = revision + 1,
           updated_at = now()
     WHERE id = $1
    RETURNING id, type, title, status, revision, package,
              created_at AS "createdAt", updated_at AS "updatedAt"
  `, [request.params.id, input.type, input.title, input.status, JSON.stringify(input.package)])

  if (result.rowCount === 0) {
    return reply.code(404).send({ error: 'component_not_found' })
  }

  return result.rows[0]
})

app.delete('/api/components/:id', { preHandler: requireAdmin }, async (request, reply) => {
  const result = await pool.query(
    'DELETE FROM components WHERE id = $1 RETURNING id',
    [request.params.id],
  )

  if (result.rowCount === 0) {
    return reply.code(404).send({ error: 'component_not_found' })
  }

  return reply.code(204).send()
})

app.setErrorHandler((error, request, reply) => {
  request.log.error(error)

  if (error?.code === '22P02') {
    reply.code(400).send({ error: 'invalid_identifier' })
    return
  }

  reply.code(error.statusCode ?? 500).send({ error: 'internal_server_error' })
})

async function shutdown(signal) {
  app.log.info({ signal }, 'shutting down')
  await app.close()
  await pool.end()
  process.exit(0)
}

process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))

await connectDatabase()
await app.listen({ host, port })
