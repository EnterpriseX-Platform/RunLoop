'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { BaseProperties, Section, TextField, TextArea } from './BaseProperties';
import { BasePropertiesProps } from './BaseProperties';

interface ChannelRow {
  name: string;
  subscribers: number;
}

export function NotifyNodeProperties({ config, onChange }: BasePropertiesProps) {
  const params = useParams();
  const projectId = params?.projectId as string | undefined;
  const [channels, setChannels] = useState<ChannelRow[]>([]);

  // Pull live channel list so the user gets autocomplete + subscriber visibility.
  useEffect(() => {
    if (!projectId) return;
    fetch('/runloop/api/channels')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setChannels(d?.data || []))
      .catch(() => {});
  }, [projectId]);

  const live = channels.find((c) => c.name === config.channel);

  return (
    <BaseProperties config={config} onChange={onChange}>
      <Section title="Channel">
        <TextField
          label="Channel name"
          value={config.channel || ''}
          onChange={(v) => onChange({ ...config, channel: v })}
          placeholder="user-notifications"
        />
        {live && (
          <p className="text-xs mt-2" style={{ color: 'var(--t-text-muted)' }}>
            <span style={{ color: live.subscribers > 0 ? 'var(--t-success)' : 'var(--t-text-muted)' }}>●</span>{' '}
            {live.subscribers} live subscriber{live.subscribers === 1 ? '' : 's'} right now
          </p>
        )}
        {!live && config.channel && (
          <p className="text-xs mt-2" style={{ color: 'var(--t-text-muted)' }}>
            No live subscribers right now &mdash; publish still succeeds, the message is just dropped.
          </p>
        )}
        {channels.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {channels.slice(0, 8).map((c) => (
              <button
                key={c.name}
                type="button"
                onClick={() => onChange({ ...config, channel: c.name })}
                style={{
                  fontSize: 10.5,
                  padding: '3px 8px',
                  border: '1px solid var(--t-border)',
                  borderRadius: 2,
                  background: 'var(--t-input)',
                  color: 'var(--t-text-secondary)',
                }}
              >
                {c.name} · {c.subscribers}
              </button>
            ))}
          </div>
        )}
      </Section>

      <Section title="Payload">
        <TextArea
          label="Payload (JSON, delivered to subscribers)"
          value={typeof config.payload === 'string' ? config.payload : JSON.stringify(config.payload || {}, null, 2)}
          onChange={(v) => {
            try { onChange({ ...config, payload: JSON.parse(v) }); }
            catch { onChange({ ...config, payload: v }); }
          }}
          placeholder={'{\n  "type": "alert",\n  "title": "New order",\n  "body": "${{order.summary}}"\n}'}
          rows={8}
        />
        <p className="text-xs mt-2" style={{ color: 'var(--t-text-muted)' }}>
          Reference upstream node outputs with <code style={{ color: 'var(--t-accent)' }}>{'${{nodeId.field}}'}</code>.
          Subscribers receive an envelope: <code style={{ color: 'var(--t-accent)' }}>{'{ channel, timestamp, payload }'}</code>.
        </p>
      </Section>

      <Section title="How subscribers connect">
        <pre style={{
          fontSize: 11, padding: 10, borderRadius: 2,
          background: 'var(--t-input)', border: '1px solid var(--t-border)',
          color: 'var(--t-text-secondary)', overflowX: 'auto',
        }}>{`const ws = new WebSocket(
  'wss://<host>/runloop/proxy/engine/ws/channel/${config.channel || '<name>'}',
  // Authenticate with a project-scoped API key (Settings → API Keys).
  // Pass it as Authorization header via a server-side proxy, or use
  // the cookie-based session if you load the websocket from a browser
  // tab already signed in to RunLoop.
);
ws.onmessage = (e) => {
  const { channel, timestamp, payload } = JSON.parse(e.data);
  // ... handle the push
};`}</pre>
      </Section>

      <Section title="Output">
        <ul className="text-xs space-y-1" style={{ color: 'var(--t-text-secondary)' }}>
          <li><code style={{ color: 'var(--t-accent)' }}>delivered</code> &mdash; how many subscribers received it (0 means nobody was listening; not an error)</li>
          <li><code style={{ color: 'var(--t-accent)' }}>channel</code> &mdash; channel name (echo)</li>
        </ul>
      </Section>
    </BaseProperties>
  );
}
