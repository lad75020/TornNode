import { useEffect, useRef, useState, useCallback } from 'react';

export default function useAppWebSocket(
  path,
  enabled,
  onUnauthorized,
  { heartbeatMs = 25000, reconnectMs = 1000, maxMessages = 800 } = {}
) {
  const wsRef = useRef(null);
  const [messages, setMessages] = useState([]);
  const [status, setStatus] = useState('closed');

  useEffect(() => {
    if (!enabled) {
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
      const url = `${base}${path}`;
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
        setMessages(prev => {
          const max = Number(maxMessages) > 0 ? Number(maxMessages) : 800;
          let base = prev;
          if (base.length >= max) base = base.slice(-max + 1);
          return [...base, ev.data];
        });
      };
      wsRef.current.onclose = (event) => {
        cleanup();
        if (event.code === 4401) { shouldReconnect = false; onUnauthorized?.(); return; }
        if (shouldReconnect) schedule();
      };
      wsRef.current.onerror = () => { try { wsRef.current.close(); } catch {}; };
    }
    function schedule() { setTimeout(() => { if (shouldReconnect) open(); }, reconnectMs); }
    function cleanup() { setStatus('closed'); if (pingTimer) clearInterval(pingTimer); }
    open();
    return () => { shouldReconnect = false; cleanup(); try { wsRef.current?.close(); } catch {}; wsRef.current = null; };
  }, [path, enabled, onUnauthorized, heartbeatMs, reconnectMs]);

  const send = useCallback((msg) => { try { if (wsRef.current?.readyState === 1) wsRef.current.send(msg); } catch {} }, []);
  return { wsRef, messages, status, send, setMessages };
}
