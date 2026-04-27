'use client';

// AIAssistant — small floating chat panel that proxies through
// /api/ai/chat (which decrypts CLAUDE_API_KEY server-side and calls
// Anthropic). Page context (current path) is included as system prompt
// so the model knows where the user is when they ask "explain this" or
// "what should I put here".
//
// Phase 1: minimal chat. Phase 2 will pull execution data, flow JSON,
// scheduler config etc. into the system prompt automatically.

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useProject } from '@/context/ProjectContext';
import { Sparkles, X, Send, Loader2, Settings } from 'lucide-react';
import Link from 'next/link';

type Provider = 'auto' | 'claude' | 'kimi' | 'openai';

const PROVIDER_LABELS: Record<Provider, string> = {
  auto: 'Auto',
  claude: 'Claude',
  openai: 'ChatGPT',
  kimi: 'Kimi',
};

// Quick-start prompts shown when the chat is empty. Click → fills the
// input. Picked to cover the four use cases I listed in the welcome card.
const SUGGESTIONS = [
  'Explain what this page does',
  'Write a cron expression for "every weekday at 9am Bangkok time"',
  'Draft an email payload for a welcome flow',
  'Why does my last execution keep failing?',
];

function rotatingGreeting() {
  const opts = [
    'พร้อมช่วยแล้ว ✨',
    'มีอะไรให้ช่วยมั้ย? 👀',
    'ลุยเลย 🚀',
    'ถามมาได้เลย 💬',
    'ว่าไง? 😎',
  ];
  return opts[Math.floor(Math.random() * opts.length)];
}

const MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

interface Message {
  role: 'user' | 'assistant';
  content: string;
  error?: boolean;
  provider?: 'claude' | 'kimi' | 'openai';
  model?: string;
}

const SYSTEM_PROMPT = `You are RunLoop's in-app AI assistant. RunLoop is a job scheduling platform with flows (DAG of nodes), schedulers, queues, executions, secrets, and pub/sub channels. Help the user with:
- Explaining how RunLoop concepts work
- Suggesting node configs (HTTP, Database, Email, Slack, Transform, Condition, Switch, Enqueue, Notify, etc.)
- Writing JSON payloads, transform expressions, cron expressions
- Debugging failing executions

Keep answers concise. When suggesting JSON, wrap it in a fenced code block.`;

export function AIAssistant() {
  const pathname = usePathname();
  const { selectedProject } = useProject();

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [provider, setProvider] = useState<Provider>('auto');
  const scrollRef = useRef<HTMLDivElement>(null);

  const greeting = useMemo(() => rotatingGreeting(), []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, busy]);

  const send = async () => {
    const text = input.trim();
    if (!text || busy || !selectedProject?.id) return;

    const next: Message[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setInput('');
    setBusy(true);

    try {
      const r = await fetch('/runloop/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: selectedProject.id,
          system: `${SYSTEM_PROMPT}\n\nThe user is currently on page: ${pathname}.`,
          messages: next.map((m) => ({ role: m.role, content: m.content })),
          maxTokens: 1024,
          // 'auto' = let the server pick (Claude wins if both keys are set,
          // otherwise whichever is configured). Explicit 'claude' / 'kimi'
          // forces that provider.
          ...(provider !== 'auto' ? { provider } : {}),
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        setMessages((m) => [
          ...m,
          {
            role: 'assistant',
            content: d.error || `Request failed (${r.status})`,
            error: true,
          },
        ]);
      } else {
        setMessages((m) => [
          ...m,
          {
            role: 'assistant',
            content: d.text || '(empty response)',
            provider: d.provider,
            model: d.model,
          },
        ]);
      }
    } catch (e: any) {
      setMessages((m) => [
        ...m,
        { role: 'assistant', content: e.message || 'network error', error: true },
      ]);
    } finally {
      setBusy(false);
    }
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  if (!selectedProject) return null;

  return (
    <>
      {/* Floating launcher */}
      <button
        onClick={() => setOpen(true)}
        aria-label="Open AI assistant"
        className="fixed bottom-5 right-5 z-40 flex items-center gap-2 px-4 py-2.5 shadow-lg hover:opacity-90 transition"
        style={{
          background: 'var(--t-accent)',
          color: '#fff',
          borderRadius: 999,
          fontSize: 12.5,
          fontWeight: 600,
          letterSpacing: '0.02em',
          display: open ? 'none' : 'flex',
        }}
      >
        <Sparkles className="w-4 h-4" />
        Ask AI
      </button>

      {/* Panel */}
      {open && (
        <div
          className="fixed bottom-5 right-5 z-50 flex flex-col shadow-2xl"
          style={{
            width: 380,
            maxWidth: 'calc(100vw - 24px)',
            height: 540,
            maxHeight: 'calc(100vh - 80px)',
            background: 'var(--t-panel)',
            border: '1px solid var(--t-border)',
            borderRadius: 6,
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{ borderBottom: '1px solid var(--t-border)' }}
          >
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4" style={{ color: 'var(--t-accent)' }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t-text)' }}>
                AI Assistant
              </span>
            </div>
            <div className="flex items-center gap-1">
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value as Provider)}
                title="LLM provider"
                style={{
                  fontSize: 11,
                  padding: '3px 6px',
                  background: 'var(--t-input)',
                  border: '1px solid var(--t-border)',
                  color: 'var(--t-text-secondary)',
                  borderRadius: 4,
                  marginRight: 4,
                }}
              >
                {(['auto', 'claude', 'openai', 'kimi'] as Provider[]).map((p) => (
                  <option key={p} value={p}>{PROVIDER_LABELS[p]}</option>
                ))}
              </select>
              <Link
                href="/settings/integrations"
                className="p-1.5 hover:opacity-70"
                style={{ color: 'var(--t-text-muted)' }}
                title="Settings"
              >
                <Settings className="w-3.5 h-3.5" />
              </Link>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 hover:opacity-70"
                style={{ color: 'var(--t-text-muted)' }}
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto px-4 py-3"
            style={{ background: 'var(--t-bg)' }}
          >
            {messages.length === 0 && (
              <div className="flex flex-col h-full">
                <div
                  className="flex flex-col items-center justify-center text-center px-4 py-6 mb-3"
                  style={{
                    background: 'linear-gradient(180deg, color-mix(in srgb, var(--t-accent) 8%, transparent), transparent)',
                    borderRadius: 6,
                  }}
                >
                  <div
                    style={{
                      width: 44, height: 44, borderRadius: 999,
                      background: 'var(--t-accent)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      marginBottom: 10,
                    }}
                  >
                    <Sparkles className="w-5 h-5" style={{ color: '#fff' }} />
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--t-text)' }}>
                    {greeting}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--t-text-muted)', marginTop: 4 }}>
                    Ask me anything about RunLoop — try one of these:
                  </div>
                </div>

                <div className="space-y-1.5 mb-3">
                  {SUGGESTIONS.map((s, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setInput(s)}
                      className="block w-full text-left px-3 py-2 hover:opacity-80 transition"
                      style={{
                        fontSize: 12.5, color: 'var(--t-text-secondary)',
                        background: 'var(--t-input)',
                        border: '1px solid var(--t-border)',
                        borderRadius: 4,
                      }}
                    >
                      <span style={{ color: 'var(--t-accent)', marginRight: 6 }}>›</span>
                      {s}
                    </button>
                  ))}
                </div>

                <p style={{ fontSize: 11, color: 'var(--t-text-muted)', textAlign: 'center' }}>
                  No provider configured?{' '}
                  <Link href="/settings/integrations" style={{ color: 'var(--t-accent)' }}>
                    Add one
                  </Link>{' '}
                  · Claude · ChatGPT · Kimi
                </p>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className="mb-3">
                <div
                  className="flex items-center gap-2"
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    color: m.role === 'user' ? 'var(--t-accent)' : 'var(--t-text-muted)',
                    marginBottom: 3,
                  }}
                >
                  {m.role === 'user' ? 'You' : 'Assistant'}
                  {m.provider && (
                    <span
                      style={{
                        fontSize: 9, padding: '1px 6px',
                        background: 'var(--t-input)', borderRadius: 999,
                        letterSpacing: '0.04em', textTransform: 'none',
                        color: 'var(--t-text-secondary)', fontWeight: 500,
                      }}
                    >
                      {PROVIDER_LABELS[m.provider as Provider]}{m.model ? ` · ${m.model}` : ''}
                    </span>
                  )}
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: m.error ? 'var(--t-error, #ef4444)' : 'var(--t-text)',
                    lineHeight: 1.55,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    fontFamily: m.role === 'assistant' && m.content.includes('```') ? MONO : undefined,
                  }}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex items-center gap-2" style={{ color: 'var(--t-text-muted)', fontSize: 12 }}>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                thinking…
              </div>
            )}
          </div>

          {/* Input */}
          <div className="px-3 py-3" style={{ borderTop: '1px solid var(--t-border)' }}>
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKey}
                placeholder="Ask anything about RunLoop…"
                rows={2}
                spellCheck={false}
                style={{
                  flex: 1,
                  resize: 'none',
                  background: 'var(--t-input)',
                  border: '1px solid var(--t-border)',
                  color: 'var(--t-text)',
                  borderRadius: 4,
                  padding: '8px 10px',
                  fontSize: 13,
                  outline: 'none',
                }}
                disabled={busy}
              />
              <button
                onClick={send}
                disabled={busy || !input.trim()}
                className="p-2.5 disabled:opacity-50"
                style={{
                  background: 'var(--t-accent)',
                  color: '#fff',
                  borderRadius: 4,
                  cursor: busy || !input.trim() ? 'not-allowed' : 'pointer',
                }}
                aria-label="Send"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
            <div style={{ fontSize: 10, color: 'var(--t-text-muted)', marginTop: 4 }}>
              Enter to send · Shift+Enter for newline
            </div>
          </div>
        </div>
      )}
    </>
  );
}
