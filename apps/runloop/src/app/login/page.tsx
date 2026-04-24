'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { Loader2, ArrowRight } from 'lucide-react';

// Login — designed as a "control-room" entry screen for a workflow engine.
// One conceptual idea, executed with care: the login panel sits *inside* a
// running system. A faint animated flow-graph loops behind the form, a live
// cron ticker counts in the corner, and the form itself is framed with
// schematic corner ticks. Every decorative detail nods to DAGs/cron/queues
// so the identity is specific to RunLoop, not a generic SaaS form. All
// colors go through --t-* so light and dark themes both hold up.

const SANS = "'IBM Plex Sans Thai', 'IBM Plex Sans', sans-serif";
const MONO = "'IBM Plex Mono', ui-monospace, monospace";

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const { login, isAuthenticated, isLoading: authLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // ?preview=1 — view the login UI even when dev auth-skip is on.
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('preview')) return;
    if (isAuthenticated && !authLoading) {
      router.push('/projects');
    }
  }, [isAuthenticated, authLoading, router]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--t-bg)' }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--t-accent)' }} />
      </div>
    );
  }
  const previewMode = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('preview');
  if (isAuthenticated && !previewMode) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen w-full relative overflow-hidden"
      style={{ background: 'var(--t-bg)', fontFamily: SANS, color: 'var(--t-text)' }}
    >
      {/* Ambient flow graph — a three-node DAG with a pulse traveling the
          edges. Sits behind everything at low opacity so it reads as
          atmosphere, not content. Pure SVG; no libraries. */}
      <FlowBackdrop />

      {/* Top bar: wordmark on left, live cron ticker on right. Reads as
          "this is a running system and you're logging into it." */}
      <header
        className="absolute top-0 left-0 right-0 flex items-center justify-between px-6 py-5 z-10"
        style={{ fontFamily: MONO, fontSize: 11, color: 'var(--t-text-muted)' }}
      >
        <div className="flex items-center gap-2">
          <LogoMark />
          <span style={{ color: 'var(--t-text)', fontWeight: 500, letterSpacing: '-0.01em' }}>
            runloop
          </span>
          <span style={{ opacity: 0.4, margin: '0 6px' }}>/</span>
          <span style={{ letterSpacing: '0.08em' }}>AUTH</span>
        </div>
        <CronTicker />
      </header>

      {/* Footer sys-line. Tiny, but it completes the "inside a system" frame. */}
      <footer
        className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-6 py-5 z-10"
        style={{ fontFamily: MONO, fontSize: 10, color: 'var(--t-text-muted)', letterSpacing: '0.1em' }}
      >
        <span>{'//'} engine: fiber+gocron</span>
        <span className="flex items-center gap-2">
          <span
            style={{
              width: 6, height: 6, borderRadius: 999,
              background: '#10B981',
              boxShadow: '0 0 0 3px color-mix(in srgb, #10B981 20%, transparent)',
            }}
          />
          ONLINE
        </span>
      </footer>

      <main className="relative z-10 min-h-screen flex items-center justify-center px-4">
        <div style={{ width: '100%', maxWidth: 400 }}>
          {/* Schematic frame: the form sits inside a rectangle with corner
              tick marks, like a technical drawing. */}
          <div className="relative">
            <CornerTicks />

            <div
              className="relative"
              style={{
                padding: '36px 32px 32px',
                background: 'color-mix(in srgb, var(--t-panel) 55%, transparent)',
                border: '1px solid var(--t-border)',
                borderRadius: 2, // sharp — schematics don't round
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
              }}
            >
              {/* Heading with terminal-style blinking caret. The caret is
                  the page's "heartbeat" — a small, specific touch. */}
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 10,
                  letterSpacing: '0.18em',
                  color: 'var(--t-text-muted)',
                  marginBottom: 14,
                }}
              >
                SESSION / NEW
              </div>

              <h1
                style={{
                  fontFamily: MONO,
                  fontSize: 24,
                  fontWeight: 500,
                  lineHeight: 1.15,
                  color: 'var(--t-text)',
                  marginBottom: 8,
                  letterSpacing: '-0.015em',
                }}
              >
                Authenticate
                <span
                  aria-hidden
                  style={{
                    display: 'inline-block',
                    width: 10,
                    height: 20,
                    marginLeft: 4,
                    verticalAlign: '-3px',
                    background: 'var(--t-accent)',
                    animation: 'rl-blink 1.1s steps(2, end) infinite',
                  }}
                />
              </h1>
              <p
                style={{
                  fontSize: 13,
                  color: 'var(--t-text-muted)',
                  marginBottom: 26,
                  lineHeight: 1.55,
                }}
              >
                Step into the control plane. Your credentials unlock the
                scheduler, flows, and execution history for every project
                you&rsquo;re a member of.
              </p>

              <form onSubmit={handleSubmit} className="space-y-5">
                <Field
                  nodeId="node.01"
                  label="EMAIL"
                  value={email}
                  onChange={setEmail}
                  type="email"
                  placeholder="you@example.com"
                  autoComplete="email"
                  autoFocus
                />
                <Field
                  nodeId="node.02"
                  label="PASSPHRASE"
                  value={password}
                  onChange={setPassword}
                  type="password"
                  placeholder="••••••••••"
                  autoComplete="current-password"
                />

                {error && (
                  <div
                    className="px-3 py-2 text-[12px] flex items-start gap-2"
                    role="alert"
                    style={{
                      background: 'color-mix(in srgb, #EF4444 10%, transparent)',
                      border: '1px solid color-mix(in srgb, #EF4444 35%, transparent)',
                      color: '#EF4444',
                      fontFamily: MONO,
                      borderRadius: 2,
                    }}
                  >
                    <span style={{ opacity: 0.7 }}>!</span>
                    <span>{error}</span>
                  </div>
                )}

                <ExecuteButton disabled={isLoading || !email || !password} loading={isLoading} />
              </form>

              {/* Demo credentials — styled as a code comment, not a card.
                  Fits the "you're inside a running system" conceit. */}
              <div
                style={{
                  marginTop: 28,
                  paddingTop: 18,
                  borderTop: '1px dashed var(--t-border)',
                  fontFamily: MONO,
                  fontSize: 11,
                  lineHeight: 1.7,
                  color: 'var(--t-text-muted)',
                }}
              >
                <div style={{ color: 'var(--t-text-secondary)' }}>
                  <span style={{ opacity: 0.6 }}>{'//'}</span> dev seed &mdash; copy to fields above
                </div>
                <div>
                  <span style={{ opacity: 0.6 }}>{'>'}</span>{' '}
                  <CopyableCred
                    label="admin@runloop.io"
                    onUse={() => { setEmail('admin@runloop.io'); setPassword('admin123'); }}
                  />
                </div>
                <div>
                  <span style={{ opacity: 0.6 }}>{'>'}</span> admin123
                </div>
              </div>
            </div>
          </div>

          <p
            style={{
              marginTop: 18,
              textAlign: 'center',
              fontSize: 11,
              fontFamily: MONO,
              color: 'var(--t-text-muted)',
              letterSpacing: '0.05em',
            }}
          >
            trouble?{' '}
            <a href="#" style={{ color: 'var(--t-accent)', textDecoration: 'none' }}>
              ping your admin
            </a>
          </p>
        </div>
      </main>

      {/* Global keyframes — scoped to this page via unique names. */}
      <style jsx global>{`
        @keyframes rl-blink {
          0%, 50% { opacity: 1; }
          50.01%, 100% { opacity: 0; }
        }
        @keyframes rl-pulse-travel {
          0%   { offset-distance: 0%;   opacity: 0; }
          8%   { opacity: 1; }
          92%  { opacity: 1; }
          100% { offset-distance: 100%; opacity: 0; }
        }
        @keyframes rl-node-breathe {
          0%, 100% { opacity: 0.55; }
          50%      { opacity: 1; }
        }
        @keyframes rl-fade-up {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .rl-stagger > * {
          opacity: 0;
          animation: rl-fade-up 0.5s ease-out forwards;
        }
      `}</style>
    </div>
  );
}

// -- Field ------------------------------------------------------------------
// Labeled input with a mono "node ID" annotation in the left gutter. The
// gutter annotation is the detail that ties each field to the DAG motif.
function Field({
  label, value, onChange, type = 'text', placeholder, autoFocus, autoComplete, nodeId,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  autoFocus?: boolean;
  autoComplete?: string;
  nodeId: string;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <label
          style={{
            fontFamily: MONO,
            fontSize: 10,
            letterSpacing: '0.14em',
            color: focused ? 'var(--t-accent)' : 'var(--t-text-muted)',
            transition: 'color 0.15s',
          }}
        >
          {label}
        </label>
        <span
          style={{
            fontFamily: MONO,
            fontSize: 9,
            letterSpacing: '0.08em',
            color: 'var(--t-text-muted)',
            opacity: 0.55,
          }}
        >
          {nodeId}
        </span>
      </div>
      <div className="relative">
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          autoComplete={autoComplete}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            width: '100%',
            padding: '10px 12px 10px 14px',
            fontSize: 13,
            fontFamily: MONO,
            background: 'var(--t-input)',
            color: 'var(--t-text)',
            border: `1px solid ${focused ? 'var(--t-accent)' : 'var(--t-border)'}`,
            borderRadius: 2,
            outline: 'none',
            transition: 'border-color 0.12s, box-shadow 0.12s',
            boxShadow: focused
              ? '0 0 0 3px color-mix(in srgb, var(--t-accent) 15%, transparent)'
              : 'none',
          }}
        />
        {/* Left edge accent — appears on focus like a selected DAG node. */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: 0, top: 0, bottom: 0,
            width: 2,
            background: 'var(--t-accent)',
            transform: focused ? 'scaleY(1)' : 'scaleY(0)',
            transformOrigin: 'center',
            transition: 'transform 0.15s ease',
          }}
        />
      </div>
    </div>
  );
}

// -- ExecuteButton ----------------------------------------------------------
// Styled as a "run" action — dev tools call this "execute", not "sign in".
// Hover slides the arrow and shifts the fill for tactile feedback.
function ExecuteButton({ disabled, loading }: { disabled: boolean; loading: boolean }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="submit"
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="flex items-center justify-between gap-2 w-full group"
      style={{
        fontFamily: MONO,
        fontSize: 12,
        letterSpacing: '0.14em',
        fontWeight: 500,
        padding: '12px 16px',
        borderRadius: 2,
        background: disabled ? 'color-mix(in srgb, var(--t-text) 40%, transparent)' : 'var(--t-text)',
        color: 'var(--t-bg)',
        border: '1px solid var(--t-text)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'transform 0.12s ease, background 0.15s',
        transform: hover && !disabled ? 'translateY(-1px)' : 'translateY(0)',
        boxShadow: hover && !disabled
          ? '0 6px 20px -8px color-mix(in srgb, var(--t-text) 50%, transparent)'
          : 'none',
      }}
    >
      <span className="flex items-center gap-2">
        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <span style={{ opacity: 0.5 }}>$</span>}
        <span>{loading ? 'AUTHENTICATING…' : 'EXECUTE'}</span>
      </span>
      <ArrowRight
        className="w-4 h-4"
        style={{
          transition: 'transform 0.18s ease',
          transform: hover && !disabled ? 'translateX(3px)' : 'translateX(0)',
        }}
      />
    </button>
  );
}

// -- CopyableCred -----------------------------------------------------------
// Click to autofill — saves friction during onboarding. Subtle hover hint.
function CopyableCred({ label, onUse }: { label: string; onUse: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onUse}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        fontFamily: MONO,
        fontSize: 11,
        color: hover ? 'var(--t-accent)' : 'var(--t-text-secondary)',
        background: 'transparent',
        border: 'none',
        padding: 0,
        cursor: 'pointer',
        borderBottom: `1px dashed ${hover ? 'var(--t-accent)' : 'transparent'}`,
        transition: 'color 0.12s, border-color 0.12s',
      }}
      title="use these credentials"
    >
      {label}
    </button>
  );
}

// -- LogoMark ---------------------------------------------------------------
// Tiny SVG mark: two nodes joined by an edge that loops — a literal
// "run loop". Better than a generic rounded square.
function LogoMark() {
  return (
    <svg width={18} height={18} viewBox="0 0 18 18" aria-hidden>
      <defs>
        <linearGradient id="rl-mark-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--t-accent)" />
          <stop offset="100%" stopColor="var(--t-accent)" stopOpacity="0.6" />
        </linearGradient>
      </defs>
      <path
        d="M4 9 Q 4 4 9 4 Q 14 4 14 9 Q 14 14 9 14"
        fill="none"
        stroke="url(#rl-mark-g)"
        strokeWidth={1.8}
        strokeLinecap="round"
      />
      <circle cx={4} cy={9} r={2} fill="var(--t-accent)" />
      <circle cx={14} cy={9} r={2} fill="var(--t-accent)" opacity={0.55} />
    </svg>
  );
}

// -- CornerTicks ------------------------------------------------------------
// L-shaped tick marks at each corner of the form — schematic/targeting feel.
function CornerTicks() {
  const size = 10;
  const offset = -1;
  const tickStyle: React.CSSProperties = {
    position: 'absolute',
    width: size,
    height: size,
    pointerEvents: 'none',
  };
  const lineColor = 'var(--t-accent)';
  return (
    <>
      <div style={{ ...tickStyle, top: offset, left: offset }}>
        <div style={{ position: 'absolute', top: 0, left: 0, width: size, height: 1, background: lineColor }} />
        <div style={{ position: 'absolute', top: 0, left: 0, width: 1, height: size, background: lineColor }} />
      </div>
      <div style={{ ...tickStyle, top: offset, right: offset }}>
        <div style={{ position: 'absolute', top: 0, right: 0, width: size, height: 1, background: lineColor }} />
        <div style={{ position: 'absolute', top: 0, right: 0, width: 1, height: size, background: lineColor }} />
      </div>
      <div style={{ ...tickStyle, bottom: offset, left: offset }}>
        <div style={{ position: 'absolute', bottom: 0, left: 0, width: size, height: 1, background: lineColor }} />
        <div style={{ position: 'absolute', bottom: 0, left: 0, width: 1, height: size, background: lineColor }} />
      </div>
      <div style={{ ...tickStyle, bottom: offset, right: offset }}>
        <div style={{ position: 'absolute', bottom: 0, right: 0, width: size, height: 1, background: lineColor }} />
        <div style={{ position: 'absolute', bottom: 0, right: 0, width: 1, height: size, background: lineColor }} />
      </div>
    </>
  );
}

// -- CronTicker -------------------------------------------------------------
// Little live readout in the header: a cron expression + an incrementing
// tick counter that fires every 2s. Reinforces the scheduler identity
// without being loud.
function CronTicker() {
  const [tick, setTick] = useState(0);
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    const id = setInterval(() => {
      setTick((t) => t + 1);
      setFlash(true);
      setTimeout(() => setFlash(false), 180);
    }, 2000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="flex items-center gap-3" style={{ fontFamily: MONO, fontSize: 10 }}>
      <span style={{ color: 'var(--t-text-muted)', letterSpacing: '0.08em' }}>CRON</span>
      <span style={{ color: 'var(--t-text-secondary)' }}>*/2 * * * * *</span>
      <span
        style={{
          display: 'inline-block',
          minWidth: 54,
          padding: '2px 6px',
          textAlign: 'center',
          border: '1px solid var(--t-border)',
          color: flash ? 'var(--t-accent)' : 'var(--t-text-secondary)',
          background: flash ? 'color-mix(in srgb, var(--t-accent) 10%, transparent)' : 'transparent',
          transition: 'color 0.2s, background 0.2s',
          letterSpacing: '0.05em',
        }}
      >
        t={String(tick).padStart(4, '0')}
      </span>
    </div>
  );
}

// -- FlowBackdrop -----------------------------------------------------------
// A five-node DAG in SVG, almost invisible, with a pulse dot traveling along
// three of its edges on a staggered loop. This is the single decorative idea
// of the page — so I'm spending the complexity here. Uses CSS Motion Path
// (offset-path) which is supported in all current evergreen browsers; falls
// back gracefully to a static graph if unsupported.
function FlowBackdrop() {
  // Node positions in a 1600x900 viewBox — graph flows roughly left→right.
  const nodes = [
    { id: 'a', x: 220,  y: 300, r: 5 },
    { id: 'b', x: 560,  y: 180, r: 4 },
    { id: 'c', x: 560,  y: 520, r: 4 },
    { id: 'd', x: 980,  y: 360, r: 5 },
    { id: 'e', x: 1360, y: 260, r: 4 },
    { id: 'f', x: 1360, y: 560, r: 4 },
  ];
  const edges = [
    { from: 'a', to: 'b' },
    { from: 'a', to: 'c' },
    { from: 'b', to: 'd' },
    { from: 'c', to: 'd' },
    { from: 'd', to: 'e' },
    { from: 'd', to: 'f' },
  ];
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  // Bezier-y path: curve each edge a touch so the graph doesn't look rigid.
  const edgePath = (x1: number, y1: number, x2: number, y2: number) => {
    const mx = (x1 + x2) / 2;
    return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
  };
  // Pulses traverse a path assembled from a few consecutive edges.
  const pulseRoutes = [
    ['a', 'b', 'd', 'e'],
    ['a', 'c', 'd', 'f'],
  ];
  const routeToPath = (route: string[]) => {
    let d = '';
    for (let i = 0; i < route.length - 1; i += 1) {
      const a = byId[route[i]];
      const b = byId[route[i + 1]];
      const seg = edgePath(a.x, a.y, b.x, b.y);
      d += i === 0 ? seg : seg.replace(/^M [^C]+C/, 'C'); // chain
    }
    return d;
  };

  return (
    <div
      aria-hidden
      className="absolute inset-0 pointer-events-none"
      style={{ opacity: 0.55 }}
    >
      {/* Grid wash — extremely faint blueprint feel, sized to viewport. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'linear-gradient(to right, color-mix(in srgb, var(--t-border) 55%, transparent) 1px, transparent 1px), ' +
            'linear-gradient(to bottom, color-mix(in srgb, var(--t-border) 55%, transparent) 1px, transparent 1px)',
          backgroundSize: '56px 56px',
          maskImage: 'radial-gradient(ellipse at center, black 40%, transparent 78%)',
          WebkitMaskImage: 'radial-gradient(ellipse at center, black 40%, transparent 78%)',
          opacity: 0.45,
        }}
      />
      <svg
        viewBox="0 0 1600 900"
        preserveAspectRatio="xMidYMid slice"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      >
        <defs>
          <radialGradient id="rl-vignette" cx="50%" cy="50%" r="60%">
            <stop offset="0%" stopColor="var(--t-accent)" stopOpacity="0.05" />
            <stop offset="100%" stopColor="var(--t-accent)" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="1600" height="900" fill="url(#rl-vignette)" />

        {/* Edges */}
        <g
          stroke="var(--t-border)"
          strokeWidth={1.25}
          fill="none"
          style={{ mixBlendMode: 'normal' }}
        >
          {edges.map((e, i) => {
            const a = byId[e.from];
            const b = byId[e.to];
            return <path key={i} d={edgePath(a.x, a.y, b.x, b.y)} />;
          })}
        </g>

        {/* Nodes */}
        <g>
          {nodes.map((n, i) => (
            <g key={n.id} style={{ animation: `rl-node-breathe 3.4s ease-in-out ${i * 0.3}s infinite` }}>
              <circle cx={n.x} cy={n.y} r={n.r + 6} fill="var(--t-accent)" opacity={0.06} />
              <circle cx={n.x} cy={n.y} r={n.r} fill="var(--t-accent)" opacity={0.55} />
              <circle cx={n.x} cy={n.y} r={n.r - 1.5} fill="var(--t-bg)" />
            </g>
          ))}
        </g>

        {/* Pulse dots — travel the routes via CSS offset-path. */}
        {pulseRoutes.map((route, i) => {
          const d = routeToPath(route);
          return (
            <circle
              key={i}
              r={3}
              fill="var(--t-accent)"
              style={{
                offsetPath: `path('${d}')`,
                offsetRotate: '0deg',
                animation: `rl-pulse-travel ${7 + i * 1.5}s linear ${i * 2.2}s infinite`,
                filter: 'drop-shadow(0 0 6px color-mix(in srgb, var(--t-accent) 60%, transparent))',
              }}
            />
          );
        })}
      </svg>
    </div>
  );
}
