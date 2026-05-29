import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import net from 'net'
import { createRateLimiter } from './middleware/rateLimiter.js'
import { errorHandler } from './middleware/errorHandler.js'
import authRoutes from './routes/authRoutes.js'
import bookingRoutes from './routes/bookingRoutes.js'
import notificationRoutes from './routes/notificationRoutes.js'
import userRoutes from './routes/userRoutes.js'
import botAdapter from './telegram/bot.js'
import { logger } from './services/logger.js'
import { FRONTEND_PUBLIC_URL, SERVER_PORT, TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_USERNAME, JWT_SECRET } from './config/appConfig.js'

dotenv.config()

const app = express()
const frontendOrigin = FRONTEND_PUBLIC_URL || process.env.FRONTEND_BASE_URL || 'http://localhost:5173'

app.use(cors({ origin: frontendOrigin, credentials: true }))
app.use(express.urlencoded({ extended: true }))
app.use(express.json())
app.use(createRateLimiter({ windowMs: 60_000, max: 120 }))

app.use('/auth', authRoutes)
app.use('/booking', bookingRoutes)
app.use('/notifications', notificationRoutes)
app.use('/api/user', userRoutes)
app.use(await botAdapter.createWebhookCallback('/webhook'))

app.get('/health', async (_req, res) => {
  let telegramStatus = false;
  try {
    const botInstance = await botAdapter.getBot();
    if (botInstance) {
      await botInstance.telegram.getMe();
      telegramStatus = true;
    }
  } catch (e) {
    logger.error('Health check: Telegram connectivity failed', e);
  }
  res.json({ status: 'ok', server: 'zam-zam-health-telegram-backend', telegram: telegramStatus, timestamp: new Date().toISOString() });
});

app.use(errorHandler)

const port = Number(process.env.PORT) || SERVER_PORT || 4000

function validateEnv() {
  const warnings = []
  if (!TELEGRAM_BOT_TOKEN) {
    warnings.push('TELEGRAM_BOT_TOKEN is not set. Telegram bot will not start.')
  }
  if (!TELEGRAM_BOT_USERNAME) {
    warnings.push('TELEGRAM_BOT_USERNAME is not set. Telegram bot username may be missing.')
  }
  if (!JWT_SECRET || JWT_SECRET === 'replace-me-with-a-secure-secret') {
    warnings.push('JWT_SECRET is not configured or is insecure. Set a strong secret.')
  }
  if (!port || Number.isNaN(port) || port <= 0) {
    warnings.push(`PORT is invalid: ${process.env.PORT || SERVER_PORT}`)
  }
  warnings.forEach((warning) => logger.warn('[ENV]', warning))
}

function isPortAvailable(portNumber) {
  return new Promise((resolve) => {
    const tester = net.createServer()
    tester.once('error', (err) => {
      tester.close()
      resolve(false)
    })
    tester.once('listening', () => {
      tester.close()
      resolve(true)
    })
    tester.listen(portNumber)
  })
}

async function startServer() {
  validateEnv()
  const available = await isPortAvailable(port)
  if (!available) {
    logger.warn('Backend already running on port', port)
    return
  }

  const server = app.listen(port, async () => {
    logger.info('Backend listening on http://localhost:' + port)
    try {
      await botAdapter.initTelegramBot()
    } catch (err) {
      logger.error('[BOT] Failed to initialize Telegram bot adapter on startup', err)
    }
  })

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      logger.warn('Backend already running on port', port)
    } else {
      logger.error('Express server error', err)
    }
  })
}

startServer().catch((err) => logger.error('Startup failed', err))
