import React, { useEffect } from 'react';
import { X } from './icons';

export function Modal({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  maxWidth = '540px',
  className = '',
}) {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="apple-modal-overlay" onClick={onClose} aria-modal="true" role="dialog">
      <div
        className={`apple-modal-dialog ${className}`}
        style={{ maxWidth }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="apple-modal-header">
          <div>
            {title && <h3 className="apple-modal-title">{title}</h3>}
            {subtitle && <p className="apple-modal-subtitle">{subtitle}</p>}
          </div>
          <button
            type="button"
            className="apple-modal-close"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X size={16} />
          </button>
        </div>

        <div className="apple-modal-content">{children}</div>

        {footer && <div className="apple-modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

export default Modal;

