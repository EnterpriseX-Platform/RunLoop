/** @type {import('next').NextConfig} */

// basePath defaults to '/runloop' to preserve the existing deployment
// (k8s probes hit /runloop, the external Apache rewrites /runloop/* to
// this app). Set BASE_PATH=/ (or another prefix) at deploy time to host
// at the root or under a different sub-path. Must start with '/' and
// not end with '/' (except the bare '/' which we coerce to '' for Next).
let basePath = process.env.BASE_PATH ?? '/runloop';
if (basePath === '/') basePath = '';
if (basePath !== '' && (!basePath.startsWith('/') || basePath.endsWith('/'))) {
  throw new Error(`BASE_PATH must be '/', '' or look like '/foo'; got '${basePath}'`);
}

const isProd = process.env.NODE_ENV === 'production';

// CORS allowlist for the API. In production, set ALLOWED_ORIGINS to a
// comma-separated list. We warn (not fatal) when ALLOWED_ORIGINS isn't
// set in production so an existing deployment doesn't crash on first
// boot just because the env hasn't been added yet — operators get a
// startup-time nudge to tighten the allowlist.
const allowedOriginsRaw = (process.env.ALLOWED_ORIGINS || '').trim();
let corsOrigin = '*';
if (allowedOriginsRaw) {
  if (isProd && allowedOriginsRaw.split(',').map((s) => s.trim()).includes('*')) {
    console.warn("[runloop] ALLOWED_ORIGINS contains '*' in production — consider tightening");
  }
  corsOrigin = allowedOriginsRaw.split(',')[0].trim();
} else if (isProd) {
  console.warn("[runloop] ALLOWED_ORIGINS not set in production — falling back to '*'. Set ALLOWED_ORIGINS=https://your-domain to lock this down.");
}

const securityHeaders = [
  // Don't reveal infra fingerprints
  { key: 'X-Powered-By', value: '' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  // HSTS only makes sense behind HTTPS — keep off in dev
  ...(isProd
    ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }]
    : []),
  // CSP: allow same-origin for everything plus inline styles/scripts that
  // Next.js needs (the framework hashes these in production). 'unsafe-eval'
  // is required by React DevTools / Next dev — only enabled outside prod.
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      `script-src 'self' 'unsafe-inline'${isProd ? '' : " 'unsafe-eval'"}`,
      "style-src 'self' 'unsafe-inline'",
      "connect-src 'self' ws: wss: https:",
      "frame-ancestors 'self'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  },
];

const nextConfig = {
  output: 'standalone',
  basePath,
  poweredByHeader: false,
  async redirects() {
    // Root → /projects. AuthProvider picks up from there:
    //   logged in  → stays on /projects (or last-selected project)
    //   logged out → bounced to /login by the protected layout
    return [
      {
        source: '/',
        destination: '/projects',
        permanent: false,
      },
    ];
  },
  async rewrites() {
    const engineUrl = process.env.ENGINE_URL || 'http://localhost:8092';
    const enginePrefix = process.env.ENGINE_BASE_PATH || '/rl';

    // The engine groups its public surface under enginePrefix (default /rl).
    // We mirror that here so a deployer who picks a different engine prefix
    // doesn't have to fork next.config.js.
    const route = (p) => ({ source: `/api${p}`, destination: `${engineUrl}${enginePrefix}/api${p}` });
    return [
      route('/schedulers'),       route('/schedulers/:path*'),
      route('/flows'),            route('/flows/:path*'),
      route('/executions'),       route('/executions/:path*'),
      route('/bulk'),
      route('/templates'),
      route('/queues'),           route('/queues/:path*'),
      route('/dlq'),              route('/dlq/:path*'),
      route('/channels'),         route('/channels/:path*'),
      route('/plugins'),          route('/plugins/:path*'),
      route('/node-templates'),   route('/node-templates/:path*'),
      // Catch-all proxy /proxy/engine/* → engine root
      { source: '/proxy/engine/:path*', destination: `${engineUrl}${enginePrefix}/:path*` },
    ];
  },
  async headers() {
    return [
      // Apply security headers to every response
      { source: '/:path*', headers: securityHeaders },
      // Stricter CORS on the API surface
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Credentials', value: 'true' },
          { key: 'Access-Control-Allow-Origin', value: corsOrigin },
          { key: 'Access-Control-Allow-Methods', value: 'GET,POST,PUT,DELETE,PATCH,OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Accept, Authorization, Content-Type, X-Requested-With, X-Idempotency-Key' },
          { key: 'Vary', value: 'Origin' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
