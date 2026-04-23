'use client';

import { BaseProperties, Section, TextField, TextArea, SelectField, SecretField } from './BaseProperties';
import { BasePropertiesProps } from './BaseProperties';

const EMAIL_ACTIONS = [
  { value: 'send_email', label: 'Send Email' },
  { value: 'send_execution_report', label: 'Send Execution Report' },
];

export function EmailNodeProperties({ config, onChange }: BasePropertiesProps) {
  return (
    <BaseProperties config={config} onChange={onChange}>
      <Section title="SMTP Configuration">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <TextField
              label="SMTP Host"
              value={config.host || ''}
              onChange={(v) => onChange({ ...config, host: v })}
              placeholder="smtp.gmail.com"
            />
            <TextField
              label="SMTP Port"
              value={String(config.port || '587')}
              onChange={(v) => onChange({ ...config, port: v })}
            />
          </div>

          <TextField
            label="Username"
            value={config.username || ''}
            onChange={(v) => onChange({ ...config, username: v })}
            placeholder="your@email.com"
          />

          <SecretField
            label="Password"
            value={config.password || ''}
            onChange={(v) => onChange({ ...config, password: v })}
            placeholder="{{secrets.SMTP_PASSWORD}}"
          />

          <TextField
            label="From Address"
            value={config.from || ''}
            onChange={(v) => onChange({ ...config, from: v })}
            placeholder="noreply@company.com"
          />
        </div>
      </Section>

      <Section title="Email Content">
        <div className="space-y-4">
          <SelectField
            label="Action"
            value={config.action || 'send_email'}
            onChange={(v) => onChange({ ...config, action: v })}
            options={EMAIL_ACTIONS}
          />

          {config.action === 'send_email' ? (
            <>
              <TextField
                label="To"
                value={config.to || ''}
                onChange={(v) => onChange({ ...config, to: v })}
                placeholder="recipient@example.com"
              />

              <div className="grid grid-cols-2 gap-4">
                <TextField
                  label="CC"
                  value={config.cc || ''}
                  onChange={(v) => onChange({ ...config, cc: v })}
                  placeholder="cc@example.com"
                />
                <TextField
                  label="BCC"
                  value={config.bcc || ''}
                  onChange={(v) => onChange({ ...config, bcc: v })}
                  placeholder="bcc@example.com"
                />
              </div>

              <TextField
                label="Subject"
                value={config.subject || ''}
                onChange={(v) => onChange({ ...config, subject: v })}
                placeholder="Email subject"
              />

              <TextArea
                label="Body"
                value={config.body || ''}
                onChange={(v) => onChange({ ...config, body: v })}
                placeholder="Email body..."
                rows={6}
              />

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={config.html || false}
                  onChange={(e) => onChange({ ...config, html: e.target.checked })}
                  className="rounded border-[#232326] bg-[#0a0a0b] text-[#0ea5e9]"
                />
                <span className="text-sm text-[#a1a1aa]">Send as HTML</span>
              </label>
            </>
          ) : (
            <>
              <TextField
                label="To"
                value={config.to || ''}
                onChange={(v) => onChange({ ...config, to: v })}
                placeholder="admin@company.com"
              />
              <div className="p-4 bg-[#1a1a1d] border border-[#232326] rounded-lg">
                <p className="text-sm text-[#71717a]">
                  This will send a formatted execution report with status, logs, and details.
                </p>
              </div>
            </>
          )}
        </div>
      </Section>
    </BaseProperties>
  );
}
