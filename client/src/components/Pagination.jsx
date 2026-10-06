import React, { useMemo } from 'react';
import { ChevronLeft, ChevronRight } from './ui/icons';
import { Select } from './ui/Select';

const PAGE_SIZES = [10, 25, 50, 100];

export function usePagination(items = [], page = 1, perPage = 25) {
  return useMemo(() => {
    const totalPages = Math.max(1, Math.ceil(items.length / perPage));
    const safePage = Math.min(Math.max(1, page), totalPages);
    const start = (safePage - 1) * perPage;
    const paged = items.slice(start, start + perPage);
    return { paged, totalPages, safePage, total: items.length };
  }, [items, page, perPage]);
}

export default function Pagination({ page, totalPages, total, perPage, onPageChange, onPerPageChange }) {
  if (total === 0) return null;

  const maxButtons = 5;
  let startPage = Math.max(1, page - Math.floor(maxButtons / 2));
  let endPage = Math.min(totalPages, startPage + maxButtons - 1);
  if (endPage - startPage + 1 < maxButtons) startPage = Math.max(1, endPage - maxButtons + 1);

  const pages = [];
  for (let i = startPage; i <= endPage; i++) pages.push(i);

  const startIdx = Math.min((page - 1) * perPage + 1, total);
  const endIdx = Math.min(page * perPage, total);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 20px',
        borderTop: '1px solid var(--border-subtle)',
        gap: 16,
        flexWrap: 'wrap'
      }}
    >
      {/* Left: Info & per-page dropdown */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)' }}>
        <span className="tabular-nums">
          Showing <strong style={{ color: 'var(--text-primary)' }}>{startIdx}</strong>–
          <strong style={{ color: 'var(--text-primary)' }}>{endIdx}</strong> of{' '}
          <strong style={{ color: 'var(--text-primary)' }}>{total}</strong>
        </span>

        {onPerPageChange && (
          <Select
            value={perPage}
            size="sm"
            placement="top"
            width={106}
            options={PAGE_SIZES.map((n) => ({ value: n, label: `${n} / page` }))}
            onChange={(e) => {
              const val = Number(e.target ? e.target.value : e);
              onPerPageChange(val);
              onPageChange(1);
            }}
          />
        )}
      </div>

      {/* Right: Page navigation controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="apple-btn-icon-only apple-btn-secondary apple-btn-sm"
          aria-label="Previous page"
        >
          <ChevronLeft size={14} />
        </button>

        {startPage > 1 && (
          <>
            <PageBtn n={1} active={page === 1} onClick={onPageChange} />
            {startPage > 2 && (
              <span style={{ color: 'var(--text-tertiary)', fontSize: 'var(--font-size-xs)', padding: '0 4px' }}>
                …
              </span>
            )}
          </>
        )}

        {pages.map((n) => (
          <PageBtn key={n} n={n} active={page === n} onClick={onPageChange} />
        ))}

        {endPage < totalPages && (
          <>
            {endPage < totalPages - 1 && (
              <span style={{ color: 'var(--text-tertiary)', fontSize: 'var(--font-size-xs)', padding: '0 4px' }}>
                …
              </span>
            )}
            <PageBtn n={totalPages} active={page === totalPages} onClick={onPageChange} />
          </>
        )}

        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="apple-btn-icon-only apple-btn-secondary apple-btn-sm"
          aria-label="Next page"
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

function PageBtn({ n, active, onClick }) {
  return (
    <button
      type="button"
      onClick={() => onClick(n)}
      className="tabular-nums"
      style={{
        minWidth: 30,
        height: 30,
        borderRadius: 'var(--radius-xs)',
        fontSize: 'var(--font-size-xs)',
        fontWeight: active ? 700 : 500,
        cursor: 'pointer',
        transition: 'var(--transition-fast)',
        background: active ? 'var(--accent)' : 'transparent',
        color: active ? '#fff' : 'var(--text-secondary)',
        border: active ? '1px solid var(--accent)' : '1px solid var(--border-subtle)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: active ? '0 1px 4px var(--accent-glow)' : 'none'
      }}
    >
      {n}
    </button>
  );
}
