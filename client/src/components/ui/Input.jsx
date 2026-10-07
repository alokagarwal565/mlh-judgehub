import React from 'react';
import { Search, X } from './icons';

export function Input({
  label,
  error,
  helpText,
  icon: Icon,
  className = '',
  id,
  type = 'text',
  ...props
}) {
  const inputId = id || (label ? `input-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined);

  return (
    <div className={`apple-form-group ${error ? 'has-error' : ''} ${className}`}>
      {label && (
        <label htmlFor={inputId} className="apple-form-label">
          {label}
        </label>
      )}
      <div className="apple-input-wrapper">
        {Icon && <Icon size={16} className="apple-input-icon-left" />}
        <input
          id={inputId}
          type={type}
          aria-invalid={!!error}
          className={`apple-input ${Icon ? 'has-left-icon' : ''}`}
          {...props}
        />
      </div>
      {error && <span className="apple-form-error">{error}</span>}
      {helpText && !error && <span className="apple-form-help">{helpText}</span>}
    </div>
  );
}

export { Select } from './Select';

export function SearchField({
  value,
  onChange,
  onClear,
  placeholder = 'Search...',
  className = '',
  style = {},
  width,
  maxWidth,
  ...props
}) {
  return (
    <div
      className={`apple-search-field ${className}`}
      style={{
        ...(width ? { width } : {}),
        ...(maxWidth ? { maxWidth } : {}),
        ...style
      }}
    >
      <Search size={15} className="apple-search-icon" />
      <input
        type="search"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="apple-search-input"
        {...props}
      />
      {value && (
        <button
          type="button"
          onClick={onClear || (() => onChange({ target: { value: '' } }))}
          className="apple-search-clear"
          aria-label="Clear search"
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
}

export function Slider({
  label,
  value,
  onChange,
  min = 0,
  max = 10,
  step = 1,
  showValue = true,
  className = '',
  ...props
}) {
  return (
    <div className={`apple-slider-group ${className}`}>
      {label && (
        <div className="apple-slider-header">
          <label className="apple-slider-label">{label}</label>
          {showValue && <span className="apple-slider-value">{value} <span className="apple-slider-max">/ {max}</span></span>}
        </div>
      )}
      <div className="apple-slider-track-wrap">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={onChange}
          className="apple-slider"
          style={{
            '--fill-pct': `${((value - min) / (max - min)) * 100}%`
          }}
          {...props}
        />
      </div>
    </div>
  );
}

export function Textarea({
  label,
  error,
  helpText,
  className = '',
  id,
  rows = 4,
  ...props
}) {
  const textareaId = id || (label ? `textarea-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined);

  return (
    <div className={`apple-form-group ${error ? 'has-error' : ''} ${className}`}>
      {label && (
        <label htmlFor={textareaId} className="apple-form-label">
          {label}
        </label>
      )}
      <div className="apple-input-wrapper">
        <textarea
          id={textareaId}
          rows={rows}
          aria-invalid={!!error}
          className="apple-textarea"
          {...props}
        />
      </div>
      {error && <span className="apple-form-error">{error}</span>}
      {helpText && !error && <span className="apple-form-help">{helpText}</span>}
    </div>
  );
}

export const AppleSlider = Slider;
export default Input;

