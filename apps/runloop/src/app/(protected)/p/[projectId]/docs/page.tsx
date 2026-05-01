'use client';

// API Docs — vertical icon+label nav on the left (mirrors the Orch.io
// API editor pattern the user pointed at), content scrolls on the
// right. Sticky search + section anchors at the top of content.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useProject } from '@/context/ProjectContext';
import {
  Copy, Check, ExternalLink, Search, KeyRound, Globe, Zap,
  Variable as VariableIcon, BookOpen, Database, Inbox,
  BellRing, Shield, Workflow, Calendar, AlertTriangle, Sparkles,
  type LucideIcon,
} from 'lucide-react';

const MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

// ─────────────────────────────────────────────────────────────────
// Endpoint catalog
// ─────────────────────────────────────────────────────────────────
interface EndpointDef {
  group: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  summary: string;
  body?: string;
  response?: string;
  notes?: string;
  id?: string;
}

const RAW_ENDPOINTS: EndpointDef[] = [
  // Queues
  { group: 'Queues', method: 'POST',  path: '/api/queues/{name}/jobs',
    summary: 'Enqueue a job. The bound flow runs asynchronously per job.',
    body: '{\n  "payload": { "to": "user@example.com", "subject": "Welcome" },\n  "idempotencyKey": "welcome-user-123",\n  "priority": 0\n}',
    response: '{ "jobId": "iodkr...", "duplicate": false }',
    notes: 'idempotencyKey dedupes — re-POST returns the same jobId.' },
  { group: 'Queues', method: 'GET',   path: '/api/queues',           summary: 'List queues in the project.' },
  { group: 'Queues', method: 'GET',   path: '/api/queues/{name}',    summary: 'Full queue config including backend_config.' },
  { group: 'Queues', method: 'PATCH', path: '/api/queues/{name}',
    summary: 'Update queue config live (flow, concurrency, max attempts, visibility, enabled).',
    body: '{ "flowId": "<flow-id>", "concurrency": 5 }',
    notes: 'Only fields included are changed. Backend + name are immutable.' },
  { group: 'Queues', method: 'DELETE', path: '/api/queues/{name}',   summary: 'Remove the queue. Postgres backend cascades the items.' },
  { group: 'Queues', method: 'GET',   path: '/api/queues/{name}/jobs',  summary: 'Recent jobs with status, attempts, last error.' },
  { group: 'Queues', method: 'GET',   path: '/api/queues/{name}/stats', summary: 'Counts by status + oldestPendingSec.' },

  // Executions
  { group: 'Executions', method: 'GET',  path: '/api/executions',        summary: 'List recent executions. Filter ?projectId=… &status=…' },
  { group: 'Executions', method: 'GET',  path: '/api/executions/{id}',   summary: 'One execution with logs, output, error, per-node results.' },
  { group: 'Executions', method: 'POST', path: '/api/flows/test',        summary: 'Dry-run a flow without saving.' },

  // Schedulers
  { group: 'Schedulers', method: 'GET',  path: '/api/schedulers',                summary: 'List schedulers in the project.' },
  { group: 'Schedulers', method: 'POST', path: '/api/schedulers/{id}/trigger',   summary: 'Manually trigger a scheduler now.' },

  // Flows
  { group: 'Flows', method: 'GET',  path: '/api/flows', summary: 'List flows. Type: SIMPLE or DAG.' },
  { group: 'Flows', method: 'POST', path: '/api/flows',
    summary: 'Create a flow. flowConfig has nodes[] + edges[].',
    body: '{\n  "projectId": "demo-project",\n  "name": "send-welcome",\n  "type": "DAG",\n  "flowConfig": { "edges": [...], "nodes": [...] }\n}',
    notes: 'Node types: START · END · CONDITION · DELAY · LOOP · TRANSFORM · MERGE · SWITCH · LOG · SET_VARIABLE · SUBFLOW · WEBHOOK_OUT · WAIT_WEBHOOK · ENQUEUE · NOTIFY · HTTP · DATABASE · SHELL · PYTHON · NODEJS · DOCKER · SLACK · EMAIL.' },

  // Channels
  { group: 'Channels', method: 'GET',  path: '/api/channels',                  summary: 'Active pub/sub channels with live subscriber counts.' },
  { group: 'Channels', method: 'POST', path: '/api/channels/{name}/publish',
    summary: 'Publish to a channel. Subscribers receive the payload immediately.',
    body: '{ "payload": { "title": "New order" } }',
    response: '{ "delivered": 3, "channel": "orders" }' },
  { group: 'Channels', method: 'GET',  path: '/rl/ws/channel/{name}',          summary: 'WebSocket subscribe. Server → client only.' },

  // Secrets / Env
  { group: 'Secrets', method: 'GET',  path: '/api/secrets', summary: 'List secrets. Names only — values never returned.' },
  { group: 'Secrets', method: 'POST', path: '/api/secrets', summary: 'Create a secret. Value is AES-256-GCM encrypted.',
    body: '{ "projectId": "...", "name": "SMTP_PASSWORD", "value": "..." }' },
  { group: 'Env Vars', method: 'GET',  path: '/api/env-vars', summary: 'List env vars (plaintext).' },
  { group: 'Env Vars', method: 'POST', path: '/api/env-vars', summary: 'Upsert env var by (projectId, name).',
    body: '{ "projectId": "...", "name": "API_BASE_URL", "value": "https://api.example.com" }' },

  // DLQ
  { group: 'Dead Letter Queue', method: 'GET',  path: '/api/dlq',                  summary: 'List failed jobs that exhausted retries.' },
  { group: 'Dead Letter Queue', method: 'POST', path: '/api/dlq/{id}/replay',      summary: 'Smart-routed replay (queue items re-enqueue, scheduler items re-trigger).' },

  // AI
  { group: 'AI', method: 'POST', path: '/api/ai/chat',
    summary: 'Server-side proxy to the configured LLM (Claude / ChatGPT / Kimi).',
    body: '{ "projectId": "...", "messages": [{ "role": "user", "content": "..." }], "provider": "claude" }' },
];

const ENDPOINTS = RAW_ENDPOINTS.map((e) => ({
  ...e,
  id: `${e.group}-${e.method}-${e.path}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
}));

const METHOD_COLORS: Record<string, string> = {
  GET: '#10B981', POST: '#3B82F6', PUT: '#F59E0B', PATCH: '#A855F7', DELETE: '#EF4444',
};

// ─────────────────────────────────────────────────────────────────
// Sidebar sections (each maps to a #anchor in the content)
// ─────────────────────────────────────────────────────────────────
interface NavSection {
  id: string;
  label: string;
  icon: LucideIcon;
  kind: 'top' | 'group';
}

const TOP_SECTIONS: NavSection[] = [
  { id: 'getting-started', label: 'Getting Started', icon: BookOpen, kind: 'top' },
  { id: 'auth',            label: 'Authentication',  icon: KeyRound, kind: 'top' },
  { id: 'base-url',        label: 'Base URL',        icon: Globe,    kind: 'top' },
  { id: 'variables',       label: 'Variables',       icon: VariableIcon, kind: 'top' },
  { id: 'recipes',         label: 'Recipes',         icon: Zap,      kind: 'top' },
];

// Group label → icon (visual cue per endpoint family)
const GROUP_ICONS: Record<string, LucideIcon> = {
  Queues:               Inbox,
  Executions:           Zap,
  Schedulers:           Calendar,
  Flows:                Workflow,
  Channels:             BellRing,
  Secrets:              Shield,
  'Env Vars':           VariableIcon,
  'Dead Letter Queue':  AlertTriangle,
  AI:                   Sparkles,
};

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────
function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="relative group" style={{ background: 'var(--t-input)', border: '1px solid var(--t-border)', borderRadius: 4 }}>
      {lang && (
        <div
          style={{
            fontSize: 9.5, padding: '4px 10px',
            color: 'var(--t-text-muted)', letterSpacing: '0.12em',
            borderBottom: '1px solid var(--t-border-light)',
            fontFamily: MONO, textTransform: 'uppercase',
          }}
        >
          {lang}
        </div>
      )}
      <pre
        style={{
          fontFamily: MONO, fontSize: 11.5,
          padding: 12, color: 'var(--t-text)',
          margin: 0, overflowX: 'auto', whiteSpace: 'pre',
        }}
      >{code}</pre>
      <button
        onClick={copy}
        className="absolute top-2 right-2 p-1.5 opacity-50 group-hover:opacity-100 transition"
        style={{ color: 'var(--t-text-muted)' }}
        title="Copy"
      >
        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}

function MethodBadge({ method }: { method: string }) {
  return (
    <span
      style={{
        fontFamily: MONO, fontSize: 10.5, fontWeight: 600,
        padding: '2px 7px', borderRadius: 3,
        background: METHOD_COLORS[method] + '22',
        color: METHOD_COLORS[method],
        letterSpacing: '0.06em',
        minWidth: 50, textAlign: 'center', display: 'inline-block',
      }}
    >
      {method}
    </span>
  );
}

function Endpoint({ ep, baseUrl }: { ep: EndpointDef; baseUrl: string }) {
  return (
    <div
      id={ep.id}
      data-doc-section
      className="mb-3 scroll-mt-24"
      style={{ background: 'var(--t-panel)', border: '1px solid var(--t-border)', borderRadius: 4 }}
    >
      <div className="px-4 py-3 flex items-center gap-3" style={{ borderBottom: '1px solid var(--t-border-light)' }}>
        <MethodBadge method={ep.method} />
        <code style={{ fontFamily: MONO, fontSize: 13, color: 'var(--t-text)', flex: 1, minWidth: 0, overflowX: 'auto' }} className="whitespace-nowrap">
          {ep.path}
        </code>
      </div>
      <div className="px-4 py-3">
        <p style={{ fontSize: 13, color: 'var(--t-text-secondary)', lineHeight: 1.55 }}>{ep.summary}</p>
        {ep.notes && (
          <p style={{ fontSize: 12, color: 'var(--t-text-muted)', marginTop: 6, lineHeight: 1.55 }}>{ep.notes}</p>
        )}
        {ep.body && (
          <details className="mt-3" open>
            <summary style={{ fontSize: 11, color: 'var(--t-text-muted)', letterSpacing: '0.08em', cursor: 'pointer', marginBottom: 6 }}>
              REQUEST BODY
            </summary>
            <CodeBlock code={ep.body} lang="json" />
          </details>
        )}
        {ep.response && (
          <details className="mt-3">
            <summary style={{ fontSize: 11, color: 'var(--t-text-muted)', letterSpacing: '0.08em', cursor: 'pointer', marginBottom: 6 }}>
              RESPONSE
            </summary>
            <CodeBlock code={ep.response} lang="json" />
          </details>
        )}
        <details className="mt-3">
          <summary style={{ fontSize: 11, color: 'var(--t-text-muted)', letterSpacing: '0.08em', cursor: 'pointer', marginBottom: 6 }}>
            CURL
          </summary>
          <CodeBlock
            lang="bash"
            code={
              `curl -X ${ep.method} '${baseUrl}${ep.path}' \\\n` +
              `  -H 'Authorization: Bearer ${'$RUNLOOP_API_KEY'}' \\\n` +
              `  -H 'Content-Type: application/json'` +
              (ep.body ? ` \\\n  -d '${ep.body.replace(/\n/g, ' ').replace(/  +/g, ' ')}'` : '')
            }
          />
        </details>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────
export default function ApiDocsPage() {
  const { selectedProject } = useProject();
  const [query, setQuery] = useState('');
  const [activeId, setActiveId] = useState<string>('getting-started');
  const contentRef = useRef<HTMLDivElement>(null);

  const baseUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/runloop`
    : 'https://<your-domain>/runloop';

  const filteredEndpoints = useMemo(() => {
    if (!query.trim()) return ENDPOINTS;
    const q = query.toLowerCase();
    return ENDPOINTS.filter(
      (e) =>
        e.path.toLowerCase().includes(q) ||
        e.summary.toLowerCase().includes(q) ||
        e.group.toLowerCase().includes(q) ||
        e.method.toLowerCase().includes(q),
    );
  }, [query]);

  const groups = useMemo(
    () => Array.from(new Set(filteredEndpoints.map((e) => e.group))),
    [filteredEndpoints],
  );

  // Build the full nav: top sections + endpoint groups, in render order.
  const navItems: NavSection[] = useMemo(
    () => [
      ...TOP_SECTIONS.slice(0, 3), // getting-started, auth, base-url
      // Section header row inserted as a 'group' kind without icon below
      ...groups.map((g) => ({ id: `group-${g.toLowerCase().replace(/\s+/g, '-')}`, label: g, icon: GROUP_ICONS[g] || Database, kind: 'group' as const })),
      ...TOP_SECTIONS.slice(3), // variables, recipes
    ],
    [groups],
  );

  // Track active section in viewport for nav highlight.
  useEffect(() => {
    const root = contentRef.current;
    if (!root) return;
    const sections = root.querySelectorAll('[data-doc-section]');
    if (sections.length === 0) return;

    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      { rootMargin: '-72px 0px -55% 0px', threshold: 0 },
    );
    sections.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [filteredEndpoints.length]);

  const NavLink = ({ item }: { item: NavSection }) => {
    const active = activeId === item.id || activeId.startsWith(item.id + '-');
    const Icon = item.icon;
    return (
      <a
        href={`#${item.id}`}
        className="flex items-center gap-2 px-3 py-2 rounded transition truncate"
        style={{
          background: active ? 'color-mix(in srgb, var(--t-accent) 14%, transparent)' : 'transparent',
          color: active ? 'var(--t-accent)' : 'var(--t-text-secondary)',
          fontSize: 12.5,
          fontWeight: active ? 600 : 500,
          borderLeft: `2px solid ${active ? 'var(--t-accent)' : 'transparent'}`,
        }}
      >
        <Icon className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="truncate">{item.label}</span>
      </a>
    );
  };

  return (
    <div className="flex" style={{ minHeight: 'calc(100vh - 64px)' }}>
      {/* ── Sidebar nav (vertical icon+label) ─────────────────────
          The page lives inside Layout's <main overflow-y-auto> scroll
          container, so position:sticky pins to that container, not the
          window. top:0 (relative to the scroll container) keeps the
          sidebar pinned through the whole scroll. The sidebar's own
          overflow-y handles the case where the nav is taller than the
          viewport.                                                    */}
      <aside
        className="hidden md:flex flex-col flex-shrink-0"
        style={{
          width: 232,
          borderRight: '1px solid var(--t-border)',
          background: 'var(--t-panel)',
          position: 'sticky',
          top: 0,
          alignSelf: 'flex-start',
          height: 'calc(100vh - 64px)',
          overflowY: 'auto',
        }}
      >
        <div className="px-3 py-4">
          <div
            style={{
              fontSize: 10.5, fontWeight: 600, color: 'var(--t-text-muted)',
              letterSpacing: '0.14em', marginBottom: 8, paddingLeft: 6,
              textTransform: 'uppercase',
            }}
          >
            Reference
          </div>
          <div className="space-y-0.5">
            {TOP_SECTIONS.slice(0, 3).map((s) => <NavLink key={s.id} item={s} />)}
          </div>

          {groups.length > 0 && (
            <>
              <div
                style={{
                  fontSize: 10.5, fontWeight: 600, color: 'var(--t-text-muted)',
                  letterSpacing: '0.14em', marginTop: 16, marginBottom: 8, paddingLeft: 6,
                  textTransform: 'uppercase',
                }}
              >
                Endpoints
              </div>
              <div className="space-y-0.5">
                {groups.map((g) => (
                  <NavLink
                    key={g}
                    item={{
                      id: `group-${g.toLowerCase().replace(/\s+/g, '-')}`,
                      label: g,
                      icon: GROUP_ICONS[g] || Database,
                      kind: 'group',
                    }}
                  />
                ))}
              </div>
            </>
          )}

          <div
            style={{
              fontSize: 10.5, fontWeight: 600, color: 'var(--t-text-muted)',
              letterSpacing: '0.14em', marginTop: 16, marginBottom: 8, paddingLeft: 6,
              textTransform: 'uppercase',
            }}
          >
            Guides
          </div>
          <div className="space-y-0.5">
            {TOP_SECTIONS.slice(3).map((s) => <NavLink key={s.id} item={s} />)}
          </div>
        </div>
      </aside>

      {/* ── Main content ──────────────────────────────────────── */}
      <div ref={contentRef} className="flex-1 min-w-0 px-6 py-6 max-w-[920px]">
        <div className="mb-5">
          <h1 style={{ fontSize: 26, fontWeight: 600, color: 'var(--t-text)', letterSpacing: '-0.02em' }}>
            API Reference
          </h1>
          <p style={{ fontSize: 13.5, color: 'var(--t-text-muted)', marginTop: 6 }}>
            Call RunLoop from your own apps and scripts.
          </p>
        </div>

        {/* Sticky search — pins inside the same scroll container as
            the sidebar, so top:0 (not 64) once the user scrolls past
            the title. */}
        <div
          className="sticky z-10 mb-6"
          style={{ top: 0, background: 'var(--t-bg)', paddingTop: 6, paddingBottom: 8 }}
        >
          <div
            className="flex items-center gap-2 px-3 py-2"
            style={{
              background: 'var(--t-input)',
              border: '1px solid var(--t-border)',
              borderRadius: 4,
            }}
          >
            <Search className="w-4 h-4" style={{ color: 'var(--t-text-muted)' }} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search endpoints, methods, paths…"
              className="flex-1 bg-transparent outline-none"
              style={{ fontSize: 13, color: 'var(--t-text)', fontFamily: MONO }}
            />
            {query && (
              <button onClick={() => setQuery('')} style={{ fontSize: 11, color: 'var(--t-text-muted)' }}>
                clear
              </button>
            )}
          </div>
          {query && (
            <p style={{ fontSize: 11, color: 'var(--t-text-muted)', marginTop: 6, paddingLeft: 4 }}>
              {filteredEndpoints.length} match{filteredEndpoints.length !== 1 ? 'es' : ''}
            </p>
          )}
        </div>

        {/* Getting started */}
        <section id="getting-started" data-doc-section className="mb-10 scroll-mt-24">
          <h2 style={{ fontSize: 20, fontWeight: 600, color: 'var(--t-text)', marginBottom: 10 }}>
            Getting Started
          </h2>
          <p style={{ fontSize: 13.5, color: 'var(--t-text-secondary)', lineHeight: 1.7 }}>
            Three steps to your first call:
          </p>
          <ol className="mt-3 space-y-2 list-decimal pl-5" style={{ fontSize: 13, color: 'var(--t-text-secondary)' }}>
            <li>
              Create a project-scoped API key in{' '}
              <a href={selectedProject ? `/runloop/p/${selectedProject.id}/api-keys` : '#'} style={{ color: 'var(--t-accent)' }}>
                Settings → API Keys
              </a>
              .
            </li>
            <li>Pass it as a Bearer token on every request.</li>
            <li>Replace <code>$RUNLOOP_BASE</code> in the snippets below with your origin.</li>
          </ol>
        </section>

        {/* Auth */}
        <section id="auth" data-doc-section className="mb-10 scroll-mt-24">
          <h2 style={{ fontSize: 20, fontWeight: 600, color: 'var(--t-text)', marginBottom: 10 }}>
            Authentication
          </h2>
          <p style={{ fontSize: 13, color: 'var(--t-text-secondary)', marginBottom: 12, lineHeight: 1.7 }}>
            Bearer-token auth. Keys are tied to a single project — you cannot reach another project&rsquo;s data with one. Both the engine routes (proxied as <code>/api/*</code>) and the Next.js routes (
            <code>/api/env-vars</code>, <code>/api/secrets</code>, <code>/api/ai/chat</code>) accept the same token.
          </p>
          <CodeBlock
            lang="bash"
            code={`export RUNLOOP_API_KEY="rl_..."
export RUNLOOP_BASE="${baseUrl}"

curl "$RUNLOOP_BASE/api/queues" \\
  -H "Authorization: Bearer $RUNLOOP_API_KEY"`}
          />
        </section>

        {/* Base URL */}
        <section id="base-url" data-doc-section className="mb-10 scroll-mt-24">
          <h2 style={{ fontSize: 20, fontWeight: 600, color: 'var(--t-text)', marginBottom: 10 }}>
            Base URL
          </h2>
          <CodeBlock code={baseUrl} />
          <p style={{ fontSize: 12, color: 'var(--t-text-muted)', marginTop: 6 }}>
            <code style={{ color: 'var(--t-accent)' }}>/api/*</code> is proxied to the engine. Hit{' '}
            <code style={{ color: 'var(--t-accent)' }}>{baseUrl}/proxy/engine/*</code> to skip the proxy.
          </p>
        </section>

        {/* Endpoints by group */}
        {filteredEndpoints.length === 0 && (
          <p style={{ fontSize: 13, color: 'var(--t-text-muted)', marginBottom: 24 }}>
            No endpoint matches &ldquo;{query}&rdquo;.
          </p>
        )}
        {groups.map((g) => {
          const Icon = GROUP_ICONS[g] || Database;
          return (
            <section
              key={g}
              id={`group-${g.toLowerCase().replace(/\s+/g, '-')}`}
              data-doc-section
              className="mb-10 scroll-mt-24"
            >
              <h2
                style={{ fontSize: 20, fontWeight: 600, color: 'var(--t-text)', marginBottom: 12 }}
                className="flex items-center gap-2"
              >
                <Icon className="w-5 h-5" style={{ color: 'var(--t-accent)' }} />
                {g}
              </h2>
              {filteredEndpoints.filter((e) => e.group === g).map((ep) => (
                <Endpoint key={ep.id} ep={ep} baseUrl={baseUrl} />
              ))}
            </section>
          );
        })}

        {/* Variables */}
        <section id="variables" data-doc-section className="mb-10 scroll-mt-24">
          <h2 style={{ fontSize: 20, fontWeight: 600, color: 'var(--t-text)', marginBottom: 10 }}>
            Variables in node config
          </h2>
          <p style={{ fontSize: 13, color: 'var(--t-text-secondary)', marginBottom: 12, lineHeight: 1.7 }}>
            Any string field in any node config can reference{' '}
            <code style={{ color: 'var(--t-accent)' }}>{'${{path}}'}</code>. Resolved at execution time.
          </p>

          <div className="grid sm:grid-cols-2 gap-3">
            {[
              { title: 'Trigger payload',   code: `\${{input.<field>}}\n# Queue:     POST body's "payload"\n# Scheduler: scheduler config's "input"\n# API:       request body's "input"` },
              { title: 'Dynamic vars',      code: `\${{NOW}}            # RFC3339\n\${{TODAY}}          # YYYY-MM-DD\n\${{TIMESTAMP}}      # Unix sec\n\${{TIMESTAMP_MS}}   # Unix ms` },
              { title: 'Upstream output',   code: `\${{<nodeId>.<key>}}\n\${{http.body.user.id}}\n\${{loop.item.email}}` },
              { title: 'Secrets & env',     code: `\${{secrets.<NAME>}}\n# AES-256-GCM, never logged\n\n\${{env.<NAME>}}\n# plaintext per-project config` },
            ].map((b) => (
              <div key={b.title} className="p-3" style={{ background: 'var(--t-panel)', border: '1px solid var(--t-border)', borderRadius: 4 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t-text)', marginBottom: 6 }}>{b.title}</div>
                <CodeBlock lang="text" code={b.code} />
              </div>
            ))}
          </div>
        </section>

        {/* Recipes */}
        <section id="recipes" data-doc-section className="mb-10 scroll-mt-24">
          <h2 style={{ fontSize: 20, fontWeight: 600, color: 'var(--t-text)', marginBottom: 10 }}>
            Quick recipes
          </h2>

          <div className="space-y-5">
            <div>
              <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--t-text-secondary)', marginBottom: 6 }}>
                Send an email through a queue (idempotent)
              </h3>
              <CodeBlock
                lang="bash"
                code={`curl -X POST "$RUNLOOP_BASE/api/queues/email-outbox/jobs" \\
  -H "Authorization: Bearer $RUNLOOP_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "payload": { "to": "user@example.com", "subject": "Welcome", "body": "..." },
    "idempotencyKey": "welcome-user-12345"
  }'`}
              />
            </div>

            <div>
              <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--t-text-secondary)', marginBottom: 6 }}>
                Subscribe to a channel (browser JS)
              </h3>
              <CodeBlock
                lang="js"
                code={`const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
const ws = new WebSocket(\`\${proto}//\${location.host}/runloop/rl/ws/channel/orders?projectId=\${PROJECT_ID}\`);
ws.onmessage = (e) => {
  const { channel, timestamp, payload } = JSON.parse(e.data);
  console.log(channel, payload);
};`}
              />
            </div>

            <div>
              <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--t-text-secondary)', marginBottom: 6 }}>
                Trigger a scheduler from another system
              </h3>
              <CodeBlock
                lang="bash"
                code={`curl -X POST "$RUNLOOP_BASE/api/schedulers/$SCHEDULER_ID/trigger" \\
  -H "Authorization: Bearer $RUNLOOP_API_KEY"`}
              />
            </div>
          </div>
        </section>

        <p style={{ fontSize: 11.5, color: 'var(--t-text-muted)' }}>
          Missing something?{' '}
          <a href="https://github.com/anthropics/runloop/issues" style={{ color: 'var(--t-accent)' }}>
            File an issue <ExternalLink className="w-3 h-3 inline" />
          </a>
        </p>
      </div>
    </div>
  );
}
