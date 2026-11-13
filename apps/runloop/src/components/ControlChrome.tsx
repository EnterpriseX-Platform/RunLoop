'use client';

import React from 'react';
import Link from 'next/link';

// ControlChrome — the small set of mono/schematic primitives that give
// every internal page the same "control-room for a workflow engine" feel.
// Each page that imports these gets a consistent breadcrumb, status dots,
// and sharp-corner buttons without re-inventing the styles per file.

export const MONO = "'IBM Plex Sans Thai', 'IBM Plex Sans', system-ui, sans-serif";

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
  void path; void node;
  if (!right) return null;
  return (
    <div
      className="flex items-center gap-2 mb-2"
      style={{ fontSize: 12, color: 'var(--t-text-secondary)' }}
    >
      {false && <span>
</span>}
      <span className="ml-auto flex items-center gap-1.5">{right}</span>
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
        <h1
          style={{
            fontSize: 28,
            fontWeight: 400,
            lineHeight: '36px',
            color: 'var(--t-text)',
            letterSpacing: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          {title}
        </h1>
        {subtitle && (
          <p
            style={{
              fontSize: 14,
              color: 'var(--t-text-secondary)',
              marginTop: 8,
              letterSpacing: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
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
              letterSpacing: 0,
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
      <span
        style={{
          color: fg,
          fontWeight: 600,
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: 0,
        }}
      >
        {value}
      </span>
      <span
        style={{
          color: 'var(--t-text-muted)',
          letterSpacing: 0,
          fontSize: 12,
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
    <div className="flex items-start justify-between mb-6 gap-4">
      <div className="min-w-0 flex-1">
        <h1
          style={{
            fontSize: 28, fontWeight: 400, lineHeight: '36px',
            color: 'var(--t-text)', letterSpacing: 0,
          }}
        >
          {title}
        </h1>
        {subtitle && (
          <p
            style={{
              fontSize: 14, color: 'var(--t-text-secondary)',
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
            style={{ fontFamily: MONO, fontSize: 11, letterSpacing: 0 }}
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
        boxShadow: soft ? 'none' : 'none',
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
    muted:   { fg: 'var(--tag-gray-text)',   bg: 'var(--tag-gray-bg)',   border: 'transparent' },
    accent:  { fg: 'var(--tag-blue-text)',   bg: 'var(--tag-blue-bg)',   border: 'transparent' },
    danger:  { fg: 'var(--tag-red-text)',    bg: 'var(--tag-red-bg)',    border: 'transparent' },
    warn:    { fg: 'var(--tag-orange-text)', bg: 'var(--tag-orange-bg)', border: 'transparent' },
    success: { fg: 'var(--tag-green-text)',  bg: 'var(--tag-green-bg)',  border: 'transparent' },
  };
  const p = palette[tone];
  return (
    <span
      style={{
        fontSize: 12,
        lineHeight: '16px',
        color: p.fg,
        background: p.bg,
        border: `1px solid ${p.border}`,
        padding: '4px 8px',
        borderRadius: 24,
        display: 'inline-flex',
        alignItems: 'center',
        whiteSpace: 'nowrap',
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
  const height = size === 'sm' ? 32 : 40;
  const base: React.CSSProperties = {
    fontSize: 14,
    fontWeight: 400,
    height,
    padding: size === 'sm' ? '0 32px 0 12px' : '0 48px 0 16px',
    borderRadius: 0,
    border: '1px solid transparent',
    justifyContent: 'space-between',
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
    ghost:   { ...base, background: 'transparent', color: 'var(--t-accent)', border: '1px solid var(--t-accent)' },
    danger:  { ...base, background: 'transparent', color: 'var(--t-error)', border: '1px solid transparent' },
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
  void color; void size; void offset;
  return null;
  const lineColor = 'var(--t-accent)';
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
        borderRadius: 0,
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
        letterSpacing: 0,
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
        fontSize: 14,
        fontWeight: 600,
        lineHeight: '18px',
        color: 'var(--t-text)',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
      }}
    >
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// TableHeaderRow — mono  column labels with wide tracking.
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
        fontSize: 14,
        fontWeight: 600,
        minHeight: 48,
        color: 'var(--t-text)',
        borderBottom: '1px solid var(--t-border)',
        background: 'var(--t-selected)',
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
          {c.label}
        </span>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Carbon list-page pieces shared by Flows / Schedulers / Queues / Projects.
// ─────────────────────────────────────────────────────────────────────────
export function ContentSwitcher<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center" role="tablist" style={{ width: 'fit-content', boxShadow: 'inset 0 0 0 1px var(--t-border)' }}>
      {options.map((o) => {
        const on = value === o;
        return (
          <button
            key={o}
            role="tab"
            aria-selected={on}
            onClick={() => onChange(o)}
            className={on ? '' : 'hover:bg-[var(--t-panel-hover)]'}
            style={{
              height: 32,
              padding: '0 16px',
              fontSize: 14,
              border: 'none',
              background: on ? 'var(--t-text)' : 'transparent',
              color: on ? 'var(--t-bg)' : 'var(--t-text-secondary)',
            }}
          >
            {o.charAt(0).toUpperCase() + o.slice(1)}
          </button>
        );
      })}
    </div>
  );
}

export function SearchField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative">
      <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
        className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: 'var(--t-text-secondary)' }}>
        <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
      </svg>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full outline-none focus:shadow-[inset_0_0_0_2px_var(--t-accent)] placeholder:text-[var(--t-text-muted)]"
        style={{
          height: 40,
          padding: '0 16px 0 44px',
          fontSize: 14,
          background: 'var(--t-panel)',
          color: 'var(--t-text)',
          border: 'none',
          borderBottom: '1px solid var(--t-border-strong)',
        }}
      />
    </div>
  );
}

export type TagTone = 'green' | 'red' | 'blue' | 'orange' | 'gray';
export function Tag({ tone = 'gray', children }: { tone?: TagTone; children: React.ReactNode }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        fontSize: 12,
        lineHeight: '16px',
        padding: '4px 8px',
        borderRadius: 24,
        whiteSpace: 'nowrap',
        background: `var(--tag-${tone}-bg)`,
        color: `var(--tag-${tone}-text)`,
      }}
    >
      {children}
    </span>
  );
}

export function sentence(s: string) {
  const t = (s || '').toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}
