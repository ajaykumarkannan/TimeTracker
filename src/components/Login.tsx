import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import './Login.css';

interface Props {
  onBack: () => void;
  onSuccess?: () => void;
}

export function Login({ onBack, onSuccess }: Props) {
  const { login, register } = useAuth();
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isRegister) {
        await register(email, username, password);
      } else {
        await login(email, password);
      }
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
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
          <h2>{isRegister ? 'Create Account' : 'Welcome Back'}</h2>
          
          {error && <div className="error-message">{error}</div>}

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

          {isRegister && (
            <div className="form-group">
              <label htmlFor="username">Username</label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="johndoe"
                required
                autoComplete="username"
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
              autoComplete={isRegister ? 'new-password' : 'current-password'}
            />
          </div>

          <button type="submit" className="submit-btn" disabled={loading}>
            {loading ? 'Please wait...' : (isRegister ? 'Create Account' : 'Sign In')}
          </button>

          <p className="toggle-mode">
            {isRegister ? 'Already have an account?' : "Don't have an account?"}
            <button type="button" onClick={() => setIsRegister(!isRegister)}>
              {isRegister ? 'Sign In' : 'Create one'}
            </button>
          </p>
          <button type="button" className="back-link" onClick={onBack}>
            ← Back to home
          </button>
        </form>
      </div>
    </div>
  );
}
