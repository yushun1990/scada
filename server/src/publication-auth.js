import crypto from 'node:crypto'

export const PUBLICATION_SESSION_COOKIE = 'scada_publish_session'

export function secureEquals(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  if (leftBuffer.length !== rightBuffer.length) return false
  return crypto.timingSafeEqual(leftBuffer, rightBuffer)
}

export function createPublicationSessionId() {
  return crypto.randomBytes(32).toString('base64url')
}

export function hashPublicationSessionId(sessionId) {
  return crypto.createHash('sha256').update(sessionId).digest('hex')
}

export function parseCookieHeader(header) {
  if (typeof header !== 'string' || !header.trim()) return new Map()

  const cookies = new Map()
  for (const part of header.split(';')) {
    const separator = part.indexOf('=')
    if (separator <= 0) continue
    const name = part.slice(0, separator).trim()
    const value = part.slice(separator + 1).trim()
    if (!name) continue
    try {
      cookies.set(name, decodeURIComponent(value))
    } catch {
      // Ignore malformed cookie values instead of making auth parsing fatal.
    }
  }
  return cookies
}

function normalizeSameSite(value) {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (normalized === 'strict') return 'Strict'
  if (normalized === 'lax') return 'Lax'
  return 'None'
}

export function serializePublicationSessionCookie(
  sessionId,
  {
    maxAgeSeconds,
    secure = true,
    sameSite = 'None',
  },
) {
  const parts = [
    `${PUBLICATION_SESSION_COOKIE}=${encodeURIComponent(sessionId)}`,
    'Path=/',
    'HttpOnly',
    `SameSite=${normalizeSameSite(sameSite)}`,
    `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`,
  ]
  if (secure) parts.push('Secure')
  return parts.join('; ')
}

export function serializeClearedPublicationSessionCookie({
  secure = true,
  sameSite = 'None',
} = {}) {
  return serializePublicationSessionCookie('', {
    maxAgeSeconds: 0,
    secure,
    sameSite,
  })
}

export function publicationIdentity(username) {
  const normalized = String(username ?? '').trim()
  if (!normalized) return null
  return {
    id: `local:${normalized}`,
    displayName: normalized,
  }
}
