import { DATABASE_CLIENT } from '../config/appConfig.js'
import { initPostgres, query as pgQuery } from './postgresClient.js'

export async function ensureDatabaseSchema() {
  if (DATABASE_CLIENT !== 'postgres') {
    return
  }

  await initPostgres()

  await pgQuery(`
    CREATE TABLE IF NOT EXISTS telegram_users (
      telegram_id TEXT PRIMARY KEY,
      username TEXT,
      first_name TEXT,
      last_name TEXT,
      profile_photo TEXT,
      auth_date TIMESTAMPTZ,
      role TEXT DEFAULT 'user',
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    )
  `)

  await pgQuery(`
    CREATE TABLE IF NOT EXISTS telegram_notifications (
      id SERIAL PRIMARY KEY,
      telegram_id TEXT,
      booking_id TEXT,
      type TEXT,
      status TEXT,
      message TEXT,
      metadata JSONB,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `)

  await pgQuery(`
    CREATE TABLE IF NOT EXISTS booking_changes (
      id SERIAL PRIMARY KEY,
      booking_id TEXT,
      telegram_id TEXT,
      doctor_id TEXT,
      old_date TEXT,
      old_time TEXT,
      new_date TEXT,
      new_time TEXT,
      reason TEXT,
      changed_by TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `)
}
