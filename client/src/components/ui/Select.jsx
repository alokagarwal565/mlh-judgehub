import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronDown, Check } from './icons';

export function Select({
  label,
  value,
  onChange,
  options = [],
  placeholder = 'Select...',
  size = 'md', // 'sm' | 'md'
  placement = 'auto', // 'auto' | 'top' | 'bottom'
  disabled = false,
  error,
  helpText,
  className = '',
  style = {},
  triggerStyle = {},
  menuStyle = {},
  icon: Icon,
  children,
  id,
  name,
  width,
  ...props
}) {
  const calculateDirection = useCallback(() => {
    if (placement === 'top') return 'top';
    if (placement === 'bottom') return 'bottom';
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      if (spaceBelow < 220 && rect.top > 180) {
        return 'top';
      }
    }
    return 'bottom';
  }, [placement]);

  const [isOpen, setIsOpen] = useState(false);
  const [dropDirection, setDropDirection] = useState(() => (placement === 'top' ? 'top' : 'bottom'));
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const containerRef = useRef(null);
  const listRef = useRef(null);

  // Normalize options from options prop or React children <option>
  const parsedOptions = React.useMemo(() => {
    if (options && options.length > 0) {
      return options.map((opt) =>
        typeof opt === 'object' && opt !== null
          ? opt
          : { value: opt, label: String(opt) }
      );
    }
    if (children) {
      const opts = [];
      React.Children.forEach(children, (child) => {
        if (React.isValidElement(child) && child.type === 'option') {
          opts.push({
            value: child.props.value,
            label: child.props.children,
            disabled: child.props.disabled,
            color: child.props.color || child.props['data-color'],
            ...child.props
          });
        }
      });
      return opts;
    }
    return [];
  }, [options, children]);

  // Find currently selected option
  const selectedOption = parsedOptions.find(
    (opt) => String(opt.value ?? '') === String(value ?? '')
  );

  // Close when clicking outside & handle drop placement
  useEffect(() => {
    if (!isOpen) return;

    setDropDirection(calculateDirection());

    const handleScrollOrResize = () => {
      setDropDirection(calculateDirection());
    };

    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [isOpen, calculateDirection]);

  const handleToggle = () => {
    if (disabled) return;
    if (!isOpen) {
      setDropDirection(calculateDirection());
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
  };

  // Keyboard navigation
  const handleKeyDown = (e) => {
    if (disabled) return;

    if (!isOpen) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setDropDirection(calculateDirection());
        setIsOpen(true);
        const currentIndex = parsedOptions.findIndex(
          (opt) => String(opt.value ?? '') === String(value ?? '')
        );
        setFocusedIndex(currentIndex >= 0 ? currentIndex : 0);
      }
      return;
    }

    if (e.key === 'Escape' || e.key === 'Tab') {
      setIsOpen(false);
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIndex((prev) => {
        let next = prev + 1;
        while (next < parsedOptions.length && parsedOptions[next]?.disabled) {
          next++;
        }
        return next < parsedOptions.length ? next : prev;
      });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIndex((prev) => {
        let next = prev - 1;
        while (next >= 0 && parsedOptions[next]?.disabled) {
          next--;
        }
        return next >= 0 ? next : prev;
      });
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (focusedIndex >= 0 && focusedIndex < parsedOptions.length) {
        const targetOpt = parsedOptions[focusedIndex];
        if (!targetOpt.disabled) {
          handleSelect(targetOpt);
        }
      }
    }
  };

  const handleSelect = (opt) => {
    if (opt.disabled || disabled) return;
    setIsOpen(false);
    if (onChange) {
      // Create rich simulated synthetic event compatible with both e.target.value and direct value
      const event = {
        target: { value: opt.value, name, id },
        currentTarget: { value: opt.value, name, id },
        value: opt.value,
        valueOf: () => opt.value,
        toString: () => String(opt.value)
      };
      onChange(event, opt.value);
    }
  };

  const isSmall = size === 'sm';
  const displayLabel = selectedOption ? selectedOption.label : placeholder;

  return (
    <div
      className={`apple-custom-select-container ${error ? 'has-error' : ''} ${className}`}
      style={{
        display: 'inline-block',
        position: 'relative',
        width: width || (style.width ? style.width : '100%'),
        ...style
      }}
      ref={containerRef}
    >
      {label && (
        <label className="apple-form-label" style={{ display: 'block', marginBottom: 6 }}>
          {label}
        </label>
      )}

      {/* Trigger Button */}
      <button
        type="button"
        id={id}
        name={name}
        disabled={disabled}
        onClick={handleToggle}
        onKeyDown={handleKeyDown}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={`apple-custom-select-trigger ${isSmall ? 'is-sm' : ''} ${isOpen ? 'is-open' : ''} ${error ? 'is-invalid' : ''}`}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          width: '100%',
          height: isSmall ? 32 : 38,
          padding: isSmall ? '0 10px' : '0 14px',
          fontSize: isSmall ? 12 : 13,
          fontWeight: 500,
          background: 'rgba(255, 255, 255, 0.04)',
          border: `1px solid ${isOpen ? 'var(--accent)' : 'var(--border-subtle)'}`,
          borderRadius: 'var(--radius-sm)',
          color: selectedOption ? 'var(--text-primary)' : 'var(--text-tertiary)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          textAlign: 'left',
          userSelect: 'none',
          outline: 'none',
          boxShadow: isOpen ? '0 0 0 3px var(--accent-focus)' : 'none',
          transition: 'border-color var(--transition-fast), box-shadow var(--transition-fast), background var(--transition-fast)',
          ...triggerStyle
        }}
        {...props}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden', flex: 1 }}>
          {Icon && <Icon size={isSmall ? 14 : 16} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />}
          {selectedOption?.color && (
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: selectedOption.color,
                boxShadow: `0 0 6px ${selectedOption.color}80`,
                flexShrink: 0
              }}
            />
          )}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {displayLabel}
          </span>
        </div>

        <ChevronDown
          size={isSmall ? 14 : 15}
          style={{
            color: 'var(--text-tertiary)',
            flexShrink: 0,
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
          }}
        />
      </button>

      {/* Dropdown Popover Menu */}
      {isOpen && (
        <div
          ref={listRef}
          role="listbox"
          tabIndex={-1}
          className="apple-custom-select-menu"
          style={{
            position: 'absolute',
            ...(dropDirection === 'top'
              ? { bottom: 'calc(100% + 4px)', top: 'auto', animation: 'appleSelectFadeInUp 0.15s cubic-bezier(0.16, 1, 0.3, 1)' }
              : { top: 'calc(100% + 4px)', bottom: 'auto', animation: 'appleSelectFadeIn 0.15s cubic-bezier(0.16, 1, 0.3, 1)' }),
            left: 0,
            right: 0,
            width: '100%',
            boxSizing: 'border-box',
            maxHeight: 260,
            overflowY: 'auto',
            background: 'rgba(24, 26, 34, 0.97)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            border: '1px solid var(--border-strong)',
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 12px 36px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(255, 255, 255, 0.06)',
            padding: 4,
            zIndex: 1000,
            ...menuStyle
          }}
        >
          {parsedOptions.length === 0 ? (
            <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-tertiary)', textAlign: 'center' }}>
              No options available
            </div>
          ) : (
            parsedOptions.map((opt, idx) => {
              const isSelected = String(opt.value ?? '') === String(value ?? '');
              const isFocused = idx === focusedIndex;

              return (
                <div
                  key={String(opt.value ?? idx)}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => handleSelect(opt)}
                  onMouseEnter={() => setFocusedIndex(idx)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    padding: isSmall ? '6px 10px' : '8px 12px',
                    fontSize: isSmall ? 12 : 13,
                    fontWeight: isSelected ? 600 : 400,
                    borderRadius: 'var(--radius-sm)',
                    color: opt.disabled
                      ? 'var(--text-tertiary)'
                      : isSelected
                      ? 'var(--accent)'
                      : 'var(--text-primary)',
                    background: isSelected
                      ? 'var(--accent-tint)'
                      : isFocused
                      ? 'rgba(255, 255, 255, 0.07)'
                      : 'transparent',
                    cursor: opt.disabled ? 'not-allowed' : 'pointer',
                    userSelect: 'none',
                    transition: 'all 0.12s ease',
                    opacity: opt.disabled ? 0.45 : 1
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden', minWidth: 0, flex: 1 }}>
                    {opt.color && (
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          background: opt.color,
                          boxShadow: `0 0 6px ${opt.color}80`,
                          flexShrink: 0
                        }}
                      />
                    )}
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {opt.label}
                    </span>
                  </div>

                  {isSelected && (
                    <Check
                      size={isSmall ? 13 : 15}
                      strokeWidth={2.4}
                      style={{ color: 'var(--accent)', flexShrink: 0, marginLeft: 8 }}
                    />
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {error && (
        <span className="apple-form-error" style={{ display: 'block', marginTop: 4 }}>
          {error}
        </span>
      )}
      {helpText && !error && (
        <span className="apple-form-help" style={{ display: 'block', marginTop: 4 }}>
          {helpText}
        </span>
      )}
    </div>
  );
}

export default Select;
