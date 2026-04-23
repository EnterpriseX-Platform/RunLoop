'use client';
import { BaseProperties, Section, TextField, TextArea } from './BaseProperties';
import { BasePropertiesProps } from './BaseProperties';

export function SetVarNodeProperties({ config, onChange }: BasePropertiesProps) {
  return (
    <BaseProperties config={config} onChange={onChange}>
      <Section title="Set Variable">
        <TextField
          label="Name"
          value={config.name || ''}
          onChange={(v) => onChange({ ...config, name: v })}
          placeholder="userId"
        />
        <TextField
          label="Value"
          value={String(config.value ?? '')}
          onChange={(v) => onChange({ ...config, value: v })}
          placeholder={'${{loop.item.id}}  or literal value'}
        />
        <div className="mt-3">
          <TextArea
            label="Batch variables (JSON, optional)"
            value={typeof config.variables === 'string' ? config.variables : JSON.stringify(config.variables || {}, null, 2)}
            onChange={(v) => {
              try { onChange({ ...config, variables: JSON.parse(v) }); }
              catch { onChange({ ...config, variables: v }); }
            }}
            placeholder={'{\n  "a": 1,\n  "b": "${{h.output.body}}"\n}'}
            rows={4}
          />
        </div>
        <p className="text-xs mt-2" style={{ color: 'var(--t-text-muted)' }}>
          Variables become available as <code style={{ color: 'var(--t-accent)' }}>{'${{name}}'}</code> to all downstream nodes.
        </p>
      </Section>
    </BaseProperties>
  );
}
