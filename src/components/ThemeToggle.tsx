import { useTheme } from '../contexts/ThemeContext';
import { Theme } from '../types';
import './ThemeToggle.css';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  const themeOrder: Theme[] = ['light', 'dark', 'system'];
  const themeConfig: Record<Theme, { icon: string; label: string }> = {
    light: { icon: '☀️', label: 'Light mode (click for dark)' },
    dark: { icon: '🌙', label: 'Dark mode (click for system)' },
    system: { icon: '💻', label: 'System mode (click for light)' }
  };

  const cycleTheme = () => {
    const currentIndex = themeOrder.indexOf(theme);
    const nextIndex = (currentIndex + 1) % themeOrder.length;
    setTheme(themeOrder[nextIndex]);
  };

  const { icon, label } = themeConfig[theme];

  return (
    <button
      className="theme-toggle-btn"
      onClick={cycleTheme}
      title={label}
      aria-label={label}
    >
      <span className="theme-icon">{icon}</span>
    </button>
  );
}
