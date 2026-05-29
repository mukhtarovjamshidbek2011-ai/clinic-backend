import { getBookingsByTelegramId } from '../../services/bookingRepository.js'
import { markDoctorUnavailable as _markDoctorUnavailable } from '../../booking/queueManager.js'
import { logger } from '../../services/logger.js'

async function getByTelegramId(telegramId) {
  if (!telegramId) return []
  try {
    const bookings = await getBookingsByTelegramId(telegramId)
    logger.info('bookingService.getByTelegramId result', { telegramId, count: bookings?.length || 0 })
    return bookings || []
  } catch (err) {
    logger.error('bookingService.getByTelegramId error', err)
    throw err
  }
}

function formatBooking(b) {
  if (!b) return ''
  const date = b.bookingDate || b.date || b.bookingTime || b.time || '—'
  const doctor = b.doctorName || b.doctor || '—'
  return `🗓 *${date}*\\n👨‍⚕️ *${doctor}*\\n🔖 ID: ${b.id || b.bookingId || '—'}`
}

async function markDoctorUnavailable(doctorId, dateString) {
  if (!doctorId || !dateString) return []
  try {
    const affected = await _markDoctorUnavailable(doctorId, dateString)
    logger.info('bookingService.markDoctorUnavailable', { doctorId, dateString, affected: affected?.length || 0 })
    return affected
  } catch (err) {
    logger.error('bookingService.markDoctorUnavailable error', err)
    throw err
  }
}

export default {
  getByTelegramId,
  formatBooking,
  markDoctorUnavailable,
}
