'use client';

import { BaseProperties, Section, TextField, SelectField, SecretField, Switch, TextArea } from './BaseProperties';
import { BasePropertiesProps } from './BaseProperties';

const REDIS_ACTIONS = [
  { value: 'get', label: 'GET - Get Value' },
  { value: 'set', label: 'SET - Set Value' },
  { value: 'delete', label: 'DEL - Delete Key' },
  { value: 'exists', label: 'EXISTS - Check Key' },
  { value: 'expire', label: 'EXPIRE - Set TTL' },
  { value: 'list_push', label: 'LPUSH/RPUSH - List Push' },
  { value: 'list_range', label: 'LRANGE - List Range' },
  { value: 'hash_set', label: 'HSET - Hash Set' },
  { value: 'hash_get', label: 'HGETALL - Hash Get' },
];

const LIST_SIDES = [
  { value: 'left', label: 'Left (LPUSH)' },
  { value: 'right', label: 'Right (RPUSH)' },
];

export function RedisNodeProperties({ config, onChange }: BasePropertiesProps) {
  return (
    <BaseProperties config={config} onChange={onChange}>
      <Section title="Connection">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <TextField
              label="Host"
              value={config.host || ''}
              onChange={(v) => onChange({ ...config, host: v })}
              placeholder="localhost"
            />
            <TextField
              label="Port"
              type="number"
              value={String(config.port || 6379)}
              onChange={(v) => onChange({ ...config, port: parseInt(v) || 6379 })}
            />
          </div>

          <TextField
            label="Database"
            type="number"
            value={String(config.database || 0)}
            onChange={(v) => onChange({ ...config, database: parseInt(v) || 0 })}
          />

          <SecretField
            label="Password (optional)"
            value={config.password || ''}
            onChange={(v) => onChange({ ...config, password: v })}
            placeholder="{{secrets.REDIS_PASSWORD}}"
            suggestions={['REDIS_PASSWORD', 'REDIS_AUTH']}
          />

          <Switch
            label="Use TLS/SSL"
            checked={config.useTLS || false}
            onChange={(v) => onChange({ ...config, useTLS: v })}
          />

          <Switch
            label="Cluster Mode"
            checked={config.cluster || false}
            onChange={(v) => onChange({ ...config, cluster: v })}
          />

          {config.cluster && (
            <TextArea
              label="Cluster Nodes"
              value={config.nodes || ''}
              onChange={(v) => onChange({ ...config, nodes: v })}
              placeholder="host1:6379,host2:6379,host3:6379"
              rows={2}
            />
          )}
        </div>
      </Section>

      <Section title="Command">
        <div className="space-y-4">
          <SelectField
            label="Action"
            value={config.action || 'get'}
            onChange={(v) => onChange({ ...config, action: v })}
            options={REDIS_ACTIONS}
          />

          {(config.action === 'get' || config.action === 'set' || config.action === 'delete' || 
            config.action === 'exists' || config.action === 'expire' || config.action === 'list_push' ||
            config.action === 'list_range' || config.action === 'hash_set' || config.action === 'hash_get') && (
            <TextField
              label="Key"
              value={config.key || ''}
              onChange={(v) => onChange({ ...config, key: v })}
              placeholder="my:key"
            />
          )}

          {config.action === 'set' && (
            <>
              <TextArea
                label="Value"
                value={config.value || ''}
                onChange={(v) => onChange({ ...config, value: v })}
                placeholder="Value to store"
                rows={3}
              />
              <TextField
                label="TTL (seconds, 0 = no expiration)"
                type="number"
                value={String(config.ttl || 0)}
                onChange={(v) => onChange({ ...config, ttl: parseInt(v) || 0 })}
              />
              <div className="flex gap-4">
                <Switch
                  label="Only if not exists (NX)"
                  checked={config.onlyIfNotExists || false}
                  onChange={(v) => onChange({ ...config, onlyIfNotExists: v })}
                />
                <Switch
                  label="Only if exists (XX)"
                  checked={config.onlyIfExists || false}
                  onChange={(v) => onChange({ ...config, onlyIfExists: v })}
                />
              </div>
            </>
          )}

          {config.action === 'expire' && (
            <TextField
              label="TTL (seconds)"
              type="number"
              value={String(config.seconds || 3600)}
              onChange={(v) => onChange({ ...config, seconds: parseInt(v) || 3600 })}
            />
          )}

          {config.action === 'delete' && (
            <TextArea
              label="Additional Keys (one per line)"
              value={config.additionalKeys || ''}
              onChange={(v) => onChange({ ...config, additionalKeys: v })}
              placeholder="key1&#10;key2&#10;key3"
              rows={3}
            />
          )}

          {config.action === 'list_push' && (
            <>
              <SelectField
                label="Side"
                value={config.side || 'right'}
                onChange={(v) => onChange({ ...config, side: v })}
                options={LIST_SIDES}
              />
              <TextArea
                label="Values (JSON array)"
                value={config.values || ''}
                onChange={(v) => onChange({ ...config, values: v })}
                placeholder={'["value1", "value2", "value3"] '}
                rows={3}
              />
            </>
          )}

          {config.action === 'list_range' && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <TextField
                  label="Start Index"
                  type="number"
                  value={String(config.start || 0)}
                  onChange={(v) => onChange({ ...config, start: parseInt(v) || 0 })}
                />
                <TextField
                  label="Stop Index (-1 for end)"
                  type="number"
                  value={String(config.stop || -1)}
                  onChange={(v) => onChange({ ...config, stop: parseInt(v) || -1 })}
                />
              </div>
            </>
          )}

          {config.action === 'hash_set' && (
            <TextArea
              label="Fields (JSON object)"
              value={config.fields || ''}
              onChange={(v) => onChange({ ...config, fields: v })}
              placeholder={'{"field1": "value1", "field2": "value2"}'}
              rows={4}
            />
          )}

          {config.action === 'hash_get' && (
            <TextArea
              label="Fields (optional, JSON array - empty for all)"
              value={config.fields || ''}
              onChange={(v) => onChange({ ...config, fields: v })}
              placeholder={'["field1", "field2"] '}
              rows={2}
            />
          )}
        </div>
      </Section>
    </BaseProperties>
  );
}
