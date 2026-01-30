import { useTheme } from '../contexts/ThemeContext';
import { Theme } from '../types';
import { SunIcon, MoonIcon, MonitorIcon } from './Icons';
import './ThemeToggle.css';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  const themeOrder: Theme[] = ['light', 'dark', 'system'];
  const themeLabels: Record<Theme, string> = {
    light: 'Light mode (click for dark)',
    dark: 'Dark mode (click for system)',
    system: 'System mode (click for light)'
  };

  const cycleTheme = () => {
    const currentIndex = themeOrder.indexOf(theme);
    const nextIndex = (currentIndex + 1) % themeOrder.length;
    setTheme(themeOrder[nextIndex]);
  };

  const renderIcon = () => {
    switch (theme) {
      case 'light':
        return <SunIcon size={18} />;
      case 'dark':
        return <MoonIcon size={18} />;
      case 'system':
        return <MonitorIcon size={18} />;
    }
  };

  return (
    <button
      className="theme-toggle-btn"
      onClick={cycleTheme}
      title={themeLabels[theme]}
      aria-label={themeLabels[theme]}
    >
      {renderIcon()}
    </button>
  );
}
