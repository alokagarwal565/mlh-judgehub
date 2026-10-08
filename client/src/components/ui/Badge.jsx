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
  const iconSize = size === 'xs' ? 11 : size === 'sm' ? 13 : 15;
  return (
    <span className={`apple-badge apple-badge-${variant} apple-badge-${size} ${className}`} {...props}>
      {dot && <span className={`apple-badge-dot ${pulse ? 'is-pulse' : ''}`} aria-hidden="true" />}
      {Icon && <Icon size={iconSize} className="apple-badge-icon" />}
      <span>{children}</span>
    </span>
  );
}

export default Badge;

