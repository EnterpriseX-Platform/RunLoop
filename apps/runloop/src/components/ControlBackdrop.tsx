'use client';

import React from 'react';

// ControlBackdrop — the quiet twin of login's FlowBackdrop. Renders a
// faint DAG + blueprint grid behind every page so the whole app reads
// as "one running system" rather than a grid of dashboards. Lower
// opacity than login (content density demands it), no traveling pulses
// (a motionless graph keeps the eye on the data).
//
// Usage: place once inside the main scroll container, absolutely
// positioned, `pointer-events-none`. Safe for light + dark themes —
// colors all come from --t-* tokens.

export function ControlBackdrop({
  variant = 'ambient',
}: {
  // `ambient` — for everyday pages (grid + faint nodes).
  // `hero`    — for empty-state / marketing panels (thicker graph + vignette).
  variant?: 'ambient' | 'hero';
}) {
  const isHero = variant === 'hero';
  const nodes = [
    { id: 'a', x: 220, y: 280, r: 4.5 },
    { id: 'b', x: 560, y: 180, r: 3.5 },
    { id: 'c', x: 560, y: 520, r: 3.5 },
    { id: 'd', x: 980, y: 360, r: 4.5 },
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

  return (
    <div
      aria-hidden
      className="absolute inset-0 pointer-events-none overflow-hidden"
      style={{
        opacity: isHero ? 0.5 : 0.3,
        zIndex: 0,
      }}
    >
      {/* Blueprint grid — extremely faint. Masked with a radial so the
          center of content stays readable and edges feel like the page
          "falls off" into the background. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'linear-gradient(to right, color-mix(in srgb, var(--t-border) 60%, transparent) 1px, transparent 1px), ' +
            'linear-gradient(to bottom, color-mix(in srgb, var(--t-border) 60%, transparent) 1px, transparent 1px)',
          backgroundSize: isHero ? '64px 64px' : '48px 48px',
          maskImage: 'radial-gradient(ellipse 80% 70% at 50% 40%, black 30%, transparent 85%)',
          WebkitMaskImage: 'radial-gradient(ellipse 80% 70% at 50% 40%, black 30%, transparent 85%)',
          opacity: isHero ? 0.55 : 0.4,
        }}
      />

      {/* DAG motif — same topology as login, drawn much lighter. */}
      <svg
        viewBox="0 0 1600 900"
        preserveAspectRatio="xMidYMid slice"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      >
        <defs>
          <radialGradient id="rl-bd-vignette" cx="50%" cy="50%" r="65%">
            <stop offset="0%" stopColor="var(--t-accent)" stopOpacity={isHero ? '0.055' : '0.03'} />
            <stop offset="100%" stopColor="var(--t-accent)" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="1600" height="900" fill="url(#rl-bd-vignette)" />

        <g stroke="var(--t-border)" strokeWidth={isHero ? 1.25 : 1} fill="none">
          {edges.map(([from, to], i) => {
            const a = byId[from];
            const b = byId[to];
            return <path key={i} d={edgePath(a.x, a.y, b.x, b.y)} />;
          })}
        </g>

        <g>
          {nodes.map((n) => (
            <g key={n.id}>
              <circle cx={n.x} cy={n.y} r={n.r + 5} fill="var(--t-accent)" opacity={0.04} />
              <circle cx={n.x} cy={n.y} r={n.r} fill="var(--t-accent)" opacity={isHero ? 0.45 : 0.3} />
              <circle cx={n.x} cy={n.y} r={n.r - 1.5} fill="var(--t-bg)" />
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}
