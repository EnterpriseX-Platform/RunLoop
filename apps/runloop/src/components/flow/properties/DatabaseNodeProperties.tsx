'use client';

import { BaseProperties, Section, TextField, TextArea, SelectField, SecretField, VariableHint } from './BaseProperties';
import { BasePropertiesProps } from './BaseProperties';

const DB_TYPES = [
  { value: 'postgresql', label: 'PostgreSQL' },
  { value: 'mysql', label: 'MySQL' },
];

const DB_ACTIONS = [
  { value: 'query', label: 'Query (SELECT)' },
  { value: 'execute', label: 'Execute (INSERT/UPDATE/DELETE)' },
  { value: 'transaction', label: 'Transaction' },
];

export function DatabaseNodeProperties({ config, onChange }: BasePropertiesProps) {
  return (
    <BaseProperties config={config} onChange={onChange}>
      <Section title="Connection">
        <div className="space-y-4">
          <SelectField
            label="Database Type"
            value={config.dbType || 'postgresql'}
            onChange={(v) => onChange({ ...config, dbType: v })}
            options={DB_TYPES}
          />

          <div className="grid grid-cols-2 gap-4">
            <TextField
              label="Host"
              value={config.host || ''}
              onChange={(v) => onChange({ ...config, host: v })}
              placeholder="localhost"
            />
            <TextField
              label="Port"
              value={String(config.port || '')}
              onChange={(v) => onChange({ ...config, port: parseInt(v) || (config.dbType === 'mysql' ? 3306 : 5432) })}
              placeholder={config.dbType === 'mysql' ? '3306' : '5432'}
            />
          </div>

          <TextField
            label="Database Name"
            value={config.database || ''}
            onChange={(v) => onChange({ ...config, database: v })}
            placeholder="my_database"
          />

          <div className="grid grid-cols-2 gap-4">
            <TextField
              label="Username"
              value={config.username || ''}
              onChange={(v) => onChange({ ...config, username: v })}
            />
            <SecretField
              label="Password"
              value={config.password || ''}
              onChange={(v) => onChange({ ...config, password: v })}
              placeholder="{{secrets.DB_PASSWORD}}"
            />
          </div>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={config.useConnectionString || false}
              onChange={(e) => onChange({ ...config, useConnectionString: e.target.checked })}
              className="rounded border-[#232326] bg-[#0a0a0b] text-[#0ea5e9] focus:ring-[#0ea5e9]"
            />
            <span className="text-sm text-[#a1a1aa]">Use Connection String</span>
          </label>

          {config.useConnectionString && (
            <SecretField
              label="Connection String"
              value={config.connectionString || ''}
              onChange={(v) => onChange({ ...config, connectionString: v })}
              placeholder="{{secrets.DATABASE_URL}}"
              suggestions={['DATABASE_URL', 'POSTGRES_URL', 'MYSQL_URL']}
            />
          )}
        </div>
      </Section>

      <Section title="Query">
        <div className="space-y-4">
          <SelectField
            label="Action"
            value={config.action || 'query'}
            onChange={(v) => onChange({ ...config, action: v })}
            options={DB_ACTIONS}
          />

          <TextArea
            label="SQL Query"
            value={config.query || ''}
            onChange={(v) => onChange({ ...config, query: v })}
            placeholder={config.action === 'query' 
              ? "SELECT * FROM users WHERE id = $1"
              : "INSERT INTO users (name, email) VALUES ($1, $2)"
            }
            rows={6}
          />

          <VariableHint />

          <TextArea
            label="Parameters (JSON array)"
            value={config.params || ''}
            onChange={(v) => onChange({ ...config, params: v })}
            placeholder={'["value1", "value2"]\n// or use variables:\n["{{userId}}", "{{userEmail}}"]'}
            rows={3}
          />
        </div>
      </Section>
    </BaseProperties>
  );
}
