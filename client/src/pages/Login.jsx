import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Sparkles, Lock, User, AlertTriangle } from '../components/ui/icons';
import Button from '../components/ui/Button';
import { Input } from '../components/ui/Input';

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid email or password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const fillQuickCredentials = (e, p) => {
    setEmail(e);
    setPassword(p);
    setError('');
  };

  return (
    <div className="login-page">
      <div className="login-card">
        {/* Brand Icon */}
        <div className="login-brand-icon">
          <Sparkles size={24} />
        </div>

        <h1 className="login-title">MLH JudgeHub</h1>
        <p className="login-subtitle">Hackathon Judging & Evaluation Suite</p>

        {error && (
          <div
            style={{
              background: 'var(--accent-danger-tint)',
              border: '1px solid rgba(255, 69, 58, 0.25)',
              color: 'var(--accent-danger)',
              padding: '12px 14px',
              borderRadius: 'var(--radius-sm)',
              marginBottom: 20,
              fontSize: 'var(--font-size-xs)',
              display: 'flex',
              alignItems: 'center',
              gap: 10
            }}
          >
            <AlertTriangle size={16} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <Input
            label="Email Address"
            type="email"
            icon={User}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@mlh.local"
            required
            autoComplete="email"
            autoFocus
          />

          <Input
            label="Password"
            type="password"
            icon={Lock}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            autoComplete="current-password"
          />

          <div style={{ marginTop: 24 }}>
            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={loading}
              style={{ width: '100%' }}
            >
              Sign In
            </Button>
          </div>
        </form>

        {/* Quick Demo Credentials */}
        <div style={{ marginTop: 28, paddingTop: 20, borderTop: '1px solid var(--border-subtle)' }}>
          <div
            style={{
              fontSize: 'var(--font-size-2xs)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              fontWeight: 600,
              color: 'var(--text-tertiary)',
              textAlign: 'center',
              marginBottom: 10
            }}
          >
            Quick Sign-In
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="apple-badge apple-badge-default apple-badge-sm"
              onClick={() => fillQuickCredentials('admin@mlh.local', 'admin123')}
              style={{ cursor: 'pointer', border: '1px solid var(--border-subtle)' }}
            >
              Admin Demo
            </button>
            <button
              type="button"
              className="apple-badge apple-badge-default apple-badge-sm"
              onClick={() => fillQuickCredentials('sarah.chen@mlh.sample', 'judge123')}
              style={{ cursor: 'pointer', border: '1px solid var(--border-subtle)' }}
            >
              Judge Demo
            </button>
            <button
              type="button"
              className="apple-badge apple-badge-default apple-badge-sm"
              onClick={() => fillQuickCredentials('team.1@team.sample', 'team123')}
              style={{ cursor: 'pointer', border: '1px solid var(--border-subtle)' }}
            >
              Team Demo
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
