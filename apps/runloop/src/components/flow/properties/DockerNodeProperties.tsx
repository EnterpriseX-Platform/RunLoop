'use client';

import { BaseProperties, Section, TextField, TextArea, Switch } from './BaseProperties';
import { BasePropertiesProps } from './BaseProperties';

export function DockerNodeProperties({ config, onChange }: BasePropertiesProps) {
  return (
    <BaseProperties config={config} onChange={onChange}>
      <Section title="Container">
        <div className="space-y-4">
          <TextField
            label="Image"
            value={config.image || ''}
            onChange={(v) => onChange({ ...config, image: v })}
            placeholder="alpine:3.19 or my-registry/image:tag"
          />
          <TextArea
            label="Command (optional)"
            value={config.command || ''}
            onChange={(v) => onChange({ ...config, command: v })}
            placeholder={'echo "Hello from container"'}
            rows={3}
          />
          <TextField
            label="Working Directory (optional)"
            value={config.workingDir || ''}
            onChange={(v) => onChange({ ...config, workingDir: v })}
            placeholder="/app"
          />
        </div>
      </Section>

      <Section title="Environment Variables">
        <TextArea
          label="Environment (JSON)"
          value={config.env || ''}
          onChange={(v) => onChange({ ...config, env: v })}
          placeholder={'{\n  "API_KEY": "{{secrets.API_KEY}}",\n  "NODE_ENV": "production"\n}'}
          rows={4}
        />
      </Section>

      <Section title="Execution Options">
        <div className="space-y-3">
          <Switch
            label="Pull latest image before running"
            checked={!!config.pull}
            onChange={(v) => onChange({ ...config, pull: v })}
          />
          <Switch
            label="Keep container after run (no --rm)"
            checked={!!config.keepContainer}
            onChange={(v) => onChange({ ...config, keepContainer: v })}
          />
          <TextField
            label="Timeout (seconds)"
            type="number"
            value={String(config.timeout || 300)}
            onChange={(v) => onChange({ ...config, timeout: parseInt(v) || 300 })}
          />
        </div>
      </Section>
    </BaseProperties>
  );
}
