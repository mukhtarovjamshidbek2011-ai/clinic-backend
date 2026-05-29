import express from 'express'
import { getBookingById, recalculateQueueForDoctorDate } from '../booking/queueManager.js'
import { rescheduleDoctorBookings, pauseDoctorBookings } from '../booking/emergencyManager.js'
import { logger } from '../services/logger.js'

const router = express.Router()

router.post('/doctor/unavailable', async (req, res, next) => {
  try {
    const { doctorId, date } = req.body
    if (!doctorId || !date) {
      return res.status(400).json({ error: 'doctorId va date talab qilinadi.' })
    }
    const pendingBookings = await pauseDoctorBookings(doctorId, date)
    res.json({ success: true, pendingBookings })
  } catch (error) {
    logger.error('Pause doctor bookings error:', error)
    next(error)
  }
})

router.post('/doctor/reschedule', async (req, res, next) => {
  try {
    const { doctorId, date, bookingId, newDate, newTime } = req.body
    if (!doctorId || !date || !bookingId || !newDate || !newTime) {
      return res.status(400).json({ error: 'doctorId, date, bookingId, newDate va newTime talab qilinadi.' })
    }
    const booking = await getBookingById(bookingId)
    if (!booking) {
      return res.status(404).json({ error: 'Bron topilmadi.' })
    }
    const result = await rescheduleDoctorBookings(booking, newDate, newTime)
    res.json({ success: true, booking: result })
  } catch (error) {
    logger.error('Reschedule booking error:', error)
    next(error)
  }
})

router.post('/queue/recalculate', async (req, res, next) => {
  try {
    const { doctorId, date } = req.body
    if (!doctorId || !date) {
      return res.status(400).json({ error: 'doctorId va date talab qilinadi.' })
    }
    const updatedBookings = await recalculateQueueForDoctorDate(doctorId, date)
    res.json({ success: true, updatedBookings })
  } catch (error) {
    logger.error('Queue recalculate error:', error)
    next(error)
  }
})

export default router
