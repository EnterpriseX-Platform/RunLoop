'use client';

import React from 'react';

// ControlBackdrop — the app-wide atmospheric backdrop. Renders a faint
// DAG + blueprint grid behind every page so all the internal screens
// share the same "inside a running system" feel as /login. The login
// page runs a big 6-node DAG with traveling pulses; this backdrop is
// its calmer twin: fewer pulses, tighter grid, higher contrast edges
// so the eye registers the motif even over dense tables.
//
// Variants:
//   ambient — dashboards, lists (default)
//   hero    — empty states, marketing panels (thicker graph)

export function ControlBackdrop({
  variant = 'ambient',
}: {
  variant?: 'ambient' | 'hero';
}) {
  const isHero = variant === 'hero';
  const nodes = [
    { id: 'a', x: 220,  y: 280, r: 4.5 },
    { id: 'b', x: 560,  y: 180, r: 3.5 },
    { id: 'c', x: 560,  y: 520, r: 3.5 },
    { id: 'd', x: 980,  y: 360, r: 4.5 },
    { id: 'e', x: 1360, y: 260, r: 3.5 },
    { id: 'f', x: 1360, y: 560, r: 3.5 },
  ];
  const edges: Array<[string, string]> = [
    ['a', 'b'], ['a', 'c'], ['b', 'd'], ['c', 'd'], ['d', 'e'], ['d', 'f'],
  ];
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const edgePath = (x1: number, y1: number, x2: number, y2: number) => {
    const mx = (x1 + x2) / 2;
    return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
  };
  const routeToPath = (route: string[]) => {
    let d = '';
    for (let i = 0; i < route.length - 1; i += 1) {
      const a = byId[route[i]];
      const b = byId[route[i + 1]];
      const seg = edgePath(a.x, a.y, b.x, b.y);
      d += i === 0 ? seg : seg.replace(/^M [^C]+C/, 'C');
    }
    return d;
  };
  const pulseRoutes = [
    ['a', 'b', 'd', 'e'],
    ['a', 'c', 'd', 'f'],
  ];

  return (
    <div
      aria-hidden
      className="absolute inset-0 pointer-events-none overflow-hidden"
      style={{
        opacity: isHero ? 0.7 : 0.55,
        zIndex: 0,
      }}
    >
      {/* Blueprint grid — stronger than before so it registers as
          atmosphere, not noise. Masked so tables in the center stay
          readable. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'linear-gradient(to right, color-mix(in srgb, var(--t-border) 90%, transparent) 1px, transparent 1px), ' +
            'linear-gradient(to bottom, color-mix(in srgb, var(--t-border) 90%, transparent) 1px, transparent 1px)',
          backgroundSize: isHero ? '64px 64px' : '48px 48px',
          maskImage: 'radial-gradient(ellipse 80% 70% at 50% 40%, black 35%, transparent 88%)',
          WebkitMaskImage: 'radial-gradient(ellipse 80% 70% at 50% 40%, black 35%, transparent 88%)',
          opacity: 0.7,
        }}
      />

      {/* DAG motif + pulses */}
      <svg
        viewBox="0 0 1600 900"
        preserveAspectRatio="xMidYMid slice"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      >
        <defs>
          <radialGradient id="rl-bd-vignette" cx="50%" cy="50%" r="65%">
            <stop offset="0%" stopColor="var(--t-accent)" stopOpacity={isHero ? '0.08' : '0.055'} />
            <stop offset="100%" stopColor="var(--t-accent)" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="1600" height="900" fill="url(#rl-bd-vignette)" />

        <g stroke="var(--t-border)" strokeWidth={1.4} fill="none" opacity={0.85}>
          {edges.map(([from, to], i) => {
            const a = byId[from];
            const b = byId[to];
            return <path key={i} d={edgePath(a.x, a.y, b.x, b.y)} />;
          })}
        </g>

        <g>
          {nodes.map((n, i) => (
            <g key={n.id} style={{ animation: `rl-bd-breathe 3.6s ease-in-out ${i * 0.25}s infinite` }}>
              <circle cx={n.x} cy={n.y} r={n.r + 6} fill="var(--t-accent)" opacity={0.08} />
              <circle cx={n.x} cy={n.y} r={n.r} fill="var(--t-accent)" opacity={0.55} />
              <circle cx={n.x} cy={n.y} r={n.r - 1.5} fill="var(--t-bg)" />
            </g>
          ))}
        </g>

        {/* Pulse dots — same idea as login, slower and fewer so they
            don't distract. Even a single drifting pulse makes the
            backdrop feel alive instead of printed. */}
        {pulseRoutes.map((route, i) => {
          const d = routeToPath(route);
          return (
            <circle
              key={i}
              r={2.5}
              fill="var(--t-accent)"
              style={{
                offsetPath: `path('${d}')`,
                offsetRotate: '0deg',
                animation: `rl-bd-pulse-travel ${9 + i * 2}s linear ${i * 2.5}s infinite`,
                filter: 'drop-shadow(0 0 5px color-mix(in srgb, var(--t-accent) 60%, transparent))',
              }}
            />
          );
        })}
      </svg>

      <style jsx>{`
        @keyframes rl-bd-breathe {
          0%, 100% { opacity: 0.6; }
          50%      { opacity: 1; }
        }
        @keyframes rl-bd-pulse-travel {
          0%   { offset-distance: 0%;   opacity: 0; }
          8%   { opacity: 1; }
          92%  { opacity: 1; }
          100% { offset-distance: 100%; opacity: 0; }
        }
      `}</style>
    </div>
  );
}
