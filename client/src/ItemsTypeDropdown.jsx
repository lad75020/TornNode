import { useEffect, useState } from 'react';
import { getAllItemsFromIDB } from './syncItemsToIndexedDB.js';
import useWsMessageBus from './hooks/useWsMessageBus.js';

/**
 * Dropdown listing unique item "type" values from ItemsDB.
 * Props:
 *  - wsMessages?: string[] (optional, for live update on getAllTornItems)
 *  - onTypeChange?: (type: string) => void
 */
export default function ItemsTypeDropdown({ wsMessages, onTypeChange }) {
  const [types, setTypes] = useState([]);
  const [selected, setSelected] = useState('');

  const computeTypes = (arr) => {
    try {
      const s = new Set();
      for (const it of Array.isArray(arr) ? arr : []) {
        const t = it && typeof it.type === 'string' ? it.type.trim() : '';
        if (t) s.add(t);
      }
      const out = Array.from(s).sort((a, b) => a.localeCompare(b));
      setTypes(out);
      if (out.length > 0 && selected && !out.includes(selected)) {
        setSelected('');
      }
    } catch {
      setTypes([]);
    }
  };

  // Initial load from IndexedDB
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const items = await getAllItemsFromIDB();
      if (!cancelled) computeTypes(items);
    })();
    return () => { cancelled = true; };
  }, []);

  // Listen to localStorage sync marker to refresh across tabs/updates
  useEffect(() => {
    const onStorage = async (ev) => {
      if (ev.key === 'itemsLastSync') {
        const items = await getAllItemsFromIDB();
        computeTypes(items);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Live update on inbound WS items (optional)
  useWsMessageBus(wsMessages, {
    onGetAllTornItems: (parsed) => {
      if (parsed && parsed.ok && Array.isArray(parsed.items)) computeTypes(parsed.items);
    }
  });

  const handleChange = (e) => {
    const value = e.target.value;
    setSelected(value);
    try { onTypeChange && onTypeChange(value); } catch {}
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label className="form-label" style={{ fontSize: 12, marginBottom: 0 }}>Item Type</label>
      <select
        className="form-select form-select-sm"
        value={selected}
        onChange={handleChange}
        style={{ minWidth: 220 }}
      >
        <option value="">All types</option>
        {types.map(t => (
          <option key={t} value={t}>{t}</option>
        ))}
      </select>
    </div>
  );
}

