import { logger } from '../services/logger.js'
import { sendTelegramNotification } from './botService.js'
import { updateBookingQueue } from '../booking/queueManager.js'

export class BotQueue {
  async handleInlineAction(ctx, callbackData) {
    const [action, bookingId] = callbackData.split(':')
    logger.info('Inline action:', action, bookingId)

    switch (action) {
      case 'confirm':
        await updateBookingQueue(bookingId, { status: 'Tasdiqlandi' })
        await sendTelegramNotification(ctx.from.id, 'Sizning broningiz tasdiqlandi. Iltimos klinikaga vaqtida keling.')
        break
      case 'reschedule':
        await updateBookingQueue(bookingId, { status: 'Qayta rejalashtirish' })
        await sendTelegramNotification(ctx.from.id, 'Broningiz qayta rejalashtiriladi. Iltimos, yangi vaqt tanlang.')
        break
      case 'cancel':
        await updateBookingQueue(bookingId, { status: 'Bekor qilindi' })
        await sendTelegramNotification(ctx.from.id, 'Broningiz bekor qilindi. Yana yordam kerak bo‘lsa, bizga yozing.')
        break
      default:
        await ctx.reply('Noma’lum amal: ' + action)
    }
  }
}
