import React from 'react';
import './Banner.css';

interface BannerProps {
  children: React.ReactNode;
  actions?: React.ReactNode;
  icon?: React.ReactNode;
  variant?: 'info' | 'warning' | 'danger';
  onDismiss?: () => void;
  className?: string;
  role?: string;
}

export function Banner({
  children,
  actions,
  icon,
  variant = 'info',
  onDismiss,
  className,
  role,
}: BannerProps) {
  return (
    <div className={`banner banner--${variant}${className ? ` ${className}` : ''}`} role={role}>
      {icon && <span className="banner__icon">{icon}</span>}
      <span className="banner__content">{children}</span>
      {actions && <div className="banner__actions">{actions}</div>}
      {onDismiss && (
        <button
          className="banner__dismiss"
          onClick={onDismiss}
          aria-label="Dismiss"
          type="button"
        >
          ×
        </button>
      )}
    </div>
  );
}
