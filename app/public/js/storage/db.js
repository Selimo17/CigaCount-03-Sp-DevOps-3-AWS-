/**
 * Local persistence with IndexedDB.
 *
 * Personal consumption data never leaves the device: the server is stateless
 * and only serves the application. Each concept has its own object store
 * ("table"), including a dedicated price history.
 */

const DB_NAME = 'cigacount';
const DB_VERSION = 1;

export const STORES = {
  meta: 'meta',
  prices: 'prices',
  baselines: 'baselines',
  cigarettes: 'cigarettes',
  goals: 'goals',
};

let dbPromise;

function promisify(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function openDatabase() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        db.createObjectStore(STORES.meta, { keyPath: 'key' });
        db.createObjectStore(STORES.prices, { keyPath: 'id' }).createIndex('effectiveAt', 'effectiveAt');
        db.createObjectStore(STORES.baselines, { keyPath: 'id' }).createIndex('effectiveDate', 'effectiveDate');
        db.createObjectStore(STORES.cigarettes, { keyPath: 'id' }).createIndex('smokedAt', 'smokedAt');
        db.createObjectStore(STORES.goals, { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  return dbPromise;
}

async function withStore(storeName, mode, operation) {
  const db = await openDatabase();
  const transaction = db.transaction(storeName, mode);
  const result = await promisify(operation(transaction.objectStore(storeName)));
  await new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
  return result;
}

/** Random identifier that also works outside secure contexts (plain HTTP). */
export function createId() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function getAll(storeName) {
  return withStore(storeName, 'readonly', (store) => store.getAll());
}

export function put(storeName, record) {
  return withStore(storeName, 'readwrite', (store) => store.put(record));
}

export function remove(storeName, id) {
  return withStore(storeName, 'readwrite', (store) => store.delete(id));
}

/** Inserts many records in a single transaction (retroactive entries, import). */
export async function putMany(storeName, records) {
  const db = await openDatabase();
  const transaction = db.transaction(storeName, 'readwrite');
  const store = transaction.objectStore(storeName);
  for (const record of records) {
    store.put(record);
  }
  await new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
}

/** Loads every table in memory: volumes stay small (a few thousand rows a year). */
export async function loadAll() {
  const [meta, prices, baselines, cigarettes, goals] = await Promise.all([
    getAll(STORES.meta),
    getAll(STORES.prices),
    getAll(STORES.baselines),
    getAll(STORES.cigarettes),
    getAll(STORES.goals),
  ]);
  const profile = meta.find((entry) => entry.key === 'profile') ?? null;
  return { profile, prices, baselines, cigarettes, goals };
}

export async function clearAll() {
  const db = await openDatabase();
  const names = Object.values(STORES);
  const transaction = db.transaction(names, 'readwrite');
  for (const name of names) {
    transaction.objectStore(name).clear();
  }
  await new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
}
