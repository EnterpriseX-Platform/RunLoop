'use client';

import { useEffect, useState } from 'react';
import { useProject } from '@/context/ProjectContext';
import { SettingsTabs } from '@/components/SettingsTabs';
import { SharpButton } from '@/components/ControlChrome';
import { Sparkles, CheckCircle2, AlertCircle, Loader2, ExternalLink } from 'lucide-react';

const MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

const MODELS = [
  { value: 'claude-opus-4-7',     label: 'Opus 4.7 — most capable' },
  { value: 'claude-sonnet-4-7',   label: 'Sonnet 4.7 — balanced' },
  { value: 'claude-haiku-4-5',    label: 'Haiku 4.5 — fastest, cheapest' },
];

const KEY_SECRET_NAME = 'CLAUDE_API_KEY';
const MODEL_SECRET_NAME = 'CLAUDE_DEFAULT_MODEL';

export default function IntegrationsPage() {
  const { selectedProject } = useProject();

  const [hasKey, setHasKey] = useState<boolean>(false);
  const [keyInput, setKeyInput] = useState('');
  const [model, setModel] = useState('claude-sonnet-4-7');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    if (!selectedProject?.id) return;
    fetch(`/runloop/api/secrets?projectId=${selectedProject.id}`)
      .then((r) => r.json())
      .then((d) => {
        const secrets: Array<{ name: string }> = d.secrets || d.data || [];
        setHasKey(secrets.some((s) => s.name === KEY_SECRET_NAME));
        const modelSecret = secrets.find((s) => s.name === MODEL_SECRET_NAME) as any;
        if (modelSecret?.value) setModel(modelSecret.value);
      })
      .catch(() => {});
  }, [selectedProject]);

  const save = async () => {
    if (!selectedProject?.id) return;
    if (!keyInput.trim() && !hasKey) {
      setTestResult({ ok: false, msg: 'API key is required' });
      return;
    }
    setSaving(true);
    setTestResult(null);
    try {
      // Save key as secret (only if user supplied a new one — don't overwrite
      // with an empty value when they just want to change the model).
      if (keyInput.trim()) {
        const res = await fetch('/runloop/api/secrets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId: selectedProject.id,
            name: KEY_SECRET_NAME,
            value: keyInput.trim(),
            category: 'API',
            description: 'Anthropic Claude API key — used by the in-app AI assistant',
          }),
        });
        if (!res.ok) throw new Error((await res.json()).error || 'save failed');
        setHasKey(true);
        setKeyInput('');
      }
      // Save default model (plain text, not really sensitive but keep it next
      // to the key for convenience).
      await fetch('/runloop/api/secrets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: selectedProject.id,
          name: MODEL_SECRET_NAME,
          value: model,
          category: 'OTHER',
          description: 'Default Claude model for the AI assistant',
        }),
      });
      setTestResult({ ok: true, msg: 'Saved' });
    } catch (e: any) {
      setTestResult({ ok: false, msg: e.message || 'save failed' });
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await fetch('/runloop/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: selectedProject?.id,
          messages: [{ role: 'user', content: 'reply with the single word: pong' }],
          maxTokens: 16,
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        setTestResult({ ok: false, msg: d.error || 'connection failed' });
      } else {
        setTestResult({ ok: true, msg: `Connected — model replied: "${(d.text || '').trim().slice(0, 100)}"` });
      }
    } catch (e: any) {
      setTestResult({ ok: false, msg: e.message || 'connection failed' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <>
      <SettingsTabs />
      <div className="p-6 max-w-[800px]">
        <div className="flex items-end justify-between mb-6 gap-4">
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 600, color: 'var(--t-text)', letterSpacing: '-0.02em' }}>
              Integrations
            </h1>
            <p style={{ fontSize: 13, color: 'var(--t-text-muted)', marginTop: 6 }}>
              Connect external AI providers and observability platforms.
            </p>
          </div>
          <SharpButton onClick={save} disabled={saving}>
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            Save Changes
          </SharpButton>
        </div>

        {/* Claude card */}
        <div
          className="mb-6"
          style={{ background: 'var(--t-panel)', border: '1px solid var(--t-border)', borderRadius: 2 }}
        >
          <div className="px-5 py-4 flex items-start gap-3" style={{ borderBottom: '1px solid var(--t-border-light)' }}>
            <Sparkles className="w-5 h-5 mt-0.5" style={{ color: 'var(--t-accent)' }} />
            <div className="flex-1">
              <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--t-text)' }}>
                Claude (Anthropic)
              </h2>
              <p style={{ fontSize: 12.5, color: 'var(--t-text-muted)', marginTop: 4, lineHeight: 1.6 }}>
                Powers the in-app AI assistant. The key is stored as a project secret
                (<code style={{ color: 'var(--t-accent)' }}>{KEY_SECRET_NAME}</code>) using AES-256-GCM at rest;
                it never leaves the server in flight (the browser calls{' '}
                <code style={{ color: 'var(--t-accent)' }}>/api/ai/chat</code>, the server proxies to Anthropic).
              </p>
            </div>
            <span
              className="flex items-center gap-1.5"
              style={{
                fontFamily: MONO, fontSize: 10.5, padding: '3px 8px',
                borderRadius: 2, letterSpacing: '0.08em', textTransform: 'uppercase',
                color: hasKey ? 'var(--t-success)' : 'var(--t-text-muted)',
                background: hasKey ? 'color-mix(in srgb, var(--t-success) 12%, transparent)' : 'var(--t-input)',
                border: `1px solid ${hasKey ? 'var(--t-success)' : 'var(--t-border)'}`,
              }}
            >
              {hasKey ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
              {hasKey ? 'Configured' : 'Not configured'}
            </span>
          </div>

          <div className="px-5 py-4 space-y-4">
            <div>
              <label
                className="block mb-2"
                style={{ fontSize: 12, fontWeight: 600, color: 'var(--t-text-secondary)' }}
              >
                API Key
              </label>
              <input
                type="password"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                placeholder={hasKey ? '•••••••••• (set — paste a new key to replace)' : 'sk-ant-...'}
                style={{
                  width: '100%', background: 'var(--t-input)', border: '1px solid var(--t-border)',
                  color: 'var(--t-text)', borderRadius: 2, padding: '10px 12px',
                  fontFamily: MONO, fontSize: 12.5,
                }}
              />
              <p style={{ fontSize: 11, color: 'var(--t-text-muted)', marginTop: 6 }}>
                Get a key from{' '}
                <a
                  href="https://console.anthropic.com/settings/keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'var(--t-accent)' }}
                >
                  console.anthropic.com <ExternalLink className="w-3 h-3 inline" />
                </a>
              </p>
            </div>

            <div>
              <label
                className="block mb-2"
                style={{ fontSize: 12, fontWeight: 600, color: 'var(--t-text-secondary)' }}
              >
                Default Model
              </label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                style={{
                  width: '100%', background: 'var(--t-input)', border: '1px solid var(--t-border)',
                  color: 'var(--t-text)', borderRadius: 2, padding: '10px 12px',
                  fontFamily: MONO, fontSize: 12.5,
                }}
              >
                {MODELS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-3 pt-2" style={{ borderTop: '1px solid var(--t-border-light)' }}>
              <SharpButton variant="ghost" onClick={testConnection} disabled={testing || !hasKey}>
                {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                Test connection
              </SharpButton>
              {testResult && (
                <span
                  className="flex items-center gap-1.5 text-sm"
                  style={{ color: testResult.ok ? 'var(--t-success)' : 'var(--t-error, #ef4444)' }}
                >
                  {testResult.ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                  {testResult.msg}
                </span>
              )}
            </div>
          </div>
        </div>

        <p style={{ fontSize: 11.5, color: 'var(--t-text-muted)' }}>
          More integrations (OpenAI, Datadog, Sentry, OpenTelemetry) will appear here as they ship.
        </p>
      </div>
    </>
  );
}
