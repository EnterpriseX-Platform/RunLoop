'use client';
import { engineWsUrl } from '@/lib/engine-ws';

import { useEffect, useRef, useState, useCallback } from 'react';

interface WebSocketMessage {
  type: string;
  executionId: string;
  status?: string;
  durationMs?: number;
  output?: Record<string, unknown>;
  logs?: string;
  error?: string;
  timestamp: number;
}

interface UseWebSocketOptions {
  executionId: string | null;
  onMessage?: (message: WebSocketMessage) => void;
  onStatusChange?: (status: string) => void;
  onLogs?: (logs: string) => void;
  onOutput?: (output: Record<string, unknown>) => void;
}

export function useWebSocket({
  executionId,
  onMessage,
  onStatusChange,
  onLogs,
  onOutput,
}: UseWebSocketOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Handlers live in a ref so a parent passing inline callbacks does not
  // tear the socket down and reopen it on every render.
  const handlersRef = useRef({ onMessage, onStatusChange, onLogs, onOutput });
  handlersRef.current = { onMessage, onStatusChange, onLogs, onOutput };
  // Set when we close on purpose, so onclose does not schedule a reconnect.
  const closingRef = useRef(false);

  const connect = useCallback(() => {
    if (!executionId) return;
    closingRef.current = false;

    // Close existing connection
    if (wsRef.current) {
      wsRef.current.onclose = null; // replaced on purpose: no auto-reconnect
      wsRef.current.close();
    }

    // Create WebSocket connection.
    //
    // In prod (behind ingress) the engine is routed at <BASE_PATH>/rl/*
    // on the SAME host as the browser, so derive from window.location.
    // In dev, override via NEXT_PUBLIC_ENGINE_WS_HOST=localhost:8080 to
    // bypass the Next.js rewrite layer (WS doesn't proxy through Next).
    const wsUrl = engineWsUrl(`executions/${executionId}`);
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      setIsConnected(true);
      setError(null);
    };

    ws.onmessage = (event) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data);

        const h = handlersRef.current;
        h.onMessage?.(message);
        if (message.status) h.onStatusChange?.(message.status);
        if (message.logs) h.onLogs?.(message.logs);
        if (message.output) h.onOutput?.(message.output);
      } catch (err) {
        console.error('[WebSocket] Failed to parse message:', err);
      }
    };

    ws.onerror = (err) => {
      console.error('[WebSocket] Error:', err);
      setError('WebSocket connection error');
      setIsConnected(false);
    };

    ws.onclose = () => {
      setIsConnected(false);
      if (closingRef.current) return;

      // Auto-reconnect after 3 seconds
      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, 3000);
    };

    wsRef.current = ws;
  }, [executionId]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      closingRef.current = true;
      wsRef.current.close();
      wsRef.current = null;
    }

    setIsConnected(false);
  }, []);

  useEffect(() => {
    connect();

    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return {
    isConnected,
    error,
    connect,
    disconnect,
  };
}
