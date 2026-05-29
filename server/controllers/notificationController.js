import { saveTelegramNotificationRecord } from '../services/notificationRepository.js'

export async function enqueueTelegramNotification(req, res) {
  const { telegramId, bookingId, type, message, metadata } = req.body
  if (!telegramId || !type || !message) {
    return res.status(400).json({ error: 'telegramId, type va message maydonlari talab qilinadi.' })
  }

  try {
    await saveTelegramNotificationRecord({
      telegramId,
      bookingId,
      type,
      status: 'pending',
      message,
      metadata,
    })

    return res.json({ success: true })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Xabarnomani ro‘yxatga olishda xatolik yuz berdi.' })
  }
}
