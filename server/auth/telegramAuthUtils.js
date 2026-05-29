import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import { JWT_SECRET } from '../config/appConfig.js'

export function normalizeTelegramAuthData(data) {
  return Object.keys(data)
    .filter((key) => key !== 'hash')
    .sort()
    .map((key) => `${key}=${data[key]}`)
    .join('\n')
}

export function verifyTelegramAuthHash(data) {
  const { hash, ...rest } = data
  const secretKey = crypto.createHash('sha256').update(process.env.TELEGRAM_BOT_TOKEN).digest()
  const dataCheckString = normalizeTelegramAuthData(rest)
  const hmac = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex')
  return hmac === hash
}

export function createJwtPayload(userRecord) {
  return jwt.sign(
    {
      telegramId: userRecord.telegramId,
      username: userRecord.username,
      firstName: userRecord.firstName,
      lastName: userRecord.lastName,
      role: userRecord.role || 'user',
    },
    JWT_SECRET,
    { expiresIn: '7d' },
  )
}
