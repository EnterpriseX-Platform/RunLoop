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
import { Sparkles, X, Send, Loader2, Settings } from 'lucide-react';
import Link from 'next/link';

const MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

interface Message {
  role: 'user' | 'assistant';
  content: string;
  error?: boolean;
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
  const scrollRef = useRef<HTMLDivElement>(null);

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
        setMessages((m) => [...m, { role: 'assistant', content: d.text || '(empty response)' }]);
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
              <div style={{ fontSize: 12.5, color: 'var(--t-text-muted)', lineHeight: 1.6 }}>
                <p style={{ marginBottom: 8 }}>Hi 👋 — I can help with:</p>
                <ul className="space-y-1 ml-4" style={{ listStyle: 'disc' }}>
                  <li>Explain how a node or feature works</li>
                  <li>Suggest configs (cron, JSON, transform expressions)</li>
                  <li>Debug a failing execution</li>
                  <li>Build a flow from a description</li>
                </ul>
                <p style={{ marginTop: 10, fontSize: 11.5 }}>
                  Set your Claude API key in{' '}
                  <Link href="/settings/integrations" style={{ color: 'var(--t-accent)' }}>
                    Settings → Integrations
                  </Link>{' '}
                  if you haven&rsquo;t already.
                </p>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className="mb-3">
                <div
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
