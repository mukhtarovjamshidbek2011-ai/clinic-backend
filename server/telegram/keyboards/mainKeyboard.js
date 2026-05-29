import { Markup } from 'telegraf'

export function mainKeyboard() {
  return Markup.keyboard([
    ['📝 Mening bronlarim', '🩺 Shifokorlar'],
    ['👤 Profil', 'ℹ️ Yordam']
  ]).resize().oneTime(false)
}

export const helpText = `🏥 *Zam-Zam Health — Klinik Yordamchi Tizimi*

Sizga klinikamiz bo‘yicha yordam berishdan mamnunmiz. Quyidagi buyruqlar orqali tizimdan foydalanishingiz mumkin:

🔹 /start — Botni ishga tushirish va telefon raqamini ulash
🔹 /profile — Shaxsiy profil ma’lumotlarini ko‘rish
🔹 /mybookings — Faol va o‘tgan barcha bronlaringiz ro‘yxati
🔹 /help — Batafsil yordam va yo‘riqnomani olish

Biz har doim sizning sog‘ligingiz haqida qayg‘uramiz! ❤️`
