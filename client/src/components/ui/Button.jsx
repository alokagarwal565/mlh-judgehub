import React from 'react';

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  icon: Icon,
  iconPosition = 'left',
  loading = false,
  disabled = false,
  className = '',
  type = 'button',
  onClick,
  ...props
}) {
  const isDisabled = disabled || loading;
  const iconSize = size === 'sm' ? 18 : size === 'lg' ? 22 : 20;

  return (
    <button
      type={type}
      disabled={isDisabled}
      onClick={onClick}
      className={`apple-btn apple-btn-${variant} apple-btn-${size} ${loading ? 'is-loading' : ''} ${className}`}
      {...props}
    >
      {loading ? (
        <span className="apple-btn-spinner" aria-hidden="true" />
      ) : Icon && iconPosition === 'left' ? (
        <Icon size={iconSize} className="apple-btn-icon" />
      ) : null}

      <span className="apple-btn-text">{children}</span>

      {!loading && Icon && iconPosition === 'right' && (
        <Icon size={iconSize} className="apple-btn-icon" />
      )}
    </button>
  );
}

export default Button;

export function IconButton({
  icon: Icon,
  variant = 'ghost',
  size = 'md',
  label,
  loading = false,
  disabled = false,
  className = '',
  onClick,
  ...props
}) {
  const iconSize = size === 'sm' ? 18 : size === 'lg' ? 22 : 20;

  return (
    <button
      type="button"
      disabled={disabled || loading}
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`apple-btn-icon-only apple-btn-${variant} apple-btn-${size} ${className}`}
      {...props}
    >
      {loading ? (
        <span className="apple-btn-spinner" aria-hidden="true" />
      ) : (
        <Icon size={iconSize} />
      )}
    </button>
  );
}

