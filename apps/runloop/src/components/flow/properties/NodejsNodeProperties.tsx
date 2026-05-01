'use client';

import { BaseProperties, Section, TextField, Switch, CodeEditor } from './BaseProperties';
import { BasePropertiesProps } from './BaseProperties';

export function NodejsNodeProperties({ config, onChange }: BasePropertiesProps) {
  const isFileMode = config.mode === 'file';

  return (
    <BaseProperties config={config} onChange={onChange}>
      <Section title="Node.js Configuration">
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
              label="JavaScript Code"
              language="javascript"
              value={config.code || ''}
              onChange={(v) => onChange({ ...config, code: v })}
              placeholder={`// Access input data\nconst data = context.input || {};\n\n// Your logic here\nconst result = data.value * 2;\n\n// Return output\ncontext.output = { result };\nconsole.log('Result:', result);`}
            />
          ) : (
            <>
              <TextField
                label="Entry Point File"
                value={config.entryPoint || ''}
                onChange={(v) => onChange({ ...config, entryPoint: v })}
                placeholder="index.js or src/main.js"
              />
              <TextField
                label="Working Directory"
                value={config.workingDir || ''}
                onChange={(v) => onChange({ ...config, workingDir: v })}
                placeholder="/path/to/project or {{workspace}}/my-project"
              />
            </>
          )}

          <div className="p-3 bg-[#1a1a1d] border border-[#232326] rounded-lg">
            <p className="text-xs text-[#71717a]">
              Available variables: <code className="text-[#0ea5e9]">context</code> (object with input/output data),
              <code className="text-[#0ea5e9]">console</code>, <code className="text-[#0ea5e9]">process.env</code>
            </p>
          </div>
        </div>
      </Section>

      <Section title="Dependencies">
        <TextField
          label="package.json Path (optional)"
          value={config.packageJson || ''}
          onChange={(v) => onChange({ ...config, packageJson: v })}
          placeholder="{{workspace}}/package.json"
        />
        <p className="text-xs text-[#71717a] mt-1">
          npm install will run if package.json exists
        </p>
      </Section>

      <Section title="Execution Options">
        <div className="space-y-3">
          <TextField
            label="Node.js Version"
            value={config.nodeVersion || '20'}
            onChange={(v) => onChange({ ...config, nodeVersion: v })}
            placeholder="20, 18, or 16"
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
