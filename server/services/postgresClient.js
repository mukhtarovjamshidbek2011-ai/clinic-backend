import pkg from 'pg'
import { PG_CONNECTION_STRING } from '../config/appConfig.js'

const { Pool } = pkg
let pool

export async function initPostgres() {
  if (pool) return
  if (!PG_CONNECTION_STRING) {
    throw new Error('PG_CONNECTION_STRING sozlanmagan.')
  }
  pool = new Pool({ connectionString: PG_CONNECTION_STRING })
}

export async function query(text, params) {
  if (!pool) {
    await initPostgres()
  }
  return pool.query(text, params)
}
