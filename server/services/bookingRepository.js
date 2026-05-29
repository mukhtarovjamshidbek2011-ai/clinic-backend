import { DATABASE_CLIENT } from '../config/appConfig.js'
import { initFirebaseAdmin, getFirestore, getDocument, setDocument } from './firebaseAdmin.js'
import { initPostgres, query as pgQuery } from './postgresClient.js'

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

export async function getBookingsByTelegramId(telegramId) {
  if (!telegramId) return []
  if (DATABASE_CLIENT === 'postgres') {
    await initPostgres()
    const result = await pgQuery('SELECT * FROM bookings WHERE telegram_id = $1 ORDER BY booking_date, booking_time', [telegramId])
    return result.rows
  }

  await initFirebaseAdmin()
  const db = getFirestore()
  const snapshot = await db.collection('bookings').where('telegramId', '==', telegramId).get()
  const docs = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
  
  // Sort in-memory by bookingDate and bookingTime to prevent index requirement
  docs.sort((a, b) => {
    const dateA = a.bookingDate || a.date || ''
    const dateB = b.bookingDate || b.date || ''
    const cmp = dateA.localeCompare(dateB)
    if (cmp !== 0) return cmp
    
    const timeA = a.bookingTime || a.time || ''
    const timeB = b.bookingTime || b.time || ''
    return timeA.localeCompare(timeB)
  })
  
  return docs
}

export async function getBookingsByDoctorAndDate(doctorId, dateString) {
  if (DATABASE_CLIENT === 'postgres') {
    await initPostgres()
    const result = await pgQuery(
      `SELECT * FROM bookings WHERE doctor_id = $1 AND booking_date = $2 AND status IN ('Kutilmoqda', 'Tasdiqlandi') ORDER BY booking_time`,
      [doctorId, dateString],
    )
    return result.rows
  }

  await initFirebaseAdmin()
  const db = getFirestore()
  const snapshot = await db
    .collection('bookings')
    .where('doctorId', '==', doctorId)
    .where('bookingDate', '==', dateString)
    .where('status', 'in', ['Kutilmoqda', 'Tasdiqlandi'])
    .orderBy('bookingTime')
    .get()

  return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
}

export async function linkBookingsToTelegram(telegramId, filter = {}) {
  if (!telegramId) {
    throw new Error('Telegram ID talab qilinadi.')
  }

  const { phone, bookingId } = filter
  if (!phone && !bookingId) {
    throw new Error('Phone yoki bookingId talab qilinadi.')
  }

  const updates = []

  if (DATABASE_CLIENT === 'postgres') {
    await initPostgres()
    const sql = `
      UPDATE bookings
      SET telegram_id = $1, updated_at = now()
      WHERE booking_id = COALESCE($2, booking_id)
        OR patient_phone = COALESCE($3, patient_phone)
        OR user_phone = COALESCE($3, user_phone)
      RETURNING *
    `
    const result = await pgQuery(sql, [telegramId, bookingId || null, phone || null])
    return result.rows
  }

  await initFirebaseAdmin()
  const db = getFirestore()
  const bookings = []
  if (bookingId) {
    const bookingRef = db.collection('bookings').doc(String(bookingId))
    const bookingSnapshot = await bookingRef.get()
    if (bookingSnapshot.exists) {
      await bookingRef.set({ telegramId }, { merge: true })
      bookings.push({ id: bookingSnapshot.id, ...bookingSnapshot.data(), telegramId })
    }
    return bookings
  }

  const query = db.collection('bookings').where('telegramId', '==', null)
  const [patientQuery, userQuery] = [query.where('patientPhone', '==', phone), query.where('userPhone', '==', phone)]
  const [patientSnapshot, userSnapshot] = await Promise.all([patientQuery.get(), userQuery.get()])

  for (const snapshot of [patientSnapshot, userSnapshot]) {
    for (const docSnap of snapshot.docs) {
      await docSnap.ref.set({ telegramId }, { merge: true })
      bookings.push({ id: docSnap.id, ...docSnap.data(), telegramId })
    }
  }

  return bookings
}

export async function updateBookingStatus(bookingId, status) {
  if (DATABASE_CLIENT === 'postgres') {
    await initPostgres()
    const result = await pgQuery(
      `UPDATE bookings SET status = $1, updated_at = now() WHERE booking_id = $2 RETURNING *`,
      [status, bookingId]
    )
    return result.rows[0] || null
  }

  await initFirebaseAdmin()
  const db = getFirestore()
  const bookingRef = db.collection('bookings').doc(String(bookingId))
  const bookingSnap = await bookingRef.get()
  if (bookingSnap.exists) {
    await bookingRef.set({ status, updatedAt: new Date() }, { merge: true })
    return { id: bookingSnap.id, ...bookingSnap.data(), status }
  }
  return null
}

export async function getBookingsForToday() {
  const todayStr = new Date().toISOString().split('T')[0]
  
  if (DATABASE_CLIENT === 'postgres') {
    await initPostgres()
    const result = await pgQuery(
      `SELECT * FROM bookings WHERE booking_date = $1 ORDER BY booking_time`,
      [todayStr]
    )
    return result.rows
  }

  await initFirebaseAdmin()
  const db = getFirestore()
  const snapshot = await db.collection('bookings').where('bookingDate', '==', todayStr).get()
  const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
  
  docs.sort((a, b) => {
    const timeA = a.bookingTime || a.time || ''
    const timeB = b.bookingTime || b.time || ''
    return timeA.localeCompare(timeB)
  })
  return docs
}

export async function getBookingsCount() {
  if (DATABASE_CLIENT === 'postgres') {
    await initPostgres()
    const result = await pgQuery('SELECT COUNT(*) as count FROM bookings')
    return parseInt(result.rows[0].count, 10)
  }

  await initFirebaseAdmin()
  const db = getFirestore()
  const snapshot = await db.collection('bookings').get()
  return snapshot.docs.length
}
