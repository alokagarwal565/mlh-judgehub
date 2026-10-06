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
        <Icon size={size === 'sm' ? 14 : size === 'lg' ? 20 : 16} className="apple-btn-icon" />
      ) : null}

      <span className="apple-btn-text">{children}</span>

      {!loading && Icon && iconPosition === 'right' && (
        <Icon size={size === 'sm' ? 14 : size === 'lg' ? 20 : 16} className="apple-btn-icon" />
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
        <Icon size={size === 'sm' ? 14 : size === 'lg' ? 20 : 16} />
      )}
    </button>
  );
}
