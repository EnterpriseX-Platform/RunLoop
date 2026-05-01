'use client';

import { BaseProperties, Section, TextField, TextArea, SelectField, SecretField } from './BaseProperties';
import { BasePropertiesProps } from './BaseProperties';

const SLACK_ACTIONS = [
  { value: 'send_message', label: 'Send Message' },
  { value: 'send_notification', label: 'Send Execution Notification' },
];

export function SlackNodeProperties({ config, onChange }: BasePropertiesProps) {
  return (
    <BaseProperties config={config} onChange={onChange}>
      <Section title="Connection">
        <div className="space-y-4">
          <SecretField
            label="Webhook URL"
            value={config.webhookUrl || ''}
            onChange={(v) => onChange({ ...config, webhookUrl: v })}
            placeholder="{{secrets.SLACK_WEBHOOK_URL}}"
            suggestions={['SLACK_WEBHOOK_URL', 'SLACK_WEBHOOK']}
          />
        </div>
      </Section>

      <Section title="Message">
        <div className="space-y-4">
          <SelectField
            label="Action"
            value={config.action || 'send_message'}
            onChange={(v) => onChange({ ...config, action: v })}
            options={SLACK_ACTIONS}
          />

          <TextField
            label="Channel (optional)"
            value={config.channel || ''}
            onChange={(v) => onChange({ ...config, channel: v })}
            placeholder="#general"
          />

          {config.action === 'send_message' ? (
            <>
              <TextArea
                label="Message Text"
                value={config.text || ''}
                onChange={(v) => onChange({ ...config, text: v })}
                placeholder="Hello from RunLoop!"
                rows={4}
              />
              <TextArea
                label="Block Kit JSON (optional)"
                value={config.blocks || ''}
                onChange={(v) => onChange({ ...config, blocks: v })}
                placeholder={'[\n  {\n    "type": "section",\n    "text": {\n      "type": "mrkdwn",\n      "text": "Hello World"\n    }\n  }\n]'}
                rows={6}
              />
            </>
          ) : (
            <div className="p-4 bg-[#1a1a1d] border border-[#232326] rounded-lg">
              <p className="text-sm text-[#71717a]">
                This will send a formatted notification with execution status, duration, and details.
              </p>
            </div>
          )}
        </div>
      </Section>
    </BaseProperties>
  );
}
