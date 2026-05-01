'use client';

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

  const connect = useCallback(() => {
    if (!executionId) return;

    // Close existing connection
    if (wsRef.current) {
      wsRef.current.close();
    }

    // Create WebSocket connection.
    //
    // In prod (behind ingress) the engine is routed at /runloop/rl/*
    // on the SAME host as the browser, so derive from window.location.
    // In dev, override via NEXT_PUBLIC_ENGINE_WS_HOST=localhost:8092 to
    // bypass the Next.js rewrite layer (WS doesn't proxy through Next).
    const isBrowser = typeof window !== 'undefined';
    const protocol = isBrowser && window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const envHost = process.env.NEXT_PUBLIC_ENGINE_WS_HOST;
    const host = envHost || (isBrowser ? window.location.host : 'localhost:8092');
    // When using the ingress host, prefix the engine path with /runloop
    // so it hits the carve-out route; direct dev host uses /rl/ws/* raw.
    const pathPrefix = envHost ? '' : (isBrowser ? '/runloop' : '');
    const wsUrl = `${protocol}//${host}${pathPrefix}/rl/ws/executions/${executionId}`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('[WebSocket] Connected:', executionId);
      setIsConnected(true);
      setError(null);
    };

    ws.onmessage = (event) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data);
        console.log('[WebSocket] Message:', message);

        // Call general message handler
        onMessage?.(message);

        // Call specific handlers
        if (message.status) {
          onStatusChange?.(message.status);
        }
        if (message.logs) {
          onLogs?.(message.logs);
        }
        if (message.output) {
          onOutput?.(message.output);
        }
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
      console.log('[WebSocket] Disconnected');
      setIsConnected(false);

      // Auto-reconnect after 3 seconds
      reconnectTimeoutRef.current = setTimeout(() => {
        console.log('[WebSocket] Attempting to reconnect...');
        connect();
      }, 3000);
    };

    wsRef.current = ws;
  }, [executionId, onMessage, onStatusChange, onLogs, onOutput]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
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
