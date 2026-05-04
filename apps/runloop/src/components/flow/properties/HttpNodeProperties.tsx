'use client';

import { BaseProperties, Section, TextField, TextArea, SelectField, SecretField, VariableHint, Switch } from './BaseProperties';
import { BasePropertiesProps } from './BaseProperties';

const HTTP_METHODS = [
  { value: 'GET', label: 'GET' },
  { value: 'POST', label: 'POST' },
  { value: 'PUT', label: 'PUT' },
  { value: 'PATCH', label: 'PATCH' },
  { value: 'DELETE', label: 'DELETE' },
  { value: 'HEAD', label: 'HEAD' },
  { value: 'OPTIONS', label: 'OPTIONS' },
];

export function HttpNodeProperties({ config, onChange }: BasePropertiesProps) {
  return (
    <BaseProperties config={config} onChange={onChange}>
      <Section title="Request">
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-3">
            <div className="col-span-1">
              <SelectField
                label="Method"
                value={config.method || 'GET'}
                onChange={(v) => onChange({ ...config, method: v })}
                options={HTTP_METHODS}
              />
            </div>
            <div className="col-span-3">
              <TextField
                label="URL"
                value={config.url || ''}
                onChange={(v) => onChange({ ...config, url: v })}
                placeholder="https://api.example.com/users"
              />
            </div>
          </div>
          
          <VariableHint />

          {/* Timeout */}
          <div className="grid grid-cols-2 gap-4">
            <TextField
              label="Timeout (seconds)"
              type="number"
              value={String(config.timeout || 30)}
              onChange={(v) => onChange({ ...config, timeout: parseInt(v) || 30 })}
            />
            <Switch
              label="Follow Redirects"
              checked={config.followRedirects !== false}
              onChange={(v) => onChange({ ...config, followRedirects: v })}
            />
          </div>
        </div>
      </Section>

      <Section title="Authentication">
        <div className="space-y-4">
          <SelectField
            label="Auth Type"
            value={config.authType || 'none'}
            onChange={(v) => onChange({ ...config, authType: v })}
            options={[
              { value: 'none', label: 'None' },
              { value: 'bearer', label: 'Bearer Token' },
              { value: 'basic', label: 'Basic Auth' },
              { value: 'apiKey', label: 'API Key' },
            ]}
          />

          {config.authType === 'bearer' && (
            <SecretField
              label="Token"
              value={config.authToken || ''}
              onChange={(v) => onChange({ ...config, authToken: v })}
              placeholder="{{secrets.API_TOKEN}}"
              suggestions={['API_TOKEN', 'JWT_TOKEN', 'BEARER_TOKEN']}
            />
          )}

          {config.authType === 'basic' && (
            <div className="grid grid-cols-2 gap-4">
              <TextField
                label="Username"
                value={config.authUsername || ''}
                onChange={(v) => onChange({ ...config, authUsername: v })}
              />
              <SecretField
                label="Password"
                value={config.authPassword || ''}
                onChange={(v) => onChange({ ...config, authPassword: v })}
              />
            </div>
          )}

          {config.authType === 'apiKey' && (
            <div className="grid grid-cols-2 gap-4">
              <TextField
                label="Key Name"
                value={config.apiKeyName || ''}
                onChange={(v) => onChange({ ...config, apiKeyName: v })}
                placeholder="X-API-Key"
              />
              <SecretField
                label="Key Value"
                value={config.apiKeyValue || ''}
                onChange={(v) => onChange({ ...config, apiKeyValue: v })}
              />
            </div>
          )}
        </div>
      </Section>

      <Section title="Headers">
        <HeadersEditor
          headers={config.headers || {}}
          onChange={(headers) => onChange({ ...config, headers })}
        />
      </Section>

      {(config.method === 'POST' || config.method === 'PUT' || config.method === 'PATCH') && (
        <Section title="Body">
          <div className="space-y-4">
            <SelectField
              label="Content Type"
              value={config.contentType || 'application/json'}
              onChange={(v) => onChange({ ...config, contentType: v })}
              options={[
                { value: 'application/json', label: 'JSON' },
                { value: 'application/x-www-form-urlencoded', label: 'Form URL Encoded' },
                { value: 'text/plain', label: 'Plain Text' },
                { value: 'application/xml', label: 'XML' },
              ]}
            />
            <TextArea
              label="Body"
              value={config.body || ''}
              onChange={(v) => onChange({ ...config, body: v })}
              placeholder={'{\n  "key": "value"\n}'}
              rows={6}
            />
            <VariableHint />
          </div>
        </Section>
      )}

      {/* Body-level success check. HTTP 2xx isn't always a real success —
          Mendix microflows / GraphQL / SOAP-over-JSON return 200 with an
          in-body status flag. This expression runs against the response;
          if it doesn't evaluate to true, the node fails with a precise
          error in the execution detail (instead of silently SUCCESS). */}
      <Section title="Success Check (optional)">
        <div className="text-[11px] text-[#71717a] mb-2 leading-relaxed">
          Expression evaluated against the response. If false → node fails.
          Available: <code className="text-[#0ea5e9]">body</code>,{' '}
          <code className="text-[#0ea5e9]">statusCode</code>,{' '}
          <code className="text-[#0ea5e9]">headers</code>.
        </div>
        <TextArea
          label="successWhen"
          value={config.successWhen || ''}
          onChange={(v) => onChange({ ...config, successWhen: v })}
          placeholder={'body.responseStatus == "SUCCESS"\n// or\nlen(body.errors) == 0\n// or\nstatusCode == 200 && body.code == "OK"'}
          rows={3}
        />
        <div className="text-[10px] text-[#52525b] mt-1">
          Examples ·{' '}
          <button
            type="button"
            className="text-[#0ea5e9] hover:underline"
            onClick={() => onChange({ ...config, successWhen: 'body.responseStatus == "SUCCESS"' })}
          >Mendix microflow</button>
          {' · '}
          <button
            type="button"
            className="text-[#0ea5e9] hover:underline"
            onClick={() => onChange({ ...config, successWhen: 'len(body.errors) == 0' })}
          >GraphQL</button>
          {' · '}
          <button
            type="button"
            className="text-[#0ea5e9] hover:underline"
            onClick={() => onChange({ ...config, successWhen: 'body.success == true' })}
          >REST {'{success: true}'}</button>
        </div>
      </Section>
    </BaseProperties>
  );
}

function HeadersEditor({ headers, onChange }: { headers: Record<string, string>; onChange: (headers: Record<string, string>) => void }) {
  const entries = Object.entries(headers);
  if (entries.length === 0) {
    entries.push(['', '']);
  }

  const updateHeader = (index: number, key: string, value: string) => {
    const newEntries = [...entries];
    newEntries[index] = [key, value];
    
    // Remove empty rows except last
    const filtered = newEntries.filter(([k, v], i) => i === newEntries.length - 1 || k !== '' || v !== '');
    if (filtered[filtered.length - 1][0] !== '' || filtered[filtered.length - 1][1] !== '') {
      filtered.push(['', '']);
    }
    
    onChange(Object.fromEntries(filtered.filter(([k]) => k !== '')));
  };

  return (
    <div className="space-y-2">
      {entries.map(([key, value], index) => (
        <div key={index} className="grid grid-cols-2 gap-2">
          <input
            type="text"
            value={key}
            onChange={(e) => updateHeader(index, e.target.value, value)}
            placeholder="Header name"
            className="px-3 py-2 bg-[#0a0a0b] border border-[#232326] rounded-lg text-white placeholder-[#52525b] focus:outline-none focus:border-[#0ea5e9] text-sm"
          />
          <input
            type="text"
            value={value}
            onChange={(e) => updateHeader(index, key, e.target.value)}
            placeholder="Value"
            className="px-3 py-2 bg-[#0a0a0b] border border-[#232326] rounded-lg text-white placeholder-[#52525b] focus:outline-none focus:border-[#0ea5e9] text-sm font-mono"
          />
        </div>
      ))}
    </div>
  );
}
