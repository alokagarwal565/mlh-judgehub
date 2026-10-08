import api from './api';
import {
  getPendingMutations,
  updateMutationStatus,
  removeMutation,
  setMeta,
  getMeta
} from './idb';

// ponytail: Full-jitter exponential backoff sync engine preventing thundering herd
class SyncEngine {
  constructor() {
    this.isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    this.isSyncing = false;
    this.pendingCount = 0;
    this.lastSyncedAt = null;
    this.lastError = null;
    this.subscribers = new Set();
    this.flushTimeout = null;
    this.retryAttempt = 0;

    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.handleOnline());
      window.addEventListener('offline', () => this.handleOffline());

      // Periodic health check and auto-sync daemon (every 20s)
      setInterval(() => {
        if (this.isOnline && !this.isSyncing) {
          this.checkAndFlush();
        }
      }, 20000);

      this.init();
    }
  }

  async init() {
    try {
      this.lastSyncedAt = await getMeta('lastSyncedAt');
      await this.updatePendingCount();
      if (this.isOnline && this.pendingCount > 0) {
        this.scheduleFlush(1000);
      }
    } catch {
      // Ignore initial IDB warmup errors
    }
  }

  subscribe(callback) {
    this.subscribers.add(callback);
    callback(this.getState());
    return () => this.subscribers.delete(callback);
  }

  notify() {
    const state = this.getState();
    this.subscribers.forEach((cb) => {
      try {
        cb(state);
      } catch (err) {
        console.error('[SyncEngine] Subscriber notification error', err);
      }
    });
  }

  getState() {
    return {
      isOnline: this.isOnline,
      isSyncing: this.isSyncing,
      pendingCount: this.pendingCount,
      lastSyncedAt: this.lastSyncedAt,
      lastError: this.lastError
    };
  }

  async updatePendingCount() {
    try {
      const pending = await getPendingMutations();
      this.pendingCount = pending.length;
      this.notify();
    } catch {
      // IDB unavailable
    }
  }

  handleOnline() {
    this.isOnline = true;
    this.lastError = null;
    this.notify();
    // Thundering herd protection: add random jitter between 500ms and 3500ms upon reconnect
    const jitter = 500 + Math.floor(Math.random() * 3000);
    this.scheduleFlush(jitter);
  }

  handleOffline() {
    this.isOnline = false;
    if (this.flushTimeout) clearTimeout(this.flushTimeout);
    this.notify();
  }

  scheduleFlush(delayMs = 0) {
    if (this.flushTimeout) clearTimeout(this.flushTimeout);
    this.flushTimeout = setTimeout(() => {
      this.flushOutbox();
    }, delayMs);
  }

  async checkAndFlush() {
    await this.updatePendingCount();
    if (this.pendingCount > 0) {
      this.flushOutbox();
    }
  }

  // ponytail: Mutation compaction reduces wire payload by merging duplicate offline edits
  compactMutations(mutations) {
    const map = new Map();
    const ordered = [];

    for (const m of mutations) {
      // Deduplicate continuous updates to same entity
      const key = `${m.setId}_${m.projectId || 'none'}_${m.operation}`;
      if (['SAVE_SCORE', 'SAVE_FEEDBACK', 'SAVE_NOMINATIONS', 'SAVE_RANKS'].includes(m.operation)) {
        if (map.has(key)) {
          // Replace previous mutation with newer one
          const oldIndex = map.get(key);
          ordered[oldIndex] = m;
        } else {
          map.set(key, ordered.length);
          ordered.push(m);
        }
      } else {
        // Preserves unique actions like COMPLETE_SET
        ordered.push(m);
      }
    }
    return ordered;
  }

  async flushOutbox() {
    if (this.isSyncing || !this.isOnline) return;

    const pending = await getPendingMutations();
    if (pending.length === 0) {
      this.pendingCount = 0;
      this.retryAttempt = 0;
      this.notify();
      return;
    }

    this.isSyncing = true;
    this.notify();

    try {
      // Group mutations by eventId
      const byEvent = new Map();
      for (const m of pending) {
        if (!byEvent.has(m.eventId)) byEvent.set(m.eventId, []);
        byEvent.get(m.eventId).push(m);
      }

      for (const [eventId, mutations] of byEvent.entries()) {
        const compacted = this.compactMutations(mutations);

        // Mark mutations as SYNCING in IDB
        for (const m of compacted) {
          await updateMutationStatus(m.id, 'SYNCING');
        }

        // Call batch sync endpoint
        const res = await api.post(`/events/${eventId}/sync`, {
          clientBatchId: `batch_${Date.now()}`,
          mutations: compacted
        });

        const results = res.data?.results || [];
        for (const r of results) {
          if (r.status === 'SYNCED') {
            await removeMutation(r.id);
          } else {
            await updateMutationStatus(r.id, r.status, r.error || 'Server rejected');
          }
        }
      }

      this.lastSyncedAt = Date.now();
      await setMeta('lastSyncedAt', this.lastSyncedAt);
      this.lastError = null;
      this.retryAttempt = 0;
    } catch (err) {
      console.warn('[SyncEngine] Batch sync attempt failed', err);
      this.lastError = err.message || 'Sync failed';
      this.retryAttempt++;

      // Full Jitter Exponential Backoff: delay = random(0, min(30000, 1000 * 2^attempt))
      const maxBackoff = Math.min(30000, 1000 * Math.pow(2, this.retryAttempt));
      const jitterDelay = Math.floor(Math.random() * maxBackoff);
      this.scheduleFlush(jitterDelay);
    } finally {
      this.isSyncing = false;
      await this.updatePendingCount();
    }
  }
}

export const syncEngine = new SyncEngine();
