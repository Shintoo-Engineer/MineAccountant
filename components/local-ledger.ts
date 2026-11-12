export type LocalProfile = {
  id: string
  username: string
  name: string
  currency: string
}

type StoredProfile = LocalProfile & {
  passwordSalt: string
  passwordVerifier: string
  createdAt: number
}

type EncryptedRecord = {
  id: string
  profileId: string
  iv: string
  ciphertext: string
}

export type LedgerTransaction = {
  id: string
  description: string
  category: string
  date: string
  kind: 'income' | 'expense'
  amount: number
}

export type LedgerBudget = {
  id: string
  category: string
  limit: number
}

const databaseName = 'mine-accountant-local'
const databaseVersion = 1
const encoder = new TextEncoder()
const decoder = new TextDecoder()

let databasePromise: Promise<IDBDatabase> | undefined

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('Local browser storage is not available.'))
  }

  if (!databasePromise) {
    databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(databaseName, databaseVersion)
      request.onupgradeneeded = () => {
        const database = request.result
        const profiles = database.createObjectStore('profiles', { keyPath: 'id' })
        profiles.createIndex('byUsername', 'username', { unique: true })
        const transactions = database.createObjectStore('transactions', { keyPath: 'id' })
        transactions.createIndex('byProfile', 'profileId')
        const budgets = database.createObjectStore('budgets', { keyPath: 'id' })
        budgets.createIndex('byProfile', 'profileId')
      }
      request.onsuccess = () => {
        const database = request.result
        database.onversionchange = () => database.close()
        resolve(database)
      }
      request.onerror = () => reject(request.error ?? new Error('Could not open local storage.'))
      request.onblocked = () => reject(new Error('Close other Mine Accountant tabs to finish updating local storage.'))
    }).catch(error => {
      databasePromise = undefined
      throw error
    })
  }

  return databasePromise!
}

function runTransaction<T>(
  stores: string[],
  mode: IDBTransactionMode,
  operation: (transaction: IDBTransaction, resolve: (value: T) => void, reject: (error: Error) => void) => void,
) {
  return openDatabase().then(database => new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(stores, mode)
    let result: T
    let hasResult = false
    let operationError: Error | undefined

    const finish = (value: T) => {
      result = value
      hasResult = true
    }
    const fail = (error: Error) => {
      operationError = error
      try {
        transaction.abort()
      } catch {
        reject(error)
      }
    }

    transaction.oncomplete = () => {
      if (hasResult) resolve(result)
      else reject(new Error('The local database transaction did not complete.'))
    }
    transaction.onerror = () => reject(operationError ?? transaction.error ?? new Error('The local database request failed.'))
    transaction.onabort = () => reject(operationError ?? transaction.error ?? new Error('The local database request was cancelled.'))

    try {
      operation(transaction, finish, fail)
    } catch (error) {
      fail(error instanceof Error ? error : new Error('The local database request failed.'))
    }
  }))
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = ''
  bytes.forEach(byte => { binary += String.fromCharCode(byte) })
  return btoa(binary)
}

function base64ToBytes(value: string) {
  return Uint8Array.from(atob(value), character => character.charCodeAt(0))
}

async function derivePasswordMaterial(password: string, salt: Uint8Array) {
  const passwordKey = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 310_000 },
    passwordKey,
    512,
  ))
  const verifier = bytesToBase64(bits.slice(0, 32))
  const encryptionKey = await crypto.subtle.importKey('raw', bits.slice(32), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
  return { verifier, encryptionKey }
}

function equalSecret(left: string, right: string) {
  const first = encoder.encode(left)
  const second = encoder.encode(right)
  if (first.length !== second.length) return false
  let difference = 0
  for (let index = 0; index < first.length; index += 1) difference |= first[index] ^ second[index]
  return difference === 0
}

async function sealRecord(profileId: string, key: CryptoKey, value: { id: string; [key: string]: unknown }): Promise<EncryptedRecord> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(JSON.stringify(value)))
  return { id: value.id, profileId, iv: bytesToBase64(iv), ciphertext: bytesToBase64(new Uint8Array(ciphertext)) }
}

async function openRecord<T>(record: EncryptedRecord, key: CryptoKey): Promise<T> {
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64ToBytes(record.iv) }, key, base64ToBytes(record.ciphertext))
  return JSON.parse(decoder.decode(plaintext)) as T
}

export async function listProfiles(): Promise<LocalProfile[]> {
  const rows = await runTransaction<StoredProfile[]>(['profiles'], 'readonly', (transaction, resolve) => {
    const request = transaction.objectStore('profiles').getAll()
    request.onsuccess = () => resolve(request.result)
  })
  return rows.map(({ id, username, name, currency }) => ({ id, username, name, currency }))
}

export async function createProfile(input: {
  username: string
  name: string
  currency: string
  password: string
}) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const { verifier, encryptionKey } = await derivePasswordMaterial(input.password, salt)
  const profile: StoredProfile = {
    id: crypto.randomUUID(),
    username: input.username.trim().toLowerCase(),
    name: input.name.trim(),
    currency: input.currency,
    passwordSalt: bytesToBase64(salt),
    passwordVerifier: verifier,
    createdAt: Date.now(),
  }

  await runTransaction<void>(['profiles'], 'readwrite', (transaction, resolve, reject) => {
    const store = transaction.objectStore('profiles')
    const existing = store.index('byUsername').get(profile.username)
    existing.onsuccess = () => {
      if (existing.result) {
        reject(new Error('That username is already in use on this device.'))
        return
      }
      store.add(profile)
      resolve(undefined)
    }
  })

  return { profile: { id: profile.id, username: profile.username, name: profile.name, currency: profile.currency }, key: encryptionKey }
}

export async function unlockProfile(profileId: string, password: string) {
  const profile = await runTransaction<StoredProfile | undefined>(['profiles'], 'readonly', (transaction, resolve) => {
    const request = transaction.objectStore('profiles').get(profileId)
    request.onsuccess = () => resolve(request.result)
  })
  if (!profile) throw new Error('This profile is no longer on this device.')

  const { verifier, encryptionKey } = await derivePasswordMaterial(password, base64ToBytes(profile.passwordSalt))
  if (!equalSecret(verifier, profile.passwordVerifier)) return null
  return { profile: { id: profile.id, username: profile.username, name: profile.name, currency: profile.currency }, key: encryptionKey }
}

export async function updateProfile(profile: LocalProfile) {
  await runTransaction<void>(['profiles'], 'readwrite', (transaction, resolve, reject) => {
    const store = transaction.objectStore('profiles')
    const request = store.get(profile.id)
    request.onsuccess = () => {
      if (!request.result) {
        reject(new Error('This profile is no longer on this device.'))
        return
      }
      store.put({ ...request.result, name: profile.name.trim(), currency: profile.currency })
      resolve(undefined)
    }
  })
}

async function listEncrypted<T>(storeName: 'transactions' | 'budgets', profileId: string, key: CryptoKey): Promise<T[]> {
  const rows = await runTransaction<EncryptedRecord[]>([storeName], 'readonly', (transaction, resolve) => {
    const request = transaction.objectStore(storeName).index('byProfile').getAll(profileId)
    request.onsuccess = () => resolve(request.result)
  })
  return Promise.all(rows.map(row => openRecord<T>(row, key)))
}

export function listTransactions(profileId: string, key: CryptoKey) {
  return listEncrypted<LedgerTransaction>('transactions', profileId, key)
}

export function listBudgets(profileId: string, key: CryptoKey) {
  return listEncrypted<LedgerBudget>('budgets', profileId, key)
}

export async function saveTransaction(profileId: string, key: CryptoKey, input: Omit<LedgerTransaction, 'id'>) {
  const transaction: LedgerTransaction = { ...input, id: crypto.randomUUID() }
  const encrypted = await sealRecord(profileId, key, transaction)
  await runTransaction<void>(['transactions'], 'readwrite', (databaseTransaction, resolve) => {
    databaseTransaction.objectStore('transactions').add(encrypted)
    resolve(undefined)
  })
  return transaction
}

export async function deleteTransaction(profileId: string, id: string) {
  await runTransaction<void>(['transactions'], 'readwrite', (transaction, resolve) => {
    const store = transaction.objectStore('transactions')
    const request = store.get(id)
    request.onsuccess = () => {
      if (request.result?.profileId === profileId) store.delete(id)
      resolve(undefined)
    }
  })
}

export async function saveBudget(profileId: string, key: CryptoKey, input: Omit<LedgerBudget, 'id'>) {
  const budget: LedgerBudget = { ...input, id: crypto.randomUUID() }
  const encrypted = await sealRecord(profileId, key, budget)
  await runTransaction<void>(['budgets'], 'readwrite', (transaction, resolve) => {
    transaction.objectStore('budgets').add(encrypted)
    resolve(undefined)
  })
  return budget
}

export async function deleteBudget(profileId: string, id: string) {
  await runTransaction<void>(['budgets'], 'readwrite', (transaction, resolve) => {
    const store = transaction.objectStore('budgets')
    const request = store.get(id)
    request.onsuccess = () => {
      if (request.result?.profileId === profileId) store.delete(id)
      resolve(undefined)
    }
  })
}

export async function deleteProfile(profileId: string) {
  await runTransaction<void>(['profiles', 'transactions', 'budgets'], 'readwrite', (transaction, resolve) => {
    transaction.objectStore('profiles').delete(profileId)
    for (const storeName of ['transactions', 'budgets']) {
      const store = transaction.objectStore(storeName)
      const cursorRequest = store.index('byProfile').openCursor(profileId)
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result
        if (cursor) {
          cursor.delete()
          cursor.continue()
        }
      }
    }
    resolve(undefined)
  })
}

export async function makeProfileBackup(profileId: string) {
  const [profile, transactions, budgets] = await Promise.all([
    runTransaction<StoredProfile | undefined>(['profiles'], 'readonly', (transaction, resolve) => {
      const request = transaction.objectStore('profiles').get(profileId)
      request.onsuccess = () => resolve(request.result)
    }),
    runTransaction<EncryptedRecord[]>(['transactions'], 'readonly', (transaction, resolve) => {
      const request = transaction.objectStore('transactions').index('byProfile').getAll(profileId)
      request.onsuccess = () => resolve(request.result)
    }),
    runTransaction<EncryptedRecord[]>(['budgets'], 'readonly', (transaction, resolve) => {
      const request = transaction.objectStore('budgets').index('byProfile').getAll(profileId)
      request.onsuccess = () => resolve(request.result)
    }),
  ])
  if (!profile) throw new Error('This profile is no longer on this device.')
  return JSON.stringify({ format: 'mine-accountant-encrypted-backup', version: 1, profile, transactions, budgets }, null, 2)
}

export async function restoreProfileBackup(contents: string) {
  const backup = JSON.parse(contents) as {
    format?: string
    version?: number
    profile?: StoredProfile
    transactions?: EncryptedRecord[]
    budgets?: EncryptedRecord[]
  }
  if (backup.format !== 'mine-accountant-encrypted-backup' || backup.version !== 1 || !backup.profile || !Array.isArray(backup.transactions) || !Array.isArray(backup.budgets)) {
    throw new Error('This file is not a supported Mine Accountant backup.')
  }

  const profileId = crypto.randomUUID()
  const profile = { ...backup.profile, id: profileId, username: backup.profile.username.trim().toLowerCase() }
  await runTransaction<void>(['profiles', 'transactions', 'budgets'], 'readwrite', (transaction, resolve, reject) => {
    const profiles = transaction.objectStore('profiles')
    const existing = profiles.index('byUsername').get(profile.username)
    existing.onsuccess = () => {
      if (existing.result) {
        reject(new Error('This backup username already exists on this device. Switch profiles or remove the existing profile first.'))
        return
      }
      profiles.add(profile)
      for (const record of backup.transactions ?? []) transaction.objectStore('transactions').add({ ...record, profileId })
      for (const record of backup.budgets ?? []) transaction.objectStore('budgets').add({ ...record, profileId })
      resolve(undefined)
    }
  })
  return { id: profile.id, username: profile.username, name: profile.name, currency: profile.currency }
}
