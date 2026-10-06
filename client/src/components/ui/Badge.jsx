import React from 'react';

export function Badge({
  children,
  variant = 'default',
  size = 'md',
  dot = false,
  pulse = false,
  icon: Icon,
  className = '',
  ...props
}) {
  return (
    <span className={`apple-badge apple-badge-${variant} apple-badge-${size} ${className}`} {...props}>
      {dot && <span className={`apple-badge-dot ${pulse ? 'is-pulse' : ''}`} aria-hidden="true" />}
      {Icon && <Icon size={size === 'sm' ? 11 : 13} className="apple-badge-icon" />}
      <span>{children}</span>
    </span>
  );
}

export default Badge;

