interface LogoIconProps {
  /** Show decorative tick marks around the clock face */
  showTicks?: boolean;
  className?: string;
}

export function LogoIcon({ showTicks, className = 'logo-icon' }: LogoIconProps) {
  return (
    <svg viewBox="0 0 48 48" className={className}>
      <circle cx="24" cy="24" r="22" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="24" cy="24" r="3" fill="currentColor" />
      <line x1="24" y1="24" x2="24" y2="10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="24" y1="24" x2="34" y2="28" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      {showTicks && (
        <path d="M12 8 L16 12 M36 8 L32 12 M8 24 L4 24 M44 24 L40 24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
      )}
    </svg>
  );
}
