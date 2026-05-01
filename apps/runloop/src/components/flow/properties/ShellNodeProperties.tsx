'use client';

import { BaseProperties, Section, TextField, TextArea, SelectField, Switch, CodeEditor } from './BaseProperties';
import { BasePropertiesProps } from './BaseProperties';

const SHELL_TYPES = [
  { value: 'bash', label: 'Bash' },
  { value: 'sh', label: 'Shell (sh)' },
  { value: 'zsh', label: 'Zsh' },
  { value: 'powershell', label: 'PowerShell' },
  { value: 'cmd', label: 'Windows CMD' },
];

export function ShellNodeProperties({ config, onChange }: BasePropertiesProps) {
  const isScriptMode = config.mode === 'script';

  return (
    <BaseProperties config={config} onChange={onChange}>
      <Section title="Shell Configuration">
        <div className="space-y-4">
          <SelectField
            label="Shell Type"
            value={config.shell || 'bash'}
            onChange={(v) => onChange({ ...config, shell: v })}
            options={SHELL_TYPES}
          />

          <div className="flex gap-2 p-1 bg-[#0a0a0b] border border-[#232326] rounded-lg">
            <button
              onClick={() => onChange({ ...config, mode: 'command' })}
              className={`flex-1 px-3 py-1.5 rounded text-sm font-medium transition-all ${
                !isScriptMode
                  ? 'bg-[#1a1a1d] text-white'
                  : 'text-[#71717a] hover:text-white'
              }`}
            >
              Single Command
            </button>
            <button
              onClick={() => onChange({ ...config, mode: 'script' })}
              className={`flex-1 px-3 py-1.5 rounded text-sm font-medium transition-all ${
                isScriptMode
                  ? 'bg-[#1a1a1d] text-white'
                  : 'text-[#71717a] hover:text-white'
              }`}
            >
              Script File
            </button>
          </div>

          {!isScriptMode ? (
            <TextField
              label="Command"
              value={config.command || ''}
              onChange={(v) => onChange({ ...config, command: v })}
              placeholder="ls -la"
            />
          ) : (
            <CodeEditor
              label="Script"
              language={config.shell || 'bash'}
              value={config.script || ''}
              onChange={(v) => onChange({ ...config, script: v })}
              placeholder={`#!/bin/bash\n\necho "Hello from RunLoop"\nls -la`}
            />
          )}
        </div>
      </Section>

      <Section title="Working Directory">
        <TextField
          label="Working Directory (optional)"
          value={config.workingDir || ''}
          onChange={(v) => onChange({ ...config, workingDir: v })}
          placeholder="/tmp or {{workspace}}"
        />
      </Section>

      <Section title="Environment Variables">
        <div className="space-y-2">
          <TextArea
            label="Environment (JSON)"
            value={config.env || ''}
            onChange={(v) => onChange({ ...config, env: v })}
            placeholder={'{\n  "API_KEY": "{{secrets.API_KEY}}",\n  "DEBUG": "true"\n}'}
            rows={4}
          />
        </div>
      </Section>

      <Section title="Execution Options">
        <div className="space-y-3">
          <Switch
            label="Fail on non-zero exit code"
            checked={config.failOnError !== false}
            onChange={(v) => onChange({ ...config, failOnError: v })}
          />
          <Switch
            label="Capture stderr"
            checked={config.captureStderr !== false}
            onChange={(v) => onChange({ ...config, captureStderr: v })}
          />
          <TextField
            label="Timeout (seconds)"
            type="number"
            value={String(config.timeout || 60)}
            onChange={(v) => onChange({ ...config, timeout: parseInt(v) || 60 })}
          />
        </div>
      </Section>
    </BaseProperties>
  );
}
