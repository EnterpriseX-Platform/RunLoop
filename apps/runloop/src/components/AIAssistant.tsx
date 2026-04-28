'use client';

// AIAssistant — small floating chat panel that proxies through
// /api/ai/chat (which decrypts CLAUDE_API_KEY server-side and calls
// Anthropic). Page context (current path) is included as system prompt
// so the model knows where the user is when they ask "explain this" or
// "what should I put here".
//
// Phase 1: minimal chat. Phase 2 will pull execution data, flow JSON,
// scheduler config etc. into the system prompt automatically.

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useProject } from '@/context/ProjectContext';
import { Sparkles, X, Send, Loader2, Settings, Eye } from 'lucide-react';
import Link from 'next/link';
import { usePageContext } from '@/hooks/usePageContext';

type Provider = 'auto' | 'claude' | 'kimi' | 'openai';

const PROVIDER_LABELS: Record<Provider, string> = {
  auto: 'Auto',
  claude: 'Claude',
  openai: 'ChatGPT',
  kimi: 'Kimi',
};

// Welcome bullets shown when the chat is empty. Same four use cases
// the AI is good at, kept short so they read at a glance.
const WELCOME_BULLETS = [
  'Explain how a node or feature works',
  'Suggest configs (cron, JSON, transform expressions)',
  'Debug a failing execution',
  'Build a flow from a description',
];

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

  // Live page context — fetched once per pathname change. Gives the AI
  // grounding for "explain this" / "why fail" without a copy-paste loop.
  const pageCtx = usePageContext(selectedProject?.id);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, busy]);

  // Listen for `ai-ask` custom events so any inline "Ask AI" button on
  // the page can open this panel with a pre-filled prompt without prop
  // drilling. Dispatch via:
  //   window.dispatchEvent(new CustomEvent('ai-ask', { detail: { prompt } }))
  // The user clicks Send to actually fire — no auto-send, so they can
  // tweak the question first.
  useEffect(() => {
    const onAsk = (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      const prompt = (detail.prompt as string) || '';
      if (!prompt) return;
      setOpen(true);
      setInput(prompt);
    };
    window.addEventListener('ai-ask', onAsk as EventListener);
    return () => window.removeEventListener('ai-ask', onAsk as EventListener);
  }, []);

  const send = async () => {
    const text = input.trim();
    if (!text || busy || !selectedProject?.id) return;

    const next: Message[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setInput('');
    setBusy(true);

    try {
      // Build the system prompt: base instructions + current path + the
      // page context block (if any). The context is the difference between
      // a generic answer and a specific one: when the user asks "why did
      // this fail?", the model sees the actual logs/status from the page.
      const systemPrompt = [
        SYSTEM_PROMPT,
        '',
        `The user is currently on page: ${pathname}.`,
        pageCtx.prompt ? '' : null,
        pageCtx.prompt || null,
      ].filter((s) => s !== null).join('\n');

      const r = await fetch('/runloop/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: selectedProject.id,
          system: systemPrompt,
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
      {/* Floating launcher — icon-only round button. Hover shows the
          "Ask AI" label as a tooltip. Cleaner than the pill version,
          and the Sparkles glyph is the AI icon the user asked for. */}
      <button
        onClick={() => setOpen(true)}
        aria-label="Open AI assistant"
        title="Ask AI"
        className="fixed bottom-5 right-5 z-40 flex items-center justify-center shadow-lg hover:scale-105 transition-transform"
        style={{
          background: 'var(--t-accent)',
          color: '#fff',
          width: 48,
          height: 48,
          borderRadius: 999,
          display: open ? 'none' : 'flex',
        }}
      >
        <Sparkles className="w-5 h-5" />
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
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <Sparkles className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--t-accent)' }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t-text)' }}>
                AI
              </span>
              {pageCtx.label && (
                <span
                  className="flex items-center gap-1 truncate"
                  title={`AI is reading: ${pageCtx.label}`}
                  style={{
                    fontSize: 10.5,
                    padding: '2px 6px',
                    background: 'color-mix(in srgb, var(--t-accent) 12%, transparent)',
                    color: 'var(--t-accent)',
                    borderRadius: 999,
                    fontWeight: 500,
                    minWidth: 0,
                  }}
                >
                  <Eye className="w-3 h-3 flex-shrink-0" />
                  <span className="truncate">{pageCtx.loading ? 'reading…' : pageCtx.label}</span>
                </span>
              )}
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
              // Welcome — back to the original simple list. The gradient
              // hero version felt over-designed for a chat panel; the
              // bullet list reads in a glance and matches the rest of
              // the app's flat surfaces. Provider switcher + page
              // context chip stay in the header where they belong.
              <div style={{ fontSize: 12.5, color: 'var(--t-text-muted)', lineHeight: 1.6 }}>
                <p style={{ marginBottom: 8, color: 'var(--t-text)' }}>
                  Hi <Sparkles className="w-3.5 h-3.5 inline" style={{ color: 'var(--t-accent)', verticalAlign: 'baseline' }} /> — I can help with:
                </p>
                <ul className="space-y-1 ml-4" style={{ listStyle: 'disc' }}>
                  {WELCOME_BULLETS.map((b) => <li key={b}>{b}</li>)}
                </ul>
                <p style={{ marginTop: 12, fontSize: 11.5 }}>
                  Set an API key in{' '}
                  <Link
                    href={selectedProject ? `/p/${selectedProject.id}/integrations` : '/settings'}
                    style={{ color: 'var(--t-accent)' }}
                  >
                    Settings → Integrations
                  </Link>
                  {' '}— Claude, ChatGPT, or Kimi.
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
