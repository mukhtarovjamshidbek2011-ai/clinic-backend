import { verifyTelegramAuthHash } from '../auth/telegramAuthUtils.js'
import { createOrUpdateTelegramUser } from '../auth/userRepository.js'
import { JWT_SECRET, JWT_EXPIRES_IN, TELEGRAM_BOT_USERNAME } from '../config/appConfig.js'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import { get as cacheGet, set as cacheSet, del as cacheDel } from '../services/cache.js'
import { logger } from '../services/logger.js'

export async function telegramLogin(req, res) {
  const authData = req.body || {}
  const payload = verifyTelegramAuthHash(authData)
  if (!payload) {
    return res.status(401).json({ error: 'Telegram auth maʼlumotlari yaroqsiz.' })
  }

  try {
    const userData = {
      telegramId: String(payload.id),
      username: payload.username || null,
      firstName: payload.first_name || null,
      lastName: payload.last_name || null,
      photoUrl: payload.photo_url || null,
      authDate: Number(payload.auth_date) || Date.now(),
    }

    const userRecord = await createOrUpdateTelegramUser(userData)
    const token = jwt.sign({
      uid: userRecord.uid || userRecord.telegram_id || userRecord.telegramId,
      telegramId: userRecord.telegram_id || userRecord.telegramId,
      username: userRecord.username,
      role: userRecord.role || 'user',
    }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN })

    return res.json({ token, user: userRecord })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Telegram login davomida xatolik yuz berdi.' })
  }
}

export async function createTelegramLoginSession(req, res) {
  try {
    const sessionId = crypto.randomUUID()
    // Telegram deep links use the bare username — strip a leading "@" so a
    // value like "@zamzam_health_bot" does not produce an invalid t.me link.
    const botUsername = String(TELEGRAM_BOT_USERNAME || 'zamzam_health_bot').trim().replace(/^@/, '')
    const botLink = `https://t.me/${botUsername}?start=login:${sessionId}`
    cacheSet(`login_session:${sessionId}`, { status: 'pending', createdAt: Date.now() }, 10 * 60 * 1000)
    return res.json({ sessionId, botLink })
  } catch (error) {
    logger.error('createTelegramLoginSession failed', error)
    return res.status(500).json({ error: 'Login sessiyasini yaratib bo‘lmadi.' })
  }
}

export async function getTelegramLoginSession(req, res) {
  try {
    const { sessionId } = req.query || {}
    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId majburiy.' })
    }

    const session = cacheGet(`login_session:${sessionId}`)
    if (!session) {
      return res.status(404).json({ error: 'Login sessiyasi topilmadi yoki muddati o‘tgan.' })
    }

    return res.json(session)
  } catch (error) {
    logger.error('getTelegramLoginSession failed', error)
    return res.status(500).json({ error: 'Login sessiyasini tekshirishda xatolik yuz berdi.' })
  }
}

export async function verifyToken(req, res) {
  const { token } = req.body || {}
  if (!token) {
    return res.status(400).json({ error: 'Token majburiy.' })
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    const jti = decoded.jti || null

    // The frontend polls and can call verify-token several times for the same
    // login (and a user may trigger /start more than once). Make verification
    // idempotent: cache the result per token id so repeated calls return the
    // same success instead of failing as "already used", and so each login
    // link is validated independently.
    if (jti) {
      const cached = cacheGet(`login_verified:${jti}`)
      if (cached) {
        return res.json(cached)
      }
    }

    const { getUserByTelegramId } = await import('../auth/userRepository.js')
    const userRecord = await getUserByTelegramId(decoded.telegramId)
    if (!userRecord) {
      return res.status(404).json({ error: 'Foydalanuvchi topilmadi.' })
    }

    // Issue the long-lived session token used by the website.
    const sessionToken = jwt.sign({
      uid: userRecord.uid || userRecord.telegram_id || userRecord.telegramId || userRecord.id,
      telegramId: userRecord.telegram_id || userRecord.telegramId || userRecord.id,
      username: userRecord.username,
      role: userRecord.role || 'user',
    }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN })

    const result = { user: userRecord, token: sessionToken }

    // Remember this token id briefly so repeat verifications are idempotent
    // (and the link is effectively one-time within this window).
    if (jti) {
      cacheSet(`login_verified:${jti}`, result, 10 * 60 * 1000)
    }

    return res.json(result)
  } catch (error) {
    logger.error('verifyToken failed', error)
    return res.status(401).json({ error: 'Token yaroqsiz yoki muddati o‘tgan.' })
  }
}

export async function getTelegramLoginSessionById(req, res) {
  try {
    const sessionId = req.params.id
    if (!sessionId || typeof sessionId !== 'string' || sessionId.trim().length === 0) {
      logger.warn('getTelegramLoginSessionById: Invalid sessionId parameter', { sessionId })
      return res.status(400).json({ error: 'sessionId majburiy.' })
    }

    const session = cacheGet(`login_session:${sessionId}`)
    if (!session) {
      logger.info('getTelegramLoginSessionById: Session not found or expired', { sessionId })
      return res.status(404).json({ error: "Login sessiyasi topilmadi yoki muddati o'tgan." })
    }

    // Verify session has required fields
    if (!session.token || !session.telegramId) {
      logger.error('getTelegramLoginSessionById: Incomplete session data', { sessionId, sessionKeys: Object.keys(session) })
      return res.status(500).json({ error: "Login sessiyasi to'liq emas." })
    }

    logger.info('getTelegramLoginSessionById: Session retrieved successfully', {
      sessionId,
      telegramId: session.telegramId,
      createdAt: session.createdAt,
    })

    return res.json(session)
  } catch (error) {
    logger.error('getTelegramLoginSessionById failed', error)
    return res.status(500).json({ error: "Login sessiyasini tekshirishda xatolik yuz berdi." })
  }
}

