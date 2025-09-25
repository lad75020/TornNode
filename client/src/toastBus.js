// Simple event bus for toasts to decouple from Main re-renders
const bus = typeof window !== 'undefined' ? new EventTarget() : null;

export function pushToast(detail) {
  try { bus && bus.dispatchEvent(new CustomEvent('toast', { detail })); } catch(_) {}
}

// push ou remplace un toast via une clé stable
export function pushOrReplaceToast(detail) {
  if (!detail || !detail.key) return pushToast(detail);
  try { bus && bus.dispatchEvent(new CustomEvent('toast', { detail: { replace: true, ...detail } })); } catch(_) {}
}

export function subscribeToasts(handler) {
  if (!bus) return () => {};
  bus.addEventListener('toast', handler);
  return () => bus.removeEventListener('toast', handler);
}

export default { pushToast, subscribeToasts };
