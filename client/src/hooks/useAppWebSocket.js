import { useEffect, useRef, useState, useCallback } from 'react';

export default function useAppWebSocket(path, token, { heartbeatMs = 25000, reconnectMs = 1000 } = {}) {
  const wsRef = useRef(null);
  const [messages, setMessages] = useState([]);
  const [status, setStatus] = useState('closed');

  useEffect(() => {
    if (!token) {
      if (wsRef.current) {
        try { wsRef.current.close(); } catch {}
        wsRef.current = null;
      }
      return;
    }
    let shouldReconnect = true;
    let pingTimer;

    function resolveWsBase() {
      try {
        if (typeof window !== 'undefined' && window.location?.host) {
          const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
          return `${proto}://${window.location.host}`;
        }
      } catch {}
      return 'wss://'+ (import.meta.env?.VITE_FALLBACK_HOST || 'localhost');
    }

    function open() {
      const base = resolveWsBase();
      const url = `${base}${path}?token=${encodeURIComponent(token)}`;
      try { wsRef.current = new WebSocket(url); } catch { schedule(); return; }
      wsRef.current.onopen = () => {
        setStatus('open');
        if (heartbeatMs) {
          pingTimer = setInterval(() => {
            try { if (wsRef.current?.readyState === 1) wsRef.current.send('ping'); } catch {}
          }, heartbeatMs);
        }
      };
      wsRef.current.onmessage = (ev) => {
        if (ev.data === 'pong') return;
        // Capture userID session message et stocker
        try {
          if (typeof ev.data === 'string' && ev.data.startsWith('{')) {
            const parsed = JSON.parse(ev.data);
            if (parsed && parsed.type === 'session' && parsed.userID) {
              try { if (!localStorage.getItem('userID')) localStorage.setItem('userID', String(parsed.userID)); } catch {}
            }
          }
        } catch {}
        setMessages(prev => [...prev, ev.data]);
      };
      wsRef.current.onclose = () => { cleanup(); if (shouldReconnect) schedule(); };
      wsRef.current.onerror = () => { try { wsRef.current.close(); } catch {}; };
    }
    function schedule() { setTimeout(() => { if (shouldReconnect) open(); }, reconnectMs); }
    function cleanup() { setStatus('closed'); if (pingTimer) clearInterval(pingTimer); }
    open();
    return () => { shouldReconnect = false; cleanup(); try { wsRef.current?.close(); } catch {}; wsRef.current = null; };
  }, [path, token, heartbeatMs, reconnectMs]);

  const send = useCallback((msg) => { try { if (wsRef.current?.readyState === 1) wsRef.current.send(msg); } catch {} }, []);
  return { wsRef, messages, status, send, setMessages };
}
