'use client';

import React from 'react';
import Link from 'next/link';

// ControlChrome — the small set of mono/schematic primitives that give
// every internal page the same "control-room for a workflow engine" feel.
// Each page that imports these gets a consistent breadcrumb, status dots,
// and sharp-corner buttons without re-inventing the styles per file.

export const MONO = "'IBM Plex Mono', ui-monospace, monospace";

// ─────────────────────────────────────────────────────────────────────────
// ControlBreadcrumb — the `// CONTROL PLANE / X [NODE.Y]` strip that
// leads every page. Optional `right` slot for extra telemetry (streaming
// dot, counter, etc.).
// ─────────────────────────────────────────────────────────────────────────
export function ControlBreadcrumb({
  path,
  node,
  right,
}: {
  path: string;          // e.g. "FLOWS" or "QUEUES / EMAIL-OUTBOX"
  node: string;          // e.g. "NODE.FLOWS"
  right?: React.ReactNode;
}) {
  return (
    <div
      className="flex items-center gap-2 mb-2"
      style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.14em', color: 'var(--t-text-muted)' }}
    >
      <span>{'// CONTROL PLANE / '}{path.toUpperCase()}</span>
      <span
        className="px-1.5 py-0.5"
        style={{
          background: 'var(--t-input)',
          border: '1px solid var(--t-border)',
          color: 'var(--t-text-secondary)',
          borderRadius: 2,
        }}
      >
        {node.toUpperCase()}
      </span>
      {right && <span className="ml-auto flex items-center gap-1.5">{right}</span>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// PageHeader — the hero strip that opens every internal page. Drew the
// same payoff the /login page gets from its heading: a mono prompt
// leading into a large title, a blinking accent caret that reads as
// the page's "heartbeat," and a console-style subtitle. Optional
// `metrics` slot renders a compact telemetry row on the right so each
// page has its own signature readout (flows active / exec success / queue depth).
// ─────────────────────────────────────────────────────────────────────────
export function PageHeader({
  title,
  subtitle,
  right,
  metrics,
  prompt = '$ rl',
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  metrics?: React.ReactNode;
  prompt?: string;
}) {
  return (
    <div className="flex items-end justify-between mb-6 gap-4">
      <div className="min-w-0 flex-1">
        {/* Console prompt line — reads like a shell command being run. */}
        <div
          style={{
            fontFamily: MONO,
            fontSize: 10.5,
            letterSpacing: '0.14em',
            color: 'var(--t-text-muted)',
            textTransform: 'uppercase',
            marginBottom: 6,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <span style={{ color: 'var(--t-accent)', opacity: 0.85 }}>{prompt}</span>
          <span style={{ opacity: 0.5 }}>·</span>
          <span>{title}</span>
        </div>
        <h1
          style={{
            fontFamily: MONO,
            fontSize: 28,
            fontWeight: 500,
            lineHeight: 1.1,
            color: 'var(--t-text)',
            letterSpacing: '-0.02em',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          {title}
          {/* Blinking caret — same heartbeat motif as the login h1. */}
          <span
            aria-hidden
            style={{
              display: 'inline-block',
              width: 11,
              height: 22,
              marginLeft: 2,
              background: 'var(--t-accent)',
              animation: 'rl-ph-blink 1.2s steps(2, end) infinite',
            }}
          />
        </h1>
        {subtitle && (
          <p
            style={{
              fontFamily: MONO,
              fontSize: 12,
              color: 'var(--t-text-muted)',
              marginTop: 10,
              letterSpacing: '0.02em',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span style={{ opacity: 0.5 }}>{'//'}</span>
            {subtitle}
          </p>
        )}
        {metrics && (
          <div
            className="flex items-center gap-3 mt-3 flex-wrap"
            style={{
              fontFamily: MONO,
              fontSize: 11,
              color: 'var(--t-text-secondary)',
              letterSpacing: '0.04em',
            }}
          >
            {metrics}
          </div>
        )}
      </div>
      {right && <div className="flex items-center gap-2 flex-shrink-0">{right}</div>}
      <style jsx global>{`
        @keyframes rl-ph-blink {
          0%, 50% { opacity: 1; }
          50.01%, 100% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// MetricChip — the small "▸ 01 active · 3 runs · 100% ok" pills that
// sit below PageHeader. Each page composes its own from telemetry it
// already fetches, so the hero feels specific to the context.
// ─────────────────────────────────────────────────────────────────────────
export function MetricChip({
  label,
  value,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  accent?: string;
}) {
  const fg = accent || 'var(--t-text)';
  return (
    <span className="flex items-center gap-1.5">
      <span style={{ color: 'var(--t-text-muted)', opacity: 0.75 }}>▸</span>
      <span
        style={{
          color: fg,
          fontWeight: 600,
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '0.02em',
        }}
      >
        {value}
      </span>
      <span
        style={{
          color: 'var(--t-text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          fontSize: 10,
        }}
      >
        {label}
      </span>
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// HeroHeader — the big "shell command + page title + blinking caret"
// treatment every list page opens with. Extracted into ControlChrome so
// we don't repeat the JSX across /flows, /schedulers, /executions etc.
//
// Composition:
//   PROMPT          "$ rl.flows · list"   (mono uppercase)
//   TITLE           "Flows█"              (28px mono with blinking caret)
//   SUBTITLE        "// build and manage …" (mono comment style)
//   METRICS         ▸ 02 ACTIVE  ▸ 01 DRAFT  (composed by caller)
//   RIGHT           [ $ NEW FLOW → ]       (CTA)
//
// ─────────────────────────────────────────────────────────────────────────
export function HeroHeader({
  prompt: _prompt,
  title,
  subtitle,
  metrics,
  right,
}: {
  prompt?: string;
  title: string;
  subtitle?: string;
  metrics?: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-end justify-between mb-6 gap-4">
      <div className="min-w-0 flex-1">
        <h1
          style={{
            fontSize: 24, fontWeight: 600, lineHeight: 1.2,
            color: 'var(--t-text)', letterSpacing: '-0.02em',
          }}
        >
          {title}
        </h1>
        {subtitle && (
          <p
            style={{
              fontSize: 13, color: 'var(--t-text-muted)',
              marginTop: 8, letterSpacing: 0,
              maxWidth: 640,
            }}
          >
            {subtitle}
          </p>
        )}
        {metrics && (
          <div
            className="flex items-center gap-3 mt-3 flex-wrap"
            style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.04em' }}
          >
            {metrics}
          </div>
        )}
      </div>
      {right && <div className="flex items-center gap-2 flex-shrink-0">{right}</div>}
      <style jsx global>{`
        @keyframes rl-ph-blink {
          0%, 50% { opacity: 1; }
          50.01%, 100% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// StatusDot — little colored pulsing dot. Used in headers, table rows,
// empty-state indicators. `soft` softens the glow for dense lists.
// ─────────────────────────────────────────────────────────────────────────
export function StatusDot({
  color,
  size = 6,
  soft,
}: {
  color: string;
  size?: number;
  soft?: boolean;
}) {
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        background: color,
        boxShadow: soft
          ? 'none'
          : `0 0 0 3px color-mix(in srgb, ${color} 15%, transparent)`,
        display: 'inline-block',
      }}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────
// MonoTag — the tiny "NODE.XYZ" / "DISABLED" / "QUEUE" badge. Sharp
// corners; use for classifications that aren't status.
// ─────────────────────────────────────────────────────────────────────────
export function MonoTag({
  children,
  tone = 'muted',
}: {
  children: React.ReactNode;
  tone?: 'muted' | 'accent' | 'danger' | 'warn' | 'success';
}) {
  const palette: Record<string, { fg: string; bg: string; border: string }> = {
    muted:   { fg: 'var(--t-text-secondary)', bg: 'var(--t-input)', border: 'var(--t-border)' },
    accent:  { fg: 'var(--t-accent)',         bg: 'color-mix(in srgb, var(--t-accent) 10%, transparent)', border: 'color-mix(in srgb, var(--t-accent) 30%, transparent)' },
    danger:  { fg: '#EF4444', bg: 'color-mix(in srgb, #EF4444 10%, transparent)', border: 'color-mix(in srgb, #EF4444 30%, transparent)' },
    warn:    { fg: '#F59E0B', bg: 'color-mix(in srgb, #F59E0B 10%, transparent)', border: 'color-mix(in srgb, #F59E0B 30%, transparent)' },
    success: { fg: '#10B981', bg: 'color-mix(in srgb, #10B981 10%, transparent)', border: 'color-mix(in srgb, #10B981 30%, transparent)' },
  };
  const p = palette[tone];
  return (
    <span
      style={{
        fontFamily: MONO,
        fontSize: 10,
        letterSpacing: '0.08em',
        color: p.fg,
        background: p.bg,
        border: `1px solid ${p.border}`,
        padding: '2px 6px',
        borderRadius: 2,
        textTransform: 'uppercase',
      }}
    >
      {children}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// SharpButton — the `$ EXECUTE →` button shape. Two variants: primary
// (filled accent) and ghost (transparent with border).
// ─────────────────────────────────────────────────────────────────────────
export function SharpButton({
  children,
  onClick,
  href,
  variant = 'primary',
  size = 'md',
  disabled,
  type = 'button',
  className = '',
}: {
  children: React.ReactNode;
  onClick?: (e: React.MouseEvent) => void;
  href?: string;
  variant?: 'primary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
  disabled?: boolean;
  type?: 'button' | 'submit';
  className?: string;
}) {
  const paddings = size === 'sm' ? '5px 10px' : '7px 14px';
  const fontSize = size === 'sm' ? 11 : 12;
  const base: React.CSSProperties = {
    fontFamily: MONO,
    fontSize,
    fontWeight: 500,
    letterSpacing: '0.04em',
    padding: paddings,
    borderRadius: 2,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    transition: 'opacity 0.12s, background 0.12s',
    textDecoration: 'none',
    whiteSpace: 'nowrap',
  };
  const styleByVariant: Record<string, React.CSSProperties> = {
    primary: { ...base, background: 'var(--t-accent)', color: '#fff' },
    ghost:   { ...base, background: 'transparent', color: 'var(--t-text-secondary)', border: '1px solid var(--t-border)' },
    danger:  { ...base, background: 'color-mix(in srgb, #EF4444 12%, transparent)', color: '#EF4444', border: '1px solid color-mix(in srgb, #EF4444 35%, transparent)' },
  };
  const style = styleByVariant[variant];
  if (href) {
    // Use next/link so Next.js basePath ('/runloop') is auto-prepended.
    // Plain <a href> bypasses the router and 404s under the basePath.
    return (
      <Link href={href} style={style} className={`hover:opacity-90 ${className}`}>
        {children}
      </Link>
    );
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled} style={style} className={`hover:opacity-90 ${className}`}>
      {children}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// CornerTicks — L-shaped tick marks at each corner of an element. Lives
// in ControlChrome so any page panel can frame itself as a technical
// drawing the same way the login form does. Wrap the target with
// `position: relative` and drop <CornerTicks /> inside.
// ─────────────────────────────────────────────────────────────────────────
export function CornerTicks({
  color,
  size = 10,
  offset = -1,
}: {
  color?: string;   // defaults to the accent color
  size?: number;
  offset?: number;  // negative pulls ticks slightly outside the border
}) {
  const lineColor = color ?? 'var(--t-accent)';
  const base: React.CSSProperties = {
    position: 'absolute',
    width: size,
    height: size,
    pointerEvents: 'none',
  };
  return (
    <>
      <span style={{ ...base, top: offset, left: offset }}>
        <span style={{ position: 'absolute', top: 0, left: 0, width: size, height: 1, background: lineColor }} />
        <span style={{ position: 'absolute', top: 0, left: 0, width: 1, height: size, background: lineColor }} />
      </span>
      <span style={{ ...base, top: offset, right: offset }}>
        <span style={{ position: 'absolute', top: 0, right: 0, width: size, height: 1, background: lineColor }} />
        <span style={{ position: 'absolute', top: 0, right: 0, width: 1, height: size, background: lineColor }} />
      </span>
      <span style={{ ...base, bottom: offset, left: offset }}>
        <span style={{ position: 'absolute', bottom: 0, left: 0, width: size, height: 1, background: lineColor }} />
        <span style={{ position: 'absolute', bottom: 0, left: 0, width: 1, height: size, background: lineColor }} />
      </span>
      <span style={{ ...base, bottom: offset, right: offset }}>
        <span style={{ position: 'absolute', bottom: 0, right: 0, width: size, height: 1, background: lineColor }} />
        <span style={{ position: 'absolute', bottom: 0, right: 0, width: 1, height: size, background: lineColor }} />
      </span>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// SchematicPanel — sharp-corner content panel with optional corner ticks.
// Use instead of rounded cards for framed content in the control-room
// aesthetic. Pass `ticked` to auto-frame the panel with CornerTicks —
// the same treatment the login form uses.
// ─────────────────────────────────────────────────────────────────────────
export function SchematicPanel({
  children,
  className = '',
  padded = true,
  ticked = false,
}: {
  children: React.ReactNode;
  className?: string;
  padded?: boolean;
  ticked?: boolean;
}) {
  return (
    <div
      className={className}
      style={{
        position: ticked ? 'relative' : undefined,
        background: 'var(--t-panel)',
        border: '1px solid var(--t-border)',
        borderRadius: 2,
        padding: padded ? 16 : 0,
      }}
    >
      {ticked && <CornerTicks />}
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// MonoNumber — a numeric readout in the same monospace + tabular
// settings as login. Use for counts, durations, IDs — anywhere the eye
// needs to scan telemetry fast.
// ─────────────────────────────────────────────────────────────────────────
export function MonoNumber({
  children,
  size = 14,
  muted = false,
  accent = false,
}: {
  children: React.ReactNode;
  size?: number;
  muted?: boolean;
  accent?: boolean;
}) {
  return (
    <span
      style={{
        fontFamily: MONO,
        fontSize: size,
        fontVariantNumeric: 'tabular-nums',
        letterSpacing: '0.02em',
        color: accent
          ? 'var(--t-accent)'
          : muted
            ? 'var(--t-text-muted)'
            : 'var(--t-text)',
      }}
    >
      {children}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// SectionLabel — a `// SECTION_NAME` marker used in sidebars and panel
// headers. Mirrors the login page's mono metadata style so the eye
// recognizes structural cues across the whole app.
// ─────────────────────────────────────────────────────────────────────────
export function SectionLabel({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={className}
      style={{
        fontFamily: MONO,
        fontSize: 10,
        letterSpacing: '0.16em',
        color: 'var(--t-text-muted)',
        textTransform: 'uppercase',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
      }}
    >
      <span style={{ opacity: 0.5 }}>{'//'}</span>
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// TableHeaderRow — mono uppercase column labels with wide tracking.
// Pass a simple `cols` array so pages stay declarative.
// ─────────────────────────────────────────────────────────────────────────
export function TableHeaderRow({
  cols,
}: {
  cols: Array<{ label: string; width?: number | string; align?: 'left' | 'right' | 'center' }>;
}) {
  return (
    <div
      className="flex items-center gap-3 px-4 py-2"
      style={{
        fontFamily: MONO,
        fontSize: 10,
        letterSpacing: '0.14em',
        color: 'var(--t-text-muted)',
        borderBottom: '1px solid var(--t-border)',
        background: 'color-mix(in srgb, var(--t-bg) 40%, transparent)',
      }}
    >
      {cols.map((c, i) => (
        <span
          key={i}
          style={{
            width: c.width,
            flex: c.width === undefined ? 1 : 'none',
            textAlign: c.align ?? 'left',
          }}
        >
          {c.label.toUpperCase()}
        </span>
      ))}
    </div>
  );
}
