import { DATABASE_CLIENT } from '../config/appConfig.js'
import { getUserByTelegramId } from '../auth/userRepository.js'
import { initFirebaseAdmin, getFirestore, getDocument, setDocument } from '../services/firebaseAdmin.js'
import { initPostgres, query as pgQuery } from '../services/postgresClient.js'
import { logger } from '../services/logger.js'

export async function updateBookingQueue(bookingId, updates) {
  if (DATABASE_CLIENT === 'postgres') {
    await initPostgres()
    const keys = Object.keys(updates)
    const setClauses = keys.map((key, index) => `${key} = $${index + 1}`).join(', ')
    const values = keys.map((key) => updates[key])
    const result = await pgQuery(`UPDATE bookings SET ${setClauses}, updated_at = now() WHERE booking_id = $${keys.length + 1} RETURNING *`, [...values, bookingId])
    return result.rows[0]
  }

  await initFirebaseAdmin()
  const db = getFirestore()
  const bookingRef = db.collection('bookings').doc(String(bookingId))
  await bookingRef.set({ ...updates, updatedAt: new Date() }, { merge: true })
  const booking = await bookingRef.get()
  return booking.exists ? { id: booking.id, ...booking.data() } : null
}

export async function markDoctorUnavailable(doctorId, dateString) {
  if (DATABASE_CLIENT === 'postgres') {
    await initPostgres()
    const result = await pgQuery(
      `UPDATE bookings SET status = 'Doctor unavailable' WHERE doctor_id = $1 AND booking_date = $2 AND status IN ('Kutilmoqda', 'Tasdiqlandi') RETURNING *`,
      [doctorId, dateString],
    )
    return result.rows
  }

  await initFirebaseAdmin()
  const db = getFirestore()
  const bookingsRef = db.collection('bookings')
  const snapshot = await bookingsRef.where('doctorId', '==', doctorId).where('bookingDate', '==', dateString).where('status', 'in', ['Kutilmoqda', 'Tasdiqlandi']).get()
  const bookings = []
  for (const docSnap of snapshot.docs) {
    await docSnap.ref.set({ status: 'Doctor unavailable', updatedAt: new Date() }, { merge: true })
    bookings.push({ id: docSnap.id, ...docSnap.data() })
  }
  return bookings
}

export async function getBookingById(bookingId) {
  if (DATABASE_CLIENT === 'postgres') {
    await initPostgres()
    const result = await pgQuery('SELECT * FROM bookings WHERE booking_id = $1', [bookingId])
    return result.rows[0] || null
  }

  await initFirebaseAdmin()
  const db = getFirestore()
  return getDocument(db, 'bookings', bookingId)
}

export async function recalculateQueueForDoctorDate(doctorId, dateString) {
  if (DATABASE_CLIENT === 'postgres') {
    await initPostgres()
    const result = await pgQuery(
      `SELECT booking_id FROM bookings WHERE doctor_id = $1 AND booking_date = $2 AND status IN ('Kutilmoqda', 'Tasdiqlandi', 'Kechikdi') ORDER BY booking_time ASC`,
      [doctorId, dateString],
    )
    const bookings = result.rows
    for (let index = 0; index < bookings.length; index += 1) {
      await pgQuery('UPDATE bookings SET queue_number = $1, updated_at = now() WHERE booking_id = $2', [index + 1, bookings[index].booking_id])
    }
    return bookings
  }

  await initFirebaseAdmin()
  const db = getFirestore()
  const bookingsRef = db.collection('bookings')
  const snapshot = await bookingsRef.where('doctorId', '==', doctorId).where('bookingDate', '==', dateString).where('status', 'in', ['Kutilmoqda', 'Tasdiqlandi', 'Kechikdi']).orderBy('bookingTime').get()
  const updated = []
  let index = 1
  for (const docSnap of snapshot.docs) {
    await docSnap.ref.set({ queueNumber: index, updatedAt: new Date() }, { merge: true })
    updated.push({ id: docSnap.id, queueNumber: index, ...docSnap.data() })
    index += 1
  }
  return updated
}

export async function getUserByTelegramIdOrThrow(telegramId) {
  const user = await getUserByTelegramId(telegramId)
  if (!user) {
    throw new Error('Foydalanuvchi topilmadi.')
  }
  return user
}
