import { Scenes, Markup } from 'telegraf'
import { initFirebaseAdmin, getFirestore, setDocument } from '../../services/firebaseAdmin.js'
import { initPostgres, query as pgQuery } from '../../services/postgresClient.js'
import crypto from 'crypto'
import telegramAuthService from '../services/telegramAuthService.js'
import { normalizeUzbekPhone } from '../phoneUtils.js'

export default function phoneSceneFactory({ userService, mainKeyboard, logger }) {
  const { BaseScene } = Scenes
  const scene = new BaseScene('phoneScene')

  scene.enter(async (ctx) => {
    try {
      logger?.info('[PHONE-SCENE] Entered phoneScene onboarding', { fromId: ctx.from?.id })
      const telegramId = ctx.from?.id ? String(ctx.from.id).trim() : null

      const isAuthFlow = ctx.session?.authFlow === 'login'

      // Check if user already exists with phone (safety check)
      if (telegramId && userService) {
        const userStatus = await telegramAuthService.getUserStatus(telegramId, userService)
        if (userStatus.exists && userStatus.hasPhone) {
          logger?.info('[PHONE-SCENE] User already has phone, handling exit', { fromId: telegramId, isAuthFlow })
          // If this is an auth flow, generate and send website return button
          if (isAuthFlow) {
            try {
              const sessionId = ctx.session?.loginSessionId || null
              // Uses TELEGRAM_AUTH_RETURN_URL preferentially for public callback URLs.
              await telegramAuthService.replyWithReturnButton(ctx, userStatus.user, sessionId)
              return await ctx.scene.leave()
            } catch (err) {
              logger?.error('[PHONE-SCENE] Failed to send return button for existing auth user', err)
            }
          }

          await ctx.reply("✅ Siz allaqachon ro'yxatdan o'tgan ekansiz.", Markup.removeKeyboard())
          return await ctx.scene.leave()
        }
      }
      const welcomeText = isAuthFlow
        ? `👋 *Assalomu alaykum! Zam-Zam Health klinik yordamchisiga xush kelibsiz.*\n\nTizimdan foydalanish va saytga kirish uchun avval telefon raqamingizni quyidagi tugma orqali ulashing:`
        : `👋 *Assalomu alaykum! Zam-Zam Health klinik yordamchisiga xush kelibsiz.*\n\nTizimdan to'liq foydalanish va shifokorlar ko'rigiga yozilish uchun telefon raqamingizni pastdagi tugmasi orqali ulashing:`

      await ctx.replyWithMarkdown(
        welcomeText,
        Markup.keyboard([
          [Markup.button.contactRequest('📞 Telefon raqamni yuborish')],
          ['❌ Bekor qilish']
        ]).resize().oneTime(true)
      )
    } catch (err) {
      logger?.error('[PHONE-SCENE] enter error', err)
    }
  })

  // Handle cancel registration action
  scene.hears('❌ Bekor qilish', async (ctx) => {
    logger?.info('[PHONE-SCENE] Registration cancelled by user', { fromId: ctx.from?.id })
    await ctx.reply('Tizimdan ro‘yxatdan o‘tish bekor qilindi. Qayta boshlash uchun /start buyrug‘ini bering.', Markup.removeKeyboard())
    return await ctx.scene.leave()
  })

  scene.on('message', async (ctx) => {
    try {
      const contact = ctx.message.contact
      let phone = null
      
      logger?.info('phoneScene: Incoming message payload', { 
        fromId: ctx.from?.id, 
        hasContact: !!contact, 
        contactDetails: contact ? { phone_number: contact.phone_number, first_name: contact.first_name } : null,
        text: ctx.message.text 
      })

      if (contact && contact.phone_number) {
        if (contact.user && contact.user.id && String(contact.user.id) !== String(ctx.from?.id)) {
          logger?.warn('phoneScene: Contact ownership mismatch', { fromId: ctx.from?.id, contactUserId: contact.user.id })
          await ctx.reply('Iltimos, faqat o\'zingizga tegishli telefon kontaktini yuboring.')
          return
        }
        phone = contact.phone_number
      } else if (ctx.message.text) {
        phone = ctx.message.text.trim()
      }

      if (!phone) {
        logger?.warn('phoneScene: Phone number not found in message payload', { fromId: ctx.from?.id })
        await ctx.reply('⚠️ Telefon raqami aniqlanmadi. Iltimos, pastdagi yashil tugma orqali yuboring yoki +998901234567 formatda yozing:')
        return
      }

      let normalizedPhone
      try {
        normalizedPhone = normalizeUzbekPhone(phone)
        logger?.info('phoneScene: Phone normalization result', { fromId: ctx.from?.id, rawPhone: phone, normalizedPhone })
      } catch (validationError) {
        logger?.warn('phoneScene: Phone validation failed', { fromId: ctx.from?.id, rawPhone: phone, error: validationError.message })
        await ctx.reply(`⚠️ Kiritilgan telefon raqami noto‘g‘ri shaklda. Iltimos quyidagi formatlardan birini yuboring:
+998901234567
998901234567
(90)1234567`)
        return
      }

      const telegramId = ctx.from?.id ? String(ctx.from.id).trim() : null
      if (!telegramId) {
        logger?.error('phoneScene: Validation error - telegramId is null or undefined')
        await ctx.reply('Tizim xatoligi yuz berdi: Telegram ID aniqlanmadi.')
        return
      }

      const parsedPayload = {
        telegramId,
        username: ctx.from.username ? String(ctx.from.username).trim() : null,
        firstName: ctx.from.first_name ? String(ctx.from.first_name).trim() : null,
        lastName: ctx.from.last_name ? String(ctx.from.last_name).trim() : null,
        phoneNumber: normalizedPhone,
      }

      logger?.info('phoneScene: Executing database save/update with parsed payload', parsedPayload)
      
      const user = await userService.createOrUpdate(parsedPayload)
      
      logger?.info('phoneScene: Database save/update result', { telegramId, success: !!user })

      // Invalidate cached status so subsequent checks reflect the latest DB state
      try {
        telegramAuthService.invalidateUserStatusCache(telegramId)
      } catch (e) {
        logger?.warn('phoneScene: failed to invalidate user status cache', e)
      }

      // Accept either session-based flag or a cached pending-login marker (if session lost)
      ctx.session = ctx.session || {}
      let isAuthFlow = ctx.session?.authFlow === 'login'
      if (!isAuthFlow) {
        try {
          const pending = telegramAuthService.getPendingLoginMarker(telegramId)
          if (pending) {
            isAuthFlow = true
            ctx.session.authFlow = 'login'
            logger?.info('phoneScene: detected pending login in cache, treating as auth flow', { fromId: ctx.from?.id })
          }
        } catch (cacheErr) {
          logger?.warn('phoneScene: cache check failed', cacheErr)
        }
      }
      if (isAuthFlow) {
        try {
          const pending = telegramAuthService.getPendingLoginMarker(telegramId)
          const sessionId = ctx.session?.loginSessionId || (pending?.sessionId || null)
          await telegramAuthService.replyWithReturnButton(ctx, user, sessionId)

          try {
            telegramAuthService.clearPendingLoginMarker(telegramId)
          } catch (_) {}
          ctx.session.authFlow = null
        } catch (err) {
          logger?.error('phoneScene: replyWithReturnButton failed', err)
        }
      } else {
        await ctx.reply('🎉 Tabriklaymiz! Siz muvaffaqiyatli ro‘yxatdan o‘tdingiz.', mainKeyboard())
      }
      await ctx.scene.leave()
    } catch (err) {
      logger?.error('phoneScene message handler failed with error:', err)
      await ctx.reply('⚠️ Telefon raqamingizni saqlashda kutilmagan xatolik yuz berdi. Iltimos, keyinroq urinib ko‘ring.')
    }
  })

  return scene
}
