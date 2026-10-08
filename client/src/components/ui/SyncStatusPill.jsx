import React, { useState, useEffect } from 'react';
import { syncEngine } from '../../services/syncEngine';
import { Check, AlertTriangle, Clock } from './icons';

export default function SyncStatusPill({ className = '' }) {
  const [syncState, setSyncState] = useState(syncEngine.getState());

  useEffect(() => {
    return syncEngine.subscribe(setSyncState);
  }, []);

  const { isOnline, isSyncing, pendingCount, lastError } = syncState;

  if (isOnline && !isSyncing && pendingCount === 0 && !lastError) {
    return (
      <div
        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 select-none ${className}`}
        style={{ backdropFilter: 'blur(8px)' }}
        title="All changes synced with server"
      >
        <Check className="w-3.5 h-3.5" />
        <span>All synced</span>
      </div>
    );
  }

  if (!isOnline) {
    return (
      <div
        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border border-amber-500/30 bg-amber-500/15 text-amber-300 select-none ${className}`}
        style={{ backdropFilter: 'blur(8px)' }}
        title="Device is offline. Changes are saved locally on this device."
      >
        <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
        <span>Offline · {pendingCount > 0 ? `${pendingCount} saved on device` : 'Local mode'}</span>
      </div>
    );
  }

  if (isSyncing) {
    return (
      <div
        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border border-blue-500/30 bg-blue-500/15 text-blue-300 select-none ${className}`}
        style={{ backdropFilter: 'blur(8px)' }}
        title="Syncing pending changes with server..."
      >
        <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping" />
        <span>Syncing {pendingCount > 0 ? `${pendingCount} items...` : '...'}</span>
      </div>
    );
  }

  if (lastError) {
    return (
      <button
        onClick={() => syncEngine.flushOutbox()}
        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border border-red-500/40 bg-red-500/15 text-red-300 hover:bg-red-500/25 transition-colors cursor-pointer select-none ${className}`}
        style={{ backdropFilter: 'blur(8px)' }}
        title="Click to retry synchronization"
      >
        <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
        <span>Sync retry ({pendingCount})</span>
      </button>
    );
  }

  if (pendingCount > 0) {
    return (
      <button
        onClick={() => syncEngine.flushOutbox()}
        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border border-blue-500/30 bg-blue-500/15 text-blue-300 hover:bg-blue-500/25 transition-colors cursor-pointer select-none ${className}`}
        style={{ backdropFilter: 'blur(8px)' }}
        title="Click to flush sync outbox"
      >
        <Clock className="w-3.5 h-3.5" />
        <span>{pendingCount} pending sync</span>
      </button>
    );
  }

  return null;
}
