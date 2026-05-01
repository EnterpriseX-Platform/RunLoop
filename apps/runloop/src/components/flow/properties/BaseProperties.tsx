'use client';

import React from 'react';
import { AlertCircle } from 'lucide-react';

export interface BasePropertiesProps {
  config: Record<string, any>;
  onChange: (config: Record<string, any>) => void;
  errors?: Record<string, string>;
}

const inputStyle: React.CSSProperties = {
  background: 'var(--t-input)',
  border: '1px solid var(--t-border)',
  color: 'var(--t-text)',
};

const inputClass =
  'w-full px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-[var(--t-accent)] focus:ring-2 focus:ring-[var(--t-accent)]/20 transition-all';

export function BaseProperties({ config, onChange, children }: BasePropertiesProps & { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <Section title="General">
        <div className="space-y-4">
          <TextField
            label="Node Name"
            value={config.name || ''}
            onChange={(v) => onChange({ ...config, name: v })}
            placeholder="Enter node name..."
          />
          <TextArea
            label="Description"
            value={config.description || ''}
            onChange={(v) => onChange({ ...config, description: v })}
            placeholder="What does this node do?"
            rows={2}
          />
        </div>
      </Section>

      {children}

      <Section title="Retry Policy">
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <Switch
              label="Enable Retry"
              checked={config.retry?.enabled ?? true}
              onChange={(v) => onChange({ ...config, retry: { ...config.retry, enabled: v } })}
            />
          </div>

          {config.retry?.enabled !== false && (
            <div
              className="grid grid-cols-2 gap-4 pl-4"
              style={{ borderLeft: '2px solid var(--t-border)' }}
            >
              <NumberField
                label="Max Retries"
                value={config.retry?.maxRetries ?? 3}
                onChange={(v) => onChange({ ...config, retry: { ...config.retry, maxRetries: v } })}
                min={0}
                max={10}
              />
              <SelectField
                label="Retry Strategy"
                value={config.retry?.strategy ?? 'exponential'}
                onChange={(v) => onChange({ ...config, retry: { ...config.retry, strategy: v } })}
                options={[
                  { value: 'fixed', label: 'Fixed Delay' },
                  { value: 'exponential', label: 'Exponential Backoff' },
                  { value: 'linear', label: 'Linear' },
                ]}
              />
              <NumberField
                label="Initial Delay (ms)"
                value={config.retry?.initialDelay ?? 1000}
                onChange={(v) => onChange({ ...config, retry: { ...config.retry, initialDelay: v } })}
                min={100}
                step={100}
              />
              <NumberField
                label="Max Delay (ms)"
                value={config.retry?.maxDelay ?? 30000}
                onChange={(v) => onChange({ ...config, retry: { ...config.retry, maxDelay: v } })}
                min={1000}
                step={1000}
              />
            </div>
          )}
        </div>
      </Section>

      <Section title="Error Handling">
        <div className="space-y-3">
          <Switch
            label="Continue on Error"
            description="Allow workflow to continue even if this node fails"
            checked={config.continueOnError ?? false}
            onChange={(v) => onChange({ ...config, continueOnError: v })}
          />
          <Switch
            label="Send to DLQ on Failure"
            description="Add failed execution to Dead Letter Queue"
            checked={config.sendToDLQ ?? true}
            onChange={(v) => onChange({ ...config, sendToDLQ: v })}
          />
        </div>
      </Section>
    </div>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const key = title.toLowerCase().includes('retry')
    ? 'retry'
    : title.toLowerCase().includes('error')
    ? 'errors'
    : 'config';
  return (
    <div
      data-section={key}
      className="pb-5 mb-5 last:border-0 last:mb-0 last:pb-0"
      style={{ borderBottom: '1px solid var(--t-border)' }}
    >
      <div className="flex items-center gap-2 mb-4">
        <span
          className="inline-block w-1 h-3 rounded-full"
          style={{ background: 'var(--t-accent)', opacity: 0.6 }}
        />
        <h3
          className="text-[11px] font-semibold uppercase"
          style={{ color: 'var(--t-text-secondary)', letterSpacing: '0.1em' }}
        >
          {title}
        </h3>
      </div>
      {children}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label
      className="block text-sm font-medium mb-1.5"
      style={{ color: 'var(--t-text-secondary)' }}
    >
      {children}
    </label>
  );
}

export function TextField({
  label, value, onChange, placeholder, type = 'text', error,
}: {
  label: string; value: string; onChange: (value: string) => void;
  placeholder?: string; type?: string; error?: string;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={inputClass}
        style={{ ...inputStyle, borderColor: error ? '#EF4444' : 'var(--t-border)' }}
      />
      {error && (
        <p className="text-xs mt-1.5 flex items-center gap-1" style={{ color: '#EF4444' }}>
          <AlertCircle className="w-3 h-3" />
          {error}
        </p>
      )}
    </div>
  );
}

export function TextArea({
  label, value, onChange, placeholder, rows = 3,
}: {
  label: string; value: string; onChange: (value: string) => void;
  placeholder?: string; rows?: number;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className={`${inputClass} font-mono text-sm resize-y`}
        style={inputStyle}
      />
    </div>
  );
}

export function SelectField({
  label, value, onChange, options,
}: {
  label: string; value: string; onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <Label>{label}</Label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass}
        style={inputStyle}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}

export function NumberField({
  label, value, onChange, min, max, step = 1,
}: {
  label: string; value: number; onChange: (value: number) => void;
  min?: number; max?: number; step?: number;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        min={min}
        max={max}
        step={step}
        className={inputClass}
        style={inputStyle}
      />
    </div>
  );
}

export function Switch({
  label, description, checked, onChange,
}: {
  label: string; description?: string; checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <div className="relative mt-0.5">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only"
        />
        <div
          className="w-10 h-5 rounded-full transition-colors"
          style={{ background: checked ? 'var(--t-accent)' : 'var(--t-border)' }}
        >
          <div
            className={`w-4 h-4 rounded-full bg-white transition-transform ${
              checked ? 'translate-x-5' : 'translate-x-0.5'
            } mt-0.5`}
          />
        </div>
      </div>
      <div>
        <span className="text-sm font-medium" style={{ color: 'var(--t-text)' }}>{label}</span>
        {description && (
          <p className="text-xs mt-0.5" style={{ color: 'var(--t-text-muted)' }}>{description}</p>
        )}
      </div>
    </label>
  );
}

export function SecretField({
  label, value, onChange, placeholder, suggestions,
}: {
  label: string; value: string; onChange: (value: string) => void;
  placeholder?: string; suggestions?: string[];
}) {
  const [showSecrets, setShowSecrets] = React.useState(false);
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-sm font-medium" style={{ color: 'var(--t-text-secondary)' }}>{label}</label>
        <button
          onClick={() => setShowSecrets(!showSecrets)}
          className="text-xs"
          style={{ color: 'var(--t-accent)' }}
        >
          {showSecrets ? 'Hide' : 'Show'} Available Secrets
        </button>
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || '{{secrets.MY_SECRET}}'}
        className={`${inputClass} font-mono text-sm`}
        style={inputStyle}
      />
      {showSecrets && suggestions && (
        <div
          className="mt-2 p-2 rounded-lg"
          style={{ background: 'var(--t-panel-hover)', border: '1px solid var(--t-border)' }}
        >
          <p className="text-xs mb-2" style={{ color: 'var(--t-text-muted)' }}>Click to insert:</p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((secret) => (
              <button
                key={secret}
                onClick={() => onChange(`{{secrets.${secret}}}`)}
                className="px-2 py-1 text-xs rounded"
                style={{
                  background: 'var(--t-input)',
                  border: '1px solid var(--t-border)',
                  color: 'var(--t-accent)',
                }}
              >
                {secret}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function CodeEditor({
  label, value, onChange, language, placeholder,
}: {
  label: string; value: string; onChange: (value: string) => void;
  language: string; placeholder?: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-sm font-medium" style={{ color: 'var(--t-text-secondary)' }}>{label}</label>
        <span className="text-xs uppercase" style={{ color: 'var(--t-text-muted)' }}>{language}</span>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={8}
        className={`${inputClass} font-mono text-sm resize-y`}
        style={inputStyle}
        spellCheck={false}
      />
    </div>
  );
}

export function VariableHint() {
  return (
    <div
      className="p-3 rounded-lg"
      style={{ background: 'var(--t-panel-hover)', border: '1px solid var(--t-border)' }}
    >
      <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--t-text-muted)' }}>
        <AlertCircle className="w-4 h-4" style={{ color: 'var(--t-accent)' }} />
        <span>
          Use <code style={{ color: 'var(--t-accent)' }}>{'{{nodeId.output}}'}</code> to reference outputs from previous nodes
        </span>
      </div>
    </div>
  );
}
