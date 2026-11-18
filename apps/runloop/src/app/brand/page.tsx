'use client';

import React from 'react';
import { RL_ALL_ICONS, RLLoop } from '@/components/icons/RunLoopIcons';

// Brand sheet: the logo in its lockups and every product icon at the sizes
// the UI uses (16 / 20 / 32), on both Carbon themes.

function Lockup({ dark }: { dark?: boolean }) {
  const fg = dark ? '#f4f4f4' : '#161616';
  return (
    <div className="flex items-center gap-3" style={{ color: fg }}>
      <RLLoop style={{ width: 40, height: 40 }} strokeWidth={2.5} />
      <span style={{ fontSize: 32, lineHeight: '40px' }}>
        Run<span style={{ fontWeight: 600 }}>Loop</span>
      </span>
    </div>
  );
}

function AppIcon({ size }: { size: number }) {
  return (
    <div style={{ width: size, height: size, background: '#161616', display: 'grid', placeItems: 'center' }}>
      <svg width={size * 0.75} height={size * 0.75} viewBox="0 0 24 24" fill="none">
        <path d="M5 11V5h14v14h-8" stroke="#fff" strokeWidth={2.5} strokeLinecap="square" />
        <path d="M11 15.5 7 19l4 3.5z" fill="#fff" />
        <rect x="3" y="12" width="4" height="4" fill="#0f62fe" />
      </svg>
    </div>
  );
}

function Sheet({ dark }: { dark?: boolean }) {
  const bg = dark ? '#161616' : '#ffffff';
  const fg = dark ? '#f4f4f4' : '#161616';
  const sub = dark ? '#c6c6c6' : '#525252';
  const line = dark ? '#393939' : '#e0e0e0';
  return (
    <section style={{ background: bg, color: fg, padding: 32 }}>
      <h2 style={{ fontSize: 20, lineHeight: '28px', marginBottom: 24 }}>{dark ? 'Dark (g100)' : 'Light (g10)'}</h2>
      <div className="flex items-end gap-12 flex-wrap" style={{ marginBottom: 32 }}>
        <Lockup dark={dark} />
        <div className="flex items-end gap-4">
          <AppIcon size={64} /><AppIcon size={32} /><AppIcon size={16} />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(128px, 1fr))', borderTop: `1px solid ${line}`, borderLeft: `1px solid ${line}` }}>
        {RL_ALL_ICONS.map(([name, Icon]) => (
          <div key={name} style={{ padding: 16, borderRight: `1px solid ${line}`, borderBottom: `1px solid ${line}` }}>
            <div className="flex items-end gap-3" style={{ height: 32, marginBottom: 12 }}>
              <Icon style={{ width: 32, height: 32 }} />
              <Icon style={{ width: 20, height: 20 }} />
              <Icon style={{ width: 16, height: 16 }} />
            </div>
            <div style={{ fontSize: 12, color: sub }}>{name}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function BrandPage() {
  return (
    <main style={{ fontFamily: "'IBM Plex Sans Thai', 'IBM Plex Sans', sans-serif" }}>
      <Sheet />
      <Sheet dark />
    </main>
  );
}
