'use client';

import { BaseProperties, Section, TextField, SelectField, VariableHint } from './BaseProperties';
import { BasePropertiesProps } from './BaseProperties';

const OPERATORS = [
  { value: 'equals', label: 'Equals (==)' },
  { value: 'not_equals', label: 'Not Equals (!=)' },
  { value: 'contains', label: 'Contains' },
  { value: 'greater_than', label: 'Greater Than (>)' },
  { value: 'less_than', label: 'Less Than (<)' },
  { value: 'greater_equal', label: 'Greater or Equal (>=)' },
  { value: 'less_equal', label: 'Less or Equal (<=)' },
  { value: 'starts_with', label: 'Starts With' },
  { value: 'ends_with', label: 'Ends With' },
  { value: 'is_empty', label: 'Is Empty' },
  { value: 'is_not_empty', label: 'Is Not Empty' },
];

export function ConditionNodeProperties({ config, onChange }: BasePropertiesProps) {
  return (
    <BaseProperties config={config} onChange={onChange}>
      <Section title="Condition">
        <div className="space-y-4">
          <div className="p-3 bg-[#1a1a1d] border border-[#232326] rounded-lg">
            <p className="text-xs text-[#71717a]">
              If condition is TRUE → continue to <strong>True</strong> branch<br/>
              If condition is FALSE → continue to <strong>False</strong> branch
            </p>
          </div>

          <TextField
            label="Left Value"
            value={config.leftValue || ''}
            onChange={(v) => onChange({ ...config, leftValue: v })}
            placeholder="{{previousNode.output}}"
          />

          <SelectField
            label="Operator"
            value={config.operator || 'equals'}
            onChange={(v) => onChange({ ...config, operator: v })}
            options={OPERATORS}
          />

          {!['is_empty', 'is_not_empty'].includes(config.operator) && (
            <TextField
              label="Right Value"
              value={config.rightValue || ''}
              onChange={(v) => onChange({ ...config, rightValue: v })}
              placeholder="expected_value"
            />
          )}

          <VariableHint />
        </div>
      </Section>

      <Section title="Advanced">
        <div className="space-y-4">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={config.caseSensitive || false}
              onChange={(e) => onChange({ ...config, caseSensitive: e.target.checked })}
              className="rounded border-[#232326] bg-[#0a0a0b] text-[#0ea5e9]"
            />
            <span className="text-sm text-[#a1a1aa]">Case Sensitive</span>
          </label>

          <TextField
            label="Custom Expression (optional)"
            value={config.customExpression || ''}
            onChange={(v) => onChange({ ...config, customExpression: v })}
            placeholder="{{a}} > {{b}} && {{c}} == 'active'"
          />
        </div>
      </Section>
    </BaseProperties>
  );
}
