import React, { useEffect, useRef, useState } from 'react';
import { openDB } from 'idb';

/**
 * Tableau réutilisable d'affichage des listings bazaar surveillés.
 * Props:
 *  - bazaarRows: Array<{itemId,itemName,price,quantity,time}>
 *  - watchedItems: number[]
 *  - priceThresholds: Record<itemId, number>
 *  - blinkingItems: Set<number>
 *  - onThresholdChange: (itemId:number, newValue:number)=>void
 *  - onUnwatch: (itemId:number)=>void
 */
export default function BazaarTable({
  bazaarRows,
  watchedItems,
  priceThresholds,
  blinkingItems,
  onThresholdChange,
  onUnwatch,
  sendWs // WebSocket send function (principal /ws)
}) {
  // Mémorise le dernier prix vu pour chaque item afin d'afficher une flèche tendance.
  const prevPricesRef = useRef(new Map()); // itemId -> last price
  const [priceChanges, setPriceChanges] = useState({}); // itemId -> 'up' | 'down' | 'same'
  const lastSyncedRef = useRef(new Map()); // itemId -> last price persisted (avoid duplicate writes)

  async function updateItemPriceInIDB(id, name, price) {
    try {
      const db = await openDB('ItemsDB', 1, {
        upgrade(db) {
          if (!db.objectStoreNames.contains('items')) {
            db.createObjectStore('items', { keyPath: 'id' });
          }
        }
      });
      const tx = db.transaction('items', 'readwrite');
      const store = tx.store;
      const existing = await store.get(id) || { id };
      // Solution C: mettre à jour le nom si un nouveau nom non vide arrive (corrige fallback ID affiché)
      if (name && typeof name === 'string' && name.trim() && name !== existing.name) {
        existing.name = name;
      } else if (!existing.name && name) {
        existing.name = name;
      }
      existing.price = price;
      existing._updatedAt = Date.now();
      await store.put(existing);
      await tx.done;
    } catch(e) {
      console.warn('[BazaarTable] Échec maj ItemsDB', id, e.message);
    }
  }

  // triggerServerPriceUpdate supprimé: les mises à jour sont maintenant faites côté serveur (wsBazaarPrice)

  useEffect(() => {
    const changes = {};
    for (const r of bazaarRows) {
      if (!watchedItems.includes(r.itemId)) continue;
      const prev = prevPricesRef.current.get(r.itemId);
      if (typeof prev === 'number' && typeof r.price === 'number') {
        if (r.price > prev) changes[r.itemId] = 'up';
        else if (r.price < prev) changes[r.itemId] = 'down';
        else changes[r.itemId] = 'same';
      } else {
        changes[r.itemId] = 'same';
      }
    }
    // Met à jour après calcul pour comparer toujours avec l'ancienne valeur.
    for (const r of bazaarRows) {
      if (typeof r.price === 'number') prevPricesRef.current.set(r.itemId, r.price);
    }
    setPriceChanges(changes);
  }, [bazaarRows, watchedItems]);

  // Effet: sur changement de prix (up/down) mettre à jour ItemsDB + serveur
  useEffect(() => {
    for (const r of bazaarRows) {
      if (!watchedItems.includes(r.itemId)) continue;
      if (typeof r.price !== 'number' || r.price <= 0) continue;
      const lastSyncedPrice = lastSyncedRef.current.get(r.itemId);
      const state = priceChanges[r.itemId];
      // Déclenche uniquement si up/down (ou première fois) et prix différent du lastSynced
      if ((state === 'up' || state === 'down' || lastSyncedPrice == null) && lastSyncedPrice !== r.price) {
        updateItemPriceInIDB(r.itemId, r.itemName, r.price);
        // Debounce simple: empêche renvoi si même prix déjà envoyé dans les 2s
  // plus de WS updatePrice ici: serveur fait la maj automatiquement
        lastSyncedRef.current.set(r.itemId, r.price);
      }
    }
  }, [priceChanges, bazaarRows, watchedItems]);
  const rows = bazaarRows.filter(r => watchedItems.includes(r.itemId));
  if (!rows.length) return null;
  return (
    <div className="mb-4">
      <h5>Market Lowest price</h5>
      <div style={{ maxHeight: 260, overflowY: 'auto', overflowX: 'auto', border: '1px solid #ddd', borderRadius: 4 }}>
        <table className="table table-sm table-striped table-hover mb-0" style={{ fontSize: 12 }}>
          <thead className="table-light" style={{ position: 'sticky', top: 0 }}>
            <tr>
              <th style={{ width: 160 }}>Item</th>
              <th style={{ width: 110 }}>Price</th>
              <th style={{ width: 52, textAlign:'center' }}>Δ</th>
              <th style={{ width: 80 }}>Qty</th>
              <th style={{ width: 110 }}>Threshold</th>
              <th style={{ width: 46 }}>Open</th>
              <th style={{ width: 30 }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const threshold = Number(priceThresholds[r.itemId] || 0);
              const alert = r.price < threshold && threshold > 0;
              return (
                <tr key={i} className={(alert ? 'bazaar-alert ' : '') + (blinkingItems.has(r.itemId) ? 'bazaar-blink' : '')}>
                  <td>
                    {r.itemName || r.itemId}
                    <div style={{ fontSize:10, opacity:0.6 }}>#{r.itemId}</div>
                  </td>
                  <td>{r.price?.toLocaleString?.() ?? r.price}</td>
                  <td style={{ textAlign:'center', padding:'0 4px' }}>
                    {priceChanges[r.itemId] === 'down' && (
                      <span
                        style={{ color: '#0d8d20', fontWeight:500, fontSize:40, lineHeight:'42px', display:'inline-block', transform:'translateY(4px)' }}
                        title="Prix en baisse"
                        aria-label="Prix en baisse"
                      >↓</span>
                    )}
                    {priceChanges[r.itemId] === 'up' && (
                      <span
                        style={{ color: '#c40000', fontWeight:500, fontSize:40, lineHeight:'42px', display:'inline-block', transform:'translateY(4px)' }}
                        title="Prix en hausse"
                        aria-label="Prix en hausse"
                      >↑</span>
                    )}
                  </td>
                  <td>{r.quantity}</td>
                  <td>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={priceThresholds[r.itemId] ?? 0}
                      onChange={(e) => {
                        const digits = (e.target.value || '').replace(/\D+/g,'');
                        onThresholdChange(r.itemId, digits === '' ? 0 : Number(digits));
                      }}
                      style={{ width: '100%', fontSize: 11, padding: 2, textAlign:'right' }}
                    />
                  </td>
                  <td>
                    <button
                      onClick={() => {
                        const url = `https://www.torn.com/page.php?sid=ItemMarket#/market/view=search&itemID=${r.itemId}`;
                        try { window.open(url, 'tornMarket', 'noopener,noreferrer'); } catch(_) {}
                      }}
                      className="btn btn-sm btn-outline-primary"
                      style={{ padding: '2px 6px', lineHeight: 1, display:'inline-flex', alignItems:'center', gap:2, fontSize:11 }}
                      title="Ouvrir la page market de cet item"
                      aria-label={`Open market for item ${r.itemId}`}
                    >
                      <span style={{fontSize:12}}>↗</span>
                    </button>
                  </td>
                  <td>
                    <button
                      onClick={() => onUnwatch(r.itemId)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#c40000',
                        fontWeight: 700,
                        fontSize: 14,
                        lineHeight: 1,
                        padding: 0,
                        cursor: 'pointer'
                      }}
                      aria-label={`Remove item ${r.itemId}`}
                      title="Stop watching"
                    >
                      ✖
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
