// The app's base path (next.config.js `basePath`, from BASE_PATH).
// Client code must build URLs from this, never from a literal '/runloop':
// fetch() and plain <a href> do not get the base path added by Next.
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
