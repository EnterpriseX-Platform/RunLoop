/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  basePath: '/runloop',
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
    const engineUrl = process.env.ENGINE_URL || 'http://localhost:8081';
    
    return [
      // Internal API: Schedulers → Go Engine
      {
        source: '/api/schedulers',
        destination: `${engineUrl}/rl/api/schedulers`,
      },
      {
        source: '/api/schedulers/:path*',
        destination: `${engineUrl}/rl/api/schedulers/:path*`,
      },
      // Internal API: Flows → Go Engine
      {
        source: '/api/flows',
        destination: `${engineUrl}/rl/api/flows`,
      },
      {
        source: '/api/flows/:path*',
        destination: `${engineUrl}/rl/api/flows/:path*`,
      },
      // Internal API: Executions → Go Engine
      {
        source: '/api/executions',
        destination: `${engineUrl}/rl/api/executions`,
      },
      {
        source: '/api/executions/:path*',
        destination: `${engineUrl}/rl/api/executions/:path*`,
      },
      // Internal API: Bulk operations → Go Engine
      {
        source: '/api/bulk',
        destination: `${engineUrl}/rl/api/bulk`,
      },
      // Internal API: Job templates → Go Engine
      {
        source: '/api/templates',
        destination: `${engineUrl}/rl/api/templates`,
      },
      // Internal API: Persistent job queues → Go Engine
      {
        source: '/api/queues',
        destination: `${engineUrl}/rl/api/queues`,
      },
      {
        source: '/api/queues/:path*',
        destination: `${engineUrl}/rl/api/queues/:path*`,
      },
      // Internal API: Dead Letter Queue → Go Engine
      {
        source: '/api/dlq',
        destination: `${engineUrl}/rl/api/dlq`,
      },
      {
        source: '/api/dlq/:path*',
        destination: `${engineUrl}/rl/api/dlq/:path*`,
      },
      // Plugin + node-template APIs (SDK extension nodes)
      {
        source: '/api/plugins',
        destination: `${engineUrl}/rl/api/plugins`,
      },
      {
        source: '/api/plugins/:path*',
        destination: `${engineUrl}/rl/api/plugins/:path*`,
      },
      {
        source: '/api/node-templates',
        destination: `${engineUrl}/rl/api/node-templates`,
      },
      {
        source: '/api/node-templates/:path*',
        destination: `${engineUrl}/rl/api/node-templates/:path*`,
      },
      // Proxy /runloop/proxy/engine/* to Go Engine
      {
        source: '/proxy/engine/:path*',
        destination: `${engineUrl}/rl/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Credentials', value: 'true' },
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,POST,PUT,DELETE,PATCH,OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
