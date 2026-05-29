import { Markup } from 'telegraf'
import authService from './authService.js'
import { get as cacheGet, set as cacheSet, del as cacheDel } from '../../services/cache.js'
import { logger } from '../../services/logger.js'

const USER_STATUS_CACHE_TTL_MS = 5 * 60 * 1000
const LOGIN_PENDING_TTL_MS = 5 * 60 * 1000
const START_DEDUP_MS = 3_000
const startDedupMap = new Map()

function checkAndRecordStartDedup(telegramId, payloadType, payloadValue) {
  if (!telegramId) return false
  const key = `${telegramId}:${payloadType}:${payloadValue || ''}`
  const lastSeen = startDedupMap.get(key) || 0
  const now = Date.now()
  if (now - lastSeen < START_DEDUP_MS) {
    return true
  }
  startDedupMap.set(key, now)
  return false
}

async function getUserStatus(telegramId, userService) {
  if (!telegramId || !userService) {
    return { exists: false, hasPhone: false, user: null }
  }

  const cacheKey = `telegram_user_status:${telegramId}`
  const cached = cacheGet(cacheKey)
  if (cached) {
    return cached
  }

  const user = await userService.getByTelegramId(telegramId)
  const status = {
    exists: Boolean(user),
    hasPhone: Boolean(user?.phoneNumber || user?.phone_number),
    user,
  }
  cacheSet(cacheKey, status, USER_STATUS_CACHE_TTL_MS)
  return status
}

function shouldRequestContact(userStatus) {
  return !userStatus || !userStatus.exists || !userStatus.hasPhone
}

async function generateWebsiteReturnButton(user, sessionId = null) {
  if (!user) {
    throw new Error('User is required to generate a website return button.')
  }

  const { token, callbackUrl, callbackSource } = await authService.generateLoginTokenForUser(user, sessionId)

  return {
    text: '🌐 Saytga qaytish',
    url: callbackUrl || null,
    token,
    callbackUrl: callbackUrl || null,
    callbackSource: callbackSource || null,
  }
}

async function replyWithReturnButton(ctx, user, sessionId = null) {
  const returnButton = await generateWebsiteReturnButton(user, sessionId)

  if (!returnButton.url) {
    const callbackHint = returnButton.callbackSource
      ? `Iltimos, quyidagi muhit o'zgaruvchisining qiymatini tekshiring: ${returnButton.callbackSource}`
      : 'Iltimos, `TELEGRAM_AUTH_RETURN_URL` yoki `TELEGRAM_CALLBACK_URL` ni HTTP manzilga o\'rnating.'

    try {
      return await ctx.replyWithMarkdown(
        `🔐 *Zam-Zam Health — Xavfsiz Kirish*\n\n🌐 Saytga avtomatik kirish domen ulangandan keyin ishlaydi. ${callbackHint}`
      )
    } catch (err) {
      logger.error('[AUTH] Failed to send fallback auth notice', err)
      throw err
    }
  }

  if (!returnButton.url.startsWith('http')) {
    throw new Error(`Invalid callback URL: ${returnButton.url}`)
  }

  // Validate URL length for Telegram (URLs must be < 2048 chars typically)
  if (returnButton.url.length > 2000) {
    logger.error('[AUTH] Callback URL exceeds safe length', {
      telegramId: user?.telegramId || user?.telegram_id || null,
      urlLength: returnButton.url.length,
    })
    throw new Error('Callback URL is too long for Telegram button')
  }

  logger.info('[AUTH] Callback URL generated', {
    telegramId: user?.telegramId || user?.telegram_id || null,
    callbackUrl: returnButton.url,
    urlLength: returnButton.url.length,
  })

  logger.info('[AUTH] Sending return button', {
    telegramId: user?.telegramId || user?.telegram_id || null,
  })

  try {
    // Use Telegraf's Markup helper for consistency and proper formatting
    const keyboard = Markup.inlineKeyboard([
      Markup.button.url(returnButton.text, returnButton.url)
    ])
    
    const result = await ctx.reply('✅ Saytga muvaffaqiyatli kirishingiz mumkin.', keyboard)
    logger.info('[AUTH] Return button sent successfully', {
      telegramId: user?.telegramId || user?.telegram_id || null,
      callbackUrl: returnButton.url,
    })
    return result
  } catch (err) {
    logger.error('[AUTH] Failed to send return button', err)
    throw err
  }
}

function setPendingLoginMarker(telegramId, meta = {}) {
  if (!telegramId) return false
  try {
    cacheSet(`pending_login:${telegramId}`, { meta, createdAt: Date.now() }, LOGIN_PENDING_TTL_MS)
    return true
  } catch (err) {
    console.warn('[TelegramLoginFlow] setPendingLoginMarker failed', err)
    return false
  }
}

function getPendingLoginMarker(telegramId) {
  if (!telegramId) return null
  try {
    return cacheGet(`pending_login:${telegramId}`)
  } catch (err) {
    console.warn('[TelegramLoginFlow] getPendingLoginMarker failed', err)
    return null
  }
}

function clearPendingLoginMarker(telegramId) {
  if (!telegramId) return
  try {
    cacheDel(`pending_login:${telegramId}`)
  } catch (err) {
    console.warn('[TelegramLoginFlow] clearPendingLoginMarker failed', err)
  }
}

function invalidateUserStatusCache(telegramId) {
  if (!telegramId) return
  try {
    cacheDel(`telegram_user_status:${telegramId}`)
  } catch (err) {
    console.warn('[TelegramLoginFlow] invalidateUserStatusCache failed', err)
  }
}

export default {
  checkAndRecordStartDedup,
  getUserStatus,
  shouldRequestContact,
  generateWebsiteReturnButton,
  replyWithReturnButton,
  getTelegramCallbackConfig: authService.getTelegramCallbackConfig,
  invalidateUserStatusCache,
  setPendingLoginMarker,
  getPendingLoginMarker,
  clearPendingLoginMarker,
}
