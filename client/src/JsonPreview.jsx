import { useEffect, useRef, useState, useMemo, useCallback } from 'react';

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
  const jsonViewInstanceRef = useRef(null); // Store the jsonview instance to preserve expansion state
  const lastRenderedValueRef = useRef(null); // Track the last rendered value to prevent unnecessary re-renders

  const filteredValue = useMemo(() => {
    if (!filter || !value) return value;
    const f = filter.toLowerCase();
    try {
      // Prefer filtering the nested collection value.root.items if present
      if (value && value.root && Array.isArray(value.root.items)) {
        const items = value.root.items.filter(it => {
          try { return JSON.stringify(it).toLowerCase().includes(f); } catch { return false; }
        });
        return { ...value, root: { ...value.root, items }, filteredCount: items.length, originalCount: value.root.items.length, __filtered: true };
      }
      // Alternate payload shape support: value.object.root.items
      if (value && value.object && value.object.root && Array.isArray(value.object.root.items)) {
        const items = value.object.root.items.filter(it => {
          try { return JSON.stringify(it).toLowerCase().includes(f); } catch { return false; }
        });
        return { ...value, object: { ...value.object, root: { ...value.object.root, items } }, filteredCount: items.length, originalCount: value.object.root.items.length, __filtered: true };
      }
      // Fallback: filter a top-level items array if present
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
    
    // Create a stable string representation of the filtered value to compare
    const currentValueStr = JSON.stringify(filteredValue);
    
    // Only re-render if the actual data has changed
    if (lastRenderedValueRef.current === currentValueStr) {
      return; // No change in data, skip re-rendering to preserve expansion state
    }
    
    // Capture current expansion state before clearing
    const expansionState = {};
    const captureExpansionState = (container) => {
      const expandedNodes = container.querySelectorAll('.fa-caret-down');
      expandedNodes.forEach((node) => {
        const line = node.closest('.line');
        if (line) {
          const keyElement = line.querySelector('.json-key');
          if (keyElement) {
            const key = keyElement.textContent;
            const depth = parseInt(line.style.marginLeft || '0') / 18;
            expansionState[`${depth}-${key}`] = true;
          }
        }
      });
    };
    
    if (containerRef.current.children.length > 0) {
      captureExpansionState(containerRef.current);
    }
    
    containerRef.current.innerHTML = '';
    setFailed(false);
    lastRenderedValueRef.current = currentValueStr;
    
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
        // Display only the nested collection at value.root.items if available; otherwise, display the full object
        console.log(JSON.stringify(safe));
        const toDisplay = (safe && safe.items && Array.isArray(safe.items))
          ? safe.items
          : (safe && safe.object && safe.object.root && Array.isArray(safe.object.root.items))
            ? safe.object.root.items
            : safe;
        const instance = jsonview.renderJSON({ root: toDisplay }, containerRef.current);
        jsonViewInstanceRef.current = instance;
        
        // Restore expansion state after a short delay to ensure DOM is ready
        setTimeout(() => {
          const restoreExpansionState = (container) => {
            const collapsedNodes = container.querySelectorAll('.fa-caret-right');
            collapsedNodes.forEach((node) => {
              const line = node.closest('.line');
              if (line) {
                const keyElement = line.querySelector('.json-key');
                if (keyElement) {
                  const key = keyElement.textContent;
                  const depth = parseInt(line.style.marginLeft || '0') / 18;
                  const stateKey = `${depth}-${key}`;
                  if (expansionState[stateKey]) {
                    // Simulate click to expand
                    const caretIcon = line.querySelector('.caret-icon');
                    if (caretIcon) {
                      caretIcon.click();
                    }
                  }
                }
              }
            });
          };
          
          if (containerRef.current && Object.keys(expansionState).length > 0) {
            restoreExpansionState(containerRef.current);
          }
        }, 10);
        
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
