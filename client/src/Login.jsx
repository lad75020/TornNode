import React, { useState } from 'react';
import { Link } from 'react-router-dom';

export default function Login({ darkMode }) {
  const [username, setUsername] = useState('');
  const [passkey, setPasskey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!username || !passkey) { setError('Please enter username and passkey'); return; }
    setLoading(true);
    try {
      const res = await fetch('/authenticate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // ensure session cookie is set server-side
        body: JSON.stringify({ username, passkey })
      });
      const data = await res.json().catch(() => ({}));
      if (data && data.success) {
        // The HttpOnly cookie is sent automatically; client code never reads it.
        window.location.href = '/';
      } else {
        setError(data && data.message ? data.message : 'Authentication failed');
      }
    } catch (err) {
      setError(err?.message || 'Network error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`d-flex align-items-center justify-content-center ${darkMode ? 'dark-mode' : 'light-mode'}`} style={{ minHeight: '100vh', padding: 16 }}>
      <div className="card" style={{ maxWidth: 420, width: '100%', ...(darkMode ? { background:'#1b1b1b', color:'#e0e0e0', border:'1px solid #2a2a2a' } : {}) }}>
        <div className="card-body">
          <h5 className="card-title" style={{ marginBottom: 12 }}>Login</h5>
          <div className="text-center" style={{ marginBottom: 16 }}>
            <img
              src="/images/ladparis320.avif"
              alt="Lad Paris"
              style={{ width: '100%', border: '6px solid #000', borderRadius: 4 }}
            />
          </div>
          <form onSubmit={onSubmit}>
            <div className="mb-3">
              <label className="form-label" htmlFor="login-username">Username</label>
              <input
                type="text"
                id="login-username"
                className="form-control"
                value={username}
                onChange={e => setUsername(e.target.value)}
                autoComplete="username"
                required
                aria-describedby={error ? 'login-error' : undefined}
                disabled={loading}
              />
            </div>
            <div className="mb-3">
              <label className="form-label" htmlFor="login-passkey">Passkey</label>
              <input
                type="password"
                id="login-passkey"
                className="form-control"
                value={passkey}
                onChange={e => setPasskey(e.target.value)}
                autoComplete="current-password"
                required
                aria-describedby={error ? 'login-error' : undefined}
                disabled={loading}
              />
            </div>
            {error && (
              <div id="login-error" className="alert alert-danger py-2" role="alert" aria-live="polite" style={{ fontSize: 13 }}>
                {error}
              </div>
            )}
            <div className="d-flex justify-content-between align-items-center" style={{ gap: 8 }}>
              <Link to="/public-bazaar" className="btn btn-outline-secondary" aria-label="Open public market page">
                View Market (public)
              </Link>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? 'Signing in…' : 'Sign in'}
              </button>
            </div>
            {loading && <p className="mt-2 mb-0" role="status">Signing in, please wait…</p>}
          </form>
        </div>
      </div>
    </div>
  );
}
