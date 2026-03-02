interface IconProps {
  size?: number;
  className?: string;
}




export function ClockIcon({ size = 16, className = '' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
      <circle cx="8" cy="8" r="6.5"/>
      <path d="M8 4v4l2.5 1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}


export function TagIcon({ size = 16, className = '' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
      <path d="M2 8.5V3a1 1 0 011-1h5.5L14 7.5 8.5 13 2 8.5z" strokeLinejoin="round"/>
      <circle cx="5" cy="5" r="1" fill="currentColor" stroke="none"/>
    </svg>
  );
}

export function ChartIcon({ size = 16, className = '' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
      <rect x="2" y="8" width="3" height="6" rx="0.5" fill="currentColor" stroke="none"/>
      <rect x="6.5" y="5" width="3" height="9" rx="0.5" fill="currentColor" stroke="none"/>
      <rect x="11" y="2" width="3" height="12" rx="0.5" fill="currentColor" stroke="none"/>
    </svg>
  );
}

export function LogoutIcon({ size = 16, className = '' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
      <path d="M6 14H3a1 1 0 01-1-1V3a1 1 0 011-1h3" strokeLinecap="round"/>
      <path d="M11 11l3-3-3-3M6 8h8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

export function SunIcon({ size = 16, className = '' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
      <circle cx="8" cy="8" r="3"/>
      <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" strokeLinecap="round"/>
    </svg>
  );
}

export function MoonIcon({ size = 16, className = '' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" className={className}>
      <path d="M6 2a6 6 0 108 8 5 5 0 01-8-8z"/>
    </svg>
  );
}

export function MonitorIcon({ size = 16, className = '' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
      <rect x="1" y="2" width="14" height="9" rx="1"/>
      <path d="M5 14h6M8 11v3" strokeLinecap="round"/>
    </svg>
  );
}





export function SettingsIcon({ size = 16, className = '' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
      <circle cx="8" cy="8" r="2"/>
      <path d="M13.5 8a5.5 5.5 0 01-.15 1.2l1.4.8-.9 1.6-1.4-.8a5.5 5.5 0 01-2.1 1.2v1.6h-1.8V12a5.5 5.5 0 01-2.1-1.2l-1.4.8-.9-1.6 1.4-.8A5.5 5.5 0 015.5 8c0-.4.05-.8.15-1.2l-1.4-.8.9-1.6 1.4.8A5.5 5.5 0 018.5 4V2.4h1.8V4a5.5 5.5 0 012.1 1.2l1.4-.8.9 1.6-1.4.8c.1.4.15.8.15 1.2z"/>
    </svg>
  );
}


export function HelpIcon({ size = 16, className = '' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
      <circle cx="8" cy="8" r="6.5"/>
      <path d="M6 6a2 2 0 113 1.73c-.5.29-1 .77-1 1.27v.5" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="8" cy="12" r="0.5" fill="currentColor" stroke="none"/>
    </svg>
  );
}
