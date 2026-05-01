'use client';

import { BaseProperties, Section, NumberField, SelectField, Switch } from './BaseProperties';
import { BasePropertiesProps } from './BaseProperties';

const TIME_UNITS = [
  { value: 'milliseconds', label: 'Milliseconds' },
  { value: 'seconds', label: 'Seconds' },
  { value: 'minutes', label: 'Minutes' },
  { value: 'hours', label: 'Hours' },
  { value: 'days', label: 'Days' },
];

export function DelayNodeProperties({ config, onChange }: BasePropertiesProps) {
  return (
    <BaseProperties config={config} onChange={onChange}>
      <Section title="Delay Configuration">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <NumberField
              label="Duration"
              value={config.duration || 1}
              onChange={(v) => onChange({ ...config, duration: v })}
              min={0}
              step={1}
            />
            <SelectField
              label="Unit"
              value={config.unit || 'seconds'}
              onChange={(v) => onChange({ ...config, unit: v })}
              options={TIME_UNITS}
            />
          </div>

          <div className="p-4 bg-[#1a1a1d] border border-[#232326] rounded-lg">
            <p className="text-sm text-[#71717a]">
              This node will pause the workflow execution for the specified duration.
              Use this to rate-limit API calls, wait for external processes, or add delays between operations.
            </p>
          </div>

          <Switch
            label="Skip delay in test mode"
            description="When testing the workflow, this delay will be skipped"
            checked={config.skipInTest !== false}
            onChange={(v) => onChange({ ...config, skipInTest: v })}
          />
        </div>
      </Section>

      <Section title="Advanced Options">
        <div className="space-y-4">
          <Switch
            label="Use random delay"
            description="Add randomness to the delay duration (between min and max)"
            checked={config.randomDelay || false}
            onChange={(v) => onChange({ ...config, randomDelay: v })}
          />

          {config.randomDelay && (
            <div className="grid grid-cols-2 gap-4 pl-4 border-l-2 border-[#232326]">
              <NumberField
                label="Minimum Duration"
                value={config.minDuration || 1}
                onChange={(v) => onChange({ ...config, minDuration: v })}
                min={0}
              />
              <NumberField
                label="Maximum Duration"
                value={config.maxDuration || 5}
                onChange={(v) => onChange({ ...config, maxDuration: v })}
                min={0}
              />
            </div>
          )}
        </div>
      </Section>
    </BaseProperties>
  );
}
