import crypto from 'node:crypto'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import pg from 'pg'
import {
  normalizePublicationRequest,
  normalizeRevisionParam,
  toPublicationHead,
  toPublishedRevision,
} from './publication-contract.js'

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

async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS component_publication_revisions (
      revision_id uuid PRIMARY KEY,
      request_id text NOT NULL UNIQUE,
      component_type text NOT NULL,
      revision integer NOT NULL CHECK (revision > 0),
      base_revision integer,
      title text NOT NULL,
      package jsonb NOT NULL,
      published_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (component_type, revision)
    )
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS component_publication_type_revision_idx
      ON component_publication_revisions (component_type, revision DESC)
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS component_publication_published_at_idx
      ON component_publication_revisions (published_at DESC)
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

app.get('/api/component-publications', async () => {
  const result = await pool.query(`
    SELECT "componentType", title, "latestRevision", "latestRevisionId", "publishedAt"
      FROM (
        SELECT DISTINCT ON (component_type)
               component_type AS "componentType",
               title,
               revision AS "latestRevision",
               revision_id AS "latestRevisionId",
               published_at AS "publishedAt"
          FROM component_publication_revisions
         ORDER BY component_type, revision DESC
      ) latest
     ORDER BY "publishedAt" DESC, "componentType" ASC
  `)

  return { items: result.rows.map(toPublicationHead) }
})

app.get('/api/component-publications/:componentType', async (request, reply) => {
  const componentType = request.params.componentType
  const result = await pool.query(`
    SELECT revision_id AS "revisionId",
           request_id AS "requestId",
           component_type AS "componentType",
           revision,
           package,
           published_at AS "publishedAt"
      FROM component_publication_revisions
     WHERE component_type = $1
     ORDER BY revision DESC
     LIMIT 1
  `, [componentType])

  if (result.rowCount === 0) {
    return reply.code(404).send({ error: 'component_publication_not_found' })
  }

  return toPublishedRevision(result.rows[0])
})

app.get(
  '/api/component-publications/:componentType/revisions/:revision',
  async (request, reply) => {
    const revision = normalizeRevisionParam(request.params.revision)
    if (revision === null) {
      return reply.code(400).send({ error: 'invalid_revision' })
    }

    const result = await pool.query(`
      SELECT revision_id AS "revisionId",
             request_id AS "requestId",
             component_type AS "componentType",
             revision,
             package,
             published_at AS "publishedAt"
        FROM component_publication_revisions
       WHERE component_type = $1 AND revision = $2
    `, [request.params.componentType, revision])

    if (result.rowCount === 0) {
      return reply.code(404).send({ error: 'component_publication_revision_not_found' })
    }

    return toPublishedRevision(result.rows[0])
  },
)

app.post(
  '/api/component-publications/:componentType/revisions',
  { preHandler: requireAdmin },
  async (request, reply) => {
    const input = normalizePublicationRequest(
      request.body,
      request.params.componentType,
    )
    if (!input) {
      return reply.code(400).send({ error: 'invalid_publication_request' })
    }

    const client = await pool.connect()
    let transactionOpen = false

    try {
      await client.query('BEGIN')
      transactionOpen = true

      // Request-id serialization makes retries idempotent even if two identical
      // attempts arrive concurrently. Component-type serialization then gives
      // one deterministic optimistic-concurrency decision per published type.
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [`publication-request:${input.requestId}`],
      )
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [`publication-component:${input.componentType}`],
      )

      const existing = await client.query(`
        SELECT revision_id AS "revisionId",
               request_id AS "requestId",
               component_type AS "componentType",
               revision,
               package,
               published_at AS "publishedAt",
               component_type = $2 AS "typeMatches",
               base_revision IS NOT DISTINCT FROM $3::integer AS "baseMatches",
               package = $4::jsonb AS "packageMatches"
          FROM component_publication_revisions
         WHERE request_id = $1
      `, [
        input.requestId,
        input.componentType,
        input.baseRevision,
        JSON.stringify(input.package),
      ])

      if (existing.rowCount > 0) {
        const row = existing.rows[0]
        if (!row.typeMatches || !row.baseMatches || !row.packageMatches) {
          await client.query('ROLLBACK')
          transactionOpen = false
          return reply.code(409).send({ error: 'idempotency_conflict' })
        }

        await client.query('COMMIT')
        transactionOpen = false
        return reply.code(200).send(toPublishedRevision(row))
      }

      const latest = await client.query(`
        SELECT revision
          FROM component_publication_revisions
         WHERE component_type = $1
         ORDER BY revision DESC
         LIMIT 1
      `, [input.componentType])
      const currentRevision = latest.rowCount > 0
        ? latest.rows[0].revision
        : null

      if (currentRevision !== input.baseRevision) {
        await client.query('ROLLBACK')
        transactionOpen = false
        return reply.code(409).send({
          error: 'publication_conflict',
          currentRevision,
        })
      }

      const revisionId = crypto.randomUUID()
      const nextRevision = (currentRevision ?? 0) + 1
      const inserted = await client.query(`
        INSERT INTO component_publication_revisions (
          revision_id,
          request_id,
          component_type,
          revision,
          base_revision,
          title,
          package
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
        RETURNING revision_id AS "revisionId",
                  request_id AS "requestId",
                  component_type AS "componentType",
                  revision,
                  package,
                  published_at AS "publishedAt"
      `, [
        revisionId,
        input.requestId,
        input.componentType,
        nextRevision,
        input.baseRevision,
        input.title,
        JSON.stringify(input.package),
      ])

      await client.query('COMMIT')
      transactionOpen = false
      return reply.code(201).send(toPublishedRevision(inserted.rows[0]))
    } catch (error) {
      if (transactionOpen) {
        try {
          await client.query('ROLLBACK')
        } catch (rollbackError) {
          request.log.error(rollbackError, 'publication rollback failed')
        }
      }
      throw error
    } finally {
      client.release()
    }
  },
)

app.setErrorHandler((error, request, reply) => {
  request.log.error(error)

  if (error?.code === '22P02') {
    reply.code(400).send({ error: 'invalid_identifier' })
    return
  }

  if (error?.code === '23505') {
    reply.code(409).send({ error: 'publication_conflict' })
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
