import React from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { Theme } from '../types';
import './ThemeToggle.css';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  const themes: { value: Theme; icon: string; label: string }[] = [
    { value: 'light', icon: '☀️', label: 'Light' },
    { value: 'dark', icon: '🌙', label: 'Dark' },
    { value: 'system', icon: '💻', label: 'System' }
  ];

  return (
    <div className="theme-toggle">
      {themes.map(({ value, icon, label }) => (
        <button
          key={value}
          className={`theme-btn ${theme === value ? 'active' : ''}`}
          onClick={() => setTheme(value)}
          title={label}
          aria-label={`Switch to ${label} theme`}
        >
          <span className="theme-icon">{icon}</span>
        </button>
      ))}
    </div>
  );
}
