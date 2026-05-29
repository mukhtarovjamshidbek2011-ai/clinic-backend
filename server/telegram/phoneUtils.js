export function normalizeUzbekPhone(rawPhone) {
  if (!rawPhone && rawPhone !== 0) {
    throw new Error('Telefon raqami kiritilmadi')
  }

  let phone = String(rawPhone).trim()

  // Remove common textual prefixes Telegram might provide
  phone = phone.replace(/^tel:\/\//i, '')
  phone = phone.replace(/^phone:/i, '')

  // Keep only digits and optional leading plus sign
  const sanitized = phone
    .replace(/[^+\d]/g, '')
    .replace(/(\+)+/g, '+')

  const hasPlus = sanitized.startsWith('+')
  let digits = hasPlus ? sanitized.slice(1) : sanitized

  // Strip international leading zeros if the user used 00998...
  if (digits.startsWith('00')) {
    digits = digits.slice(2)
  }

  // If user supplied local Uzbek number like 90xxxxxxx or 090xxxxxxx, add +998
  if (digits.length === 9 && /^[1-9]\d{8}$/.test(digits)) {
    digits = `998${digits}`
  }

  if (digits.length === 10 && digits.startsWith('0') && /^[0-9]{10}$/.test(digits)) {
    digits = `998${digits.slice(1)}`
  }

  // Accept direct Uzbekistan international form 998XXXXXXXXX
  if (digits.length === 12 && digits.startsWith('998')) {
    const normalized = `+${digits}`
    if (!isValidUzbekPhone(normalized)) {
      throw new Error('Telefon raqami noto‘g‘ri uzbek formatda')
    }
    return normalized
  }

  const normalized = `+${digits}`
  if (!isValidUzbekPhone(normalized)) {
    throw new Error('Telefon raqami noto‘g‘ri uzbek formatda')
  }

  return normalized
}

export function isValidUzbekPhone(normalizedPhone) {
  return /^\+998\d{9}$/.test(normalizedPhone)
}
