'use client';

import { BaseProperties, Section, NumberField, SelectField, TextArea, Switch } from './BaseProperties';
import { BasePropertiesProps } from './BaseProperties';

// Matches the engine's executeLoop modes 1:1. See flow_executor.go.
const LOOP_MODES = [
  { value: 'count', label: 'Count — run N times' },
  { value: 'forEach', label: 'For Each — iterate an array' },
  { value: 'batch', label: 'Batch — split array into chunks' },
];

export function LoopNodeProperties({ config, onChange }: BasePropertiesProps) {
  const mode = config.mode || 'count';

  return (
    <BaseProperties config={config} onChange={onChange}>
      <Section title="Loop Configuration">
        <div className="space-y-4">
          <SelectField
            label="Mode"
            value={mode}
            onChange={(v) => onChange({ ...config, mode: v })}
            options={LOOP_MODES}
          />

          {mode === 'count' && (
            <NumberField
              label="Iterations"
              value={config.iterations || 3}
              onChange={(v) => onChange({ ...config, iterations: v })}
              min={1}
              max={10000}
            />
          )}

          {(mode === 'forEach' || mode === 'batch') && (
            <TextArea
              label="Items"
              value={config.items || ''}
              onChange={(v) => {
                // Accept JSON array literal or a ${{path}} reference —
                // engine resolves both. Store as-is; no client parse.
                onChange({ ...config, items: v });
              }}
              placeholder={'${{db.output.rows}}  — or  [{"id":1},{"id":2}]'}
              rows={3}
            />
          )}

          {mode === 'batch' && (
            <NumberField
              label="Batch Size"
              value={config.batchSize || 100}
              onChange={(v) => onChange({ ...config, batchSize: v })}
              min={1}
              max={10000}
            />
          )}

          <div className="grid grid-cols-2 gap-4">
            <Switch
              label="Run in parallel"
              description="Iterate concurrently instead of one-by-one"
              checked={config.parallel || false}
              onChange={(v) => onChange({ ...config, parallel: v })}
            />
            {config.parallel && (
              <NumberField
                label="Concurrency"
                value={config.concurrency || 4}
                onChange={(v) => onChange({ ...config, concurrency: v })}
                min={1}
                max={16}
              />
            )}
          </div>
        </div>

        <div className="mt-4 p-3 rounded-lg" style={{ background: 'var(--t-panel-hover)', border: '1px solid var(--t-border)' }}>
          <p className="text-xs" style={{ color: 'var(--t-text-muted)' }}>
            In the loop body, reference per-iteration values via{' '}
            <code style={{ color: 'var(--t-accent)' }}>{'${{loop.index}}'}</code>,{' '}
            <code style={{ color: 'var(--t-accent)' }}>{'${{loop.item}}'}</code>,{' '}
            <code style={{ color: 'var(--t-accent)' }}>{'${{loop.batch}}'}</code>.
            Nested fields work too: <code style={{ color: 'var(--t-accent)' }}>{'${{loop.item.email}}'}</code>.
          </p>
        </div>
      </Section>

      <Section title="Body Subgraph (JSON)">
        <TextArea
          label="Body"
          value={typeof config.body === 'string' ? config.body : JSON.stringify(config.body || { nodes: [], edges: [] }, null, 2)}
          onChange={(v) => {
            // Keep it as raw JSON string; engine accepts both string and object.
            onChange({ ...config, body: v });
          }}
          placeholder={'{\n  "nodes": [ ... ],\n  "edges": [ ... ]\n}'}
          rows={8}
        />
        <p className="text-xs mt-2" style={{ color: 'var(--t-text-muted)' }}>
          The body is a nested flow (same shape as the main canvas). A richer body-editor UI ships in a later release.
        </p>
      </Section>
    </BaseProperties>
  );
}
