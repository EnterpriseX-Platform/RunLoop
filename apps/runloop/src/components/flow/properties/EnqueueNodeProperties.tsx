'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { BaseProperties, Section, SelectField, TextArea, TextField } from './BaseProperties';
import { BasePropertiesProps } from './BaseProperties';

interface QueueRow {
  name: string;
  flowId: string;
  backend: string;
  enabled: boolean;
}

export function EnqueueNodeProperties({ config, onChange }: BasePropertiesProps) {
  const params = useParams();
  const projectId = params?.projectId as string | undefined;
  const [queues, setQueues] = useState<QueueRow[]>([]);

  useEffect(() => {
    if (!projectId) return;
    fetch(`/runloop/api/queues?projectId=${projectId}`)
      .then((r) => r.json())
      .then((d) => setQueues(d.data || []))
      .catch(() => {});
  }, [projectId]);

  const selected = queues.find((q) => q.name === config.queue);

  return (
    <BaseProperties config={config} onChange={onChange}>
      <Section title="Target Queue">
        <SelectField
          label="Queue"
          value={config.queue || ''}
          onChange={(v) => onChange({ ...config, queue: v })}
          options={[
            { value: '', label: 'Select a queue…' },
            ...queues.map((q) => ({
              value: q.name,
              label: `${q.name}${q.enabled ? '' : ' (disabled)'} · ${q.backend}`,
            })),
          ]}
        />
        {selected && (
          <p className="text-xs mt-2" style={{ color: 'var(--t-text-muted)' }}>
            Bound to flow <code style={{ color: 'var(--t-accent)' }}>{selected.flowId}</code>. Each
            enqueued job triggers a separate execution of that flow with the payload as input.
          </p>
        )}
      </Section>

      <Section title="Payload">
        <TextArea
          label="Payload (JSON)"
          value={typeof config.payload === 'string' ? config.payload : JSON.stringify(config.payload || {}, null, 2)}
          onChange={(v) => {
            try { onChange({ ...config, payload: JSON.parse(v) }); }
            catch { onChange({ ...config, payload: v }); }
          }}
          placeholder={'{\n  "to": "${{loop.item.email}}",\n  "subject": "Welcome",\n  "body": "..."\n}'}
          rows={8}
        />
        <p className="text-xs mt-2" style={{ color: 'var(--t-text-muted)' }}>
          The payload becomes the bound flow&rsquo;s <code style={{ color: 'var(--t-accent)' }}>input</code>.
          Reference upstream node outputs with <code style={{ color: 'var(--t-accent)' }}>{'${{nodeId.field}}'}</code>.
        </p>
      </Section>

      <Section title="Delivery">
        <TextField
          label="Idempotency Key (optional)"
          value={config.idempotencyKey || ''}
          onChange={(v) => onChange({ ...config, idempotencyKey: v })}
          placeholder="welcome-${{user.id}}"
        />
        <p className="text-xs mt-1 mb-3" style={{ color: 'var(--t-text-muted)' }}>
          If set, duplicate submissions with the same key dedupe to the existing job &mdash; no double-send.
        </p>
        <TextField
          label="Priority (optional)"
          value={String(config.priority ?? '')}
          onChange={(v) => onChange({ ...config, priority: v === '' ? undefined : Number(v) })}
          placeholder="0"
        />
      </Section>

      <Section title="Output">
        <p className="text-xs" style={{ color: 'var(--t-text-muted)' }}>
          This node returns immediately after the job is accepted by the queue &mdash; it does NOT
          wait for the consumer flow to finish. Output exposes:
        </p>
        <ul className="text-xs mt-2 space-y-1" style={{ color: 'var(--t-text-secondary)' }}>
          <li><code style={{ color: 'var(--t-accent)' }}>jobId</code> &mdash; queue job ID for tracing</li>
          <li><code style={{ color: 'var(--t-accent)' }}>duplicate</code> &mdash; true if dedupe hit</li>
          <li><code style={{ color: 'var(--t-accent)' }}>queue</code> &mdash; queue name (echo)</li>
        </ul>
      </Section>
    </BaseProperties>
  );
}
