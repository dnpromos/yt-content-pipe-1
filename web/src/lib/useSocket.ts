import { useEffect, useRef, useCallback } from 'react';

type MessageHandler = (data: Record<string, unknown>) => void;

export function useSocket(onMessage: MessageHandler) {
  const wsRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef(onMessage);
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
      console.log('[ws] disconnected, reconnecting in 2s...');
      setTimeout(connect, 2000);
    };

    wsRef.current = ws;
  }, []);

  useEffect(() => {
    connect();
    return () => wsRef.current?.close();
  }, [connect]);
}
