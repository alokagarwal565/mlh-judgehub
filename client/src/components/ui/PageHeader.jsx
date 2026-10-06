import React from 'react';
import { Badge } from './Badge';

export function PageHeader({
  title,
  subtitle,
  badge,
  actions,
  breadcrumbs,
  className = '',
}) {
  const renderBadge = () => {
    if (!badge) return null;
    if (React.isValidElement(badge)) return badge;
    if (typeof badge === 'object') {
      return <Badge variant={badge.variant || 'default'}>{badge.text || badge.label}</Badge>;
    }
    return <Badge>{badge}</Badge>;
  };

  return (
    <div className={`apple-page-header ${className}`}>
      {breadcrumbs && <div className="apple-breadcrumbs">{breadcrumbs}</div>}
      <div className="apple-page-header-main">
        <div className="apple-page-header-text">
          <div className="apple-page-title-row">
            <h1 className="apple-page-title">{title}</h1>
            {badge && <div className="apple-page-badge">{renderBadge()}</div>}
          </div>
          {subtitle && <p className="apple-page-subtitle">{subtitle}</p>}
        </div>
        {actions && <div className="apple-page-actions">{actions}</div>}
      </div>
    </div>
  );
}


export default PageHeader;

