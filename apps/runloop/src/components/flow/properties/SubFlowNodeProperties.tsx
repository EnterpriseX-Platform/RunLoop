'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { BaseProperties, Section, TextArea } from './BaseProperties';
import { BasePropertiesProps } from './BaseProperties';
import { Combobox } from '@/components/Combobox';

export function SubFlowNodeProperties({ config, onChange }: BasePropertiesProps) {
  const params = useParams();
  const projectId = params?.projectId as string | undefined;
  const [flows, setFlows] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (!projectId) return;
    fetch(`/runloop/api/flows?projectId=${projectId}`)
      .then((r) => r.json())
      .then((d) => setFlows((d.data || []).map((f: any) => ({ id: f.id, name: f.name }))))
      .catch(() => {});
  }, [projectId]);

  return (
    <BaseProperties config={config} onChange={onChange}>
      <Section title="Sub-flow">
        <label className="block mb-2" style={{ fontSize: 12, fontWeight: 600, color: 'var(--t-text-secondary)' }}>
          Flow to invoke
        </label>
        <Combobox
          value={config.flowId || ''}
          onChange={(v) => onChange({ ...config, flowId: v })}
          placeholder="Pick a flow…"
          options={flows.map((f) => ({ value: f.id, label: f.name, hint: f.id }))}
        />
        <div className="mt-3">
          <TextArea
            label="Input (JSON, optional)"
            value={typeof config.input === 'string' ? config.input : JSON.stringify(config.input || {}, null, 2)}
            onChange={(v) => {
              try { onChange({ ...config, input: JSON.parse(v) }); }
              catch { onChange({ ...config, input: v }); }
            }}
            placeholder={'{\n  "user": "${{previous.output.user}}"\n}'}
            rows={5}
          />
        </div>
        <p className="text-xs mt-2" style={{ color: 'var(--t-text-muted)' }}>
          The sub-flow inherits the parent&apos;s variables; `input` is merged on top. Its output is available as <code style={{ color: 'var(--t-accent)' }}>{'${{<thisNodeId>.output}}'}</code>.
        </p>
      </Section>
    </BaseProperties>
  );
}
