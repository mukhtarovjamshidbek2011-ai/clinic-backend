import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '../../')
const serverDir = path.resolve(__dirname, '../')
// Load environment variables in priority order:
// 1. workspace root .env.local
// 2. workspace root .env
// 3. server/.env.local
// 4. server/.env
dotenv.config({ path: path.resolve(rootDir, '.env.local') })
dotenv.config({ path: path.resolve(rootDir, '.env') })
dotenv.config({ path: path.resolve(serverDir, '.env.local') })
dotenv.config({ path: path.resolve(serverDir, '.env') })

// Preferred callback env for Telegram website login.
// TELEGRAM_AUTH_RETURN_URL should point to a public HTTPS site URL.
export const FRONTEND_BASE_URL = process.env.FRONTEND_BASE_URL || 'https://zamzam-clinic.netlify.app/'
export const FRONTEND_PUBLIC_URL = process.env.FRONTEND_PUBLIC_URL || process.env.FRONTEND_BASE_URL || 'https://zamzam-clinic.netlify.app/'
export const TELEGRAM_AUTH_RETURN_URL = process.env.TELEGRAM_AUTH_RETURN_URL || process.env.TELEGRAM_CALLBACK_URL || ''
export const TELEGRAM_CALLBACK_URL = process.env.TELEGRAM_CALLBACK_URL || process.env.TELEGRAM_AUTH_RETURN_URL || ''
export const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.env.VITE_TELEGRAM_BOT_TOKEN || ''
export const TELEGRAM_BOT_USERNAME = process.env.TELEGRAM_BOT_USERNAME || process.env.VITE_TELEGRAM_BOT_USERNAME || ''
import crypto from 'crypto'

let secureSecret = process.env.JWT_SECRET
if (!secureSecret || secureSecret === 'replace-me-with-a-secure-secret' || secureSecret === 'replace-me-with-secure-key') {
  console.warn('[CONFIG] JWT_SECRET not properly configured. Generating a temporary random secret. For production, set JWT_SECRET env var.')
  secureSecret = crypto.randomBytes(32).toString('hex')
}
export const JWT_SECRET = secureSecret
export const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d'
export const DATABASE_CLIENT = process.env.DATABASE_CLIENT || 'firebase'
export const FIREBASE_SERVICE_ACCOUNT_PATH = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || ''
export const PG_CONNECTION_STRING = process.env.PG_CONNECTION_STRING || ''
export const SERVER_PORT = Number(process.env.PORT) || 4000
export const ADMIN_TELEGRAM_IDS = (process.env.ADMIN_TELEGRAM_IDS || '').split(',').map(id => id.trim()).filter(Boolean)
