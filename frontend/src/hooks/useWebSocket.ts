import { useEffect, useRef, useCallback } from 'react';

type WSMessage = { type: string; channel?: string; event?: string; data?: unknown };

export function useWebSocket(
  token: string | null,
  onMessage?: (msg: WSMessage) => void
) {
  const wsRef      = useRef<WebSocket | null>(null);
  const retryRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const connect = useCallback(() => {
    if (!token || !mountedRef.current) return;

    // Use explicit WS URL in production, fall back to same-host proxy in dev
    const wsBase = import.meta.env.VITE_WS_URL
      ? import.meta.env.VITE_WS_URL
      : (() => {
          const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
          return `${protocol}//${window.location.host}/ws`;
        })();
    const ws = new WebSocket(`${wsBase}?token=${token}`);

    ws.onopen = () => {
      if (retryRef.current) { clearTimeout(retryRef.current); retryRef.current = null; }
    };

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data) as WSMessage;
        onMessage?.(data);
      } catch { /* ignore malformed frames */ }
    };

    ws.onclose = () => {
      if (mountedRef.current) {
        retryRef.current = setTimeout(connect, 3000);
      }
    };

    wsRef.current = ws;
  }, [token, onMessage]);

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      if (retryRef.current) clearTimeout(retryRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const subscribe = useCallback((channel: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'subscribe', channel }));
    }
  }, []);

  const unsubscribe = useCallback((channel: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'unsubscribe', channel }));
    }
  }, []);

  return { subscribe, unsubscribe };
}
