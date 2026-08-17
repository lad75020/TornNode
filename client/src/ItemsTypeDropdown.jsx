import { useEffect, useState } from 'react';
import { getAllItemsFromIDB, isCompleteItem } from './syncItemsToIndexedDB.js';
import useWsMessageBus from './hooks/useWsMessageBus.js';

/**
 * Dropdown listing unique item "type" values from ItemsDB.
 * Props:
 *  - wsMessages?: string[] (optional, for live update on getAllTornItems)
 *  - onTypeChange?: (type: string) => void
 */
export default function ItemsTypeDropdown({ wsMessages, onTypeChange, value }) {
  const [types, setTypes] = useState([]);
  const [selected, setSelected] = useState(value || '');

  const computeTypes = (arr) => {
    // Never replace known-good options with an empty or malformed snapshot.
    if (!Array.isArray(arr) || arr.length === 0 || arr.some(item => !isCompleteItem(item))) {
      return false;
    }

    try {
      const s = new Set();
      for (const item of arr) {
        const type = typeof item.type === 'string' ? item.type.trim() : '';
        if (type) s.add(type);
      }
      const out = Array.from(s).sort((a, b) => a.localeCompare(b));
      setTypes(out);
      if (selected && !out.includes(selected)) {
        setSelected('');
        try { onTypeChange && onTypeChange(''); } catch {}
      }
      return true;
    } catch {
      return false;
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

  // Keep local selected in sync if parent controls value
  useEffect(() => {
    if (typeof value !== 'undefined' && value !== selected) {
      setSelected(value || '');
    }
  }, [value]);

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
      if (parsed && parsed.ok === true && Array.isArray(parsed.items)) {
        computeTypes(parsed.items);
      }
    }
  });

  const handleChange = (e) => {
    const nextValue = e.target.value;
    setSelected(nextValue);
    try { onTypeChange && onTypeChange(nextValue); } catch {}
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label htmlFor="item-type-filter" className="form-label" style={{ fontSize: 12, marginBottom: 0 }}>Item Type</label>
      <select
        id="item-type-filter"
        className="form-select form-select-sm"
        value={selected}
        onChange={handleChange}
        style={{ minWidth: 220 }}
      >
        <option value="">All types</option>
        {types.map(type => (
          <option key={type} value={type}>{type}</option>
        ))}
      </select>
    </div>
  );
}
