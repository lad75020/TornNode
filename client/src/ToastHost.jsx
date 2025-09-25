import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { subscribeToasts } from './toastBus.js';

export default function ToastHost() {
  const [toasts, setToasts] = useState([]); // {id, ttl, kind, title, body, raw}

  useEffect(() => {
    const unsub = subscribeToasts(ev => {
      const t = ev.detail || {};
      setToasts(prev => {
        if (t.replace && t.key) {
          const existingIdx = prev.findIndex(x => x.key === t.key);
          if (existingIdx >= 0) {
            const clone = [...prev];
            clone[existingIdx] = { ...clone[existingIdx], ...t, id: clone[existingIdx].id, ttl: t.ttl || clone[existingIdx].ttl || 6000, initialTtl: t.ttl || clone[existingIdx].initialTtl || 6000 };
            return clone;
          }
          return [...prev, { id: t.key, ttl: t.ttl || 6000, initialTtl: t.ttl || 6000, ...t }];
        }
        return [...prev, { id: Math.random().toString(36).slice(2), ttl: t.ttl || 6000, initialTtl: t.ttl || 6000, ...t }];
      });
    });
    return unsub;
  }, []);

  // TTL decrement (isolated re-render not affecting Main)
  useEffect(() => {
    if (!toasts.length) return;
    const int = setInterval(() => {
      setToasts(prev => prev
        .map(t => {
          if (t.persistent) return t; // pas de décrément pour les persistants
          return { ...t, ttl: t.ttl - 1000 };
        })
        .filter(t => t.persistent || t.ttl > 0));
    }, 1000);
    return () => clearInterval(int);
  }, [toasts.length]);

  return createPortal(
    <div style={{ position:'fixed', top:10, right:10, zIndex:3000, display:'flex', flexDirection:'column', gap:8, maxWidth:320, pointerEvents:'none' }}>
      {toasts.map(t => (
        <div key={t.id} className={`border rounded shadow-sm p-2 bg-${t.kind==='success'?'success':t.kind==='error'?'danger':t.kind==='info'?'info':'secondary'} text-white`} style={{ fontSize:12, opacity:0.95, pointerEvents:'auto' }}>
          <div className="d-flex justify-content-between align-items-start" style={{ gap:6 }}>
            <strong>{t.title}</strong>
            <button type="button" className="btn-close btn-close-white" style={{ filter:'invert(1) grayscale(1)', opacity:0.7 }} onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}></button>
          </div>
          <div>{t.body}</div>
          {t.raw && <pre style={{ margin:0, marginTop:4, maxHeight:120, overflow:'auto', background:'rgba(0,0,0,0.15)', padding:4, borderRadius:4 }}>{JSON.stringify(t.raw, null, 2)}</pre>}
          {!t.persistent && (
            <div style={{ height:3, background:'rgba(255,255,255,0.3)', marginTop:4, position:'relative', overflow:'hidden' }}>
              <div style={{ position:'absolute', top:0, left:0, height:'100%', width:`${(t.ttl/(t.initialTtl||6000))*100}%`, background:'rgba(255,255,255,0.85)', transition:'width 1000ms linear' }} />
            </div>
          )}
        </div>
      ))}
    </div>,
    document.body
  );
}
