import { sendTelegramNotification } from '../telegram/botService.js'
import { logger } from '../services/logger.js'

const queue = []
const MAX_RETRIES = 3
const RETRY_DELAY_MS = 2500
let isProcessing = false

function createQueueItem({ chatId, text, options = {}, retryCount = 0 }) {
  return { chatId, text, options, retryCount }
}

export function enqueueNotification(notification) {
  queue.push(createQueueItem(notification))
  processQueue().catch((error) => logger.error('Notification queue processing error:', error))
}

async function processQueue() {
  if (isProcessing || queue.length === 0) {
    return
  }

  isProcessing = true

  while (queue.length > 0) {
    const item = queue.shift()
    try {
      await sendTelegramNotification(item.chatId, item.text, item.options)
      logger.info('Telegram notification sent', { chatId: item.chatId })
    } catch (error) {
      logger.warn('Telegram notification failed', { chatId: item.chatId, retryCount: item.retryCount, error: error.message })
      if (item.retryCount < MAX_RETRIES) {
        queue.push(createQueueItem({ ...item, retryCount: item.retryCount + 1 }))
        await delay(RETRY_DELAY_MS)
      } else {
        logger.error('Telegram notification permanently failed', { chatId: item.chatId })
      }
    }
  }

  isProcessing = false
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
