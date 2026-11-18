import { ENGINE_BASE_PATH } from './engine-path';
// Engine WebSocket URL, built from configuration rather than literals.
//
// Production: the ingress routes <BASE_PATH>/rl/* on the browser's own host
// straight to the engine (WebSocket upgrades don't pass through Next).
// Development: set NEXT_PUBLIC_ENGINE_WS_HOST=localhost:<engine port> to
// talk to the engine directly, without the base path.
export function engineWsUrl(path: string): string {
  const isBrowser = typeof window !== 'undefined';
  const protocol = isBrowser && window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const envHost = process.env.NEXT_PUBLIC_ENGINE_WS_HOST;
  const host = envHost || (isBrowser ? window.location.host : 'localhost:8080');
  const basePath = envHost ? '' : (process.env.NEXT_PUBLIC_BASE_PATH || '');
  return `${protocol}//${host}${basePath}${ENGINE_BASE_PATH}/ws/${path.replace(/^\//, '')}`;
}
