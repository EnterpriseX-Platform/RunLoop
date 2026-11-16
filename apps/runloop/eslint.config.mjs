import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';

// ESLint 9 flat config. Next 16 removed `next lint`, so we run ESLint
// directly. eslint-config-next 16 ships a native flat config, spread here.
const config = [
  { ignores: ['node_modules/**', '.next/**', 'next-env.d.ts'] },
  ...nextCoreWebVitals,
  {
    rules: {
      '@next/next/no-html-link-for-pages': 'off',
      'react/no-unescaped-entities': 'off',
      'react/jsx-no-comment-textnodes': 'off',
      // eslint-plugin-react-hooks v6 (bundled with Next 16) adds React
      // Compiler readiness rules as errors. This app does not use the
      // compiler, so keep them visible as warnings rather than blocking.
      'react-hooks/immutability': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
    },
  },
];

export default config;
