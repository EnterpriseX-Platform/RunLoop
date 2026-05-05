'use client';

import { BaseProperties, Section, SelectField } from './BaseProperties';
import { BasePropertiesProps } from './BaseProperties';

const STRATEGIES = [
  { value: 'collect', label: 'Collect — keyed by source node' },
  { value: 'array',   label: 'Array — ordered list of outputs' },
  { value: 'first',   label: 'First — first successful branch wins' },
];

export function MergeNodeProperties({ config, onChange }: BasePropertiesProps) {
  return (
    <BaseProperties config={config} onChange={onChange}>
      <Section title="Merge Strategy">
        <SelectField
          label="How to combine incoming outputs"
          value={config.strategy || 'collect'}
          onChange={(v) => onChange({ ...config, strategy: v })}
          options={STRATEGIES}
        />
        <div className="mt-4 p-3 rounded-lg" style={{ background: 'var(--t-panel-hover)', border: '1px solid var(--t-border)' }}>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--t-text-muted)' }}>
            Merge is a fan-in: connect multiple upstream nodes into a single
            Merge node. It waits for all branches (that aren&apos;t skipped) and
            emits one combined output. Skipped branches are ignored.
          </p>
        </div>
      </Section>
    </BaseProperties>
  );
}
