import express from 'express'
import { verifyJwt } from '../middleware/authMiddleware.js'
import { getTelegramBookings, connectBookingTelegram, getBookingDetails, logBookingChange } from '../controllers/bookingController.js'
import { updateUserProfile } from '../controllers/userController.js'

const router = express.Router()

router.get('/telegram/bookings', verifyJwt, getTelegramBookings)
router.post('/telegram/connect', verifyJwt, connectBookingTelegram)
router.get('/booking/:id', verifyJwt, getBookingDetails)
router.post('/booking/change', verifyJwt, logBookingChange)
router.put('/profile', verifyJwt, updateUserProfile)

export default router
