import { useEffect, useRef, useState, useMemo } from 'react';

let cachedJsonView = null;
async function ensureJsonView() {
  if (cachedJsonView) return cachedJsonView;
  const mod = await import('./jsonview.js');
  cachedJsonView = mod.renderJSON ? mod : (mod.default ? mod.default : mod);
  return cachedJsonView;
}

export default function JsonPreview({ value, className, style, enableFilter = true, filterPlaceholder = 'Filter (substring, case-insensitive)...' }) {
  const containerRef = useRef(null);
  const [failed, setFailed] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [filter, setFilter] = useState('');

  const filteredValue = useMemo(() => {
    if (!filter || !value) return value;
    const f = filter.toLowerCase();
    try {
      if (value && Array.isArray(value.items)) {
        const items = value.items.filter(it => {
          try { return JSON.stringify(it).toLowerCase().includes(f); } catch { return false; }
        });
        return { ...value, items, filteredCount: items.length, originalCount: value.items.length, __filtered: true };
      }
      const pass = JSON.stringify(value).toLowerCase().includes(f);
      return pass ? value : { __filteredOut: true };
    } catch {
      return value;
    }
  }, [filter, value]);

  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.innerHTML = '';
    setFailed(false);
    (async () => {
      try {
        const jsonview = await ensureJsonView();
        if (typeof jsonview.renderJSON !== 'function') throw new Error('renderJSON missing');
        const safe = JSON.parse(JSON.stringify(filteredValue, (k, v) => {
          if (Array.isArray(v) && v.length > 1500) {
            return v.slice(0, 1500).concat([{ __truncated: true, originalLength: v.length }]);
          }
            return v;
        }));
        jsonview.renderJSON({ root: safe }, containerRef.current);
      } catch (e) {
        setFailed(true);
        setErrorMsg(e.message || String(e));
      }
    })();
  }, [filteredValue]);

  const filterUi = enableFilter ? (
    <div style={{ marginBottom: 6 }}>
      <input
        type="text"
        placeholder={filterPlaceholder}
        value={filter}
        onChange={e => setFilter(e.target.value)}
        style={{ width: '100%', fontSize: 12, padding: '4px 6px', border: '1px solid #444', background: '#1b1b1b', color: '#ddd', borderRadius: 4 }}
      />
      {filteredValue && filteredValue.__filtered && (
        <div style={{ fontSize: 10, opacity: 0.7, marginTop: 2 }}>
          Showing {filteredValue.filteredCount} / {filteredValue.originalCount} items
        </div>
      )}
      {filteredValue && filteredValue.__filteredOut && (
        <div style={{ fontSize: 10, opacity: 0.7, marginTop: 2 }}>
          No match for filter
        </div>
      )}
    </div>
  ) : null;

  if (failed) {
    return (
      <div className={className} style={style}>
        {filterUi}
        <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, background: '#111', color: '#f55', padding: 8 }}>
JSON render fallback (raw)\nReason: {errorMsg}\n---\n{(() => { try { return JSON.stringify(filteredValue, null, 2); } catch { return 'Unserializable'; } })()}
        </pre>
      </div>
    );
  }
  return (
    <div className={className} style={style}>
      {filterUi}
      <div ref={containerRef} />
    </div>
  );
}
