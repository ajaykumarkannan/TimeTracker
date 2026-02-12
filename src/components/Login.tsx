import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api';
import './Login.css';

interface Props {
  onBack: () => void;
  onSuccess?: () => void;
  sessionExpired?: boolean;
}

type Mode = 'login' | 'register' | 'forgot' | 'reset';

export function Login({ onBack, onSuccess, sessionExpired }: Props) {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [showSessionExpiredMessage, setShowSessionExpiredMessage] = useState(sessionExpired || false);
  const [rememberMe, setRememberMe] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      if (mode === 'register') {
        await register(email, name, password);
        onSuccess?.();
      } else if (mode === 'login') {
        await login(email, password, rememberMe);
        onSuccess?.();
      } else if (mode === 'forgot') {
        const result = await api.forgotPassword(email);
        // In demo mode, show the token. In production, just show success message
        if (result.resetToken) {
          setResetToken(result.resetToken);
          setMode('reset');
          setSuccess('Reset token generated. Enter it below with your new password.');
        } else {
          setSuccess('If an account exists with this email, a reset link has been sent.');
        }
      } else if (mode === 'reset') {
        await api.resetPassword(resetToken, password);
        setSuccess('Password reset successfully! You can now sign in.');
        setMode('login');
        setPassword('');
        setResetToken('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const renderForm = () => {
    switch (mode) {
      case 'forgot':
        return (
          <>
            <h2>Reset Password</h2>
            {error && <div className="error-message">{error}</div>}
            {success && <div className="success-message">{success}</div>}
            <div className="form-group">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
              />
            </div>
            <button type="submit" className="submit-btn" disabled={loading}>
              {loading ? 'Please wait...' : 'Send Reset Link'}
            </button>
            <button type="button" className="back-link" onClick={() => { setMode('login'); setError(''); setSuccess(''); }}>
              ← Back to sign in
            </button>
          </>
        );

      case 'reset':
        return (
          <>
            <h2>Set New Password</h2>
            {error && <div className="error-message">{error}</div>}
            {success && <div className="success-message">{success}</div>}
            <div className="form-group">
              <label htmlFor="reset-token">Reset Token</label>
              <input
                id="reset-token"
                type="text"
                value={resetToken}
                onChange={(e) => setResetToken(e.target.value)}
                placeholder="Paste your reset token"
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="password">New Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                autoComplete="new-password"
              />
            </div>
            <button type="submit" className="submit-btn" disabled={loading}>
              {loading ? 'Please wait...' : 'Reset Password'}
            </button>
            <button type="button" className="back-link" onClick={() => { setMode('login'); setError(''); setSuccess(''); }}>
              ← Back to sign in
            </button>
          </>
        );

      default:
        return (
          <>
            <h2>{mode === 'register' ? 'Create Account' : 'Welcome Back'}</h2>
            {showSessionExpiredMessage && (
              <div className="session-expired-message">
                <strong>Session expired</strong>
                <p>Your session has expired. Please sign in again to continue.</p>
                <button 
                  type="button" 
                  className="dismiss-btn"
                  onClick={() => setShowSessionExpiredMessage(false)}
                  aria-label="Dismiss"
                >
                  ×
                </button>
              </div>
            )}
            {error && <div className="error-message">{error}</div>}
            {success && <div className="success-message">{success}</div>}
            <div className="form-group">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
              />
            </div>
            {mode === 'register' && (
              <div className="form-group">
                <label htmlFor="name">Name</label>
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="John Doe"
                  required
                  autoComplete="name"
                />
              </div>
            )}
            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              />
            </div>
            {mode === 'login' && (
              <div className="remember-me-group">
                <label className="remember-me-label">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className='remember-me-checkbox'
                  />
                  <span>Remember me for 30 days</span>
                </label>
              </div>
            )}
            {mode === 'login' && (
              <button type="button" className="forgot-link" onClick={() => { setMode('forgot'); setError(''); setSuccess(''); }}>
                Forgot password?
              </button>
            )}
            <button type="submit" className="submit-btn" disabled={loading}>
              {loading ? 'Please wait...' : (mode === 'register' ? 'Create Account' : 'Sign In')}
            </button>
            <p className="toggle-mode">
              {mode === 'register' ? 'Already have an account?' : "Don't have an account?"}
              <button type="button" onClick={() => { setMode(mode === 'register' ? 'login' : 'register'); setError(''); setSuccess(''); }}>
                {mode === 'register' ? 'Sign In' : 'Create one'}
              </button>
            </p>
          </>
        );
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-logo">
          <svg viewBox="0 0 48 48" className="logo-icon">
            <circle cx="24" cy="24" r="22" fill="none" stroke="currentColor" strokeWidth="2" />
            <circle cx="24" cy="24" r="3" fill="currentColor" />
            <line x1="24" y1="24" x2="24" y2="10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <line x1="24" y1="24" x2="34" y2="28" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <path d="M12 8 L16 12 M36 8 L32 12 M8 24 L4 24 M44 24 L40 24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
          </svg>
          <h1>ChronoFlow</h1>
          <p className="tagline">Track your time, master your day</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          {renderForm()}
          {(mode === 'login' || mode === 'register') && (
            <button type="button" className="back-link" onClick={onBack}>
              ← Back to home
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
