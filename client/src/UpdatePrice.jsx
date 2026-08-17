import {
  getAllItemsFromIDB,
  isCompleteItem,
  normalizeItemId,
  writeItemsToIndexedDB,
} from './syncItemsToIndexedDB.js';

function isValidPrice(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export function refreshPriceViaWs(sendWs, itemId, opts = {}) {
  const { onSent } = opts;
  const normalizedId = normalizeItemId(itemId);
  if (normalizedId === null || typeof sendWs !== 'function') return undefined;

  try {
    const payload = { type: 'updatePrice', id: normalizedId };
    const maybe = sendWs(JSON.stringify(payload), { bypassUpdatePrice: true });
    if (onSent) {
      try { onSent(payload); } catch {}
    }
    return maybe;
  } catch {}
  return undefined;
}

// Process a successful updatePrice response and update only its matching local row.
export async function handleUpdatePriceMessage(parsed) {
  if (!parsed || parsed.type !== 'updatePrice' || parsed.ok !== true) return;

  const normalizedId = normalizeItemId(parsed.id);
  if (normalizedId === null || !isValidPrice(parsed.price)) return;

  try {
    const items = await getAllItemsFromIDB();
    let changed = false;
    const updated = items.map((item) => {
      if (normalizeItemId(item && item.id) !== normalizedId) return item;
      const candidate = { ...item, id: normalizedId, price: parsed.price };
      if (!isCompleteItem(candidate)) return item;
      changed = true;
      return candidate;
    });

    if (!changed) return;
    return await writeItemsToIndexedDB(updated);
  } catch {}
}
