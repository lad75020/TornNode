import React, { useState } from 'react';

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
      if (data && data.success && data.token) {
        try { localStorage.setItem('jwt', data.token); } catch(_) {}
        // Reload to let Main reinitialize websockets and state
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
          <form onSubmit={onSubmit}>
            <div className="mb-3">
              <label className="form-label">Username</label>
              <input
                type="text"
                className="form-control"
                value={username}
                onChange={e => setUsername(e.target.value)}
                autoComplete="username"
                disabled={loading}
              />
            </div>
            <div className="mb-3">
              <label className="form-label">Passkey</label>
              <input
                type="password"
                className="form-control"
                value={passkey}
                onChange={e => setPasskey(e.target.value)}
                autoComplete="current-password"
                disabled={loading}
              />
            </div>
            {error && (
              <div className="alert alert-danger py-2" role="alert" style={{ fontSize: 13 }}>
                {error}
              </div>
            )}
            <div className="d-flex justify-content-end" style={{ gap: 8 }}>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? 'Signing in…' : 'Sign in'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function LoginForm({ onAuth }) {
  const [username, setLogin] = useState('');
  const [passkey, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
  const res = await fetch('/authenticate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, passkey})
      });
      if (!res.ok) throw new Error('Authentication failed');
      const data = await res.json();
      if (data.token) {
        onAuth(data.token);
      } else {
        setError('Invalid credentials');
      }
    } catch (err) {
      setError('Erreur d’authentification');
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ margin: 20 }}>
      <div>
        <input
          type="text"
          value={username}
          onChange={e => setLogin(e.target.value)}
          placeholder="Login"
          style={{ padding: 8, width: 200, marginBottom: 8 }}
        />
      </div>
      <div>
        <input
          type="password"
          value={passkey}
          onChange={e => setPassword(e.target.value)}
          placeholder="Mot de passe"
          style={{ padding: 8, width: 200, marginBottom: 8 }}
        />
      </div>
      <div style={{ width: '100%' }}>
        <button type="submit" className="btn btn-primary mb-4">Se&nbsp;connecter</button>
      </div>
      {error && <div style={{ color: 'red', marginTop: 8 }}>{error}</div>}
    </form>
  );
}
