'use client';

import { BaseProperties, Section, TextField, Switch, CodeEditor } from './BaseProperties';
import { BasePropertiesProps } from './BaseProperties';

export function PythonNodeProperties({ config, onChange }: BasePropertiesProps) {
  const isFileMode = config.mode === 'file';

  return (
    <BaseProperties config={config} onChange={onChange}>
      <Section title="Python Configuration">
        <div className="space-y-4">
          <div className="flex gap-2 p-1 bg-[#0a0a0b] border border-[#232326] rounded-lg">
            <button
              onClick={() => onChange({ ...config, mode: 'code' })}
              className={`flex-1 px-3 py-1.5 rounded text-sm font-medium transition-all ${
                !isFileMode
                  ? 'bg-[#1a1a1d] text-white'
                  : 'text-[#71717a] hover:text-white'
              }`}
            >
              Inline Code
            </button>
            <button
              onClick={() => onChange({ ...config, mode: 'file' })}
              className={`flex-1 px-3 py-1.5 rounded text-sm font-medium transition-all ${
                isFileMode
                  ? 'bg-[#1a1a1d] text-white'
                  : 'text-[#71717a] hover:text-white'
              }`}
            >
              Script File
            </button>
          </div>

          {!isFileMode ? (
            <CodeEditor
              label="Python Code"
              language="python"
              value={config.code || ''}
              onChange={(v) => onChange({ ...config, code: v })}
              placeholder={`# Access input data\ndata = context.get('input', {})\n\n# Your logic here\nresult = data.get('value', 0) * 2\n\n# Return output\ncontext['output'] = {'result': result}\nprint(f"Result: {result}")`}
            />
          ) : (
            <TextField
              label="File Path"
              value={config.file || ''}
              onChange={(v) => onChange({ ...config, file: v })}
              placeholder="/path/to/script.py or {{workspace}}/script.py"
            />
          )}

          <div className="p-3 bg-[#1a1a1d] border border-[#232326] rounded-lg">
            <p className="text-xs text-[#71717a]">
              Available variables: <code className="text-[#0ea5e9]">context</code> (dict with input/output), 
              <code className="text-[#0ea5e9]">os</code>, <code className="text-[#0ea5e9]">json</code>, 
              <code className="text-[#0ea5e9]">requests</code>
            </p>
          </div>
        </div>
      </Section>

      <Section title="Dependencies">
        <TextField
          label="Requirements (one per line)"
          value={config.requirements || ''}
          onChange={(v) => onChange({ ...config, requirements: v })}
          placeholder="requests>=2.28.0\nnumpy>=1.21.0"
        />
        <p className="text-xs text-[#71717a] mt-1">
          These packages will be installed before execution
        </p>
      </Section>

      <Section title="Execution Options">
        <div className="space-y-3">
          <TextField
            label="Python Version"
            value={config.pythonVersion || '3.11'}
            onChange={(v) => onChange({ ...config, pythonVersion: v })}
            placeholder="3.11"
          />
          <TextField
            label="Timeout (seconds)"
            type="number"
            value={String(config.timeout || 300)}
            onChange={(v) => onChange({ ...config, timeout: parseInt(v) || 300 })}
          />
          <Switch
            label="Fail on stderr output"
            checked={config.failOnStderr || false}
            onChange={(v) => onChange({ ...config, failOnStderr: v })}
          />
        </div>
      </Section>
    </BaseProperties>
  );
}
