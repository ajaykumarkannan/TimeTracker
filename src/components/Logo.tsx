interface Props {
  size?: number;
  className?: string;
}

export function Logo({ size = 28, className = '' }: Props) {
  return (
    <svg 
      viewBox="0 0 48 48" 
      width={size} 
      height={size} 
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="logoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#6366f1"/>
          <stop offset="100%" stopColor="#8b5cf6"/>
        </linearGradient>
      </defs>
      <circle cx="24" cy="24" r="22" fill="url(#logoGrad)"/>
      <circle cx="24" cy="24" r="2.5" fill="white"/>
      <line x1="24" y1="24" x2="24" y2="12" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
      <line x1="24" y1="24" x2="32" y2="28" stroke="white" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}
