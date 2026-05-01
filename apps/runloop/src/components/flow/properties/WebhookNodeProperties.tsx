'use client';
import { BaseProperties, Section, TextField, TextArea, SelectField } from './BaseProperties';
import { BasePropertiesProps } from './BaseProperties';

export function WebhookNodeProperties({ config, onChange }: BasePropertiesProps) {
  return (
    <BaseProperties config={config} onChange={onChange}>
      <Section title="Webhook Out">
        <TextField
          label="URL"
          value={config.url || ''}
          onChange={(v) => onChange({ ...config, url: v })}
          placeholder="https://api.partner.com/events"
        />
        <SelectField
          label="Method"
          value={config.method || 'POST'}
          onChange={(v) => onChange({ ...config, method: v })}
          options={[
            { value: 'POST', label: 'POST' },
            { value: 'PUT',  label: 'PUT' },
            { value: 'PATCH', label: 'PATCH' },
          ]}
        />
        <TextArea
          label="Body (JSON)"
          value={config.body || ''}
          onChange={(v) => onChange({ ...config, body: v })}
          placeholder={'{ "event": "order.created", "orderId": "${{prev.output.id}}" }'}
          rows={5}
        />
      </Section>
      <Section title="HMAC Signing (optional)">
        <TextField
          label="Secret"
          value={config.secret || ''}
          onChange={(v) => onChange({ ...config, secret: v })}
          placeholder="${{secrets.PARTNER_HMAC}}"
        />
        <TextField
          label="Signature header"
          value={config.signatureHeader || ''}
          onChange={(v) => onChange({ ...config, signatureHeader: v })}
          placeholder="X-Signature (default)"
        />
        <p className="text-xs mt-2" style={{ color: 'var(--t-text-muted)' }}>
          HMAC-SHA256 of the request body, hex-encoded. Leave secret blank to skip signing.
        </p>
      </Section>
    </BaseProperties>
  );
}
