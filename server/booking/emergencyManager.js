import { DATABASE_CLIENT } from '../config/appConfig.js'
import { initFirebaseAdmin, getFirestore } from '../services/firebaseAdmin.js'
import { initPostgres, query as pgQuery } from '../services/postgresClient.js'
import { enqueueNotification } from '../notifications/notificationQueue.js'
import { buildDoctorUnavailableMessage, buildRescheduleMessage } from '../notifications/telegramTemplates.js'

export async function pauseDoctorBookings(doctorId, dateString) {
  if (DATABASE_CLIENT === 'postgres') {
    await initPostgres()
    const result = await pgQuery(
      `UPDATE bookings SET status = 'Doctor unavailable', updated_at = now() WHERE doctor_id = $1 AND booking_date = $2 AND status IN ('Kutilmoqda', 'Tasdiqlandi') RETURNING *`,
      [doctorId, dateString],
    )
    result.rows.forEach((booking) => {
      enqueueNotification({
        chatId: booking.telegram_id,
        text: buildDoctorUnavailableMessage(booking),
      })
    })
    return result.rows
  }

  await initFirebaseAdmin()
  const db = getFirestore()
  const ref = db.collection('bookings')
  const snapshot = await ref.where('doctorId', '==', doctorId).where('bookingDate', '==', dateString).where('status', 'in', ['Kutilmoqda', 'Tasdiqlandi']).get()
  const bookings = []
  for (const docSnap of snapshot.docs) {
    const data = docSnap.data()
    await docSnap.ref.set({ status: 'Doctor unavailable', updatedAt: new Date() }, { merge: true })
    bookings.push({ id: docSnap.id, ...data })
    enqueueNotification({
      chatId: data.telegramId,
      text: buildDoctorUnavailableMessage({ ...data, bookingId: docSnap.id }),
    })
  }
  return bookings
}

export async function rescheduleDoctorBookings(booking, newDate, newTime) {
  if (DATABASE_CLIENT === 'postgres') {
    await initPostgres()
    const result = await pgQuery(
      'UPDATE bookings SET booking_date = $1, booking_time = $2, status = $3, updated_at = now() WHERE booking_id = $4 RETURNING *',
      [newDate, newTime, 'Qayta rejalashtirilgan', booking.booking_id],
    )
    const updated = result.rows[0]
    enqueueNotification({
      chatId: updated.telegram_id,
      text: buildRescheduleMessage(updated),
    })
    return updated
  }

  await initFirebaseAdmin()
  const db = getFirestore()
  const bookingRef = db.collection('bookings').doc(String(booking.id))
  await bookingRef.set({ bookingDate: newDate, bookingTime: newTime, status: 'Qayta rejalashtirilgan', updatedAt: new Date() }, { merge: true })
  const updated = await bookingRef.get()
  const data = { id: updated.id, ...updated.data() }
  enqueueNotification({
    chatId: data.telegramId,
    text: buildRescheduleMessage(data),
  })
  return data
}
