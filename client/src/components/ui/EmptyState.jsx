import React from 'react';
import { HelpCircle } from './icons';

export function EmptyState({
  icon: Icon = HelpCircle,
  title,
  description,
  action,
  actionLabel,
  onAction,
  className = '',
}) {
  return (
    <div className={`apple-empty-state ${className}`}>
      <div className="apple-empty-icon-wrapper">
        <Icon size={32} className="apple-empty-icon" />
      </div>
      {title && <h3 className="apple-empty-title">{title}</h3>}
      {description && <p className="apple-empty-description">{description}</p>}
      {action && <div className="apple-empty-action">{action}</div>}
      {!action && actionLabel && onAction && (
        <div className="apple-empty-action">
          <button className="apple-btn apple-btn-primary" onClick={onAction}>
            {actionLabel}
          </button>
        </div>
      )}
    </div>
  );
}

export default EmptyState;

