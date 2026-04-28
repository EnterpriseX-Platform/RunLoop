'use client';

import { useEffect, useState } from 'react';
import { useProject } from '@/context/ProjectContext';
import { SharpButton } from '@/components/ControlChrome';
import { Sparkles, CheckCircle2, AlertCircle, Loader2, ExternalLink } from 'lucide-react';

const MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

interface Provider {
  id: 'claude' | 'kimi' | 'openai';
  name: string;
  blurb: string;
  keySecret: string;
  modelSecret: string;
  defaultModel: string;
  models: { value: string; label: string }[];
  keyPlaceholder: string;
  getKeyUrl: string;
  getKeyLabel: string;
  accent: string;
}

const PROVIDERS: Provider[] = [
  {
    id: 'claude',
    name: 'Claude',
    blurb: 'Anthropic',
    keySecret: 'CLAUDE_API_KEY',
    modelSecret: 'CLAUDE_DEFAULT_MODEL',
    defaultModel: 'claude-sonnet-4-7',
    models: [
      { value: 'claude-opus-4-7',   label: 'Opus 4.7 — most capable' },
      { value: 'claude-sonnet-4-7', label: 'Sonnet 4.7 — balanced' },
      { value: 'claude-haiku-4-5',  label: 'Haiku 4.5 — fastest' },
    ],
    keyPlaceholder: 'sk-ant-...',
    getKeyUrl: 'https://console.anthropic.com/settings/keys',
    getKeyLabel: 'console.anthropic.com',
    accent: 'var(--t-accent)',
  },
  {
    id: 'openai',
    name: 'ChatGPT',
    blurb: 'OpenAI',
    keySecret: 'OPENAI_API_KEY',
    modelSecret: 'OPENAI_DEFAULT_MODEL',
    defaultModel: 'gpt-4o-mini',
    models: [
      { value: 'gpt-4o',       label: 'GPT-4o — flagship' },
      { value: 'gpt-4o-mini',  label: 'GPT-4o mini — fast, cheap' },
      { value: 'gpt-4-turbo',  label: 'GPT-4 Turbo' },
      { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' },
    ],
    keyPlaceholder: 'sk-...',
    getKeyUrl: 'https://platform.openai.com/api-keys',
    getKeyLabel: 'platform.openai.com',
    accent: '#0EA5E9',
  },
  {
    id: 'kimi',
    name: 'Kimi',
    blurb: 'Moonshot AI',
    keySecret: 'KIMI_API_KEY',
    modelSecret: 'KIMI_DEFAULT_MODEL',
    defaultModel: 'kimi-latest',
    models: [
      { value: 'kimi-latest',     label: 'Kimi Latest' },
      { value: 'moonshot-v1-8k',  label: 'Moonshot v1 · 8k context' },
      { value: 'moonshot-v1-32k', label: 'Moonshot v1 · 32k context' },
      { value: 'moonshot-v1-128k', label: 'Moonshot v1 · 128k context' },
    ],
    keyPlaceholder: 'sk-...',
    getKeyUrl: 'https://platform.moonshot.cn/console/api-keys',
    getKeyLabel: 'platform.moonshot.cn',
    accent: '#10B981',
  },
];

interface CardState {
  hasKey: boolean;
  keyInput: string;
  model: string;
  saving: boolean;
  testing: boolean;
  result: { ok: boolean; msg: string } | null;
}

function emptyState(p: Provider): CardState {
  return { hasKey: false, keyInput: '', model: p.defaultModel, saving: false, testing: false, result: null };
}

// CLAUDE_DEFAULT_PROVIDER is the legacy secret name the engine already
// reads in /api/ai/chat. We keep it (rather than rename to AI_PROVIDER)
// so existing data stays valid. Acceptable values: 'auto' | 'claude' |
// 'kimi' | 'openai'.
const PROVIDER_PREF_SECRET = 'CLAUDE_DEFAULT_PROVIDER';

export default function IntegrationsPage() {
  const { selectedProject } = useProject();
  const [cards, setCards] = useState<Record<string, CardState>>(
    Object.fromEntries(PROVIDERS.map((p) => [p.id, emptyState(p)])),
  );
  // 'auto' = server picks (claude wins if both keys are set, otherwise
  // whichever is configured). Otherwise force a specific provider.
  const [activeProvider, setActiveProvider] = useState<'auto' | Provider['id']>('auto');
  const [savingActive, setSavingActive] = useState(false);

  const setCard = (id: string, patch: Partial<CardState>) =>
    setCards((s) => ({ ...s, [id]: { ...s[id], ...patch } }));

  // Pull current state for all providers in one shot.
  useEffect(() => {
    if (!selectedProject?.id) return;
    fetch(`/runloop/api/secrets?projectId=${selectedProject.id}`)
      .then((r) => r.json())
      .then((d) => {
        const secrets: Array<{ name: string; value?: string }> = d.secrets || d.data || [];
        const next: Record<string, CardState> = {};
        for (const p of PROVIDERS) {
          const hasKey = secrets.some((s) => s.name === p.keySecret);
          const ms = secrets.find((s) => s.name === p.modelSecret) as any;
          next[p.id] = {
            ...emptyState(p),
            hasKey,
            model: ms?.value || p.defaultModel,
          };
        }
        setCards(next);
        const pref = secrets.find((s) => s.name === PROVIDER_PREF_SECRET) as any;
        const v = (pref?.value || 'auto') as 'auto' | Provider['id'];
        if (v === 'auto' || v === 'claude' || v === 'kimi' || v === 'openai') {
          setActiveProvider(v);
        }
      })
      .catch(() => {});
  }, [selectedProject]);

  const saveActiveProvider = async (next: 'auto' | Provider['id']) => {
    if (!selectedProject?.id) return;
    const prev = activeProvider;
    setActiveProvider(next);
    setSavingActive(true);
    try {
      await fetch('/runloop/api/secrets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: selectedProject.id,
          name: PROVIDER_PREF_SECRET,
          value: next,
          category: 'OTHER',
          description: 'Active LLM provider for the AI assistant (auto / claude / kimi / openai)',
        }),
      });
    } catch {
      setActiveProvider(prev);
    } finally {
      setSavingActive(false);
    }
  };

  const save = async (p: Provider) => {
    if (!selectedProject?.id) return;
    const c = cards[p.id];
    if (!c.keyInput.trim() && !c.hasKey) {
      setCard(p.id, { result: { ok: false, msg: 'API key is required' } });
      return;
    }
    setCard(p.id, { saving: true, result: null });
    try {
      if (c.keyInput.trim()) {
        const res = await fetch('/runloop/api/secrets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId: selectedProject.id,
            name: p.keySecret,
            value: c.keyInput.trim(),
            category: 'API',
            description: `${p.name} (${p.blurb}) API key — used by the in-app AI assistant`,
          }),
        });
        if (!res.ok) throw new Error((await res.json()).error || 'save failed');
        setCard(p.id, { hasKey: true, keyInput: '' });
      }
      await fetch('/runloop/api/secrets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: selectedProject.id,
          name: p.modelSecret,
          value: c.model,
          category: 'OTHER',
          description: `Default ${p.name} model for the AI assistant`,
        }),
      });
      setCard(p.id, { result: { ok: true, msg: 'Saved' } });
    } catch (e: any) {
      setCard(p.id, { result: { ok: false, msg: e.message || 'save failed' } });
    } finally {
      setCard(p.id, { saving: false });
    }
  };

  const testConnection = async (p: Provider) => {
    setCard(p.id, { testing: true, result: null });
    try {
      const r = await fetch('/runloop/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: selectedProject?.id,
          provider: p.id,
          messages: [{ role: 'user', content: 'reply with the single word: pong' }],
          maxTokens: 16,
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        setCard(p.id, { result: { ok: false, msg: d.error || 'connection failed' } });
      } else {
        setCard(p.id, {
          result: { ok: true, msg: `Connected — ${d.model} replied: "${(d.text || '').trim().slice(0, 80)}"` },
        });
      }
    } catch (e: any) {
      setCard(p.id, { result: { ok: false, msg: e.message || 'connection failed' } });
    } finally {
      setCard(p.id, { testing: false });
    }
  };

  return (
    <div className="p-6 max-w-[800px]">
      <div className="flex items-end justify-between mb-6 gap-4">
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600, color: 'var(--t-text)', letterSpacing: '-0.02em' }}>
            Integrations
          </h1>
          <p style={{ fontSize: 13, color: 'var(--t-text-muted)', marginTop: 6 }}>
            Plug an LLM into your workspace.
          </p>
        </div>
      </div>

      {/* Active provider — picked here, persisted as a project secret,
          read by /api/ai/chat. AI Assistant doesn't expose a per-chat
          provider switcher anymore; pick once here and every chat in
          the project uses it. 'Auto' lets the server pick based on
          which keys are configured (Claude wins if both). */}
      <div
        className="mb-5"
        style={{
          background: 'var(--t-panel)',
          border: '1px solid var(--t-border)',
          borderRadius: 2,
          padding: 16,
        }}
      >
        <div className="flex items-center justify-between mb-3">
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t-text)' }}>
              Active provider
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--t-text-muted)', marginTop: 2 }}>
              Used by every AI Assistant chat in this project.
            </div>
          </div>
          {savingActive && (
            <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: 'var(--t-text-muted)' }} />
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          {(['auto', 'claude', 'openai', 'kimi'] as const).map((id) => {
            const active = activeProvider === id;
            const labelMap = {
              auto: 'Auto',
              claude: 'Claude',
              openai: 'ChatGPT',
              kimi: 'Kimi',
            } as const;
            return (
              <button
                key={id}
                type="button"
                onClick={() => saveActiveProvider(id)}
                disabled={savingActive}
                style={{
                  padding: '7px 14px',
                  borderRadius: 999,
                  fontSize: 12.5,
                  fontWeight: active ? 600 : 500,
                  cursor: savingActive ? 'not-allowed' : 'pointer',
                  background: active
                    ? 'color-mix(in srgb, var(--t-accent) 18%, transparent)'
                    : 'var(--t-input)',
                  color: active ? 'var(--t-accent)' : 'var(--t-text-secondary)',
                  border: `1px solid ${active ? 'var(--t-accent)' : 'var(--t-border)'}`,
                  transition: 'background 0.12s, color 0.12s, border-color 0.12s',
                }}
              >
                {labelMap[id]}
              </button>
            );
          })}
        </div>
      </div>

      {PROVIDERS.map((p) => {
        const c = cards[p.id];
        return (
          <div
            key={p.id}
            className="mb-5"
            style={{ background: 'var(--t-panel)', border: '1px solid var(--t-border)', borderRadius: 2 }}
          >
            <div
              className="px-5 py-4 flex items-start gap-3"
              style={{ borderBottom: '1px solid var(--t-border-light)' }}
            >
              <Sparkles className="w-5 h-5 mt-0.5" style={{ color: p.accent }} />
              <div className="flex-1">
                <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--t-text)' }}>
                  {p.name}{' '}
                  <span style={{ fontWeight: 400, color: 'var(--t-text-muted)', fontSize: 13 }}>
                    · {p.blurb}
                  </span>
                </h2>
              </div>
              <span
                className="flex items-center gap-1.5"
                style={{
                  fontFamily: MONO, fontSize: 10.5, padding: '3px 8px',
                  borderRadius: 2, letterSpacing: '0.08em', textTransform: 'uppercase',
                  color: c.hasKey ? 'var(--t-success)' : 'var(--t-text-muted)',
                  background: c.hasKey ? 'color-mix(in srgb, var(--t-success) 12%, transparent)' : 'var(--t-input)',
                  border: `1px solid ${c.hasKey ? 'var(--t-success)' : 'var(--t-border)'}`,
                }}
              >
                {c.hasKey ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                {c.hasKey ? 'Configured' : 'Not configured'}
              </span>
            </div>

            <div className="px-5 py-4 space-y-4">
              <div>
                <label className="block mb-2" style={{ fontSize: 12, fontWeight: 600, color: 'var(--t-text-secondary)' }}>
                  API Key
                </label>
                <input
                  type="password"
                  value={c.keyInput}
                  onChange={(e) => setCard(p.id, { keyInput: e.target.value })}
                  placeholder={c.hasKey ? '•••••••••• (set — paste a new key to replace)' : p.keyPlaceholder}
                  style={{
                    width: '100%', background: 'var(--t-input)', border: '1px solid var(--t-border)',
                    color: 'var(--t-text)', borderRadius: 2, padding: '10px 12px',
                    fontFamily: MONO, fontSize: 12.5,
                  }}
                />
                <p style={{ fontSize: 11, color: 'var(--t-text-muted)', marginTop: 6 }}>
                  Get a key from{' '}
                  <a href={p.getKeyUrl} target="_blank" rel="noopener noreferrer" style={{ color: p.accent }}>
                    {p.getKeyLabel} <ExternalLink className="w-3 h-3 inline" />
                  </a>
                </p>
              </div>

              <div>
                <label className="block mb-2" style={{ fontSize: 12, fontWeight: 600, color: 'var(--t-text-secondary)' }}>
                  Default Model
                </label>
                <select
                  value={c.model}
                  onChange={(e) => setCard(p.id, { model: e.target.value })}
                  style={{
                    width: '100%', background: 'var(--t-input)', border: '1px solid var(--t-border)',
                    color: 'var(--t-text)', borderRadius: 2, padding: '10px 12px',
                    fontFamily: MONO, fontSize: 12.5,
                  }}
                >
                  {p.models.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-3 pt-2 flex-wrap" style={{ borderTop: '1px solid var(--t-border-light)' }}>
                <SharpButton onClick={() => save(p)} disabled={c.saving}>
                  {c.saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                  Save
                </SharpButton>
                <SharpButton variant="ghost" onClick={() => testConnection(p)} disabled={c.testing || !c.hasKey}>
                  {c.testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                  Test
                </SharpButton>
                {c.result && (
                  <span
                    className="flex items-center gap-1.5 text-sm"
                    style={{ color: c.result.ok ? 'var(--t-success)' : 'var(--t-error, #ef4444)' }}
                  >
                    {c.result.ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                    {c.result.msg}
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}

      <p style={{ fontSize: 11.5, color: 'var(--t-text-muted)' }}>
        More integrations (OpenAI, Datadog, Sentry, OpenTelemetry) will appear here as they ship.
      </p>
    </div>
  );
}
