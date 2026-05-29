/**
 * Lightweight in-memory cache with TTL support.
 * Prevents redundant Firestore / Postgres reads for hot data.
 */

const store = new Map()

/**
 * @param {string} key
 * @param {number} [ttlMs=15000] Time-to-live in milliseconds
 */
export function get(key) {
  const entry = store.get(key)
  if (!entry) return undefined
  if (Date.now() > entry.expiresAt) {
    store.delete(key)
    return undefined
  }
  return entry.value
}

/**
 * @param {string} key
 * @param {*} value
 * @param {number} [ttlMs=15000]
 */
export function set(key, value, ttlMs = 15_000) {
  store.set(key, { value, expiresAt: Date.now() + ttlMs })
}

/**
 * Explicitly remove a key (e.g. after a write).
 * @param {string} key
 */
export function del(key) {
  store.delete(key)
}

/**
 * Delete all keys that start with a given prefix.
 * @param {string} prefix
 */
export function delByPrefix(prefix) {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key)
  }
}

/** Periodically evict expired entries to prevent unbounded memory growth. */
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of store.entries()) {
    if (now > entry.expiresAt) store.delete(key)
  }
}, 60_000).unref() // .unref() so this never prevents process exit
