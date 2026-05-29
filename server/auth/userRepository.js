import { DATABASE_CLIENT } from '../config/appConfig.js'
import { initFirebaseAdmin, getFirestore, getDocument, setDocument } from '../services/firebaseAdmin.js'
import { initPostgres, query as pgQuery } from '../services/postgresClient.js'
import { logger } from '../services/logger.js'
import * as cache from '../services/cache.js'

const USER_CACHE_TTL = 15_000 // 15 seconds

function userCacheKey(telegramId) {
  return `user:${telegramId}`
}

export async function createOrUpdateTelegramUser(userData) {
  if (!userData) throw new Error('User data is required')

  const telegramId = userData.telegramId ? String(userData.telegramId).trim() : null
  if (!telegramId) throw new Error('telegramId is required')

  const phoneNumber = userData.phoneNumber ? String(userData.phoneNumber).trim() : null
  const username = userData.username ? String(userData.username).trim() : null
  const firstName = userData.firstName ? String(userData.firstName).trim() : null
  const lastName = userData.lastName ? String(userData.lastName).trim() : null
  const photoUrl = userData.photoUrl ? String(userData.photoUrl).trim() : null
  const authDate = userData.authDate || Date.now()

  const cleanObject = (obj) => Object.fromEntries(Object.entries(obj).filter(([_, v]) => v !== undefined))

  // Invalidate cache immediately on write
  cache.del(userCacheKey(telegramId))

  if (DATABASE_CLIENT === 'postgres') {
    await initPostgres()
    const text = `
      INSERT INTO users (telegram_id, username, first_name, last_name, profile_photo, phone_number, auth_date, role, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, to_timestamp($7), 'user', now(), now())
      ON CONFLICT (telegram_id)
      DO UPDATE SET username = EXCLUDED.username, first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name, profile_photo = EXCLUDED.profile_photo, phone_number = EXCLUDED.phone_number, auth_date = EXCLUDED.auth_date, updated_at = now()
      RETURNING *
    `
    const values = [telegramId, username, firstName, lastName, photoUrl, phoneNumber || null, authDate / 1000]
    try {
      logger.db('createOrUpdateTelegramUser (postgres)', { telegramId })
      const result = await pgQuery(text, values)
      const row = result.rows[0]
      cache.set(userCacheKey(telegramId), row, USER_CACHE_TTL)
      return row
    } catch (err) {
      logger.error('createOrUpdateTelegramUser (postgres) failed', err)
      throw err
    }
  }

  // Firebase path
  await initFirebaseAdmin()
  const db = getFirestore()
  try {
    logger.db('createOrUpdateTelegramUser (firebase)', { telegramId })
    const existing = await getDocument(db, 'users', telegramId)
    const record = {
      telegramId,
      username,
      firstName,
      lastName,
      phoneNumber: phoneNumber || existing?.phoneNumber || null,
      profilePhoto: photoUrl || existing?.profilePhoto || null,
      authDate: new Date(authDate),
      role: existing?.role || 'user',
      createdAt: existing?.createdAt || new Date(),
      updatedAt: new Date(),
    }
    const cleanRecord = cleanObject(record)
    await setDocument(db, 'users', telegramId, cleanRecord)
    cache.set(userCacheKey(telegramId), cleanRecord, USER_CACHE_TTL)
    return cleanRecord
  } catch (err) {
    logger.error('createOrUpdateTelegramUser (firebase) failed', err)
    throw err
  }
}

export async function getUserByTelegramId(telegramId) {
  if (!telegramId) return null

  // Check cache first
  const cached = cache.get(userCacheKey(telegramId))
  if (cached) {
    logger.db('getUserByTelegramId cache hit', { telegramId })
    return cached
  }

  if (DATABASE_CLIENT === 'postgres') {
    await initPostgres()
    try {
      logger.db('getUserByTelegramId (postgres)', { telegramId })
      const result = await pgQuery('SELECT * FROM users WHERE telegram_id = $1', [telegramId])
      const row = result.rows[0] || null
      if (row) cache.set(userCacheKey(telegramId), row, USER_CACHE_TTL)
      return row
    } catch (err) {
      logger.error('getUserByTelegramId (postgres) failed', err)
      throw err
    }
  }

  await initFirebaseAdmin()
  const db = getFirestore()
  try {
    logger.db('getUserByTelegramId (firebase)', { telegramId })
    const doc = await getDocument(db, 'users', telegramId)
    if (doc) cache.set(userCacheKey(telegramId), doc, USER_CACHE_TTL)
    return doc
  } catch (err) {
    logger.error('getUserByTelegramId (firebase) failed', err)
    throw err
  }
}

export async function getAllUsers() {
  if (DATABASE_CLIENT === 'postgres') {
    await initPostgres()
    const result = await pgQuery('SELECT * FROM users ORDER BY created_at DESC')
    return result.rows
  }

  await initFirebaseAdmin()
  const db = getFirestore()
  const snapshot = await db.collection('users').get()
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
}

export async function getUsersCount() {
  if (DATABASE_CLIENT === 'postgres') {
    await initPostgres()
    const result = await pgQuery('SELECT COUNT(*) as count FROM users')
    return parseInt(result.rows[0].count, 10)
  }

  await initFirebaseAdmin()
  const db = getFirestore()
  const snapshot = await db.collection('users').get()
  return snapshot.docs.length
}
