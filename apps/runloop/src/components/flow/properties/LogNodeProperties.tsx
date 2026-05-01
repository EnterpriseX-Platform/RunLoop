'use client';
import { BaseProperties, Section, SelectField, TextArea } from './BaseProperties';
import { BasePropertiesProps } from './BaseProperties';

export function LogNodeProperties({ config, onChange }: BasePropertiesProps) {
  return (
    <BaseProperties config={config} onChange={onChange}>
      <Section title="Log Message">
        <TextArea
          label="Message"
          value={config.message || ''}
          onChange={(v) => onChange({ ...config, message: v })}
          placeholder={'Processing user ${{loop.item.email}}'}
          rows={3}
        />
        <SelectField
          label="Level"
          value={config.level || 'info'}
          onChange={(v) => onChange({ ...config, level: v })}
          options={[
            { value: 'debug', label: 'Debug' },
            { value: 'info',  label: 'Info' },
            { value: 'warn',  label: 'Warning' },
            { value: 'error', label: 'Error' },
          ]}
        />
      </Section>
    </BaseProperties>
  );
}
