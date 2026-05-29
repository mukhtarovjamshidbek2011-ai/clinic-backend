import { getBookingById, getBookingsByTelegramId, linkBookingsToTelegram } from '../services/bookingRepository.js'
import { saveBookingChangeRecord } from '../services/notificationRepository.js'

export async function getTelegramBookings(req, res) {
  const telegramId = req.user?.telegramId || req.query.telegramId
  if (!telegramId) {
    return res.status(400).json({ error: 'Telegram ID mavjud emas.' })
  }

  try {
    const bookings = await getBookingsByTelegramId(telegramId)
    return res.json({ bookings })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Bookinglarni olishda xatolik yuz berdi.' })
  }
}

export async function connectBookingTelegram(req, res) {
  const telegramId = req.user?.telegramId || req.body.telegramId
  if (!telegramId) {
    return res.status(400).json({ error: 'Telegram ID talab qilinadi.' })
  }

  try {
    const bookings = await linkBookingsToTelegram(telegramId, {
      phone: req.body.phone,
      bookingId: req.body.bookingId,
    })

    return res.json({ bookings })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Telegram bilan bookingni bog‘lashda xatolik yuz berdi.' })
  }
}

export async function getBookingDetails(req, res) {
  const bookingId = req.params.id
  if (!bookingId) {
    return res.status(400).json({ error: 'Booking ID talab qilinadi.' })
  }

  try {
    const booking = await getBookingById(bookingId)
    if (!booking) {
      return res.status(404).json({ error: 'Booking topilmadi.' })
    }
    return res.json({ booking })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Bookingni olishda xatolik yuz berdi.' })
  }
}

export async function logBookingChange(req, res) {
  const { bookingId, oldDate, oldTime, newDate, newTime, doctorId, reason } = req.body
  const telegramId = req.user?.telegramId

  if (!bookingId) {
    return res.status(400).json({ error: 'Booking ID talab qilinadi.' })
  }

  try {
    await saveBookingChangeRecord({
      bookingId,
      telegramId,
      doctorId,
      oldDate,
      oldTime,
      newDate,
      newTime,
      reason,
      changedBy: req.user?.email || req.user?.username || 'admin',
    })

    return res.json({ success: true })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Booking o‘zgartirishini saqlashda xatolik yuz berdi.' })
  }
}
