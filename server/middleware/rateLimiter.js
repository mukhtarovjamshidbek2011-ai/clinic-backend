import rateLimit from 'express-rate-limit'

export function createRateLimiter({ windowMs = 60000, max = 100 } = {}) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: 'Ko‘p so‘rov yuborildi, iltimos biroz kutib qayta urinib ko‘ring.',
    },
  })
}
