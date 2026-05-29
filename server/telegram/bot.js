import { Telegraf, session, Scenes, Markup } from 'telegraf'
import { TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_USERNAME, ADMIN_TELEGRAM_IDS } from '../config/appConfig.js'
import { logger } from '../services/logger.js'
import phoneSceneFactory from './scenes/phoneScene.js'
import { mainKeyboard, helpText } from './keyboards/mainKeyboard.js'
import userService from './services/userService.js'
import bookingService from './services/bookingService.js'
import telegramAuthService from './services/telegramAuthService.js'

const globalBotState = globalThis.__ZAMZAM_TELEGRAM_BOT_STATE__ ||= { bot: null, started: false }
let bot = globalBotState.bot
let started = globalBotState.started

function escapeHTML(text) {
  if (!text) return ''
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

async function registerCommands(b) {
  await b.telegram.setMyCommands([
    { command: 'start', description: 'Botni ishga tushurish' },
    { command: 'profile', description: "Profil ma'lumotlarini ko‘rish" },
    { command: 'mybookings', description: 'Bronlaringizni ko‘rish' },
    { command: 'doctors', description: 'Shifokorlar ro‘yxati' },
    { command: 'book', description: 'Uchrashuv bron qilish' },
    { command: 'help', description: 'Yordam' },
  ])
}

async function initTelegramBot() {
  if (globalBotState.started && globalBotState.bot) {
    logger.info('[BOT] Telegram bot already initialized, reusing instance')
    return globalBotState.bot
  }

  if (!TELEGRAM_BOT_TOKEN) {
    logger.error('[BOT] TELEGRAM_BOT_TOKEN mavjud emas — bot ishga tushmaydi')
    return null
  }

  if (!TELEGRAM_BOT_USERNAME) {
    logger.warn('[BOT] TELEGRAM_BOT_USERNAME mavjud emas — bot foydalanuvchi nomi noaniq bo‘lishi mumkin')
  }

  if (bot) {
    logger.info('[BOT] Reusing existing Telegraf instance')
    return bot
  }

  bot = new Telegraf(TELEGRAM_BOT_TOKEN)
  const { Stage } = Scenes
  const phoneScene = phoneSceneFactory({ userService, mainKeyboard, logger })
  const stage = new Stage([phoneScene])

  const userLastCommandTime = new Map()
  const RATE_LIMIT_MS = 1200 // limit to 1.2 seconds between commands to prevent spam/abuse

  bot.use(session())
  bot.use(stage.middleware())

  logger.info('[BOT] Bot middleware configured')

  // Logging & Security Rate Limiting Middleware
  bot.use(async (ctx, next) => {
    try {
      const userId = ctx.from?.id
      
      // Rate limiter protection for commands
      if (userId && ctx.updateType === 'message' && ctx.message?.text?.startsWith('/')) {
        const now = Date.now()
        const lastTime = userLastCommandTime.get(userId) || 0
        if (now - lastTime < RATE_LIMIT_MS) {
          logger.warn('Rate limit exceeded for user', { userId, command: ctx.message.text })
          return await ctx.reply('⚠️ Iltimos, xizmatlardan foydalanishda ketma-ket tez-tez so‘rov yubormang.')
        }
        userLastCommandTime.set(userId, now)
      }

      logger.info('Incoming update', { type: ctx.updateType, from: userId })
      await next()
    } catch (err) {
      logger.error('Middleware error', err)
      try {
        await ctx.reply("Kutilmagan xatolik yuz berdi. Iltimos keyinroq urinib ko'ring.")
      } catch (replyError) {
        logger.warn('Failed to send fallback error reply', replyError)
      }
    }
  })

  bot.start(async (ctx) => {
    const rawPayload = ctx.startPayload || ''
    logger.info('[AUTH][START] Command /start executed (raw update)', { update: ctx.update, from: ctx.from && ctx.from.id, rawPayload })

    // Robust payload parsing: support plain 'login', 'login:<token>', or direct token
    function parseStartPayload(p) {
      if (!p) return { type: 'none', value: null }
      const s = String(p).trim()
      if (/^login$/i.test(s)) return { type: 'login', value: null }
      if (/^login[:_]/i.test(s)) return { type: 'login', value: s.split(/[:_]/).slice(1).join('_') }
      // if it looks like a JWT (three parts) treat as token
      if (s.split('.').length === 3) return { type: 'token', value: s }
      // fallback: if short alphanumeric, treat as token
      if (/^[A-Za-z0-9-_]{8,}$/.test(s)) return { type: 'token', value: s }
      return { type: 'unknown', value: s }
    }

    const parsed = parseStartPayload(rawPayload)
    logger.info('[AUTH][PAYLOAD] Parsed start payload', { parsed })

    try {
      const telegramId = ctx.from?.id ? String(ctx.from.id).trim() : null
      if (!telegramId) {
        logger.error('[AUTH][START] Missing telegramId')
        return await ctx.reply('Tizim xatoligi: Telegram ID aniqlanmadi. Iltimos, botni qayta oching.')
      }

      // Check for duplicate /start within 3 seconds
      if (telegramAuthService.checkAndRecordStartDedup(telegramId, parsed.type, parsed.value)) {
        logger.info('[AUTH][START] Duplicate detected, ignoring')
        return
      }

      // Ensure session exists
      ctx.session = ctx.session || {}

      // Get current user status (cached for 5 minutes)
      const userStatus = await telegramAuthService.getUserStatus(telegramId, userService)

      // ========== HANDLE LOGIN/WEBSITE FLOW ==========
      const sessionId = parsed.type === 'login' ? parsed.value || null : null
      if (sessionId) {
        ctx.session.loginSessionId = sessionId
      }

      // Check if this is a website login flow (either from payload or from saved session state)
      const isWebsiteLoginFlow = parsed.type === 'login' || parsed.type === 'token' || !!ctx.session.loginSessionId

      if (isWebsiteLoginFlow) {
        logger.info('[AUTH][START] Website-triggered login flow detected', { sessionId, fromSession: !!ctx.session.loginSessionId })

        // If user exists and has phone, ALWAYS generate JWT and show return button
        // This is the key fix: existing users from website auth MUST see the return button
        if (userStatus.exists && userStatus.hasPhone) {
          logger.info('[AUTH][EXISTING_USER] Detected existing user in website auth flow', { telegramId })
          try {
            await telegramAuthService.replyWithReturnButton(ctx, userStatus.user, sessionId || ctx.session.loginSessionId)
            logger.info('[AUTH][RETURN_BUTTON] Return button sent to existing user', { telegramId })
            return
          } catch (err) {
            logger.error('[AUTH][START] Failed to reply with login button for existing user', err)
            // Even on error, don't fall back to manual flow - inform user about the issue
            await ctx.reply('⚠️ Saytga qaytish tugmasi yuborishda xatolik yuz berdi. Iltimos qaytadan urinib ko\'ring.')
            return
          }
        }

        // User doesn't exist or missing phone - mark as auth flow and ask for contact
        logger.info('[AUTH][NEW_USER] New user detected in website auth flow, requesting contact', { telegramId })
        ctx.session.authFlow = 'login'
        telegramAuthService.setPendingLoginMarker(telegramId, { initiatedAt: Date.now(), payload: sessionId, sessionId })
        
        return ctx.scene.enter('phoneScene')
      }

      // ========== HANDLE MANUAL /start FLOW ==========
      // If user exists and has phone
      if (userStatus.exists && userStatus.hasPhone) {
        logger.info('[AUTH][START] Existing user with complete profile (manual flow)')
        await ctx.replyWithMarkdown(
          "*Assalomu alaykum!* 👋\n\nSiz allaqachon ro'yxatdan o'tgan ekansiz.",
          mainKeyboard()
        )
        return
      }

      // User doesn't exist or missing phone - ask for contact
      logger.info('[AUTH][START] Entering phone scene for new/incomplete user (manual flow)')
      return ctx.scene.enter('phoneScene')

    } catch (error) {
      logger.error('[AUTH][START] Handler error', error)
      await ctx.reply("❌ Xatolik yuz berdi. Iltimos qaytadan urinib ko'ring.")
    }
  })

  bot.command('help', async (ctx) => {
    logger.info('Command /help executed', { id: ctx.from?.id })
    try {
      await ctx.reply(helpText, mainKeyboard())
    } catch (err) {
      logger.error('/help error', err)
    }
  })

  async function showProfile(ctx) {
    const telegramId = ctx.from?.id ? String(ctx.from.id).trim() : null
    if (!telegramId) {
      logger.warn('/profile: Missing telegramId')
      return ctx.reply("Siz avvalo /start orqali ro'yxatdan o'tishingiz kerak.")
    }

    try {
      const user = await userService.getByTelegramId(telegramId)
      if (!user) {
        logger.warn('/profile: User not found in DB', { telegramId })
        return ctx.reply("Siz avvalo /start orqali ro'yxatdan o'tishingiz kerak.")
      }

      let bookings = []
      try {
        bookings = await bookingService.getByTelegramId(telegramId)
      } catch (err) {
        logger.error('/profile: Failed to load bookings from DB', err)
      }

      const bookingCount = Array.isArray(bookings) ? bookings.length : 0
      const name = escapeHTML(`${user.firstName || user.first_name || "Noma'lum"} ${user.lastName || user.last_name || "Noma'lum"}`.trim() || '—')
      const phone = escapeHTML(user.phoneNumber || user.phone_number || '—')
      const usernameStr = user.username ? `@${escapeHTML(user.username)}` : '—'
      
      let regDateStr = '—'
      if (user.createdAt) {
        try {
          const dateObj = user.createdAt.toDate ? user.createdAt.toDate() : new Date(user.createdAt)
          const options = { year: 'numeric', month: 'long', day: 'numeric' }
          regDateStr = dateObj.toLocaleDateString('uz-UZ', options)
        } catch (_) {
          regDateStr = String(user.createdAt).split('T')[0]
        }
      }

      const text = `👤 <b>Zam-Zam Health — Bemor Profili</b>\n\n🔹 <b>To'liq ism:</b> ${name}\n🔹 <b>Username:</b> ${usernameStr}\n🔹 <b>Telefon:</b> ${phone}\n🔹 <b>Ro'yxatdan o'tgan sana:</b> ${regDateStr}\n🔹 <b>Bronlar soni:</b> ${bookingCount}\n🔹 <b>Hisob holati:</b> 🟢 Faol`

      await ctx.replyWithHTML(text, mainKeyboard())
    } catch (err) {
      logger.error('/profile logic error', err)
      await ctx.reply("Profilni yuklashda xatolik yuz berdi")
    }
  }

  async function showMyBookings(ctx) {
    const telegramId = ctx.from?.id ? String(ctx.from.id).trim() : null
    if (!telegramId) {
      return ctx.replyWithMarkdown('📭 *Sizda hozircha hech qanday bronlar mavjud emas.*\n\nKlinikamiz shifokorlari qabuliga yozilish uchun veb-saytimizga tashrif buyuring yoki ro‘yxatxonaga bog‘laning.', mainKeyboard())
    }

    try {
      let bookings = []
      try {
        bookings = await bookingService.getByTelegramId(telegramId)
      } catch (dbErr) {
        logger.error('/mybookings db error', dbErr)
      }

      if (!bookings || bookings.length === 0) {
        return ctx.replyWithHTML('📭 <b>Sizda hozircha hech qanday bronlar mavjud emas.</b>\n\nKlinikamiz shifokorlari qabuliga yozilish uchun veb-saytimizga tashrif buyuring yoki ro\'yxatxonaga bog\'laning.', mainKeyboard())
      }

      await ctx.reply(`🔍 Sizning uchrashuvlaringiz ro'yxati (jami: ${bookings.length}):`)

      for (const b of bookings) {
        try {
          const bDate = b.bookingDate || b.date || '—'
          const bTime = b.bookingTime || b.time || '—'
          const docName = b.doctorName || b.doctor || 'Noma\'lum'
          const status = b.status || 'Kutilmoqda'
          
          let statusBadge = '🟡 Kutilmoqda'
          if (status === 'Tasdiqlandi') statusBadge = '🟢 Tasdiqlandi'
          if (status === 'Bekor qilindi') statusBadge = '🔴 Bekor qilindi'
          
          const safeDocName = escapeHTML(docName)
          const safeBDate = escapeHTML(bDate)
          const safeBTime = escapeHTML(bTime)
          const safeBId = escapeHTML(String(b.id || b.bookingId || '—'))
          
          const bookingText = `🏥 <b>Zam-Zam Health — Bron ma'lumotlari</b>\n\n👨‍⚕️ <b>Shifokor:</b> ${safeDocName}\n📅 <b>Sana:</b> ${safeBDate}\n⏰ <b>Vaqt:</b> ${safeBTime}\n📌 <b>Holati:</b> ${statusBadge}\n🔖 <b>Bron ID:</b> <code>${safeBId}</code>`

          if (status === 'Kutilmoqda' || status === 'Tasdiqlandi') {
            const inlineKeyboard = Markup.inlineKeyboard([
              Markup.button.callback('❌ Bronni bekor qilish', 'cancel:${b.id || b.bookingId}')
            ])
            await ctx.replyWithHTML(bookingText, inlineKeyboard)
          } else {
            await ctx.replyWithHTML(bookingText)
          }
        } catch (innerErr) {
          logger.error('Failed to format booking', innerErr)
        }
      }
    } catch (err) {
      logger.error('/mybookings logic error', err)
      await ctx.reply('Bronlarni olishda xatolik yuz berdi')
    }
  }

  bot.command('profile', showProfile)
  bot.command('mybookings', showMyBookings)

  // ============================================================
  // ADMIN COMMANDS
  // ============================================================

  /**
   * Guard: only allow admin Telegram IDs (from ADMIN_TELEGRAM_IDS env var).
   * Returns true if authorized, false + sends rejection message if not.
   */
  async function requireAdmin(ctx) {
    const userId = String(ctx.from?.id || '')
    if (!userId || ADMIN_TELEGRAM_IDS.length === 0 || !ADMIN_TELEGRAM_IDS.includes(userId)) {
      logger.warn('Admin command blocked for non-admin user', { userId, command: ctx.message?.text })
      await ctx.reply('⛔ Bu buyruq faqat adminlar uchun.')
      return false
    }
    return true
  }

  // /stats — Platform overview
  bot.command('stats', async (ctx) => {
    if (!await requireAdmin(ctx)) return
    logger.info('Admin /stats executed', { by: ctx.from?.id })
    try {
      const { getUsersCount } = await import('../auth/userRepository.js')
      const { getBookingsCount } = await import('../services/bookingRepository.js')
      const [usersCount, bookingsCount, todayBookings] = await Promise.all([
        getUsersCount().catch(() => '—'),
        getBookingsCount().catch(() => '—'),
        import('../services/bookingRepository.js').then(m => m.getBookingsForToday()).catch(() => []),
      ])
      const today = new Date().toLocaleDateString('uz-UZ', { year: 'numeric', month: 'long', day: 'numeric' })
      const todayCount = Array.isArray(todayBookings) ? todayBookings.length : '—'
      const confirmedToday = Array.isArray(todayBookings) ? todayBookings.filter(b => b.status === 'Tasdiqlandi').length : '—'
      const pendingToday = Array.isArray(todayBookings) ? todayBookings.filter(b => b.status === 'Kutilmoqda').length : '—'

      const text = `📊 <b>Zam-Zam Health — Tizim Statistikasi</b>\n\n📅 <b>Sana:</b> ${today}\n\n👥 <b>Foydalanuvchilar:</b>\n  • Jami ro'yxatdan o'tganlar: <b>${usersCount}</b>\n\n🗓 <b>Bugungi bronlar (${today}):</b>\n  • Jami: <b>${todayCount}</b>\n  • ✅ Tasdiqlangan: <b>${confirmedToday}</b>\n  • 🟡 Kutilmoqda: <b>${pendingToday}</b>\n\n📋 <b>Umumiy bronlar (jami):</b> <b>${bookingsCount}</b>`

      await ctx.replyWithHTML(text)
    } catch (err) {
      logger.error('Admin /stats error', err)
      await ctx.reply("Statistikani yuklashda xatolik yuz berdi.")
    }
  })

  // /today — Today's appointment schedule
  bot.command('today', async (ctx) => {
    if (!await requireAdmin(ctx)) return
    logger.info('Admin /today executed', { by: ctx.from?.id })
    try {
      const { getBookingsForToday } = await import('../services/bookingRepository.js')
      const bookings = await getBookingsForToday()
      if (!bookings || bookings.length === 0) {
        return ctx.replyWithMarkdown('📭 *Bugun uchun bronlar mavjud emas.*')
      }
      const today = new Date().toLocaleDateString('uz-UZ', { year: 'numeric', month: 'long', day: 'numeric' })
      await ctx.replyWithHTML(`🗓 <b>Bugungi qabullar — ${today}</b> (jami: ${bookings.length})`)
      for (const b of bookings.slice(0, 20)) { // cap at 20 to avoid flood
        try {
          const docName = escapeHTML(b.doctorName || b.doctor || "Noma'lum");
          const bTime = escapeHTML(b.bookingTime || b.time || '—');
          const patient = escapeHTML(b.patientName || b.userName || b.name || "Noma'lum");
          const phone = escapeHTML(b.patientPhone || b.userPhone || b.phoneNumber || '—');
          let statusBadge = '🟡 Kutilmoqda'
          if (b.status === 'Tasdiqlandi') statusBadge = '🟢 Tasdiqlandi'
          if (b.status === 'Bekor qilindi') statusBadge = '🔴 Bekor qilindi'
          const line = `⏰ <b>${bTime}</b> — 👨‍⚕️ ${docName}\n👤 Bemor: ${patient} | 📞 ${phone}\n📌 Holat: ${statusBadge}\n🔖 ID: <code>${escapeHTML(b.id || b.bookingId || '—')}</code>`
          await ctx.replyWithHTML(line)
        } catch (innerErr) {
          logger.error('Admin /today: Failed to format booking', innerErr)
        }
      }
      if (bookings.length > 20) {
        await ctx.reply(`⚠️ Faqat birinchi 20 ta bron ko'rsatildi. Jami: ${bookings.length}.`)
      }
    } catch (err) {
      logger.error('Admin /today error', err)
      await ctx.reply("Bugungi bronlarni olishda xatolik yuz berdi.")
    }
  })

  // /patients — List of registered patients (paginated, first 30)
  bot.command('patients', async (ctx) => {
    if (!await requireAdmin(ctx)) return
    logger.info('Admin /patients executed', { by: ctx.from?.id })
    try {
      const { getAllUsers } = await import('../auth/userRepository.js')
      const users = await getAllUsers()
      if (!users || users.length === 0) {
        return ctx.replyWithHTML("📭 <b>Hozircha ro'yxatdan o'tgan bemorlar mavjud emas.</b>")
      }
      const displayUsers = users.slice(0, 30)
      await ctx.replyWithHTML(`👥 <b>Ro'yxatdan o'tgan bemorlar</b> (korsatilmoqda: ${displayUsers.length} / jami: ${users.length})`)
      for (const u of displayUsers) {
        try {
          const name = escapeHTML(`${u.firstName || u.first_name || ''} ${u.lastName || u.last_name || ''}`.trim() || '—')
          const phone = escapeHTML(u.phoneNumber || u.phone_number || '—')
          const usernameStr = u.username ? `@${escapeHTML(u.username)}` : '—'
          const regDate = u.createdAt
            ? (u.createdAt.toDate ? u.createdAt.toDate() : new Date(u.createdAt)).toLocaleDateString('uz-UZ')
            : '—'
          const line = `👤 <b>${name}</b>\n📞 ${phone} | TG: ${usernameStr}\n📅 Ro'yxat: ${regDate} | ID: <code>${escapeHTML(u.telegramId || u.id || '—')}</code>`
          await ctx.replyWithHTML(line)
        } catch (innerErr) {
          logger.error('Admin /patients: Failed to format user', innerErr)
        }
      }
      if (users.length > 30) {
        await ctx.reply(`⚠️ Faqat birinchi 30 ta bemor ko'rsatildi. Jami: ${users.length}.`)
      }
    } catch (err) {
      logger.error("Admin /patients error", err)
      await ctx.reply("Bemorlar ro'yxatini olishda xatolik yuz berdi.")
    }
  })

  // /broadcast <message> — Send a message to ALL registered users
  bot.command('broadcast', async (ctx) => {
    if (!await requireAdmin(ctx)) return
    logger.info('Admin /broadcast executed', { by: ctx.from?.id })
    try {
      // Extract message text after /broadcast command
      const rawText = ctx.message?.text || ''
      const broadcastText = rawText.replace(/^\/broadcast\s*/i, '').trim()
      if (!broadcastText) {
        return ctx.replyWithMarkdown(`ℹ️ *Foydalanish:* /broadcast <xabar matni>\n\nMisol: /broadcast Bugun klinika 15:00 gacha ishlaydi.`)
      }

      const { getAllUsers } = await import('../auth/userRepository.js')
      const users = await getAllUsers()
      if (!users || users.length === 0) {
        return ctx.reply('Hozircha hech qanday foydalanuvchi topilmadi.')
      }

      const recipientIds = users.map(u => u.telegramId || u.id).filter(Boolean)
      await ctx.reply(`📡 Xabar yuborilmoqda ${recipientIds.length} ta foydalanuvchiga...`)

      let successCount = 0
      let failCount = 0
      const formatted = `📢 *Zam-Zam Health — Muhim Xabar*\n\n${broadcastText}\n\n_— Klinika ma'muriyati_`

      for (const telegramId of recipientIds) {
        try {
          await bot.telegram.sendMessage(String(telegramId), formatted, { parse_mode: 'Markdown' })
          successCount++
          // Small delay to avoid hitting Telegram rate limits (30msg/sec max)
          await new Promise(resolve => setTimeout(resolve, 50))
        } catch (msgErr) {
          failCount++
          logger.warn('Broadcast: Failed to send to user', { telegramId, error: msgErr.message })
        }
      }

      logger.info('Admin /broadcast complete', { successCount, failCount, total: recipientIds.length })
      await ctx.reply(`✅ Xabar yuborish yakunlandi.\n\n✔️ Muvaffaqiyatli: ${successCount}\n✖️ Yuborilmadi: ${failCount}`)
    } catch (err) {
      logger.error('Admin /broadcast error', err)
      await ctx.reply('Xabar yuborishda xatolik yuz berdi.')
    }
  })

  // NOTE: Contact handler removed - phoneScene handles all contact sharing
  // This consolidation prevents duplicate message handlers and ensures consistent flow
  // bot.on('contact') previously caused duplicate processing of shared contacts
  
  // REMOVED: Duplicate contact handler that was outside phoneScene

  // Hears quick replies mapping to command logic
  bot.hears('👤 Profil', showProfile)
  bot.hears('📝 Mening bronlarim', showMyBookings)
  bot.hears('ℹ️ Yordam', async (ctx) => {
    logger.info('Button Help clicked', { id: ctx.from?.id })
    await ctx.replyWithMarkdown(helpText, mainKeyboard())
  })
  
  bot.hears('🩺 Shifokorlar', async (ctx) => {
    logger.info('Button Shifokorlar clicked', { id: ctx.from?.id })
    const doctorsListText = `👨‍⚕️ *Bizning yuqori malakali shifokorlarimiz:*\n\n1️⃣ *Dr. Alisher Karimov* — Kardiolog\n⭐ 4.9 | 10+ yillik tajriba | 1,200+ shifo topgan bemor\n\n2️⃣ *Dr. Fatima Al-Rashid* — Nevrolog\n⭐ 4.8 | 8+ yillik tajriba | 950+ shifo topgan bemor\n\n3️⃣ *Dr. Omar Hassan* — Ginekolog\n⭐ 4.9 | 12+ yillik tajriba | 1,500+ shifo topgan bemor\n\n4️⃣ *Dr. Aisha Ahmed* — Pediatr\n⭐ 4.7 | 7+ yillik tajriba | 2,100+ shifo topgan bemor\n\n5️⃣ *Dr. Hassan Ibrahim* — Stomatolog\n⭐ 4.8 | 9+ yillik tajriba | 800+ shifo topgan bemor\n\n6️⃣ *Dr. Zainab Al-Mansouri* — Xirurg\n⭐ 4.9 | 15+ yillik tajriba | 650+ shifo topgan bemor\n\n📅 Shifokor ko‘rigiga yozilish uchun klinikamizning rasmiy veb-saytidan yoki ro‘yxatxonadan ro'yxatdan o‘tin.`
    await ctx.replyWithMarkdown(doctorsListText, mainKeyboard())
  })

  // Callback query handler
  bot.on('callback_query', async (ctx) => {
    const callbackData = ctx.callbackQuery.data
    logger.info('Callback query received', { callbackData, fromId: ctx.from?.id })

    try {      // Handle localhost redirect callback (for development/localhost auth flow)
      if (callbackData.startsWith('redirect:')) {
        const encodedUrl = callbackData.substring('redirect:'.length)
        try {
          const redirectUrl = Buffer.from(encodedUrl, 'base64').toString('utf-8')
          logger.info('[AUTH] Localhost redirect callback', { telegramId: ctx.from?.id, redirectUrl })
          await ctx.answerCbQuery()
          // Send the redirect URL as a clickable message
          await ctx.reply(
            `✅ *Saytga qaytish tugmasi bosildi*\n\n🔗 Saytga qaytish uchun quyidagi havolani oching:\n\n${redirectUrl}`,
            { parse_mode: 'Markdown' }
          )
          return
        } catch (err) {
          logger.error('[AUTH] Localhost redirect processing error', err)
          await ctx.answerCbQuery('Saytga qaytishda xatolik yuz berdi.', true)
          return
        }
      }
      const [action, bookingId] = callbackData.split(':')
      if (!action || !bookingId) {
        return await ctx.answerCbQuery("Noto‘g‘ri ma'lumotlar.", true)
      }

      const { getBookingById, updateBookingStatus } = await import('../services/bookingRepository.js')
      const booking = await getBookingById(bookingId)
      
      if (!booking) {
        logger.warn('Callback action on non-existent booking', { bookingId })
        return await ctx.answerCbQuery('Uchrashuv topilmadi.', true)
      }

      if (String(booking.telegramId) !== String(ctx.from.id)) {
        logger.warn('Security Alert: Unauthorized callback query action', { 
          fromId: ctx.from.id, 
          bookingTelegramId: booking.telegramId 
        })
        return await ctx.answerCbQuery('Xavfsizlik xatosi: Siz ushbu amalni bajara olmaysiz.', true)
      }

      if (action === 'confirm') {
        await updateBookingStatus(bookingId, 'Tasdiqlandi')
        logger.info('Booking confirmed from telegram callback', { bookingId })
        await ctx.editMessageText(`✅ *Sizning uchrashuvingiz tasdiqlandi!*\n\n👨‍⚕️ Shifokor: ${booking.doctorName || '—'}\n📅 Sana: ${booking.bookingDate || '—'}\n⏰ Vaqt: ${booking.bookingTime || '—'}\n\nKlinikamizga vaqtida kelishingizni so‘raymiz. Salomat bo‘ling!`, { parse_mode: 'Markdown' })
        await ctx.answerCbQuery('Uchrashuv tasdiqlandi!')
      } 
      else if (action === 'reschedule') {
        await updateBookingStatus(bookingId, 'Qayta rejalashtirish')
        logger.info('Booking set to reschedule from callback', { bookingId })
        await ctx.editMessageText('🔄 *Uchrashuvni qayta rejalashtirish so‘rovi qabul qilindi.*\n\nTez orada klinikamiz ro‘yxatxonasi yangi qabul vaqtini kelishish uchun siz bilan bog‘lanadi yoki rasmiy veb-saytimiz orqali qayta yozilishingiz mumkin.', { parse_mode: 'Markdown' })
        await ctx.answerCbQuery('Qayta rejalashtirish so‘rovi yuborildi!')
      } 
      else if (action === 'cancel') {
        await updateBookingStatus(bookingId, 'Bekor qilindi')
        logger.info('Booking cancelled from telegram callback', { bookingId })
        await ctx.editMessageText('❌ *Uchrashuv muvaffaqiyatli bekor qilindi.*\n\nYana yordam kerak bo‘lsa, /start buyrug‘ini berishingiz yoki pastdagi menyudan foydalanishingiz mumkin. Salomat bo‘ling!', { parse_mode: 'Markdown' })
        await ctx.answerCbQuery('Uchrashuv bekor qilindi!')
      } 
      else {
        await ctx.answerCbQuery(`Noma'lum amal: ${action}`, true)
      }
    } catch (err) {
      logger.error('Callback query error:', err)
      await ctx.answerCbQuery("Kutilmagan xatolik yuz berdi. Iltimos keyinroq urinib ko'ring.", true)
    }
  })

  // Default message handler for unrecognized text inputs
  bot.on('message', async (ctx, next) => {
    try {
      if (ctx.message.text && ['/start', '/help', '/profile', '/mybookings'].includes(ctx.message.text.trim().toLowerCase())) {
        return next()
      }
      await ctx.reply('💬 Iltimos, pastdagi menyudan tugmalardan birini tanlang yoki /help buyrug‘ini bosing.', mainKeyboard())
    } catch (error) {
      logger.error('Default message handler error:', error)
      await ctx.reply("Xatolik yuz berdi. Iltimos qaytadan urinib ko'ring.")
    }
  })

  // register commands and start
  try {
    logger.info('[BOT] Registering commands')
    await registerCommands(bot)
    logger.info('[BOT] Commands registered, launching bot')
    await bot.launch({ dropPendingUpdates: true })
    logger.info('[BOT] bot.launch returned')
    started = true
    globalBotState.bot = bot
    globalBotState.started = true
    const info = await bot.telegram.getMe()
    logger.info('[BOT] Telegram bot started successfully', { username: info.username, id: info.id })
  } catch (err) {
    const rawErrorText = String(err?.message || err?.response?.description || err?.description || err || '')
    const isPollingConflict = rawErrorText.includes('terminated by other getUpdates request')
      || rawErrorText.includes('409: Conflict')
      || rawErrorText.includes('Conflict: terminated by other getUpdates request')
      || rawErrorText.includes('another bot instance is running')

    if (isPollingConflict) {
      logger.warn('[BOT] Telegram polling conflict detected; another bot instance may be running. Skipping bot launch.', { error: rawErrorText })
      bot = null
      started = false
      globalBotState.bot = null
      globalBotState.started = false
      return null
    }

    logger.error('[BOT] Failed launching Telegraf', err)
    bot = null
    started = false
    globalBotState.bot = null
    globalBotState.started = false
    throw err
  }

  // graceful shutdown
  process.once('SIGINT', async () => {
    logger.info('SIGINT received — stopping bot')
    try { await bot.stop(); } catch (_) {}
    process.exit(0)
  })
  process.once('SIGTERM', async () => {
    logger.info('SIGTERM received — stopping bot')
    try { await bot.stop(); } catch (_) {}
    process.exit(0)
  })

  return bot
}

async function getBot() { return bot }

async function sendTelegramNotification(chatId, text, extra = {}) {
  if (!bot) throw new Error('Bot not initialized')
  try {
    const res = await bot.telegram.sendMessage(String(chatId), text, { parse_mode: 'Markdown', ...extra })
    logger.info('Notification sent', { chatId })
    return res
  } catch (err) {
    logger.error('sendTelegramNotification failed', err)
    throw err
  }
}

async function sendBookingUpdateNotification(telegramId, booking, reason) {
  const text = `🔔 *Bron yangilandi*\n${reason || ''}\n` + bookingService.formatBooking(booking)
  return sendTelegramNotification(telegramId, text)
}

async function notifyDoctorUnavailable(doctorId, dateString) {
  const affected = await bookingService.markDoctorUnavailable(doctorId, dateString)
  for (const b of affected) {
    if (!b.telegramId) continue
    
    const docName = b.doctorName || b.doctor || 'Shifokor'
    const date = b.bookingDate || b.date || dateString
    const time = b.bookingTime || b.time || '—'

    const alertText = `⚠️ *Muhim Xabarnoma — Shifokor Qabul Vaqti O‘zgardi*\n\nHurmatli mijoz, shifokorimiz *${docName}* kutilmagan shoshilinch holatlar tufayli *${date}* kuni qabulga kela olmaydigan bo‘ldilar. \n\nSizning soat *${time}* dagi uchrashuv broningiz bekor qilindi. Noqulayliklar uchun klinikamiz nomidan samimiy uzr so‘raymiz! 🙏\n\n🔄 *Tavsiya etiladigan alternativ vaqtlar:*\n- Keyingi ish kuni soat *10:00* yoki *14:30*\n\nIltimos, quyidagi tugmalardan birini tanlash orqali uchrashuvni tasdiqlang, boshqa vaqtga ko‘chiring yoki bekor qiling:`

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('✅ Tasdiqlash', `confirm:${b.id || b.bookingId}`)],
      [Markup.button.callback('🔄 Boshqa vaqt tanlash', `reschedule:${b.id || b.bookingId}`)],
      [Markup.button.callback('❌ Bekor qilish', `cancel:${b.id || b.bookingId}`)]
    ])

    await sendTelegramNotification(b.telegramId, alertText, { reply_markup: keyboard.reply_markup })
  }
  logger.info('Doctor unavailable notifications sent', { doctorId, dateString, count: affected.length })
  return affected
}

export default {
  initTelegramBot,
  getBot,
  sendTelegramNotification,
  sendBookingUpdateNotification,
  notifyDoctorUnavailable,
}
