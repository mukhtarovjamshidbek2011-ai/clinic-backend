import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import { JWT_SECRET, JWT_EXPIRES_IN, FRONTEND_BASE_URL, FRONTEND_PUBLIC_URL, TELEGRAM_AUTH_RETURN_URL, TELEGRAM_CALLBACK_URL } from '../../config/appConfig.js'
import { initPostgres, query as pgQuery } from '../../services/postgresClient.js'
import { initFirebaseAdmin, getFirestore, setDocument } from '../../services/firebaseAdmin.js'
import { get as cacheGet, set as cacheSet } from '../../services/cache.js'
import { logger } from '../../services/logger.js'

const LOGIN_TTL_MS = 5 * 60 * 1000

function getTelegramCallbackConfig() {
  const sources = [
    { name: 'FRONTEND_BASE_URL', value: FRONTEND_BASE_URL },
    { name: 'TELEGRAM_AUTH_RETURN_URL', value: TELEGRAM_AUTH_RETURN_URL },
    { name: 'TELEGRAM_CALLBACK_URL', value: TELEGRAM_CALLBACK_URL },
    { name: 'FRONTEND_PUBLIC_URL', value: FRONTEND_PUBLIC_URL },
  ]

  const validSource = sources.find((entry) => entry.value && typeof entry.value === 'string')
  return {
    source: validSource?.name || null,
    base: String(validSource?.value || '').replace(/\/$/, '') || null,
    raw: {
      FRONTEND_BASE_URL,
      TELEGRAM_AUTH_RETURN_URL,
      TELEGRAM_CALLBACK_URL,
      FRONTEND_PUBLIC_URL,
    },
  }
}

function normalizeLocalhostUrl(value) {
  if (!value || typeof value !== 'string') return value
  try {
    const parsed = new URL(value)
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`.replace(/\/$/, '')
  } catch (err) {
    return String(value).replace(/\/$/, '')
  }
}

function getTelegramCallbackBase() {
  return getTelegramCallbackConfig().base
}

async function persistJti(telegramId, jti, expiresAt) {
  try {
    if (process.env.DATABASE_CLIENT === 'postgres') {
      await initPostgres()
      await pgQuery('UPDATE users SET last_login_jti = $1, login_token_expires_at = to_timestamp($2) WHERE telegram_id = $3', [jti, Math.floor(expiresAt / 1000), telegramId])
      logger.info('[AUTH][DB] persisted jti to Postgres', { telegramId, jti })
    } else {
      await initFirebaseAdmin()
      const db = getFirestore()
      await setDocument(db, 'users', String(telegramId), { lastLoginJti: jti, loginTokenExpiresAt: new Date(expiresAt) })
      logger.info('[AUTH][DB] persisted jti to Firebase', { telegramId, jti })
    }
  } catch (err) {
    logger.error('[AUTH][DB] failed to persist jti', err)
  }
}

export async function generateLoginTokenForUser(user, sessionId = null) {
  if (!user) throw new Error('user is required')
  const telegramId = user.telegramId || user.telegram_id || user.id
  if (!telegramId) throw new Error('telegramId is required in user object')
  
  const jti = crypto.randomUUID()
  const payload = {
    telegramId,
    phone: user.phoneNumber || user.phone_number || null,
    username: user.username || user.name || null,
    role: user.role || 'user',
    iat: Math.floor(Date.now() / 1000),
  }
  
  // Verify JWT_SECRET is available
  if (!JWT_SECRET || JWT_SECRET.length < 8) {
    throw new Error('JWT_SECRET is not properly configured')
  }
  
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN, jwtid: jti })

  const session = sessionId || crypto.randomUUID()
  
  // Validate session ID format
  if (!session || typeof session !== 'string' || session.length < 8) {
    throw new Error('Invalid session ID generated')
  }

  const callbackConfig = getTelegramCallbackConfig()
  const rawBase = FRONTEND_BASE_URL ? String(FRONTEND_BASE_URL) : callbackConfig.base
  const callbackBase = normalizeLocalhostUrl(rawBase)
  const callbackUrl = callbackBase
    ? `${callbackBase}/auth/telegram/success?session=${encodeURIComponent(session)}`
    : null

  if (!callbackUrl) {
    logger.warn('[AUTH] Telegram callback URL not configured.', {
      callbackSource: callbackConfig.source,
      rawValues: callbackConfig.raw,
    })
  } else {
    // Validate URL format and length
    try {
      new URL(callbackUrl) // Validate URL is properly formed
      if (callbackUrl.length > 2000) {
        logger.warn('[AUTH] Callback URL exceeds recommended length', {
          length: callbackUrl.length,
          url: callbackUrl,
        })
      }
    } catch (urlErr) {
      logger.error('[AUTH] Invalid callback URL format', { callbackUrl, error: urlErr.message })
    }
  }

  // persist in cache immediately for short-term recovery
  try {
    cacheSet(`pending_login:${telegramId}`, { jti, createdAt: Date.now(), sessionId: session }, LOGIN_TTL_MS)
  } catch (e) {
    logger.warn('[AUTH] failed to cache pending login', e)
  }

  // Store session with token in cache for frontend retrieval
  try {
    cacheSet(`login_session:${session}`, {
      status: 'ready',
      telegramId,
      token,
      callbackUrl,
      createdAt: Date.now(),
    }, 10 * 60 * 1000)
    logger.info('[AUTH] Session stored in cache', {
      sessionId: session,
      telegramId,
      cachedAt: new Date().toISOString(),
    })
  } catch (e) {
    logger.warn('[AUTH] failed to save login session state', e)
  }

  // persist jti before returning to avoid race conditions where verifyToken
  // checks the jti immediately after token generation.
  try {
    const expiresAt = Date.now() + LOGIN_TTL_MS
    await persistJti(telegramId, jti, expiresAt)
  } catch (e) {
    logger.error('[AUTH] persist jti failed', e)
  }

  return {
    token,
    jti,
    callbackUrl,
    callbackSource: callbackConfig.source,
    callbackBase: callbackConfig.base,
    sessionId: session,
  }
}

export function setPendingLoginForTelegram(telegramId, meta = {}) {
  try {
    cacheSet(`pending_login:${telegramId}`, { meta, createdAt: Date.now() }, LOGIN_TTL_MS)
    return true
  } catch (e) {
    logger.warn('[AUTH] setPendingLoginForTelegram failed', e)
    return false
  }
}

export function getPendingLoginForTelegram(telegramId) {
  try {
    return cacheGet(`pending_login:${telegramId}`)
  } catch (e) {
    logger.warn('[AUTH] getPendingLoginForTelegram failed', e)
    return null
  }
}

export default {
  generateLoginTokenForUser,
  getTelegramCallbackConfig,
  setPendingLoginForTelegram,
  getPendingLoginForTelegram,
}
