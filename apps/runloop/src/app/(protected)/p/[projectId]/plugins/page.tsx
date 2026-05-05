'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Blocks, Plus, Trash2, Power, AlertCircle, Loader2, CheckCircle2, Link as LinkIcon, Code2,
} from 'lucide-react';

const FONT = "'IBM Plex Sans Thai', 'IBM Plex Sans', sans-serif";
const T = {
  bg: 'var(--t-bg)',
  panel: 'var(--t-panel)',
  border: 'var(--t-border)',
  input: 'var(--t-input)',
  text: 'var(--t-text)',
  textSec: 'var(--t-text-secondary)',
  textMuted: 'var(--t-text-muted)',
  accent: 'var(--t-accent)',
  red: '#EF4444',
  green: '#10B981',
};

interface Plugin {
  name: string;
  version: string;
  manifest: {
    name: string;
    version: string;
    displayName?: string;
    description?: string;
    category?: string;
    icon?: string;
    color?: string;
    inputs?: Array<{ name: string; type: string; required?: boolean }>;
    outputs?: Array<{ name: string; type: string }>;
    handler?: { kind: string; url: string };
  };
  enabled: boolean;
  installedAt: string;
}

export default function PluginsPage() {
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [loading, setLoading] = useState(true);
  const [installOpen, setInstallOpen] = useState(false);
  const [installMode, setInstallMode] = useState<'url' | 'json'>('url');
  const [installUrl, setInstallUrl] = useState('');
  const [installJson, setInstallJson] = useState('');
  const [installSecret, setInstallSecret] = useState('');
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const fetchPlugins = useCallback(async () => {
    try {
      const res = await fetch('/runloop/api/plugins');
      const d = await res.json();
      setPlugins(d.data || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPlugins(); }, [fetchPlugins]);

  function notify(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  async function install() {
    setError(null);
    setInstalling(true);
    try {
      let body: Record<string, unknown> = { authSecret: installSecret || undefined };
      if (installMode === 'url') {
        if (!installUrl.trim()) throw new Error('Provide a manifest URL');
        body.url = installUrl.trim();
      } else {
        try {
          body.manifest = JSON.parse(installJson);
        } catch (e) {
          throw new Error('Manifest JSON is invalid');
        }
      }
      const res = await fetch('/runloop/api/plugins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
      notify('Plugin installed');
      setInstallOpen(false);
      setInstallUrl('');
      setInstallJson('');
      setInstallSecret('');
      fetchPlugins();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'install failed');
    } finally {
      setInstalling(false);
    }
  }

  async function toggle(name: string, enabled: boolean) {
    await fetch(`/runloop/api/plugins/${encodeURIComponent(name)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    fetchPlugins();
  }

  async function uninstall(name: string) {
    if (!confirm(`Uninstall plugin "${name}"? Flows using its nodes will fail at next execution.`)) return;
    await fetch(`/runloop/api/plugins/${encodeURIComponent(name)}`, { method: 'DELETE' });
    fetchPlugins();
    notify('Uninstalled');
  }

  const MONO = "'IBM Plex Mono', ui-monospace, monospace";
  const enabledCount = plugins.filter((p) => p.enabled).length;

  return (
    <div style={{ fontFamily: FONT }}>
      {toast && (
        <div
          className="fixed right-6 top-6 px-4 py-2 shadow-lg z-50"
          style={{ background: T.panel, border: `1px solid ${T.border}`, color: T.text, fontSize: 13, borderRadius: 2, fontFamily: MONO }}
        >
          {toast}
        </div>
      )}

      <div className="flex items-end justify-between mb-6 gap-4">
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600, color: T.text, letterSpacing: '-0.02em' }}>Plugins</h1>
          <p style={{ fontSize: 13, color: T.textMuted, marginTop: 6 }}>
            Install third-party node types. Plugins run as HTTP handlers — they can be written in any language.
          </p>
        </div>
        <button
          onClick={() => { setInstallOpen(true); setError(null); }}
          style={{
            background: T.accent, color: '#fff',
            fontSize: 12, fontWeight: 500, letterSpacing: '0.02em',
            padding: '7px 14px', borderRadius: 2,
          }}
          className="flex items-center gap-1.5 hover:opacity-90 transition"
        >
          <Plus className="w-3.5 h-3.5" /> Install Plugin
        </button>
      </div>

      {/* Install drawer */}
      {installOpen && (
        <div className="mb-5 p-4" style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 12 }}>
          <div className="flex items-center justify-between mb-3">
            <h3 style={{ fontSize: 13, fontWeight: 600, color: T.text }}>Install a plugin</h3>
            <button onClick={() => setInstallOpen(false)} style={{ fontSize: 12, color: T.textMuted }}>Cancel</button>
          </div>
          <div className="flex gap-2 mb-3">
            <button
              onClick={() => setInstallMode('url')}
              style={{
                padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 500,
                background: installMode === 'url' ? T.accent : T.input,
                color: installMode === 'url' ? '#fff' : T.textSec,
                border: `1px solid ${installMode === 'url' ? T.accent : T.border}`,
              }}
              className="flex items-center gap-1.5"
            >
              <LinkIcon className="w-3.5 h-3.5" /> From URL
            </button>
            <button
              onClick={() => setInstallMode('json')}
              style={{
                padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 500,
                background: installMode === 'json' ? T.accent : T.input,
                color: installMode === 'json' ? '#fff' : T.textSec,
                border: `1px solid ${installMode === 'json' ? T.accent : T.border}`,
              }}
              className="flex items-center gap-1.5"
            >
              <Code2 className="w-3.5 h-3.5" /> Paste JSON
            </button>
          </div>

          {installMode === 'url' ? (
            <input
              value={installUrl}
              onChange={(e) => setInstallUrl(e.target.value)}
              placeholder="https://plugins.example.com/stripe/manifest.json"
              style={{ background: T.input, border: `1px solid ${T.border}`, color: T.text, borderRadius: 8, padding: '10px 12px', fontSize: 13, width: '100%', outline: 'none' }}
            />
          ) : (
            <textarea
              value={installJson}
              onChange={(e) => setInstallJson(e.target.value)}
              rows={10}
              spellCheck={false}
              placeholder={`{\n  "name": "stripe-charge",\n  "version": "1.0.0",\n  "displayName": "Stripe Charge",\n  "category": "Notifications",\n  "icon": "credit-card",\n  "color": "#635BFF",\n  "inputs": [\n    {"name": "amount", "type": "number", "required": true},\n    {"name": "customer", "type": "string", "required": true}\n  ],\n  "outputs": [{"name": "chargeId", "type": "string"}],\n  "handler": {\n    "kind": "http",\n    "url": "https://plugins.example.com/stripe/charge"\n  }\n}`}
              style={{ background: T.input, border: `1px solid ${T.border}`, color: T.text, borderRadius: 8, padding: 12, fontSize: 12, fontFamily: 'JetBrains Mono, monospace', width: '100%', outline: 'none', resize: 'vertical' }}
            />
          )}

          <input
            value={installSecret}
            onChange={(e) => setInstallSecret(e.target.value)}
            placeholder="Auth secret (optional, sent as X-Plugin-Secret)"
            style={{ background: T.input, border: `1px solid ${T.border}`, color: T.text, borderRadius: 8, padding: '10px 12px', fontSize: 13, width: '100%', outline: 'none', marginTop: 8 }}
          />

          {error && (
            <div className="mt-3 p-3 rounded-lg flex items-start gap-2" style={{ background: '#EF444412', border: '1px solid #EF444440' }}>
              <AlertCircle className="w-4 h-4 mt-0.5" style={{ color: T.red }} />
              <span style={{ fontSize: 13, color: T.red }}>{error}</span>
            </div>
          )}

          <div className="flex items-center gap-2 mt-4">
            <button
              onClick={install}
              disabled={installing}
              style={{ background: T.accent, color: '#fff', borderRadius: 8, padding: '8px 18px', fontSize: 13, opacity: installing ? 0.7 : 1 }}
              className="flex items-center gap-2"
            >
              {installing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {installing ? 'Installing…' : 'Install'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-5 h-5 animate-spin" style={{ color: T.accent }} />
        </div>
      ) : plugins.length === 0 ? (
        <div className="text-center py-16">
          <div style={{ width: 56, height: 56, background: T.panel, border: `1px solid ${T.border}`, borderRadius: 12 }}
            className="mx-auto mb-4 flex items-center justify-center">
            <Blocks className="w-7 h-7" style={{ color: T.textMuted }} />
          </div>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: T.text, marginBottom: 4 }}>No plugins installed</h3>
          <p style={{ fontSize: 13, color: T.textMuted, marginBottom: 12 }}>
            Install a plugin manifest to add new node types to the flow editor
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {plugins.map((p, i) => {
            const color = p.manifest.color || '#6B7280';
            const idx = String(i + 1).padStart(2, '0');
            return (
              <div
                key={p.name}
                className="flex items-center gap-3 px-4 py-3 group"
                style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 2 }}
              >
                <span style={{ fontFamily: MONO, fontSize: 10, color: T.textMuted, width: 22, textAlign: 'right' }}>{idx}</span>
                <div
                  className="flex items-center justify-center flex-shrink-0"
                  style={{ width: 34, height: 34, borderRadius: 2, background: `${color}18`, border: `1px solid ${color}40`, color }}
                >
                  <Blocks className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span style={{ fontSize: 14, fontWeight: 500, color: T.text, letterSpacing: '-0.005em' }}>
                      {p.manifest.displayName || p.name}
                    </span>
                    <span style={{
                      fontFamily: MONO, fontSize: 10, fontWeight: 500, letterSpacing: '0.06em',
                      color: T.textSec, background: 'transparent',
                      padding: '1px 5px', borderRadius: 2,
                      border: `1px solid ${T.border}`,
                    }}>
                      {p.name}@{p.version}
                    </span>
                    {!p.enabled && (
                      <span style={{
                        fontFamily: MONO, fontSize: 10, fontWeight: 500, color: T.red,
                        background: 'transparent', padding: '1px 5px', borderRadius: 2,
                        border: '1px solid color-mix(in srgb, #EF4444 40%, transparent)',
                        letterSpacing: '0.08em',
                      }}>
                        DISABLED
                      </span>
                    )}
                  </div>
                  <p style={{ fontFamily: MONO, fontSize: 10.5, color: T.textMuted, marginTop: 3, letterSpacing: '0.02em' }} className="truncate">
                    {p.manifest.description || p.manifest.category || 'plugin'}
                    {p.manifest.handler?.url && <> · {p.manifest.handler.url}</>}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => toggle(p.name, !p.enabled)}
                    title={p.enabled ? 'Disable' : 'Enable'}
                    style={{ color: p.enabled ? T.green : T.textMuted }}
                    className="p-2 hover:opacity-70"
                  >
                    <Power className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => uninstall(p.name)}
                    title="Uninstall"
                    style={{ color: T.red }}
                    className="p-2 hover:opacity-70"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}
