import { DATABASE_CLIENT } from '../config/appConfig.js'
import { initFirebaseAdmin, getFirestore } from './firebaseAdmin.js'
import { logger } from './logger.js'

// Doctors are managed by the website admin panel and stored in the Firestore
// 'doctors' collection (see the frontend services/firestore.js). The bot reads
// that same collection so it always shows the real, current doctors instead of
// a hardcoded list.
export async function getActiveDoctors() {
  if (DATABASE_CLIENT === 'postgres') {
    // This deployment keeps doctors in Firebase; nothing to read from Postgres.
    return []
  }

  await initFirebaseAdmin()
  const db = getFirestore()
  const snapshot = await db.collection('doctors').get()
  const doctors = snapshot.docs
    .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
    .filter((d) => d.isActive !== false)

  doctors.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
  logger.info('getActiveDoctors', { count: doctors.length })
  return doctors
}
