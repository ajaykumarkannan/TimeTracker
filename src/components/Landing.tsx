import { ThemeToggle } from './ThemeToggle';
import './Landing.css';

interface Props {
  onLogin: () => void;
  onLocalMode: () => void;
}

export function Landing({ onLogin, onLocalMode }: Props) {
  return (
    <div className="landing">
      <header className="landing-header">
        <div className="landing-logo">
          <svg viewBox="0 0 48 48" className="logo-icon">
            <circle cx="24" cy="24" r="22" fill="none" stroke="currentColor" strokeWidth="2" />
            <circle cx="24" cy="24" r="3" fill="currentColor" />
            <line x1="24" y1="24" x2="24" y2="10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <line x1="24" y1="24" x2="34" y2="28" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
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
          
          <div className="hero-actions">
            <button className="btn btn-primary btn-lg" onClick={onLogin}>
              Get Started Free
            </button>
            <button className="btn btn-outline btn-lg" onClick={onLocalMode}>
              Try Without Account
            </button>
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

        <div className="modes-section">
          <h2>Choose Your Mode</h2>
          <div className="modes-grid">
            <div className="mode-card">
              <div className="mode-icon">☁️</div>
              <h3>Cloud Mode</h3>
              <p>Create an account to sync your data across devices and never lose your tracking history.</p>
              <button className="btn btn-primary" onClick={onLogin}>Sign Up / Login</button>
            </div>
            <div className="mode-card">
              <div className="mode-icon">💾</div>
              <h3>Local Mode</h3>
              <p>Keep everything in your browser. No account needed, your data stays on your device.</p>
              <button className="btn btn-outline" onClick={onLocalMode}>Use Locally</button>
            </div>
          </div>
        </div>
      </main>

      <footer className="landing-footer">
        <p>ChronoFlow — Track time, not complexity</p>
      </footer>
    </div>
  );
}
