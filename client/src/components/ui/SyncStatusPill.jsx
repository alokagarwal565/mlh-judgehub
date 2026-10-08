import React, { useState, useEffect } from 'react';
import { syncEngine } from '../../services/syncEngine';
import { Check, AlertTriangle, Clock } from './icons';

export default function SyncStatusPill({ className = '', style = {} }) {
  const [syncState, setSyncState] = useState(syncEngine.getState());

  useEffect(() => {
    return syncEngine.subscribe(setSyncState);
  }, []);

  const { isOnline, isSyncing, pendingCount, lastError } = syncState;

  const baseStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 12px',
    borderRadius: 'var(--radius-pill)',
    fontSize: 'var(--font-size-xs)',
    fontWeight: 500,
    userSelect: 'none',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    transition: 'all 0.2s ease',
    ...style
  };

  if (isOnline && !isSyncing && pendingCount === 0 && !lastError) {
    return (
      <div
        className={className}
        style={{
          ...baseStyle,
          background: 'rgba(48, 209, 88, 0.12)',
          border: '1px solid rgba(48, 209, 88, 0.28)',
          color: 'var(--accent-success)'
        }}
        title="All changes synced with server"
      >
        <Check size={13} />
        <span>All synced</span>
      </div>
    );
  }

  if (!isOnline) {
    return (
      <div
        className={className}
        style={{
          ...baseStyle,
          background: 'rgba(255, 214, 10, 0.12)',
          border: '1px solid rgba(255, 214, 10, 0.3)',
          color: 'var(--accent-warning)'
        }}
        title="Device is offline. Changes are saved locally on this device."
      >
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            backgroundColor: 'var(--accent-warning)'
          }}
        />
        <span>Offline · {pendingCount > 0 ? `${pendingCount} saved on device` : 'Local mode'}</span>
      </div>
    );
  }

  if (isSyncing) {
    return (
      <div
        className={className}
        style={{
          ...baseStyle,
          background: 'rgba(10, 132, 255, 0.12)',
          border: '1px solid rgba(10, 132, 255, 0.3)',
          color: 'var(--accent)'
        }}
        title="Syncing pending changes with server..."
      >
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            backgroundColor: 'var(--accent)'
          }}
        />
        <span>Syncing {pendingCount > 0 ? `${pendingCount} items...` : '...'}</span>
      </div>
    );
  }

  if (lastError) {
    return (
      <button
        onClick={() => syncEngine.flushOutbox()}
        className={className}
        style={{
          ...baseStyle,
          background: 'rgba(255, 69, 58, 0.12)',
          border: '1px solid rgba(255, 69, 58, 0.35)',
          color: 'var(--accent-danger)',
          cursor: 'pointer'
        }}
        title="Click to retry synchronization"
      >
        <AlertTriangle size={13} />
        <span>Sync retry ({pendingCount})</span>
      </button>
    );
  }

  if (pendingCount > 0) {
    return (
      <button
        onClick={() => syncEngine.flushOutbox()}
        className={className}
        style={{
          ...baseStyle,
          background: 'rgba(10, 132, 255, 0.12)',
          border: '1px solid rgba(10, 132, 255, 0.3)',
          color: 'var(--accent)',
          cursor: 'pointer'
        }}
        title="Click to flush sync outbox"
      >
        <Clock size={13} />
        <span>{pendingCount} pending sync</span>
      </button>
    );
  }

  return null;
}
