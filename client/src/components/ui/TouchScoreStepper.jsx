import React from 'react';

/**
 * Apple HIG Touch-optimized numeric scoring control (0 - 10)
 * Uses native Apple design tokens and smooth micro-steppers + slider
 */
export default function TouchScoreStepper({
  value = 0,
  onChange,
  disabled = false,
  label,
  desc,
  min = 0,
  max = 10,
}) {
  const currentVal = typeof value === 'number' ? value : 0;
  const pct = Math.min(100, Math.max(0, ((currentVal - min) / (max - min)) * 100));
  const accentColor =
    currentVal >= 8
      ? 'var(--accent-success)'
      : currentVal >= 5
      ? 'var(--accent)'
      : 'var(--accent-warning)';

  const decrement = () => {
    if (disabled || currentVal <= min) return;
    onChange(currentVal - 1);
  };

  const increment = () => {
    if (disabled || currentVal >= max) return;
    onChange(currentVal + 1);
  };

  // Read-only inspection presentation
  if (disabled) {
    return (
      <div
        style={{
          padding: '12px 14px',
          background: 'var(--bg-surface-elevated)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--text-primary)' }}>
              {label}
            </div>
            {desc && (
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)', marginTop: 2, lineHeight: 1.4 }}>
                {desc}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, flexShrink: 0 }}>
            <span
              className="tabular-nums"
              style={{
                fontSize: 'var(--font-size-lg)',
                fontWeight: 700,
                color: accentColor,
              }}
            >
              {currentVal}
            </span>
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)' }}>/ {max}</span>
          </div>
        </div>

        {/* Visual Score Track */}
        <div
          style={{
            height: 4,
            borderRadius: 2,
            background: 'rgba(255, 255, 255, 0.08)',
            overflow: 'hidden',
            width: '100%',
          }}
        >
          <div
            style={{
              width: `${pct}%`,
              height: '100%',
              background: accentColor,
              borderRadius: 2,
              transition: 'width 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          />
        </div>
      </div>
    );
  }

  // Active scoring mode: Slider + tactile +/- tap buttons
  return (
    <div
      style={{
        padding: '12px 14px',
        background: 'var(--bg-surface-elevated)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-md)',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div>
          <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--text-primary)' }}>
            {label}
          </div>
          {desc && (
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)', marginTop: 2, lineHeight: 1.3 }}>
              {desc}
            </div>
          )}
        </div>

        {/* Stepper Buttons & Score Display */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <button
            type="button"
            onClick={decrement}
            disabled={currentVal <= min}
            aria-label={`Decrease ${label}`}
            style={{
              width: 30,
              height: 30,
              borderRadius: '50%',
              border: '1px solid var(--border-medium)',
              background: 'var(--bg-surface)',
              color: 'var(--text-primary)',
              fontSize: 16,
              fontWeight: 700,
              cursor: currentVal <= min ? 'not-allowed' : 'pointer',
              opacity: currentVal <= min ? 0.3 : 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              userSelect: 'none',
              transition: 'var(--transition-fast)',
            }}
          >
            −
          </button>

          <div style={{ minWidth: 36, textAlign: 'center' }}>
            <span
              className="tabular-nums"
              style={{
                fontSize: 'var(--font-size-lg)',
                fontWeight: 700,
                color: accentColor,
              }}
            >
              {currentVal}
            </span>
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)' }}>/{max}</span>
          </div>

          <button
            type="button"
            onClick={increment}
            disabled={currentVal >= max}
            aria-label={`Increase ${label}`}
            style={{
              width: 30,
              height: 30,
              borderRadius: '50%',
              border: '1px solid var(--border-medium)',
              background: 'var(--bg-surface)',
              color: 'var(--text-primary)',
              fontSize: 16,
              fontWeight: 700,
              cursor: currentVal >= max ? 'not-allowed' : 'pointer',
              opacity: currentVal >= max ? 0.3 : 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              userSelect: 'none',
              transition: 'var(--transition-fast)',
            }}
          >
            +
          </button>
        </div>
      </div>

      {/* Apple Slider with Fill Track */}
      <div className="apple-slider-track-wrap" style={{ width: '100%' }}>
        <input
          type="range"
          min={min}
          max={max}
          step={1}
          value={currentVal}
          onChange={(e) => onChange(Number(e.target.value))}
          className="apple-slider"
          style={{
            '--fill-pct': `${pct}%`,
            width: '100%',
          }}
          aria-label={label}
        />
      </div>
    </div>
  );
}
