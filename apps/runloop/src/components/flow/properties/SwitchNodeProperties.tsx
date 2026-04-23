'use client';

import { BaseProperties, Section, TextField, TextArea } from './BaseProperties';
import { BasePropertiesProps } from './BaseProperties';

// Switch routes to one of several outgoing edges based on the value of an
// expression. Cases are expressed on the edges themselves (edge.condition)
// and mirror-listed here so the operator can see what's wired.
export function SwitchNodeProperties({ config, onChange }: BasePropertiesProps) {
  return (
    <BaseProperties config={config} onChange={onChange}>
      <Section title="Switch Expression">
        <TextField
          label="Value to match"
          value={config.value || ''}
          onChange={(v) => onChange({ ...config, value: v })}
          placeholder="${{previousNode.output.status}}"
        />
        <div className="mt-3">
          <TextArea
            label="Cases (one per line: match-value → label)"
            value={config.cases || 'approved\nrejected\npending'}
            onChange={(v) => onChange({ ...config, cases: v })}
            placeholder={'approved\nrejected\npending'}
            rows={4}
          />
        </div>
        <div className="mt-4 p-3 rounded-lg" style={{ background: 'var(--t-panel-hover)', border: '1px solid var(--t-border)' }}>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--t-text-muted)' }}>
            Draw one outgoing edge per case and set the edge's condition to the
            match value. Any output not matching a case falls through the
            "default" edge (condition = <code>ON_FAILURE</code>).
          </p>
        </div>
      </Section>
    </BaseProperties>
  );
}
