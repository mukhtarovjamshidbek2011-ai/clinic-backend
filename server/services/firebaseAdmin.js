import { initializeApp } from 'firebase/app'
import {
  getFirestore as getWebFirestore,
  doc,
  collection,
  getDoc,
  setDoc,
  getDocs,
  query as webQuery,
  where,
  orderBy,
  limit
} from 'firebase/firestore'
import { logger } from './logger.js'

let firebaseApp = null
let webDb = null

export async function initFirebaseAdmin() {
  if (firebaseApp) return

  const firebaseConfig = {
    apiKey: process.env.VITE_FIREBASE_API_KEY || 'AIzaSyCfMZ2vXSf-VE2KbJJHavxL7diFRp0ugYQ',
    authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || 'zamzam-clinic.firebaseapp.com',
    projectId: process.env.VITE_FIREBASE_PROJECT_ID || 'zamzam-clinic',
    messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '722285722144',
    appId: process.env.VITE_FIREBASE_APP_ID || '1:722285722144:web:bb16027589d34e30121a45',
  }

  logger.info('Initializing Firebase Client SDK Adapter...', { projectId: firebaseConfig.projectId })
  try {
    firebaseApp = initializeApp(firebaseConfig)
    webDb = getWebFirestore(firebaseApp)
    logger.info('Firebase Client SDK initialized successfully.')
  } catch (err) {
    logger.error('Failed to initialize Firebase Client SDK', err)
    throw err
  }
}

class DocumentReferenceShim {
  constructor(collectionName, docId) {
    this.collectionName = collectionName
    this.docId = docId
  }

  get id() {
    return this.docId
  }

  async get() {
    if (!this.docId) throw new Error("Cannot get document without an ID")
    const d = doc(webDb, this.collectionName, this.docId)
    const snap = await getDoc(d)
    return {
      exists: snap.exists(),
      id: snap.id,
      data: () => snap.data(),
      ref: this
    }
  }

  async set(data, options = {}) {
    let d
    if (this.docId) {
      d = doc(webDb, this.collectionName, this.docId)
    } else {
      d = doc(collection(webDb, this.collectionName))
      this.docId = d.id
    }
    await setDoc(d, data, options)
    return { id: this.docId }
  }
}

class QueryShim {
  constructor(collectionName, constraints = []) {
    this.collectionName = collectionName
    this.constraints = constraints
  }

  doc(id) {
    return new DocumentReferenceShim(this.collectionName, id)
  }

  where(field, op, value) {
    const sanitizedVal = value === undefined ? null : value
    return new QueryShim(this.collectionName, [...this.constraints, where(field, op, sanitizedVal)])
  }

  orderBy(field, direction = 'asc') {
    return new QueryShim(this.collectionName, [...this.constraints, orderBy(field, direction)])
  }

  limit(num) {
    return new QueryShim(this.collectionName, [...this.constraints, limit(num)])
  }

  async get() {
    const coll = collection(webDb, this.collectionName)
    const q = webQuery(coll, ...this.constraints)
    const snap = await getDocs(q)
    return {
      docs: snap.docs.map(d => ({
        id: d.id,
        data: () => d.data(),
        ref: new DocumentReferenceShim(this.collectionName, d.id)
      }))
    }
  }
}

class FirestoreShim {
  collection(name) {
    return new QueryShim(name)
  }
}

export function getFirestore() {
  if (!firebaseApp) {
    throw new Error('Firebase Client SDK has not been initialized yet.')
  }
  return new FirestoreShim()
}

export async function getDocument(db, collectionName, id) {
  const docRef = db.collection(collectionName).doc(String(id))
  const docSnap = await docRef.get()
  return docSnap.exists ? { id: docSnap.id, ...docSnap.data() } : null
}

export async function setDocument(db, collectionName, id, data) {
  const docRef = db.collection(collectionName).doc(String(id))
  await docRef.set(data, { merge: true })
  return { id: docRef.id, ...data }
}
