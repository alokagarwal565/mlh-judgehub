import React from 'react';

export default function Skeleton({
  width,
  height,
  borderRadius,
  className = '',
  style = {},
  variant = 'rect', // rect | text | circle
}) {
  return (
    <div
      className={`apple-skeleton apple-skeleton-${variant} ${className}`}
      style={{
        width,
        height,
        borderRadius,
        ...style,
      }}
      aria-hidden="true"
    />
  );
}

export function SkeletonCard({ rows = 3, className = '' }) {
  return (
    <div className={`apple-card ${className}`}>
      <div className="apple-card-header has-border" style={{ padding: '16px 20px' }}>
        <Skeleton width="40%" height={20} borderRadius={6} />
        <Skeleton width={60} height={20} borderRadius={10} />
      </div>
      <div className="apple-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Skeleton width="100%" height={16} />
        <Skeleton width="80%" height={16} />
        {rows > 2 && <Skeleton width="60%" height={16} />}
      </div>
    </div>
  );
}

export function SkeletonTable({ rows = 5, cols = 4, className = '' }) {
  return (
    <div className={`apple-table-skeleton ${className}`}>
      <div style={{ display: 'flex', gap: 16, padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} width={`${100 / cols}%`} height={16} borderRadius={4} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} style={{ display: 'flex', gap: 16, padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} width={`${100 / cols}%`} height={18} borderRadius={4} />
          ))}
        </div>
      ))}
    </div>
  );
}
