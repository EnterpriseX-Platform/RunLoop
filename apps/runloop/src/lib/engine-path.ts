// The engine's route prefix (engine BASE_PATH, default /rl). Server routes
// and the browser's WebSocket URL use this instead of a literal '/rl', the
// same setting next.config.js already uses for its rewrites.
export const ENGINE_BASE_PATH =
  process.env.ENGINE_BASE_PATH || process.env.NEXT_PUBLIC_ENGINE_BASE_PATH || '/rl';
