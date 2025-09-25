// Nouvelle version: nécessite passage d'une fonction sendWs et écoute des messages wsMain.messages côté appelant.
import { writeItemsToIndexedDB } from './syncItemsToIndexedDB.js';

export function refreshPriceViaWs(sendWs, itemId, opts = {}) {
  const { onSent } = opts;
  try {
    // Utiliser bypassUpdatePrice pour autoriser l'envoi bloqué par le wrapper
    if (typeof sendWs === 'function') {
      const payload = { type:'updatePrice', id: itemId };
      // Certains wrappers acceptent (data, opts)
      const maybe = sendWs(JSON.stringify(payload), { bypassUpdatePrice: true });
      if (onSent) try { onSent(payload); } catch {}
      return maybe;
    }
  } catch {}
}

// Helper pour traiter un message updatePrice et maj IDB local (appelé depuis Autocomplete au parsing WS)
export async function handleUpdatePriceMessage(parsed) {
  if (!parsed || parsed.type !== 'updatePrice' || !parsed.ok || typeof parsed.id === 'undefined') return;
  if (typeof parsed.price !== 'number') return;
  // Lire items existants, mettre à jour un seul et ré-écrire (petit volume acceptable)
  try {
  const { getAllItemsFromIDB } = await import('./syncItemsToIndexedDB.js');
    const items = await getAllItemsFromIDB();
    let changed = false;
    const updated = items.map(it => {
      if (it.id === parsed.id) { changed = true; return { ...it, price: parsed.price }; }
      return it;
    });
    if (changed) await writeItemsToIndexedDB(updated);
  } catch {}
}
