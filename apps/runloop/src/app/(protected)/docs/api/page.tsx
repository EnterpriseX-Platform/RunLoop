'use client';

import { useState } from 'react';
import { useProject } from '@/context/ProjectContext';
import { Copy, Check, ExternalLink } from 'lucide-react';

const MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

interface EndpointDef {
  group: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  summary: string;
  body?: string;
  response?: string;
  notes?: string;
}

const ENDPOINTS: EndpointDef[] = [
  // ─── Queues ────────────────────────────────────────────────────
  {
    group: 'Queues',
    method: 'POST',
    path: '/api/queues/{name}/jobs',
    summary: 'Enqueue a job. The bound flow runs asynchronously per job.',
    body: `{
  "payload": { "to": "user@example.com", "subject": "Welcome" },
  "idempotencyKey": "welcome-user-123",  // optional
  "priority": 0                          // optional
}`,
    response: `{ "jobId": "iodkrzmfo7sm73r97ajedj75e", "duplicate": false }`,
    notes: 'If `idempotencyKey` matches an existing job, returns the same jobId with `duplicate: true` instead of double-enqueueing.',
  },
  {
    group: 'Queues',
    method: 'GET',
    path: '/api/queues',
    summary: 'List queues in the project (with backend, concurrency, enabled flag).',
    response: `{ "data": [{ "name": "email-outbox", "flowId": "...", "backend": "postgres", "concurrency": 5, "enabled": true }] }`,
  },
  {
    group: 'Queues',
    method: 'GET',
    path: '/api/queues/{name}/jobs',
    summary: 'List recent jobs in a queue with their status and last error.',
  },
  // ─── DLQ ───────────────────────────────────────────────────────
  {
    group: 'Dead Letter Queue',
    method: 'GET',
    path: '/api/dlq?projectId={id}',
    summary: 'List failed jobs that exhausted retries. Filters: status (PENDING/REVIEWING/RESOLVED), reason.',
  },
  {
    group: 'Dead Letter Queue',
    method: 'POST',
    path: '/api/dlq/{id}/replay',
    summary: 'Replay a DLQ entry. Smart routing: if `scheduler_id` starts with `queue:`, re-enqueues; otherwise triggers the scheduler.',
  },
  {
    group: 'Dead Letter Queue',
    method: 'POST',
    path: '/api/dlq/{id}/discard',
    summary: 'Drop a DLQ entry without replaying.',
  },
  // ─── Executions ─────────────────────────────────────────────────
  {
    group: 'Executions',
    method: 'GET',
    path: '/api/executions?projectId={id}',
    summary: 'List recent executions. Status: PENDING/RUNNING/SUCCESS/FAILED/CANCELLED/TIMEOUT.',
  },
  {
    group: 'Executions',
    method: 'GET',
    path: '/api/executions/{id}',
    summary: 'Get one execution with full logs, output, error details, per-node results.',
    response: `{
  "data": {
    "id": "...", "status": "SUCCESS", "durationMs": 120,
    "logs": "[start] SUCCESS: (0ms, 0 retries)\\n...",
    "output": { ... }
  }
}`,
  },
  {
    group: 'Executions',
    method: 'POST',
    path: '/api/flows/test',
    summary: 'Dry-run a flow without saving. Body: `{ projectId, flowConfig }`. Returns executionId; poll /executions/{id} to get the result.',
  },
  // ─── Channels ───────────────────────────────────────────────────
  {
    group: 'Channels (Pub/Sub)',
    method: 'GET',
    path: '/api/channels',
    summary: 'List active pub/sub channels with live subscriber counts (project-scoped).',
  },
  {
    group: 'Channels (Pub/Sub)',
    method: 'POST',
    path: '/api/channels/{name}/publish',
    summary: 'Publish to a channel. Subscribers connected via WebSocket receive the payload immediately.',
    body: `{ "payload": { "title": "New order", "body": "..." } }`,
    response: `{ "delivered": 3, "channel": "orders" }`,
  },
  {
    group: 'Channels (Pub/Sub)',
    method: 'GET',
    path: '/rl/ws/channel/{name}',
    summary: 'WebSocket subscribe. Server → client only. Each message is `{ channel, timestamp, payload }`.',
    notes: 'Subscriber must authenticate (session cookie or Bearer token). Project-scoped automatically.',
  },
  // ─── Secrets ────────────────────────────────────────────────────
  {
    group: 'Secrets',
    method: 'GET',
    path: '/api/secrets?projectId={id}',
    summary: 'List secrets (names only — values never returned). Reference inside flows as `${{secrets.NAME}}`.',
  },
  {
    group: 'Secrets',
    method: 'POST',
    path: '/api/secrets',
    summary: 'Create a secret. Value is AES-256-GCM encrypted at rest.',
    body: `{ "projectId": "demo-project", "name": "SMTP_PASSWORD", "value": "..." }`,
  },
  // ─── Flows ──────────────────────────────────────────────────────
  {
    group: 'Flows',
    method: 'GET',
    path: '/api/flows?projectId={id}',
    summary: 'List flows. Type: SIMPLE or DAG.',
  },
  {
    group: 'Flows',
    method: 'POST',
    path: '/api/flows',
    summary: 'Create a flow. flowConfig has nodes[] + edges[]. See example below.',
    body: `{
  "projectId": "demo-project",
  "name": "send-welcome",
  "type": "DAG",
  "flowConfig": {
    "edges": [
      { "id": "e1", "source": "start", "target": "email", "condition": "ON_SUCCESS" },
      { "id": "e2", "source": "email", "target": "end",   "condition": "ON_SUCCESS" }
    ],
    "nodes": [
      { "id": "start", "name": "Start", "type": "START", "config": {} },
      { "id": "email", "name": "Email", "type": "EMAIL",
        "config": {
          "host": "smtp.gmail.com", "port": 587,
          "username": "you@gmail.com",
          "password": "\${{secrets.SMTP_PASSWORD}}",
          "to": "\${{input.to}}", "subject": "Welcome"
        }
      },
      { "id": "end", "name": "End", "type": "END", "config": {} }
    ]
  }
}`,
    notes: 'Node types: START · END · CONDITION · DELAY · LOOP · TRANSFORM · MERGE · SWITCH · LOG · SET_VARIABLE · SUBFLOW · WEBHOOK_OUT · WAIT_WEBHOOK · ENQUEUE · NOTIFY · HTTP · DATABASE · SHELL · PYTHON · NODEJS · DOCKER · SLACK · EMAIL.',
  },
  // ─── Schedulers ─────────────────────────────────────────────────
  {
    group: 'Schedulers',
    method: 'POST',
    path: '/api/schedulers/{id}/trigger',
    summary: 'Manually trigger a scheduler now. Returns the executionId.',
  },
];

function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="relative" style={{ background: 'var(--t-input)', border: '1px solid var(--t-border)', borderRadius: 2 }}>
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
        className="absolute top-2 right-2 p-1.5 hover:opacity-70"
        style={{ color: 'var(--t-text-muted)' }}
        title="Copy"
      >
        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}

const METHOD_COLORS: Record<string, string> = {
  GET:    '#10B981',
  POST:   '#3B82F6',
  PUT:    '#F59E0B',
  PATCH:  '#A855F7',
  DELETE: '#EF4444',
};

function Endpoint({ ep, baseUrl }: { ep: EndpointDef; baseUrl: string }) {
  return (
    <div
      className="mb-3"
      style={{ background: 'var(--t-panel)', border: '1px solid var(--t-border)', borderRadius: 2 }}
    >
      <div className="px-4 py-3 flex items-center gap-3" style={{ borderBottom: '1px solid var(--t-border-light)' }}>
        <span
          style={{
            fontFamily: MONO, fontSize: 11, fontWeight: 600,
            padding: '3px 8px', borderRadius: 2,
            background: METHOD_COLORS[ep.method] + '22',
            color: METHOD_COLORS[ep.method],
            letterSpacing: '0.06em',
          }}
        >
          {ep.method}
        </span>
        <code
          style={{ fontFamily: MONO, fontSize: 12, color: 'var(--t-text)', flex: 1, minWidth: 0, overflowX: 'auto' }}
          className="whitespace-nowrap"
        >
          {ep.path}
        </code>
      </div>
      <div className="px-4 py-3">
        <p style={{ fontSize: 12.5, color: 'var(--t-text-secondary)' }}>{ep.summary}</p>
        {ep.notes && (
          <p style={{ fontSize: 11.5, color: 'var(--t-text-muted)', marginTop: 6 }}>{ep.notes}</p>
        )}
        {ep.body && (
          <div className="mt-3">
            <div style={{ fontSize: 10.5, color: 'var(--t-text-muted)', letterSpacing: '0.12em', marginBottom: 4 }}>
              REQUEST BODY
            </div>
            <CodeBlock code={ep.body} lang="json" />
          </div>
        )}
        {ep.response && (
          <div className="mt-3">
            <div style={{ fontSize: 10.5, color: 'var(--t-text-muted)', letterSpacing: '0.12em', marginBottom: 4 }}>
              RESPONSE
            </div>
            <CodeBlock code={ep.response} lang="json" />
          </div>
        )}
        <div className="mt-3">
          <div style={{ fontSize: 10.5, color: 'var(--t-text-muted)', letterSpacing: '0.12em', marginBottom: 4 }}>
            CURL
          </div>
          <CodeBlock
            lang="bash"
            code={
              `curl -X ${ep.method} '${baseUrl}${ep.path}' \\\n` +
              `  -H 'Authorization: Bearer ${'$RUNLOOP_API_KEY'}' \\\n` +
              `  -H 'Content-Type: application/json'` +
              (ep.body ? ` \\\n  -d '${ep.body.replace(/\n/g, ' ').replace(/  +/g, ' ')}'` : '')
            }
          />
        </div>
      </div>
    </div>
  );
}

export default function ApiDocsPage() {
  const { selectedProject } = useProject();

  const baseUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/runloop`
    : 'https://community.oneweb.tech/runloop';

  const groups = Array.from(new Set(ENDPOINTS.map((e) => e.group)));

  return (
    <div className="p-6 max-w-[960px]">
      <div className="mb-8">
        <h1 style={{ fontSize: 24, fontWeight: 600, color: 'var(--t-text)', letterSpacing: '-0.02em' }}>
          API Reference
        </h1>
        <p style={{ fontSize: 13, color: 'var(--t-text-muted)', marginTop: 6 }}>
          Call RunLoop from your own apps and scripts. All endpoints are project-scoped, JWT-authenticated, and accept JSON.
        </p>
      </div>

      {/* Auth section */}
      <section className="mb-8">
        <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--t-text)', marginBottom: 10 }}>
          1. Authentication
        </h2>
        <p style={{ fontSize: 13, color: 'var(--t-text-secondary)', marginBottom: 10, lineHeight: 1.6 }}>
          Create a project-scoped API key in <a href={`/runloop/p/${selectedProject?.id || 'demo-project'}/api-keys`} style={{ color: 'var(--t-accent)', textDecoration: 'underline' }}>Settings → API Keys</a> and pass it as a Bearer token. Keys are tied to a single project &mdash; you cannot reach another project&rsquo;s data with one.
        </p>
        <CodeBlock
          lang="bash"
          code={`export RUNLOOP_API_KEY="rl_..."
export RUNLOOP_BASE="${baseUrl}"

curl "$RUNLOOP_BASE/api/projects" \\
  -H "Authorization: Bearer $RUNLOOP_API_KEY"`}
        />
      </section>

      {/* Base URL */}
      <section className="mb-8">
        <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--t-text)', marginBottom: 10 }}>
          2. Base URL
        </h2>
        <CodeBlock code={baseUrl} />
        <p style={{ fontSize: 12, color: 'var(--t-text-muted)', marginTop: 6 }}>
          The web app proxies <code>/api/*</code> to the Go engine. You can hit <code>{baseUrl}/proxy/engine/*</code> directly if you want to skip the proxy.
        </p>
      </section>

      {/* Endpoints by group */}
      <section className="mb-8">
        <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--t-text)', marginBottom: 10 }}>
          3. Endpoints
        </h2>
        {groups.map((group) => (
          <div key={group} className="mb-6">
            <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--t-text-secondary)', marginBottom: 8, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              {group}
            </h3>
            {ENDPOINTS.filter((e) => e.group === group).map((ep, i) => (
              <Endpoint key={i} ep={ep} baseUrl={baseUrl} />
            ))}
          </div>
        ))}
      </section>

      {/* Quick recipes */}
      <section className="mb-8">
        <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--t-text)', marginBottom: 10 }}>
          4. Quick recipes
        </h2>

        <div className="mb-5">
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

        <div className="mb-5">
          <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--t-text-secondary)', marginBottom: 6 }}>
            Subscribe to a channel (browser JS)
          </h3>
          <CodeBlock
            lang="js"
            code={`const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
const ws = new WebSocket(\`\${proto}//\${location.host}/runloop/rl/ws/channel/orders\`);
ws.onmessage = (e) => {
  const { channel, timestamp, payload } = JSON.parse(e.data);
  console.log(channel, payload);
};`}
          />
        </div>

        <div className="mb-5">
          <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--t-text-secondary)', marginBottom: 6 }}>
            Subscribe from a server (Node)
          </h3>
          <CodeBlock
            lang="js"
            code={`import WebSocket from 'ws';
const ws = new WebSocket('${baseUrl.replace(/^https?:/, 'wss:')}/rl/ws/channel/orders', {
  headers: { Authorization: \`Bearer \${process.env.RUNLOOP_API_KEY}\` },
});
ws.on('message', (raw) => {
  const { channel, timestamp, payload } = JSON.parse(raw.toString());
  // ...
});`}
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
      </section>

      <p style={{ fontSize: 11.5, color: 'var(--t-text-muted)' }}>
        Missing something?{' '}
        <a href="https://github.com/anthropics/runloop/issues" style={{ color: 'var(--t-accent)' }}>
          File an issue <ExternalLink className="w-3 h-3 inline" />
        </a>
      </p>
    </div>
  );
}
