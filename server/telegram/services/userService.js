import { createOrUpdateTelegramUser, getUserByTelegramId } from '../../auth/userRepository.js'
import { logger } from '../../services/logger.js'
import { normalizeUzbekPhone } from '../phoneUtils.js'
import { get as cacheGet, set as cacheSet } from '../../services/cache.js';

async function createOrUpdate(payload) {
  const { telegramId, phoneNumber } = payload || {}
  logger.info('userService.createOrUpdate called', { telegramId, phoneNumber })
  if (!telegramId) throw new Error('telegramId is required')
  if (!phoneNumber) throw new Error('phoneNumber is required')

  let normalizedPhone
  try {
    normalizedPhone = normalizeUzbekPhone(phoneNumber)
    logger.info('userService.createOrUpdate normalized phone', { telegramId, normalizedPhone })
  } catch (validationError) {
    logger.error('userService.createOrUpdate invalid phone', { telegramId, phoneNumber, error: validationError.message })
    throw validationError
  }

  const userPayload = {
    telegramId,
    username: payload.username || null,
    firstName: payload.firstName || null,
    lastName: payload.lastName || null,
    photoUrl: payload.photoUrl || null,
    authDate: payload.authDate || Date.now(),
    phoneNumber: normalizedPhone,
  }
  logger.info('userService.createOrUpdate payload to repository', { telegramId, userPayload })
  console.log('USER SERVICE SAVE PAYLOAD:', JSON.stringify(userPayload, null, 2))

  const result = await createOrUpdateTelegramUser(userPayload)
  logger.info('userService.createOrUpdate result', { telegramId, result: !!result })
  console.log('SAVE RESULT:', JSON.stringify(result, null, 2))
  // Update cache after save
  const cacheKey = `user:${telegramId}`
  cacheSet(cacheKey, result, 10 * 60 * 1000)
  return result
}

async function getByTelegramId(telegramId) {
  logger.info('userService.getByTelegramId called', { telegramId })
  if (!telegramId) return null
  // Try cache first
  const cacheKey = `user:${telegramId}`
  const cached = cacheGet(cacheKey)
  if (cached) {
    logger.info('userService.getByTelegramId cache hit', { telegramId })
    return cached
  }
  try {
    const user = await getUserByTelegramId(telegramId)
    logger.info('userService.getByTelegramId result', { telegramId, found: !!user })
    if (user) cacheSet(cacheKey, user, 10 * 60 * 1000) // 10 min TTL
    return user
  } catch (err) {
    logger.error('userService.getByTelegramId error', err)
    throw err
  }
}

export default {
  createOrUpdate,
  getByTelegramId,
}
