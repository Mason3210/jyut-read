// IndexedDB wrapper for persistent storage
const DB_NAME = 'jyutread'
const DB_VERSION = 2

export function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = (e) => {
      const db = e.target.result
      if (!db.objectStoreNames.contains('cards')) {
        const store = db.createObjectStore('cards', { keyPath: 'char' })
        store.createIndex('nextReview', 'nextReview', { unique: false })
        store.createIndex('level', 'level', { unique: false })
        store.createIndex('starred', 'starred', { unique: false })
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' })
      }
    }
    req.onsuccess = (e) => resolve(e.target.result)
    req.onerror = (e) => reject(e.target.error)
  })
}

export async function getAllCards() {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('cards', 'readonly')
    const store = tx.objectStore('cards')
    const req = store.getAll()
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function getCard(char) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('cards', 'readonly')
    const store = tx.objectStore('cards')
    const req = store.get(char)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function saveCard(card) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('cards', 'readwrite')
    const store = tx.objectStore('cards')
    const req = store.put(card)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

export async function getSetting(key) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('settings', 'readonly')
    const store = tx.objectStore('settings')
    const req = store.get(key)
    req.onsuccess = () => resolve(req.result?.value)
    req.onerror = () => reject(req.error)
  })
}

export async function saveSetting(key, value) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('settings', 'readwrite')
    const store = tx.objectStore('settings')
    const req = store.put({ key, value })
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

export async function importCards(characters) {
  // Initialize cards for new characters (first time setup)
  const existing = await getAllCards()
  const existingChars = new Set(existing.map(c => c.char))
  
  for (const ch of characters) {
    if (!existingChars.has(ch.char)) {
      await saveCard({
        char: ch.char,
        jyutping: ch.jyutping,
        rank: ch.rank,
        level: Math.ceil(ch.rank / 1000), // level 1-5 based on rank
        ease: 2.5,
        interval: 0,
        repetitions: 0,
        nextReview: null,
        lastReview: null,
        lastQuality: null,
        starred: false,
        history: []
      })
    }
  }
}

export async function getStarredCards() {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('cards', 'readonly')
    const store = tx.objectStore('cards')
    const index = store.index('starred')
    const req = index.getAll(true) // true = get only where starred=true
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}
