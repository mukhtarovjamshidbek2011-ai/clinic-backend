import express from 'express'
import { sendAppointmentReminder } from '../notifications/reminderService.js'
import { enqueueTelegramNotification } from '../controllers/notificationController.js'

const router = express.Router()

router.post('/reminder', async (req, res, next) => {
  try {
    const { chatId, type, booking } = req.body
    if (!chatId || !type || !booking) {
      return res.status(400).json({ error: 'chatId, type va booking talablidir.' })
    }

    await sendAppointmentReminder(chatId, type, booking)
    res.json({ success: true })
  } catch (error) {
    next(error)
  }
})

router.post('/telegram', enqueueTelegramNotification)

export default router
