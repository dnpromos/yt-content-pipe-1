import { useEffect, useRef, useCallback } from 'react';

type MessageHandler = (data: Record<string, unknown>) => void;

export function useSocket(onMessage: MessageHandler) {
  const wsRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef(onMessage);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  handlersRef.current = onMessage;

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const wsUrl = import.meta.env.DEV
      ? `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`
      : 'ws://localhost:8000/ws';
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => console.log('[ws] connected');
    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        handlersRef.current(data);
      } catch { /* ignore */ }
    };
    ws.onclose = () => {
      if (!mountedRef.current) return;
      console.log('[ws] disconnected, reconnecting in 2s...');
      reconnectRef.current = setTimeout(connect, 2000);
    };

    wsRef.current = ws;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      wsRef.current?.close();
    };
  }, [connect]);
}
