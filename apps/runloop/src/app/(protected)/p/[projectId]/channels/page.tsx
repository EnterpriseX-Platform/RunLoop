'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { BellRing, Send, Loader2, RefreshCcw, Wifi } from 'lucide-react';
import { SharpButton } from '@/components/ControlChrome';

const MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

interface ChannelRow {
  name: string;
  subscribers: number;
}

export default function ChannelsPage() {
  const params = useParams();
  const projectId = params?.projectId as string;

  const [channels, setChannels] = useState<ChannelRow[]>([]);
  const [totalPub, setTotalPub] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Test publish form
  const [testChannel, setTestChannel] = useState('');
  const [testPayload, setTestPayload] = useState('{"hello":"world"}');

  // Live subscriber feed
  const [tapName, setTapName] = useState('');
  const [tapMessages, setTapMessages] = useState<Array<{ts: number; data: any}>>([]);
  const [tapStatus, setTapStatus] = useState<'idle' | 'connecting' | 'open' | 'closed' | 'error'>('idle');
  const [tapSocket, setTapSocket] = useState<WebSocket | null>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch('/runloop/api/channels');
      if (!r.ok) throw new Error(String(r.status));
      const d = await r.json();
      setChannels(d.data || []);
      setTotalPub(d.totalPublishes || 0);
    } catch (e) {
      // silent — the engine may be temporarily unreachable
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, [refresh]);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const publish = async () => {
    if (!testChannel.trim()) return flash('channel name required');
    let payload: any = {};
    try {
      payload = JSON.parse(testPayload);
    } catch {
      return flash('payload is not valid JSON');
    }
    setBusy('publish');
    try {
      const r = await fetch(`/runloop/api/channels/${encodeURIComponent(testChannel)}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload }),
      });
      const d = await r.json();
      flash(r.ok ? `delivered to ${d.delivered} subscriber${d.delivered === 1 ? '' : 's'}` : (d.error || 'publish failed'));
      refresh();
    } finally {
      setBusy(null);
    }
  };

  const openTap = () => {
    if (!tapName.trim()) return flash('channel name required');
    if (tapSocket) {
      tapSocket.close();
      setTapSocket(null);
    }
    setTapMessages([]);
    setTapStatus('connecting');
    // WebSocket upgrades don't pass through Next.js rewrites in production.
    // The ingress has a carve-out at /runloop/rl/* that goes straight to the
    // engine container — that's also what useWebSocket uses for execution
    // streams. The session cookie (Path=/runloop) is sent on the upgrade
    // and JWTMiddleware reads it from c.Cookies("token").
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${proto}//${window.location.host}/runloop/rl/ws/channel/${encodeURIComponent(tapName)}`;
    const ws = new WebSocket(url);
    ws.onopen = () => setTapStatus('open');
    ws.onerror = () => setTapStatus('error');
    ws.onclose = () => setTapStatus('closed');
    ws.onmessage = (e) => {
      try {
        const env = JSON.parse(e.data);
        setTapMessages((m) => [{ ts: env.timestamp, data: env.payload }, ...m].slice(0, 50));
      } catch {
        setTapMessages((m) => [{ ts: Date.now() / 1000, data: e.data }, ...m].slice(0, 50));
      }
    };
    setTapSocket(ws);
  };

  const closeTap = () => {
    tapSocket?.close();
    setTapSocket(null);
    setTapStatus('idle');
  };

  return (
    <div className="p-6">
      {toast && (
        <div
          className="fixed bottom-6 right-6 z-50 px-4 py-2 rounded-sm"
          style={{
            background: 'var(--t-accent)', color: '#fff',
            fontFamily: MONO, fontSize: 12, letterSpacing: '0.04em',
          }}
        >
          {toast}
        </div>
      )}

      <div className="flex items-end justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600, color: 'var(--t-text)', letterSpacing: '-0.02em' }}>
            Channels
          </h1>
          <p style={{ fontSize: 13, color: 'var(--t-text-muted)', marginTop: 6 }}>
            Real-time pub/sub channels &mdash; flow nodes publish, mobile/web apps subscribe over WebSocket. In-memory, project-scoped.
          </p>
        </div>
        <SharpButton onClick={refresh}>
          <RefreshCcw className="w-3.5 h-3.5" /> Refresh
        </SharpButton>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 mb-6">
        <div className="p-3" style={{ background: 'var(--t-panel)', border: '1px solid var(--t-border)', borderRadius: 2 }}>
          <div style={{ fontSize: 10, color: 'var(--t-text-muted)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            Active channels
          </div>
          <div style={{ fontFamily: MONO, fontSize: 26, fontWeight: 600, color: 'var(--t-text)', marginTop: 4 }}>
            {channels.length}
          </div>
        </div>
        <div className="p-3" style={{ background: 'var(--t-panel)', border: '1px solid var(--t-border)', borderRadius: 2 }}>
          <div style={{ fontSize: 10, color: 'var(--t-text-muted)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            Live subscribers
          </div>
          <div style={{ fontFamily: MONO, fontSize: 26, fontWeight: 600, color: 'var(--t-text)', marginTop: 4 }}>
            {channels.reduce((a, c) => a + c.subscribers, 0)}
          </div>
        </div>
        <div className="p-3" style={{ background: 'var(--t-panel)', border: '1px solid var(--t-border)', borderRadius: 2 }}>
          <div style={{ fontSize: 10, color: 'var(--t-text-muted)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            Lifetime publishes
          </div>
          <div style={{ fontFamily: MONO, fontSize: 26, fontWeight: 600, color: 'var(--t-text)', marginTop: 4 }}>
            {totalPub}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Active channels list */}
        <div style={{ background: 'var(--t-panel)', border: '1px solid var(--t-border)', borderRadius: 2 }}>
          <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--t-border)' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--t-text)' }}>Active channels</span>
          </div>
          <div>
            {loading ? (
              <div className="text-center py-8" style={{ color: 'var(--t-text-muted)' }}>
                <Loader2 className="w-5 h-5 mx-auto animate-spin" />
              </div>
            ) : channels.length === 0 ? (
              <div className="text-center py-10 px-4" style={{ color: 'var(--t-text-muted)' }}>
                <BellRing className="w-7 h-7 mx-auto mb-2 opacity-50" />
                <p style={{ fontSize: 12 }}>No channels with live subscribers right now.</p>
                <p style={{ fontSize: 11, marginTop: 4 }}>
                  Channels appear here once a flow publishes or a client subscribes.
                </p>
              </div>
            ) : (
              channels.map((c) => (
                <div
                  key={c.name}
                  className="flex items-center justify-between px-4 py-2.5"
                  style={{ borderTop: '1px solid var(--t-border-light)' }}
                >
                  <span style={{ fontFamily: MONO, fontSize: 12, color: 'var(--t-text)' }}>{c.name}</span>
                  <span
                    className="flex items-center gap-1.5"
                    style={{
                      fontFamily: MONO, fontSize: 11,
                      color: c.subscribers > 0 ? 'var(--t-accent)' : 'var(--t-text-muted)',
                    }}
                  >
                    <Wifi className="w-3.5 h-3.5" />
                    {c.subscribers} subscriber{c.subscribers === 1 ? '' : 's'}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Test publish + tap subscriber */}
        <div className="space-y-4">
          <div style={{ background: 'var(--t-panel)', border: '1px solid var(--t-border)', borderRadius: 2 }}>
            <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--t-border)' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--t-text)' }}>Test publish</span>
            </div>
            <div className="p-4 space-y-3">
              <input
                placeholder="channel name"
                value={testChannel}
                onChange={(e) => setTestChannel(e.target.value)}
                style={{
                  width: '100%', background: 'var(--t-input)', border: '1px solid var(--t-border)',
                  color: 'var(--t-text)', borderRadius: 2, padding: '8px 12px',
                  fontFamily: MONO, fontSize: 12,
                }}
              />
              <textarea
                placeholder='{"hello":"world"}'
                value={testPayload}
                onChange={(e) => setTestPayload(e.target.value)}
                rows={4}
                spellCheck={false}
                style={{
                  width: '100%', background: 'var(--t-input)', border: '1px solid var(--t-border)',
                  color: 'var(--t-text)', borderRadius: 2, padding: 10,
                  fontFamily: MONO, fontSize: 12,
                }}
              />
              <SharpButton onClick={publish} disabled={busy === 'publish'}>
                {busy === 'publish' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                Publish
              </SharpButton>
            </div>
          </div>

          <div style={{ background: 'var(--t-panel)', border: '1px solid var(--t-border)', borderRadius: 2 }}>
            <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--t-border)' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--t-text)' }}>Tap subscriber (live)</span>
              <span
                style={{
                  fontFamily: MONO, fontSize: 10, letterSpacing: '0.1em',
                  color:
                    tapStatus === 'open' ? 'var(--t-success)' :
                    tapStatus === 'connecting' ? 'var(--t-text)' :
                    tapStatus === 'error' ? 'var(--t-error, #ef4444)' :
                    'var(--t-text-muted)',
                }}
              >
                {tapStatus.toUpperCase()}
              </span>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex gap-2">
                <input
                  placeholder="channel name to subscribe to"
                  value={tapName}
                  onChange={(e) => setTapName(e.target.value)}
                  style={{
                    flex: 1, background: 'var(--t-input)', border: '1px solid var(--t-border)',
                    color: 'var(--t-text)', borderRadius: 2, padding: '8px 12px',
                    fontFamily: MONO, fontSize: 12,
                  }}
                />
                {tapStatus === 'open' || tapStatus === 'connecting' ? (
                  <SharpButton variant="ghost" onClick={closeTap}>Disconnect</SharpButton>
                ) : (
                  <SharpButton onClick={openTap}>Connect</SharpButton>
                )}
              </div>
              <div
                style={{
                  background: 'var(--t-input)', border: '1px solid var(--t-border)',
                  borderRadius: 2, padding: 10, height: 220, overflowY: 'auto',
                  fontFamily: MONO, fontSize: 11, color: 'var(--t-text-secondary)',
                }}
              >
                {tapMessages.length === 0 ? (
                  <span style={{ color: 'var(--t-text-muted)' }}>
                    {tapStatus === 'open' ? 'connected — waiting for messages…' : '(no messages)'}
                  </span>
                ) : (
                  tapMessages.map((m, i) => (
                    <div key={i} style={{ marginBottom: 6 }}>
                      <span style={{ color: 'var(--t-text-muted)', marginRight: 8 }}>
                        {new Date(m.ts * 1000).toLocaleTimeString()}
                      </span>
                      <span style={{ color: 'var(--t-text)' }}>
                        {typeof m.data === 'string' ? m.data : JSON.stringify(m.data)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
