'use client';
import { BaseProperties, Section, TextField, NumberField } from './BaseProperties';
import { BasePropertiesProps } from './BaseProperties';

export function WaitWebhookNodeProperties({ config, onChange }: BasePropertiesProps) {
  const baseHint =
    typeof window !== 'undefined'
      ? `${window.location.origin}/runloop/api/webhooks/wait/<correlationId>`
      : '/runloop/api/webhooks/wait/<correlationId>';
  return (
    <BaseProperties config={config} onChange={onChange}>
      <Section title="Wait for Webhook">
        <TextField
          label="Correlation ID"
          value={config.correlationId || ''}
          onChange={(v) => onChange({ ...config, correlationId: v })}
          placeholder={'${{prev.output.callbackId}}  or  approval-${{run.id}}'}
        />
        <NumberField
          label="Timeout (seconds)"
          value={config.timeoutSec || 300}
          onChange={(v) => onChange({ ...config, timeoutSec: v })}
          min={10}
          max={86400}
        />
        <div className="mt-3 p-3 rounded-lg" style={{ background: 'var(--t-panel-hover)', border: '1px solid var(--t-border)' }}>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--t-text-muted)' }}>
            This node parks the flow until an HTTP POST arrives at:
          </p>
          <code className="block mt-1 text-xs" style={{ color: 'var(--t-accent)' }}>
            POST {baseHint}
          </code>
          <p className="text-xs mt-2" style={{ color: 'var(--t-text-muted)' }}>
            The request body lands in the node&apos;s output. Make the correlation id unguessable —
            anyone with the URL can resume the flow.
          </p>
        </div>
      </Section>
    </BaseProperties>
  );
}
