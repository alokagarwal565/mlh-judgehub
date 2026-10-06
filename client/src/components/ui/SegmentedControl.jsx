import React from 'react';

export function SegmentedControl({
  options = [],
  value,
  onChange,
  size = 'md',
  className = '',
}) {
  return (
    <div className={`apple-segmented-control apple-segmented-${size} ${className}`} role="tablist">
      {options.map((option) => {
        const optVal = option.value !== undefined ? option.value : option.id;
        const isSelected = value === optVal;
        const Icon = option.icon;
        const badgeCount = option.badge !== undefined ? option.badge : option.count;

        return (
          <button
            key={optVal}
            type="button"
            role="tab"
            aria-selected={isSelected}
            onClick={() => onChange(optVal)}
            className={`apple-segmented-item ${isSelected ? 'is-active' : ''}`}
          >
            {Icon && <Icon size={size === 'sm' ? 13 : 15} className="apple-segmented-icon" />}
            <span className="apple-segmented-label">{option.label}</span>
            {badgeCount !== undefined && (
              <span className="apple-segmented-badge">{badgeCount}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default SegmentedControl;

