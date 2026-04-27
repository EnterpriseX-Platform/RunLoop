'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Save, Loader2, AlertCircle } from 'lucide-react';
import {
  ControlBreadcrumb, PageHeader, SchematicPanel, SharpButton, MONO,
} from '@/components/ControlChrome';

const FONT = "'IBM Plex Sans Thai', 'IBM Plex Sans', sans-serif";
const T = {
  panel: 'var(--t-panel)',
  border: 'var(--t-border)',
  input: 'var(--t-input)',
  text: 'var(--t-text)',
  textSec: 'var(--t-text-secondary)',
  textMuted: 'var(--t-text-muted)',
  accent: 'var(--t-accent)',
  red: '#EF4444',
};

type Backend = 'postgres' | 'redis' | 'rabbitmq' | 'kafka';

interface FlowOption { id: string; name: string }

const BACKEND_FIELDS: Record<Backend, { key: string; label: string; placeholder: string; required?: boolean; hint?: string }[]> = {
  postgres: [],
  redis: [
    { key: 'url', label: 'Redis URL', placeholder: 'redis://host:6379', required: true },
    { key: 'stream', label: 'Stream name', placeholder: 'email-outbox', required: true, hint: 'The Redis Stream that stores jobs' },
    { key: 'group', label: 'Consumer group', placeholder: 'runloop (default)' },
  ],
  rabbitmq: [
    { key: 'url', label: 'AMQP URL', placeholder: 'amqp://guest:guest@host:5672', required: true },
    { key: 'queue', label: 'Queue name', placeholder: 'email.outbox', required: true },
    { key: 'exchange', label: 'Exchange', placeholder: 'runloop (default)' },
  ],
  kafka: [
    { key: 'brokers', label: 'Brokers (comma-sep)', placeholder: 'host1:9092,host2:9092', required: true, hint: 'Comma-separated list of broker host:port pairs' },
    { key: 'topic', label: 'Topic', placeholder: 'email-outbox', required: true },
    { key: 'groupId', label: 'Group ID', placeholder: 'runloop-<queue> (default)' },
  ],
};

export default function NewQueuePage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.projectId as string;

  const [name, setName] = useState('');
  const [flowId, setFlowId] = useState('');
  const [backend, setBackend] = useState<Backend>('postgres');
  const [bcfg, setBcfg] = useState<Record<string, string>>({});

  const [concurrency, setConcurrency] = useState(1);
  const [maxAttempts, setMaxAttempts] = useState(3);
  const [visibilitySec, setVisibilitySec] = useState(300);

  const [flows, setFlows] = useState<FlowOption[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/runloop/api/flows?projectId=${projectId}`)
      .then((r) => r.json())
      .then((d) => setFlows((d.data || []).map((f: any) => ({ id: f.id, name: f.name }))))
      .catch(() => setFlows([]));
  }, [projectId]);

  async function submit() {
    setError(null);
    if (!name.trim()) return setError('Queue name is required');
    if (!flowId) return setError('Pick a flow for this queue');

    const backendConfig: Record<string, any> = {};
    for (const f of BACKEND_FIELDS[backend]) {
      const v = bcfg[f.key];
      if (!v) continue;
      if (f.key === 'brokers') {
        backendConfig[f.key] = v.split(',').map((s) => s.trim()).filter(Boolean);
      } else {
        backendConfig[f.key] = v;
      }
    }

    setSubmitting(true);
    try {
      const res = await fetch('/runloop/api/queues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, projectId, flowId, backend, backendConfig,
          concurrency, maxAttempts, visibilitySec,
          enabled: true,
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || `HTTP ${res.status}`);
      }
      router.push(`/p/${projectId}/queues/${encodeURIComponent(name)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
      setSubmitting(false);
    }
  }

  return (
    <div style={{ fontFamily: FONT, maxWidth: 760 }}>
      <Link
        href={`/p/${projectId}/queues`}
        className="inline-flex items-center gap-1.5 mb-4 hover:opacity-80"
        style={{ fontSize: 12, color: T.textMuted }}
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Back to Queues
      </Link>

      <div className="mb-6">
        <h1 style={{ fontSize: 24, fontWeight: 600, color: T.text, letterSpacing: '-0.02em' }}>New Queue</h1>
        <p style={{ fontSize: 13, color: T.textMuted, marginTop: 6 }}>
          A queue binds a flow to a durable job inbox. Producers enqueue jobs; the engine processes them with retry + DLQ.
        </p>
      </div>

      {error && (
        <div
          className="mb-4 p-3 flex items-start gap-2"
          style={{
            background: 'color-mix(in srgb, #EF4444 10%, transparent)',
            border: '1px solid color-mix(in srgb, #EF4444 30%, transparent)',
            borderRadius: 2,
          }}
        >
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: T.red }} />
          <span style={{ fontFamily: MONO, fontSize: 12, color: T.red, letterSpacing: '0.04em' }}>
            {error}
          </span>
        </div>
      )}

      <Section title="BASICS">
        <Field label="Name" required hint="Used as the queue identifier and in the producer URL">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="email-outbox"
            style={inputStyle()}
          />
        </Field>
        <Field label="Flow" required hint="Each job triggers this flow with its payload as input">
          <select value={flowId} onChange={(e) => setFlowId(e.target.value)} style={inputStyle()}>
            <option value="">Select a flow…</option>
            {flows.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        </Field>
      </Section>

      <Section title="BACKEND">
        <div className="flex gap-1.5 mb-3">
          {(['postgres', 'redis', 'rabbitmq', 'kafka'] as Backend[]).map((b) => {
            const active = backend === b;
            return (
              <button
                key={b}
                onClick={() => { setBackend(b); setBcfg({}); }}
                style={{
                  padding: '7px 14px', borderRadius: 2,
                  fontFamily: MONO, fontSize: 11, fontWeight: 500, letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  background: active ? T.accent : 'transparent',
                  color: active ? '#fff' : T.textSec,
                  border: `1px solid ${active ? T.accent : T.border}`,
                  minWidth: 100,
                }}
              >
                {b === 'rabbitmq' ? 'RabbitMQ' : b}
              </button>
            );
          })}
        </div>

        {BACKEND_FIELDS[backend].length === 0 ? (
          <p
            style={{
              fontFamily: MONO, fontSize: 11, color: T.textMuted,
              padding: '8px 0', letterSpacing: '0.06em',
            }}
          >
            // POSTGRES USES THE ENGINE'S OWN DATABASE — NO EXTRA CONFIG NEEDED
          </p>
        ) : (
          BACKEND_FIELDS[backend].map((f) => (
            <Field key={f.key} label={f.label} required={f.required} hint={f.hint}>
              <input
                value={bcfg[f.key] || ''}
                onChange={(e) => setBcfg({ ...bcfg, [f.key]: e.target.value })}
                placeholder={f.placeholder}
                style={inputStyle()}
              />
            </Field>
          ))
        )}
      </Section>

      <Section title="DELIVERY">
        <div className="grid grid-cols-3 gap-3">
          <Field label="Concurrency" hint="Max parallel jobs per worker">
            <input
              type="number" min={1} max={64} value={concurrency}
              onChange={(e) => setConcurrency(parseInt(e.target.value) || 1)}
              style={inputStyle()}
            />
          </Field>
          <Field label="Max attempts" hint="DLQ after N failures">
            <input
              type="number" min={1} max={20} value={maxAttempts}
              onChange={(e) => setMaxAttempts(parseInt(e.target.value) || 3)}
              style={inputStyle()}
            />
          </Field>
          <Field label="Visibility (sec)" hint="Lease duration">
            <input
              type="number" min={10} max={3600} value={visibilitySec}
              onChange={(e) => setVisibilitySec(parseInt(e.target.value) || 300)}
              style={inputStyle()}
            />
          </Field>
        </div>
      </Section>

      <div className="flex items-center gap-2 pt-2">
        <SharpButton onClick={submit} disabled={submitting}>
          {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          {submitting ? 'Creating…' : 'Create Queue'}
        </SharpButton>
        <SharpButton variant="ghost" href={`/p/${projectId}/queues`}>
          Cancel
        </SharpButton>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <SchematicPanel className="mb-3">
      <h3
        style={{
          fontSize: 12, fontWeight: 600, color: T.textSec,
          marginBottom: 14, letterSpacing: '0.04em', textTransform: 'uppercase',
        }}
      >
        {title}
      </h3>
      <div className="space-y-3">{children}</div>
    </SchematicPanel>
  );
}

function Field({
  label, hint, required, children,
}: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label
        style={{
          fontFamily: MONO, fontSize: 10.5, fontWeight: 500, color: T.textSec,
          display: 'block', marginBottom: 5, letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}
      >
        {label} {required && <span style={{ color: T.accent }}>*</span>}
      </label>
      {children}
      {hint && (
        <p style={{ fontFamily: MONO, fontSize: 10.5, color: T.textMuted, marginTop: 4, letterSpacing: '0.02em' }}>
          {hint}
        </p>
      )}
    </div>
  );
}

function inputStyle(): React.CSSProperties {
  return {
    width: '100%',
    background: T.input,
    border: `1px solid ${T.border}`,
    color: T.text,
    borderRadius: 2,
    padding: '8px 12px',
    fontFamily: MONO,
    fontSize: 12,
    outline: 'none',
  };
}
