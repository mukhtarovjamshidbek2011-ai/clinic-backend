import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') })
dotenv.config({ path: path.resolve(__dirname, '../../.env') })
dotenv.config({ path: path.resolve(__dirname, '../.env') })

import userService from '../telegram/services/userService.js'
import { logger } from '../services/logger.js'

async function main() {
  try {
    const testPayload = {
      telegramId: String(Math.floor(Math.random() * 1000000000)),
      username: 'test_user_' + Math.floor(Math.random() * 10000),
      firstName: 'Test',
      lastName: 'User',
      phoneNumber: '+998901234567',
      authDate: Date.now(),
    }
    logger.info('Running saveUserTest with payload', testPayload)
    const res = await userService.createOrUpdate(testPayload)
    logger.info('saveUserTest result', res)
    console.log('Result:', res)
  } catch (err) {
    logger.error('saveUserTest error', err)
    console.error('Error:', err)
    process.exit(1)
  }
}

main()
