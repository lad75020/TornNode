import { useEffect, useState } from 'react';
import {
  describeAccessKeyError,
  fetchAccessKeys,
  getAccessKeySupport,
  registerAccessKey,
  removeAccessKey
} from './webauthn.js';

function formatDate(value) {
  if (!value) return 'Never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleString();
}

export default function AccessKeyManager({ darkMode, open, onClose }) {
  const [credentials, setCredentials] = useState([]);
  const [loading, setLoading] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [removingId, setRemovingId] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const support = getAccessKeySupport();

  useEffect(() => {
    if (!open) return undefined;

    let canceled = false;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const data = await fetchAccessKeys();
        if (!canceled) {
          setCredentials(Array.isArray(data.credentials) ? data.credentials : []);
        }
      } catch (err) {
        if (!canceled) {
          setError(describeAccessKeyError(err));
        }
      } finally {
        if (!canceled) {
          setLoading(false);
        }
      }
    };

    load();
    return () => { canceled = true; };
  }, [open]);

  if (!open) return null;

  const handleRegister = async () => {
    setRegistering(true);
    setError('');
    setNotice('');
    try {
      const data = await registerAccessKey(name);
      setCredentials(Array.isArray(data.credentials) ? data.credentials : []);
      setName('');
      setNotice('Access key added');
    } catch (err) {
      setError(describeAccessKeyError(err));
    } finally {
      setRegistering(false);
    }
  };

  const handleRemove = async (credentialID) => {
    setRemovingId(credentialID);
    setError('');
    setNotice('');
    try {
      const data = await removeAccessKey(credentialID);
      setCredentials(Array.isArray(data.credentials) ? data.credentials : []);
      setNotice('Access key removed');
    } catch (err) {
      setError(describeAccessKeyError(err));
    } finally {
      setRemovingId('');
    }
  };

  return (
    <div
      className="modal d-block"
      role="dialog"
      aria-modal="true"
      style={{ background: 'rgba(0,0,0,0.55)' }}
      onClick={onClose}
    >
      <div
        className="modal-dialog modal-dialog-centered modal-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div
          className="modal-content"
          style={darkMode ? { background: '#1b1b1b', color: '#e0e0e0', border: '1px solid #2a2a2a' } : undefined}
        >
          <div className="modal-header">
            <h5 className="modal-title">Access Keys</h5>
            <button type="button" className="btn-close" onClick={onClose} />
          </div>
          <div className="modal-body">
            <p style={{ marginBottom: 12, fontSize: 14, opacity: 0.8 }}>
              Add one or more WebAuthn access keys for passwordless sign-in. Each key stays attached to your current account.
            </p>

            {!support.supported && (
              <div className="alert alert-warning py-2" role="alert">
                {support.reason}
              </div>
            )}

            <div className="d-flex flex-wrap align-items-end" style={{ gap: 12, marginBottom: 16 }}>
              <div style={{ flex: '1 1 260px' }}>
                <label className="form-label">Label</label>
                <input
                  type="text"
                  className="form-control"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="MacBook, iPhone, YubiKey..."
                  maxLength={80}
                  disabled={registering || !support.supported}
                />
              </div>
              <button
                type="button"
                className="btn btn-primary"
                disabled={registering || !support.supported}
                onClick={handleRegister}
              >
                {registering ? 'Adding…' : 'Add access key'}
              </button>
            </div>

            {error && (
              <div className="alert alert-danger py-2" role="alert">
                {error}
              </div>
            )}
            {notice && (
              <div className="alert alert-success py-2" role="alert">
                {notice}
              </div>
            )}

            <div className="table-responsive">
              <table className={`table table-sm ${darkMode ? 'table-dark' : ''}`} style={{ marginBottom: 0 }}>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Device</th>
                    <th>Created</th>
                    <th>Last used</th>
                    <th style={{ width: 1 }} />
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr>
                      <td colSpan="5" style={{ opacity: 0.75 }}>Loading access keys…</td>
                    </tr>
                  )}
                  {!loading && credentials.length === 0 && (
                    <tr>
                      <td colSpan="5" style={{ opacity: 0.75 }}>No access keys registered yet.</td>
                    </tr>
                  )}
                  {!loading && credentials.map((credential) => (
                    <tr key={credential.credentialID}>
                      <td>
                        <div>{credential.name || 'Access key'}</div>
                        <div style={{ fontSize: 12, opacity: 0.65 }}>{credential.credentialID.slice(0, 18)}…</div>
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {credential.deviceType === 'multiDevice' ? 'Synced' : 'Single device'}
                        {credential.backedUp ? ' • Backed up' : ''}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>{formatDate(credential.createdAt)}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{formatDate(credential.lastUsedAt)}</td>
                      <td className="text-end">
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-danger"
                          disabled={removingId === credential.credentialID}
                          onClick={() => handleRemove(credential.credentialID)}
                        >
                          {removingId === credential.credentialID ? 'Removing…' : 'Remove'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    </div>
  );
}
