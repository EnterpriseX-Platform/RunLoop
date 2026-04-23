'use client';

import { BaseProperties, Section, TextField, SelectField, SecretField, Switch, TextArea } from './BaseProperties';
import { BasePropertiesProps } from './BaseProperties';

const S3_ACTIONS = [
  { value: 'upload', label: 'Upload File' },
  { value: 'download', label: 'Download File' },
  { value: 'delete', label: 'Delete File' },
  { value: 'list', label: 'List Objects' },
  { value: 'generate_presigned_url', label: 'Generate Presigned URL' },
];

export function S3NodeProperties({ config, onChange }: BasePropertiesProps) {
  return (
    <BaseProperties config={config} onChange={onChange}>
      <Section title="AWS Configuration">
        <div className="space-y-4">
          <TextField
            label="AWS Region"
            value={config.region || ''}
            onChange={(v) => onChange({ ...config, region: v })}
            placeholder="us-east-1"
          />

          <SecretField
            label="Access Key ID"
            value={config.accessKeyId || ''}
            onChange={(v) => onChange({ ...config, accessKeyId: v })}
            placeholder="{{secrets.AWS_ACCESS_KEY_ID}}"
            suggestions={['AWS_ACCESS_KEY_ID', 'AWS_KEY']}
          />

          <SecretField
            label="Secret Access Key"
            value={config.secretAccessKey || ''}
            onChange={(v) => onChange({ ...config, secretAccessKey: v })}
            placeholder="{{secrets.AWS_SECRET_ACCESS_KEY}}"
            suggestions={['AWS_SECRET_ACCESS_KEY', 'AWS_SECRET']}
          />

          <TextField
            label="Default Bucket"
            value={config.bucket || ''}
            onChange={(v) => onChange({ ...config, bucket: v })}
            placeholder="my-bucket"
          />

          <TextField
            label="Custom Endpoint (optional)"
            value={config.endpoint || ''}
            onChange={(v) => onChange({ ...config, endpoint: v })}
            placeholder="https://minio.example.com"
          />
          <p className="text-xs text-[#71717a]">For MinIO or other S3-compatible services</p>
        </div>
      </Section>

      <Section title="Action">
        <div className="space-y-4">
          <SelectField
            label="Action"
            value={config.action || 'upload'}
            onChange={(v) => onChange({ ...config, action: v })}
            options={S3_ACTIONS}
          />

          {(config.action === 'upload' || config.action === 'download' || config.action === 'delete') && (
            <>
              <TextField
                label="Object Key"
                value={config.key || ''}
                onChange={(v) => onChange({ ...config, key: v })}
                placeholder="path/to/file.txt"
              />
            </>
          )}

          {config.action === 'upload' && (
            <>
              <TextArea
                label="Content"
                value={config.content || ''}
                onChange={(v) => onChange({ ...config, content: v })}
                placeholder="File content or {{previousNode.output}}"
                rows={4}
              />
              <SelectField
                label="Content Type"
                value={config.contentType || 'application/octet-stream'}
                onChange={(v) => onChange({ ...config, contentType: v })}
                options={[
                  { value: 'application/octet-stream', label: 'Binary' },
                  { value: 'text/plain', label: 'Text' },
                  { value: 'application/json', label: 'JSON' },
                  { value: 'text/html', label: 'HTML' },
                  { value: 'image/png', label: 'PNG Image' },
                  { value: 'image/jpeg', label: 'JPEG Image' },
                ]}
              />
              <Switch
                label="Content is Base64 encoded"
                checked={config.isBase64 || false}
                onChange={(v) => onChange({ ...config, isBase64: v })}
              />
            </>
          )}

          {config.action === 'download' && (
            <Switch
              label="Return as Base64"
              checked={config.asBase64 || false}
              onChange={(v) => onChange({ ...config, asBase64: v })}
            />
          )}

          {config.action === 'list' && (
            <>
              <TextField
                label="Prefix (optional)"
                value={config.prefix || ''}
                onChange={(v) => onChange({ ...config, prefix: v })}
                placeholder="folder/"
              />
              <TextField
                label="Max Keys"
                type="number"
                value={String(config.maxKeys || 1000)}
                onChange={(v) => onChange({ ...config, maxKeys: parseInt(v) || 1000 })}
              />
            </>
          )}

          {config.action === 'generate_presigned_url' && (
            <>
              <TextField
                label="Expires In (seconds)"
                type="number"
                value={String(config.expiresIn || 3600)}
                onChange={(v) => onChange({ ...config, expiresIn: parseInt(v) || 3600 })}
              />
            </>
          )}
        </div>
      </Section>
    </BaseProperties>
  );
}
