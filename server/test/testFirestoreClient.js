import { initializeApp } from 'firebase/app'
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') })

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
}

console.log('Firebase Config loaded:', firebaseConfig)

const app = initializeApp(firebaseConfig)
const db = getFirestore(app)

async function test() {
  try {
    const testDocRef = doc(db, 'users', 'test_telegram_id_123')
    console.log('Attempting to set document...')
    await setDoc(testDocRef, {
      telegramId: 'test_telegram_id_123',
      username: 'test_user_web_sdk',
      firstName: 'Test',
      lastName: 'User',
      phoneNumber: '+998901234567',
      createdAt: new Date(),
    })
    console.log('Successfully wrote document!')

    console.log('Attempting to get document...')
    const snap = await getDoc(testDocRef)
    if (snap.exists()) {
      console.log('Successfully read document data:', snap.data())
    } else {
      console.log('Document does not exist.')
    }
  } catch (err) {
    console.error('Firestore Web SDK Test Error:', err)
  }
  process.exit(0)
}

test()
