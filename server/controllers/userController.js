import { DATABASE_CLIENT } from '../config/appConfig.js'
import { initPostgres, query as pgQuery } from '../services/postgresClient.js'
import { initFirebaseAdmin, getFirestore, setDocument } from '../services/firebaseAdmin.js'
import { logger } from '../services/logger.js'

export async function updateUserProfile(req, res) {
  try {
    const telegramId = req.user?.telegramId
    if (!telegramId) {
      return res.status(401).json({ error: 'Foydalanuvchi aniqlanmadi.' })
    }

    const { fullName, displayName, phone, phoneNumber, phone_number, avatar, photoURL, profilePhoto, photo_url, status } = req.body || {}

    const resolvedFullName = (fullName || displayName || '').trim()
    const resolvedPhone = (phone || phoneNumber || phone_number || '').trim()
    const resolvedAvatar = (avatar || photoURL || profilePhoto || photo_url || '').trim()

    // Split name
    const nameParts = resolvedFullName.split(/\s+/)
    const firstName = nameParts[0] || ''
    const lastName = nameParts.slice(1).join(' ') || ''

    logger.info('updateUserProfile called', { telegramId, resolvedFullName, resolvedPhone, resolvedAvatar, status })

    if (DATABASE_CLIENT === 'postgres') {
      await initPostgres()
      
      // Ensure phone_number, last_login_jti, login_token_expires_at and status columns exist in postgres users table
      try {
        await pgQuery('ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_number TEXT')
        await pgQuery('ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_jti TEXT')
        await pgQuery('ALTER TABLE users ADD COLUMN IF NOT EXISTS login_token_expires_at TIMESTAMPTZ')
        await pgQuery('ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT')
      } catch (colErr) {
        logger.warn('Non-critical: Alter table users columns check failed', colErr)
      }

      const queryText = `
        UPDATE users
        SET first_name = COALESCE(NULLIF($1, ''), first_name),
            last_name = COALESCE(NULLIF($2, ''), last_name),
            phone_number = COALESCE(NULLIF($3, ''), phone_number),
            profile_photo = COALESCE(NULLIF($4, ''), profile_photo),
            status = COALESCE(NULLIF($5, ''), status),
            updated_at = now()
        WHERE telegram_id = $6
        RETURNING *
      `
      const values = [firstName, lastName, resolvedPhone, resolvedAvatar, status || null, telegramId]
      const result = await pgQuery(queryText, values)
      logger.info('updateUserProfile (postgres) success', { telegramId, rowCount: result.rowCount })
    }

    // Always update Firebase too for real-time synchronization
    await initFirebaseAdmin()
    const db = getFirestore()
    const firebasePayload = {}
    if (firstName) firebasePayload.firstName = firstName
    if (lastName) firebasePayload.lastName = lastName
    if (resolvedFullName) firebasePayload.displayName = resolvedFullName
    if (resolvedPhone) firebasePayload.phoneNumber = resolvedPhone
    if (resolvedPhone) firebasePayload.phone = resolvedPhone
    if (resolvedAvatar) firebasePayload.profilePhoto = resolvedAvatar
    if (resolvedAvatar) firebasePayload.photoURL = resolvedAvatar
    if (status !== undefined) firebasePayload.status = status
    firebasePayload.updatedAt = new Date()

    await setDocument(db, 'users', String(telegramId), firebasePayload)
    logger.info('updateUserProfile (firebase) success', { telegramId })

    return res.json({ success: true, message: 'Profil muvaffaqiyatli yangilandi.' })
  } catch (error) {
    logger.error('updateUserProfile failed', error)
    return res.status(500).json({ error: error.message || 'Profilni yangilashda xatolik yuz berdi.' })
  }
}
