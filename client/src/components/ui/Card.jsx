import React from 'react';

export function Card({
  children,
  title,
  subtitle,
  action,
  headerBorder = true,
  className = '',
  glass = false,
  interactive = false,
  onClick,
  ...props
}) {
  return (
    <div
      className={`apple-card ${glass ? 'is-glass' : ''} ${interactive ? 'is-interactive' : ''} ${className}`}
      onClick={onClick}
      {...props}
    >
      {(title || action) && (
        <div className={`apple-card-header ${headerBorder ? 'has-border' : ''}`}>
          <div>
            {title && <h3 className="apple-card-title">{title}</h3>}
            {subtitle && <p className="apple-card-subtitle">{subtitle}</p>}
          </div>
          {action && <div className="apple-card-action">{action}</div>}
        </div>
      )}
      <div className="apple-card-body">{children}</div>
    </div>
  );
}

export default Card;


export function StatCard({
  label,
  value,
  subvalue,
  icon: Icon,
  variant = 'default',
  trend,
  className = '',
  onClick,
}) {
  return (
    <div
      className={`apple-stat-card apple-stat-card-${variant} ${onClick ? 'is-interactive' : ''} ${className}`}
      onClick={onClick}
    >
      <div className="apple-stat-top">
        <span className="apple-stat-label">{label}</span>
        {Icon && (
          <div className="apple-stat-icon-wrap">
            <Icon size={18} className="apple-stat-icon" />
          </div>
        )}
      </div>
      <div className="apple-stat-value">{value}</div>
      {(subvalue || trend) && (
        <div className="apple-stat-bottom">
          {trend && (
            <span className={`apple-stat-trend trend-${trend.type || 'neutral'}`}>
              {trend.text}
            </span>
          )}
          {subvalue && <span className="apple-stat-subvalue">{subvalue}</span>}
        </div>
      )}
    </div>
  );
}
