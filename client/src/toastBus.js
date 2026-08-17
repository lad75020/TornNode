// Simple event bus for toasts to decouple from Main re-renders.
const bus = typeof window !== 'undefined' && typeof EventTarget !== 'undefined' ? new EventTarget() : null;
const MAX_TEXT_LENGTH = 600;
const MAX_KEY_LENGTH = 120;
const MAX_TTL_MS = 10 * 60 * 1000;
const SENSITIVE_KEY = /pass(word|key)?|token|secret|authorization|cookie|session|credential/i;
const ALLOWED_KINDS = new Set(['success', 'error', 'warning', 'info']);

function safeText(value, fallback = '') {
  if (value == null) return fallback;
  return String(value).slice(0, MAX_TEXT_LENGTH);
}

function sanitizeDiagnostic(value, depth = 0, seen = new WeakSet()) {
  if (value == null || depth > 3) return value == null ? value : '[truncated]';
  if (typeof value === 'string') return value.slice(0, MAX_TEXT_LENGTH);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value !== 'object') return undefined;
  if (seen.has(value)) return '[circular]';
  seen.add(value);

  if (Array.isArray(value)) {
    return value.slice(0, 20).map(item => sanitizeDiagnostic(item, depth + 1, seen));
  }

  const result = {};
  for (const [key, child] of Object.entries(value).slice(0, 40)) {
    if (SENSITIVE_KEY.test(key)) continue;
    const sanitized = sanitizeDiagnostic(child, depth + 1, seen);
    if (sanitized !== undefined) result[key] = sanitized;
  }
  return result;
}

export function sanitizeToastDetail(detail) {
  if (!detail || typeof detail !== 'object') return null;
  const ttl = Number(detail.ttl);
  const normalized = {
    key: detail.key == null ? undefined : safeText(detail.key).slice(0, MAX_KEY_LENGTH),
    kind: ALLOWED_KINDS.has(detail.kind) ? detail.kind : 'info',
    title: safeText(detail.title, 'Dashboard notification'),
    body: safeText(detail.body),
    persistent: Boolean(detail.persistent),
    ttl: Number.isFinite(ttl) && ttl > 0 ? Math.min(ttl, MAX_TTL_MS) : 6000,
    replace: Boolean(detail.replace)
  };
  if (detail.raw !== undefined) normalized.raw = sanitizeDiagnostic(detail.raw);
  return normalized;
}

export function pushToast(detail) {
  const safeDetail = sanitizeToastDetail(detail);
  if (!safeDetail) return;
  try {
    bus?.dispatchEvent(new CustomEvent('toast', { detail: safeDetail }));
  } catch (_) { /* notifications must never block dashboard work */ }
}

// Push or replace a toast via a stable operation key.
export function pushOrReplaceToast(detail) {
  const safeDetail = sanitizeToastDetail(detail);
  if (!safeDetail) return;
  if (!safeDetail.key) return pushToast(safeDetail);
  try {
    bus?.dispatchEvent(new CustomEvent('toast', { detail: { ...safeDetail, replace: true } }));
  } catch (_) { /* notifications must never block dashboard work */ }
}

export function subscribeToasts(handler) {
  if (!bus || typeof handler !== 'function') return () => {};
  bus.addEventListener('toast', handler);
  return () => bus.removeEventListener('toast', handler);
}

export default { pushToast, pushOrReplaceToast, subscribeToasts };
