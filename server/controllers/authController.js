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
    const botUsername = TELEGRAM_BOT_USERNAME || 'zamzam_health_bot'
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
    const { getUserByTelegramId } = await import('../auth/userRepository.js')
    const userRecord = await getUserByTelegramId(decoded.telegramId)
    if (!userRecord) {
      return res.status(404).json({ error: 'Foydalanuvchi topilmadi.' })
    }

    const { DATABASE_CLIENT, JWT_EXPIRES_IN } = await import('../config/appConfig.js')
    const telegramId = userRecord.telegram_id || userRecord.telegramId || userRecord.id

    // Check jti to prevent token reuse
    const savedJti = DATABASE_CLIENT === 'postgres' ? userRecord.last_login_jti : userRecord.lastLoginJti
    if (!decoded.jti || decoded.jti !== savedJti) {
      logger.warn('Token reuse or invalid jti detected', { telegramId, decodedJti: decoded.jti, savedJti })
      return res.status(401).json({ error: 'Ushbu kirish havolasi allaqachon ishlatilgan yoki yaroqsiz.' })
    }

    // Clear jti in the database
    if (DATABASE_CLIENT === 'postgres') {
      const { initPostgres, query: pgQuery } = await import('../services/postgresClient.js')
      await initPostgres()
      await pgQuery('UPDATE users SET last_login_jti = NULL, login_token_expires_at = NULL WHERE telegram_id = $1', [telegramId])
      logger.info('verifyToken: cleared last_login_jti in Postgres', { telegramId })
    } else {
      const { initFirebaseAdmin, getFirestore, setDocument } = await import('../services/firebaseAdmin.js')
      await initFirebaseAdmin()
      const db = getFirestore()
      await setDocument(db, 'users', String(telegramId), { lastLoginJti: null, loginTokenExpiresAt: null })
      logger.info('verifyToken: cleared lastLoginJti in Firebase', { telegramId })
    }

    // Generate a long-lived session token
    const sessionToken = jwt.sign({
      uid: userRecord.uid || userRecord.telegram_id || userRecord.telegramId || userRecord.id,
      telegramId: userRecord.telegram_id || userRecord.telegramId || userRecord.id,
      username: userRecord.username,
      role: userRecord.role || 'user',
    }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN })

    // Return the user and the new session token
    return res.json({ user: userRecord, token: sessionToken })
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

