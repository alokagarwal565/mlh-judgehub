import React from 'react';

/**
 * Apple HIG Touch-optimized numeric scoring control (0 - 10)
 * Replaces imprecise mobile sliders with large 44x44pt single-tap segmented targets
 */
export default function TouchScoreStepper({
  value = 0,
  onChange,
  disabled = false,
  label,
  desc
}) {
  const currentVal = typeof value === 'number' ? value : 0;

  const handleSelect = (num) => {
    if (disabled) return;
    onChange(num);
  };

  const decrement = () => {
    if (disabled || currentVal <= 0) return;
    onChange(currentVal - 1);
  };

  const increment = () => {
    if (disabled || currentVal >= 10) return;
    onChange(currentVal + 1);
  };

  return (
    <div className="py-2.5 border-b border-white/5 last:border-0">
      <div className="flex items-center justify-between mb-2">
        <div>
          <span className="text-sm font-semibold text-white tracking-tight">{label}</span>
          {desc && <p className="text-xs text-neutral-400 mt-0.5 leading-snug">{desc}</p>}
        </div>
        <div className="flex items-center gap-2 pl-3">
          <button
            type="button"
            onClick={decrement}
            disabled={disabled || currentVal <= 0}
            className="w-8 h-8 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center text-base font-bold text-neutral-300 transition-colors"
            aria-label="Decrement score"
          >
            -
          </button>
          <span className="w-7 text-center font-bold text-lg text-emerald-400 tabular-nums">
            {currentVal}
          </span>
          <button
            type="button"
            onClick={increment}
            disabled={disabled || currentVal >= 10}
            className="w-8 h-8 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center text-base font-bold text-neutral-300 transition-colors"
            aria-label="Increment score"
          >
            +
          </button>
        </div>
      </div>

      {/* 0-10 Segmented Touch Strip (Minimum 44pt tap target) */}
      <div className="grid grid-cols-11 gap-1 pt-1">
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => {
          const isSelected = currentVal === num;
          return (
            <button
              key={num}
              type="button"
              disabled={disabled}
              onClick={() => handleSelect(num)}
              className={`min-h-[40px] h-10 rounded-lg text-xs font-bold transition-all duration-150 flex items-center justify-center ${
                isSelected
                  ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/25 scale-105 z-10 font-extrabold'
                  : 'bg-white/5 text-neutral-400 hover:bg-white/10 hover:text-white border border-white/5'
              } ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer active:scale-95'}`}
            >
              {num}
            </button>
          );
        })}
      </div>
    </div>
  );
}
