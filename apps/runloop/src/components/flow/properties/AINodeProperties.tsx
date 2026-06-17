'use client';

import {
  BaseProperties,
  Section,
  TextField,
  TextArea,
  SelectField,
  NumberField,
  SecretField,
  VariableHint,
} from './BaseProperties';
import { BasePropertiesProps } from './BaseProperties';

const PROVIDERS = [
  { value: '', label: 'Auto (project default)' },
  { value: 'claude', label: 'Claude (Anthropic)' },
  { value: 'openai', label: 'OpenAI (ChatGPT)' },
  { value: 'kimi', label: 'Kimi (Moonshot)' },
];

const RESPONSE_FORMATS = [
  { value: 'text', label: 'Text' },
  { value: 'json', label: 'JSON object' },
];

const MODEL_PLACEHOLDER: Record<string, string> = {
  claude: 'claude-sonnet-4-7',
  openai: 'gpt-4o-mini',
  kimi: 'kimi-latest',
  '': 'provider default',
};

export function AINodeProperties({ config, onChange }: BasePropertiesProps) {
  const provider = config.provider || '';
  const jsonMode = (config.responseFormat || 'text') === 'json';

  return (
    <BaseProperties config={config} onChange={onChange}>
      <Section title="Model">
        <div className="space-y-4">
          <SelectField
            label="Provider"
            value={provider}
            onChange={(v) => onChange({ ...config, provider: v })}
            options={PROVIDERS}
          />
          <p className="text-xs -mt-2" style={{ color: 'var(--t-text-muted)' }}>
            Keys come from the secret vault (<code style={{ color: 'var(--t-accent)' }}>CLAUDE_API_KEY</code>,{' '}
            <code style={{ color: 'var(--t-accent)' }}>OPENAI_API_KEY</code>,{' '}
            <code style={{ color: 'var(--t-accent)' }}>KIMI_API_KEY</code>). Auto picks your project default.
          </p>
          <TextField
            label="Model (optional)"
            value={config.model || ''}
            onChange={(v) => onChange({ ...config, model: v })}
            placeholder={MODEL_PLACEHOLDER[provider] || 'provider default'}
          />
        </div>
      </Section>

      <Section title="Prompt">
        <div className="space-y-4">
          <TextArea
            label="System Prompt (optional)"
            value={config.systemPrompt || ''}
            onChange={(v) => onChange({ ...config, systemPrompt: v })}
            placeholder="You are a concise assistant that summarizes incident reports."
            rows={3}
          />
          <TextArea
            label="Prompt"
            value={config.prompt || ''}
            onChange={(v) => onChange({ ...config, prompt: v })}
            placeholder={'Summarize this payload in one sentence:\n${{input.body}}'}
            rows={6}
          />
          <VariableHint />
        </div>
      </Section>

      <Section title="Output & Tuning">
        <div className="space-y-4">
          <SelectField
            label="Response Format"
            value={config.responseFormat || 'text'}
            onChange={(v) => onChange({ ...config, responseFormat: v })}
            options={RESPONSE_FORMATS}
          />
          {jsonMode && (
            <p className="text-xs -mt-2" style={{ color: 'var(--t-text-muted)' }}>
              The model is asked to return one JSON object. Reference fields downstream as{' '}
              <code style={{ color: 'var(--t-accent)' }}>{'${{nodeId.json.field}}'}</code>.
            </p>
          )}
          <div className="grid grid-cols-2 gap-4">
            <NumberField
              label="Max Tokens"
              value={config.maxTokens ?? 1024}
              onChange={(v) => onChange({ ...config, maxTokens: v })}
              min={1}
              max={4096}
              step={64}
            />
            <NumberField
              label="Temperature"
              value={config.temperature ?? 0.7}
              onChange={(v) => onChange({ ...config, temperature: v })}
              min={0}
              max={2}
              step={0.1}
            />
          </div>
          <NumberField
            label="Timeout (seconds)"
            value={config.timeout ?? 60}
            onChange={(v) => onChange({ ...config, timeout: v })}
            min={1}
            max={600}
          />
        </div>
      </Section>

      <Section title="Advanced">
        <div className="space-y-4">
          <SecretField
            label="API Key Override (optional)"
            value={config.apiKey || ''}
            onChange={(v) => onChange({ ...config, apiKey: v })}
            placeholder="{{secrets.CLAUDE_API_KEY}}"
            suggestions={['CLAUDE_API_KEY', 'OPENAI_API_KEY', 'KIMI_API_KEY']}
          />
          <p className="text-xs -mt-2" style={{ color: 'var(--t-text-muted)' }}>
            Leave empty to use the provider key from the vault automatically.
          </p>
        </div>
      </Section>
    </BaseProperties>
  );
}
