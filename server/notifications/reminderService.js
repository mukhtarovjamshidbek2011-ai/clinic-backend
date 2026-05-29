import { logger } from '../services/logger.js'
import { sendTelegramNotification } from '../telegram/botService.js'

const REMINDER_TEMPLATES = {
  dayBefore: '⏰ Eslatma: Ertaga sizning uchrashuvingiz bor. Iltimos, tayyor bo‘ling.',
  hoursBefore: '⏰ Eslatma: Uchrashuvga 2 soat qoldi. Iltimos, taytli bo‘ling.',
  minutesBefore: '⏰ Eslatma: Uchrashuvga 20 daqiqa qoldi. Iltimos, klinikaga vaqtida yetib boring.',
}

export async function sendAppointmentReminder(chatId, type, booking) {
  const template = REMINDER_TEMPLATES[type]
  if (!template) {
    throw new Error('Noma’lum eslatma turi: ' + type)
  }

  const text = `${template}\n\nShifokor: ${booking.doctorName || '—'}\nVaqt: ${booking.bookingTime || booking.time || '—'}\nSana: ${booking.bookingDate || booking.date || '—'}`
  logger.info('Sending reminder', { chatId, type, bookingId: booking.bookingId || booking.id })
  return sendTelegramNotification(chatId, text)
}
