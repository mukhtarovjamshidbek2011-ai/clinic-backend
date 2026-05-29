import botAdapter from './bot.js'

export const initTelegramBot = botAdapter.initTelegramBot
export const getTelegramBot = botAdapter.getBot
export const sendTelegramNotification = botAdapter.sendTelegramNotification
export const sendBookingUpdateNotification = botAdapter.sendBookingUpdateNotification
export const notifyDoctorUnavailable = botAdapter.notifyDoctorUnavailable

export default {
  initTelegramBot,
  getTelegramBot,
  sendTelegramNotification,
  sendBookingUpdateNotification,
  notifyDoctorUnavailable,
}
