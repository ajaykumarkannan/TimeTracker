import { ThemeToggle } from './ThemeToggle';
import { LogoIcon } from './LogoIcon';
import './Landing.css';

interface Props {
  onLogin: () => void;
  onGuest: () => void;
}

export function Landing({ onLogin, onGuest }: Props) {
  return (
    <div className="landing">
      <header className="landing-header">
        <div className="landing-logo">
          <LogoIcon />
          <span>ChronoFlow</span>
        </div>
        <ThemeToggle />
      </header>

      <main className="landing-main">
        <div className="hero">
          <h1>Track your time,<br />master your day</h1>
          <p className="hero-subtitle">
            Simple, beautiful time tracking that helps you understand where your hours go.
            Stay focused, measure progress, and take control of your workday.
          </p>
        </div>

        <div className="modes-section">
          <h2>Choose Your Mode</h2>
          <div className="modes-grid">
            <div className="mode-card">
              <div className="mode-icon">☁️</div>
              <h3>With Account</h3>
              <p>Create an account to sync your data across devices and never lose your tracking history.</p>
              <button className="btn btn-primary" onClick={onLogin}>Sign Up / Login</button>
            </div>
            <div className="mode-card">
              <div className="mode-icon">👤</div>
              <h3>Guest Mode</h3>
              <p>Start tracking immediately. Your data is saved on the server and you can create an account later.</p>
              <button className="btn btn-outline" onClick={onGuest}>Continue as Guest</button>
            </div>
          </div>
        </div>

        <div className="features">
          <div className="feature-card">
            <div className="feature-icon">⏱️</div>
            <h3>One-Click Tracking</h3>
            <p>Start and stop timers instantly. Quick-start buttons for your frequent tasks.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">🏷️</div>
            <h3>Custom Categories</h3>
            <p>Organize your time with color-coded categories that match your workflow.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">📊</div>
            <h3>Insightful Analytics</h3>
            <p>See where your time goes with beautiful charts and actionable insights.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">🌙</div>
            <h3>Dark Mode</h3>
            <p>Easy on the eyes with automatic light and dark theme support.</p>
          </div>
        </div>
      </main>

      <footer className="landing-footer">
        <p>ChronoFlow — Track time, not complexity</p>
      </footer>
    </div>
  );
}
