export function buildDoctorUnavailableMessage(booking) {
  return `🚨 Doctor holati o‘zgardi\n\nShifokor: ${booking.doctorName || booking.doctor_id || '—'}\nSana: ${booking.bookingDate || booking.date || '—'}\nVaqt: ${booking.bookingTime || booking.time || '—'}\n\nAfsuski, shifokor hozirda mavjud emas. Iltimos, yangi vaqt tanlash yoki qayta rejalashtirish uchun admin bilan bog‘laning.`
}

export function buildRescheduleMessage(booking) {
  return `🔄 Bron qayta rejalashtirildi\n\nShifokor: ${booking.doctorName || booking.doctor_id || '—'}\nYangi sana: ${booking.bookingDate || booking.date || '—'}\nYangi vaqt: ${booking.bookingTime || booking.time || '—'}\n\nIltimos, klinikaga yangilangan vaqtda tashrif buyuring.`
}
