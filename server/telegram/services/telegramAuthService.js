import telegramLoginFlow from './telegramLoginFlow.js'

export default {
  getUserStatus: telegramLoginFlow.getUserStatus.bind(telegramLoginFlow),
  shouldRequestContact: telegramLoginFlow.shouldRequestContact.bind(telegramLoginFlow),
  checkAndRecordStartDedup: telegramLoginFlow.checkAndRecordStartDedup.bind(telegramLoginFlow),
  generateWebsiteReturnButton: telegramLoginFlow.generateWebsiteReturnButton.bind(telegramLoginFlow),
  replyWithReturnButton: telegramLoginFlow.replyWithReturnButton.bind(telegramLoginFlow),
  getTelegramCallbackConfig: telegramLoginFlow.getTelegramCallbackConfig.bind(telegramLoginFlow),
  invalidateUserStatusCache: telegramLoginFlow.invalidateUserStatusCache.bind(telegramLoginFlow),
  setPendingLoginMarker: telegramLoginFlow.setPendingLoginMarker.bind(telegramLoginFlow),
  getPendingLoginMarker: telegramLoginFlow.getPendingLoginMarker.bind(telegramLoginFlow),
  clearPendingLoginMarker: telegramLoginFlow.clearPendingLoginMarker.bind(telegramLoginFlow),
}
