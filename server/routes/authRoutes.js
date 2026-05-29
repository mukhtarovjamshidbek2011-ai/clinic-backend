import express from 'express'
import { telegramLogin, verifyToken, createTelegramLoginSession, getTelegramLoginSession, getTelegramLoginSessionById } from '../controllers/authController.js'

const router = express.Router()

router.post('/login', telegramLogin)
router.post('/verify-token', verifyToken)
router.post('/session', createTelegramLoginSession)
router.get('/session', getTelegramLoginSession)
router.get('/telegram/session/:id', getTelegramLoginSessionById)

export default router
