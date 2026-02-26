import { useMemo } from 'react';

const PAGE_SIZES = [10, 25, 50, 100];

export function usePagination(items, page, perPage) {
  return useMemo(() => {
    const totalPages = Math.max(1, Math.ceil(items.length / perPage));
    const safePage = Math.min(page, totalPages);
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

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '12px 0', gap: 12, flexWrap: 'wrap'
    }}>
      {/* Left: info + per-page */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, color: 'var(--text-muted)' }}>
        <span>
          Showing <strong style={{ color: 'var(--text-primary)' }}>{Math.min((page - 1) * perPage + 1, total)}</strong>
          –<strong style={{ color: 'var(--text-primary)' }}>{Math.min(page * perPage, total)}</strong>
          {' '}of <strong style={{ color: 'var(--text-primary)' }}>{total}</strong>
        </span>
        <select
          value={perPage}
          onChange={e => { onPerPageChange(Number(e.target.value)); onPageChange(1); }}
          style={{
            background: 'var(--bg-input)', color: 'var(--text-primary)',
            border: '1px solid var(--border-light)', borderRadius: 6,
            padding: '4px 8px', fontSize: 12, cursor: 'pointer'
          }}
        >
          {PAGE_SIZES.map(n => <option key={n} value={n}>{n} / page</option>)}
        </select>
      </div>

      {/* Right: page buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          style={{
            padding: '5px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600,
            cursor: page <= 1 ? 'not-allowed' : 'pointer',
            background: 'transparent', color: page <= 1 ? 'var(--text-muted)' : 'var(--text-secondary)',
            border: '1px solid var(--border-light)', opacity: page <= 1 ? 0.4 : 1,
            transition: 'all 0.15s'
          }}
        >←</button>

        {startPage > 1 && (
          <>
            <PageBtn n={1} active={page === 1} onClick={onPageChange} />
            {startPage > 2 && <span style={{ color: 'var(--text-muted)', fontSize: 12, padding: '0 4px' }}>…</span>}
          </>
        )}

        {pages.map(n => <PageBtn key={n} n={n} active={page === n} onClick={onPageChange} />)}

        {endPage < totalPages && (
          <>
            {endPage < totalPages - 1 && <span style={{ color: 'var(--text-muted)', fontSize: 12, padding: '0 4px' }}>…</span>}
            <PageBtn n={totalPages} active={page === totalPages} onClick={onPageChange} />
          </>
        )}

        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          style={{
            padding: '5px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600,
            cursor: page >= totalPages ? 'not-allowed' : 'pointer',
            background: 'transparent', color: page >= totalPages ? 'var(--text-muted)' : 'var(--text-secondary)',
            border: '1px solid var(--border-light)', opacity: page >= totalPages ? 0.4 : 1,
            transition: 'all 0.15s'
          }}
        >→</button>
      </div>
    </div>
  );
}

function PageBtn({ n, active, onClick }) {
  return (
    <button
      onClick={() => onClick(n)}
      style={{
        minWidth: 32, height: 32, borderRadius: 6, fontSize: 12, fontWeight: 600,
        cursor: 'pointer', transition: 'all 0.15s',
        background: active ? 'var(--accent)' : 'transparent',
        color: active ? '#fff' : 'var(--text-secondary)',
        border: active ? '1px solid var(--accent)' : '1px solid var(--border-light)'
      }}
    >{n}</button>
  );
}
