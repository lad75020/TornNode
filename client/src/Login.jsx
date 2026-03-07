import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  describeAccessKeyError,
  getAccessKeySupport,
  loginWithAccessKey
} from './webauthn.js';

export default function Login({ darkMode }) {
  const [username, setUsername] = useState('');
  const [passkey, setPasskey] = useState('');
  const [loading, setLoading] = useState(false);
  const [accessKeyLoading, setAccessKeyLoading] = useState(false);
  const [error, setError] = useState('');
  const accessKeySupport = getAccessKeySupport();

  const finishLogin = (token) => {
    try { localStorage.setItem('jwt', token); } catch (_) {}
    window.location.href = '/';
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    setError('');
    if (!username || !passkey) {
      setError('Please enter username and password');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/authenticate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, passkey })
      });
      const data = await res.json().catch(() => ({}));
      if (data?.success && data?.token) {
        finishLogin(data.token);
      } else {
        setError(data?.message || 'Authentication failed');
      }
    } catch (err) {
      setError(err?.message || 'Network error');
    } finally {
      setLoading(false);
    }
  };

  const onAccessKeyLogin = async () => {
    setError('');
    setAccessKeyLoading(true);
    try {
      const data = await loginWithAccessKey();
      if (data?.token) {
        finishLogin(data.token);
      } else {
        setError('Access key login failed');
      }
    } catch (err) {
      setError(describeAccessKeyError(err));
    } finally {
      setAccessKeyLoading(false);
    }
  };

  return (
    <div className={`d-flex align-items-center justify-content-center ${darkMode ? 'dark-mode' : 'light-mode'}`} style={{ minHeight: '100vh', padding: 16 }}>
      <div className="card" style={{ maxWidth: 420, width: '100%', ...(darkMode ? { background: '#1b1b1b', color: '#e0e0e0', border: '1px solid #2a2a2a' } : {}) }}>
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
              <label className="form-label">Username</label>
              <input
                type="text"
                className="form-control"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                disabled={loading || accessKeyLoading}
              />
            </div>
            <div className="mb-3">
              <label className="form-label">Password</label>
              <input
                type="password"
                className="form-control"
                value={passkey}
                onChange={(event) => setPasskey(event.target.value)}
                autoComplete="current-password"
                disabled={loading || accessKeyLoading}
              />
            </div>
            {error && (
              <div className="alert alert-danger py-2" role="alert" style={{ fontSize: 13 }}>
                {error}
              </div>
            )}
            {!accessKeySupport.supported && (
              <div className="alert alert-warning py-2" role="alert" style={{ fontSize: 13 }}>
                {accessKeySupport.reason}
              </div>
            )}
            <div className="d-flex justify-content-between align-items-center" style={{ gap: 8, flexWrap: 'wrap' }}>
              <Link to="/public-bazaar" className="btn btn-outline-secondary" aria-label="Open public market page">
                View Market (public)
              </Link>
              <div className="d-flex" style={{ gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-outline-primary" disabled={accessKeyLoading || loading || !accessKeySupport.supported} onClick={onAccessKeyLogin}>
                  {accessKeyLoading ? 'Waiting…' : 'Use access key'}
                </button>
                <button type="submit" className="btn btn-primary" disabled={loading || accessKeyLoading}>
                  {loading ? 'Signing in…' : 'Sign in'}
                </button>
              </div>
            </div>
          </form>
          <p style={{ marginTop: 14, marginBottom: 0, fontSize: 13, opacity: 0.75 }}>
            Add access keys after signing in once with your password.
          </p>
        </div>
      </div>
    </div>
  );
}
