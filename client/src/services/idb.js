// ponytail: Native zero-dependency IndexedDB wrapper for offline judging resilience
const DB_NAME = 'mlh_judgehub_offline_v1';
const DB_VERSION = 1;

let dbPromise = null;

export function getDB() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB is not supported in this environment'));
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // 1. Cached Sets store
      if (!db.objectStoreNames.contains('cached_sets')) {
        const setStore = db.createObjectStore('cached_sets', { keyPath: 'id' });
        setStore.createIndex('eventId', 'eventId', { unique: false });
      }

      // 2. Draft Scores & Feedback store
      if (!db.objectStoreNames.contains('draft_scores')) {
        const draftStore = db.createObjectStore('draft_scores', { keyPath: 'id' });
        draftStore.createIndex('setId', 'setId', { unique: false });
        draftStore.createIndex('projectId', 'projectId', { unique: false });
      }

      // 3. Outbox Mutations store
      if (!db.objectStoreNames.contains('outbox_mutations')) {
        const outboxStore = db.createObjectStore('outbox_mutations', { keyPath: 'id' });
        outboxStore.createIndex('status', 'status', { unique: false });
        outboxStore.createIndex('createdAt', 'createdAt', { unique: false });
        outboxStore.createIndex('setId', 'setId', { unique: false });
      }

      // 4. Sync & Session Metadata store
      if (!db.objectStoreNames.contains('sync_meta')) {
        db.createObjectStore('sync_meta', { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

// ── SET CACHING ─────────────────────────────────────────────────────────────
export async function cacheSet(setData) {
  if (!setData?.id) return;
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('cached_sets', 'readwrite');
    tx.objectStore('cached_sets').put({
      ...setData,
      cachedAt: Date.now()
    });
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

export async function getCachedSet(setId) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('cached_sets', 'readonly');
    const req = tx.objectStore('cached_sets').get(setId);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function getAllCachedSets(eventId) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('cached_sets', 'readonly');
    const store = tx.objectStore('cached_sets');
    const req = store.getAll();
    req.onsuccess = () => {
      const all = req.result || [];
      if (!eventId) return resolve(all);
      resolve(all.filter(s => s.eventId === eventId));
    };
    req.onerror = () => reject(req.error);
  });
}

// ── DRAFT SCORES ────────────────────────────────────────────────────────────
export async function saveDraftScore(setId, projectId, data) {
  const db = await getDB();
  const id = `${setId}_${projectId}`;
  return new Promise((resolve, reject) => {
    const tx = db.transaction('draft_scores', 'readwrite');
    tx.objectStore('draft_scores').put({
      id,
      setId,
      projectId,
      ...data,
      updatedAt: Date.now()
    });
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

export async function getDraftScores(setId) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('draft_scores', 'readonly');
    const idx = tx.objectStore('draft_scores').index('setId');
    const req = idx.getAll(setId);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

// ── OUTBOX MUTATIONS ────────────────────────────────────────────────────────
export async function enqueueMutation({ eventId, setId, projectId, operation, payload }) {
  const db = await getDB();
  const mutation = {
    id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `mut_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    idempotencyKey: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `idemp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    eventId,
    setId,
    projectId: projectId || null,
    operation,
    payload,
    createdAt: Date.now(),
    attemptCount: 0,
    status: 'PENDING',
    lastError: null
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction('outbox_mutations', 'readwrite');
    tx.objectStore('outbox_mutations').put(mutation);
    tx.oncomplete = () => resolve(mutation);
    tx.onerror = () => reject(tx.error);
  });
}

export async function getPendingMutations() {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('outbox_mutations', 'readonly');
    const req = tx.objectStore('outbox_mutations').getAll();
    req.onsuccess = () => {
      const all = req.result || [];
      // Filter pending or retriable failed mutations, sorted by creation timestamp
      const pending = all
        .filter(m => m.status === 'PENDING' || m.status === 'FAILED')
        .sort((a, b) => a.createdAt - b.createdAt);
      resolve(pending);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function updateMutationStatus(id, status, error = null) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('outbox_mutations', 'readwrite');
    const store = tx.objectStore('outbox_mutations');
    const req = store.get(id);
    req.onsuccess = () => {
      const item = req.result;
      if (!item) return resolve(false);
      item.status = status;
      if (status === 'SYNCING') item.attemptCount = (item.attemptCount || 0) + 1;
      if (error) item.lastError = error;
      store.put(item);
    };
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

export async function removeMutation(id) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('outbox_mutations', 'readwrite');
    tx.objectStore('outbox_mutations').delete(id);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

// ── METADATA & CLEANUP ──────────────────────────────────────────────────────
export async function setMeta(key, value) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('sync_meta', 'readwrite');
    tx.objectStore('sync_meta').put({ key, value, updatedAt: Date.now() });
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

export async function getMeta(key) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('sync_meta', 'readonly');
    const req = tx.objectStore('sync_meta').get(key);
    req.onsuccess = () => resolve(req.result ? req.result.value : null);
    req.onerror = () => reject(req.error);
  });
}

export async function clearJudgeCache() {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['cached_sets', 'draft_scores', 'outbox_mutations'], 'readwrite');
    tx.objectStore('cached_sets').clear();
    tx.objectStore('draft_scores').clear();
    tx.objectStore('outbox_mutations').clear();
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}
