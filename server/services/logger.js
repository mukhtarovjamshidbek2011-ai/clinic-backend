/**
 * Structured logger with timestamps, levels, and token masking.
 * Levels: info, warn, error, telegram, db, auth
 */

const TOKEN_PATTERN = /\b\d{8,10}:[A-Za-z0-9_-]{35}\b/g

function maskSensitive(str) {
  if (typeof str !== 'string') return str
  return str.replace(TOKEN_PATTERN, '***BOT_TOKEN***')
}

function sanitize(arg) {
  if (arg === null || arg === undefined) return arg
  if (typeof arg === 'string') return maskSensitive(arg)
  if (arg instanceof Error) {
    return { message: maskSensitive(arg.message), stack: arg.stack?.split('\n').slice(0, 4).join('\n') }
  }
  if (typeof arg === 'object') {
    try {
      const s = JSON.stringify(arg)
      if (TOKEN_PATTERN.test(s)) return JSON.parse(maskSensitive(s))
    } catch (_) {}
  }
  return arg
}

function sanitizeArgs(args) {
  return args.map(sanitize)
}

function ts() {
  return new Date().toISOString()
}

// Only log verbose info in non-production environments
const IS_PROD = process.env.NODE_ENV === 'production'

export const logger = {
  info: (...args) => {
    if (!IS_PROD) console.log(`[${ts()}] [INFO]`, ...sanitizeArgs(args))
  },
  warn: (...args) => {
    console.warn(`[${ts()}] [WARN]`, ...sanitizeArgs(args))
  },
  error: (...args) => {
    console.error(`[${ts()}] [ERROR]`, ...sanitizeArgs(args))
  },
  telegram: (...args) => {
    if (!IS_PROD) console.log(`[${ts()}] [TG]`, ...sanitizeArgs(args))
  },
  db: (...args) => {
    if (!IS_PROD) console.log(`[${ts()}] [DB]`, ...sanitizeArgs(args))
  },
  auth: (...args) => {
    if (!IS_PROD) console.log(`[${ts()}] [AUTH]`, ...sanitizeArgs(args))
  },
}
