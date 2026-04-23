'use client';

import React from 'react';

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
      <span>// CONTROL PLANE / {path.toUpperCase()}</span>
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
// Page title + subtitle, deliberately sans-serif to avoid mono fatigue.
// Lives in the chrome module so dimensions and spacing stay consistent.
// ─────────────────────────────────────────────────────────────────────────
export function PageHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between mb-5">
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--t-text)', letterSpacing: '-0.01em' }}>
          {title}
        </h1>
        {subtitle && (
          <p style={{ fontSize: 13, color: 'var(--t-text-muted)', marginTop: 2 }}>{subtitle}</p>
        )}
      </div>
      {right && <div className="flex items-center gap-2">{right}</div>}
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
    return (
      <a href={href} style={style} className={`hover:opacity-90 ${className}`}>
        {children}
      </a>
    );
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled} style={style} className={`hover:opacity-90 ${className}`}>
      {children}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// SchematicPanel — sharp-corner content panel with optional corner ticks.
// Use instead of rounded cards for framed content in the control-room
// aesthetic.
// ─────────────────────────────────────────────────────────────────────────
export function SchematicPanel({
  children,
  className = '',
  padded = true,
}: {
  children: React.ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <div
      className={className}
      style={{
        background: 'var(--t-panel)',
        border: '1px solid var(--t-border)',
        borderRadius: 2,
        padding: padded ? 16 : 0,
      }}
    >
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
