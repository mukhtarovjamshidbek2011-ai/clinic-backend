import { DATABASE_CLIENT } from '../config/appConfig.js'
import { initFirebaseAdmin, getFirestore } from './firebaseAdmin.js'
import { initPostgres, query as pgQuery } from './postgresClient.js'

export async function saveTelegramNotificationRecord(record) {
  if (DATABASE_CLIENT === 'postgres') {
    await initPostgres()
    await pgQuery(
      `INSERT INTO telegram_notifications (telegram_id, booking_id, type, status, message, metadata) VALUES ($1, $2, $3, $4, $5, $6)`,
      [record.telegramId || null, record.bookingId || null, record.type || null, record.status || 'pending', record.message || null, record.metadata || {}],
    )
    return
  }

  await initFirebaseAdmin()
  const db = getFirestore()
  const docRef = db.collection('telegram_notifications').doc()
  await docRef.set({
    telegramId: record.telegramId || null,
    bookingId: record.bookingId || null,
    type: record.type || null,
    status: record.status || 'pending',
    message: record.message || null,
    metadata: record.metadata || {},
    createdAt: new Date(),
  })
}

export async function saveBookingChangeRecord(record) {
  if (DATABASE_CLIENT === 'postgres') {
    await initPostgres()
    await pgQuery(
      `INSERT INTO booking_changes (booking_id, telegram_id, doctor_id, old_date, old_time, new_date, new_time, reason, changed_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        record.bookingId || null,
        record.telegramId || null,
        record.doctorId || null,
        record.oldDate || null,
        record.oldTime || null,
        record.newDate || null,
        record.newTime || null,
        record.reason || null,
        record.changedBy || null,
      ],
    )
    return
  }

  await initFirebaseAdmin()
  const db = getFirestore()
  const docRef = db.collection('booking_changes').doc()
  await docRef.set({
    bookingId: record.bookingId || null,
    telegramId: record.telegramId || null,
    doctorId: record.doctorId || null,
    oldDate: record.oldDate || null,
    oldTime: record.oldTime || null,
    newDate: record.newDate || null,
    newTime: record.newTime || null,
    reason: record.reason || null,
    changedBy: record.changedBy || null,
    createdAt: new Date(),
  })
}
