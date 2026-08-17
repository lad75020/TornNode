import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { sanitizeToastDetail, subscribeToasts } from './toastBus.js';

let nextToastId = 1;
const DEFAULT_TTL = 6000;

function makeToast(detail) {
  const safeDetail = sanitizeToastDetail(detail) || {};
  const ttl = safeDetail.ttl || DEFAULT_TTL;
  return {
    id: safeDetail.key || `toast-${nextToastId++}`,
    ...safeDetail,
    ttl,
    initialTtl: ttl
  };
}

export default function ToastHost() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const unsubscribe = subscribeToasts(event => {
      const incoming = makeToast(event.detail);
      setToasts(previous => {
        if (incoming.replace && incoming.key) {
          const existingIndex = previous.findIndex(toast => toast.key === incoming.key);
          if (existingIndex >= 0) {
            const updated = [...previous];
            updated[existingIndex] = {
              ...updated[existingIndex],
              ...incoming,
              id: updated[existingIndex].id,
              ttl: incoming.persistent ? updated[existingIndex].ttl : incoming.ttl,
              initialTtl: incoming.persistent ? updated[existingIndex].initialTtl : incoming.initialTtl
            };
            return updated;
          }
        }
        return [...previous, incoming].slice(-20);
      });
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!toasts.length) return undefined;
    const interval = window.setInterval(() => {
      setToasts(previous => previous
        .map(toast => {
          if (toast.persistent) return toast;
          return { ...toast, ttl: toast.ttl - 1000 };
        })
        .filter(toast => toast.persistent || toast.ttl > 0));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [toasts.length]);

  const dismiss = id => setToasts(previous => previous.filter(toast => toast.id !== id));

  return createPortal(
    <div
      role="region"
      aria-label="Notifications"
      aria-live="polite"
      className="dashboard-notification-region"
      data-testid="notification-region"
    >
      {toasts.map(toast => {
        const progress = toast.persistent
          ? 100
          : Math.max(0, Math.min(100, (toast.ttl / (toast.initialTtl || DEFAULT_TTL)) * 100));
        const messageRole = toast.kind === 'error' ? 'alert' : 'status';
        return (
          <div
            key={toast.id}
            role={messageRole}
            data-testid="dashboard-toast"
            data-toast-key={toast.key || undefined}
            className={`dashboard-toast dashboard-toast-${toast.kind}`}
          >
            <div className="dashboard-toast-header">
              <strong>{toast.title}</strong>
              <button
                type="button"
                className="btn-close btn-close-white"
                aria-label={`Dismiss ${toast.title}`}
                onClick={() => dismiss(toast.id)}
              />
            </div>
            {toast.body && <div className="dashboard-toast-body">{toast.body}</div>}
            {toast.raw && (
              <pre className="dashboard-toast-details">{JSON.stringify(toast.raw, null, 2)}</pre>
            )}
            {!toast.persistent && (
              <div className="dashboard-toast-progress" aria-hidden="true">
                <div style={{ width: `${progress}%` }} />
              </div>
            )}
          </div>
        );
      })}
    </div>,
    document.body
  );
}
