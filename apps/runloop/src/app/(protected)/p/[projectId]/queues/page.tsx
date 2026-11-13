'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  Plus, Inbox, AlertCircle, Loader2, ChevronRight,
  Database as DatabaseIcon, Radio, Rabbit, Waves,
} from 'lucide-react';
import { HeroHeader, MetricChip, SharpButton, Tag } from '@/components/ControlChrome';

const FONT = "'IBM Plex Sans Thai', 'IBM Plex Sans', sans-serif";
const THEME = {
  bg: 'var(--t-bg)',
  panel: 'var(--t-panel)',
  panelHover: 'var(--t-panel-hover)',
  border: 'var(--t-border)',
  text: {
    primary: 'var(--t-text)',
    secondary: 'var(--t-text-secondary)',
    muted: 'var(--t-text-muted)',
  },
  accent: 'var(--t-accent)',
  input: 'var(--t-input)',
  colors: {
    blue: '#0f62fe', emerald: '#24a148', purple: '#8a3ffc',
    amber: '#eb6200', red: '#da1e28', cyan: '#1192e8',
  },
};

// Visual identity per backend — icon + accent. Picked to match each
// broker's brand colors where possible, and to differ enough that the
// dashboard scan-reads like a legend.
const BACKEND_META: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  postgres: { icon: DatabaseIcon, color: '#336791', label: 'Postgres' },
  redis:    { icon: Radio,        color: '#DC382D', label: 'Redis' },
  rabbitmq: { icon: Rabbit,       color: '#FF6600', label: 'RabbitMQ' },
  kafka:    { icon: Waves,        color: '#231F20', label: 'Kafka' },
};

interface QueueRow {
  name: string;
  projectId: string;
  flowId: string;
  backend: string;
  concurrency: number;
  maxAttempts: number;
  enabled: boolean;
}

interface Stats {
  counts: Record<string, number>;
  oldestPendingSec: number;
}

// Threshold logic: a queue is "alerting" when ANY of these is true.
// Tuned to be quiet: a healthy production queue should have 0 alerts,
// any single trigger means an operator should look. Tweak per queue
// later if specific queues run hot by design.
function alertsFor(q: QueueRow, s: Stats): { level: 'critical' | 'warn'; label: string }[] {
  const alerts: { level: 'critical' | 'warn'; label: string }[] = [];
  const pending = s.counts?.PENDING || 0;
  const dlq = s.counts?.DLQ || 0;
  const oldest = s.oldestPendingSec || 0;

  if (dlq > 0) alerts.push({ level: 'critical', label: `${dlq} dead` });

  // Backed-up: pending > 10× concurrency means workers can't keep up.
  const backlogLimit = Math.max(20, q.concurrency * 10);
  if (pending > backlogLimit) {
    alerts.push({ level: 'critical', label: `backlog ${pending}` });
  } else if (pending > backlogLimit / 2) {
    alerts.push({ level: 'warn', label: `pending ${pending}` });
  }

  // Stale: oldest pending message hasn't been picked in 5 min.
  if (oldest > 300) {
    alerts.push({ level: 'critical', label: `stale ${Math.round(oldest / 60)}m` });
  } else if (oldest > 120) {
    alerts.push({ level: 'warn', label: `stale ${Math.round(oldest / 60)}m` });
  }

  if (!q.enabled) alerts.push({ level: 'warn', label: 'disabled' });

  return alerts;
}

export default function QueuesPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [queues, setQueues] = useState<QueueRow[]>([]);
  const [statsMap, setStatsMap] = useState<Record<string, Stats>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch the queue list, then fan out per-queue stats. Stats are fetched in
  // parallel with Promise.all so a dozen queues doesn't serialize into a
  // noticeable delay.
  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/runloop/api/queues?projectId=${projectId}`);
      if (!res.ok) throw new Error('failed to fetch queues');
      const d = await res.json();
      const rows: QueueRow[] = d.data || [];
      setQueues(rows);

      const stats = await Promise.all(
        rows.map(async (q) => {
          try {
            const r = await fetch(`/runloop/api/queues/${encodeURIComponent(q.name)}/stats`);
            const j = await r.json();
            return [q.name, j.data] as [string, Stats];
          } catch {
            return [q.name, { counts: {}, oldestPendingSec: 0 }] as [string, Stats];
          }
        }),
      );
      setStatsMap(Object.fromEntries(stats));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to load queues');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchAll();
    // Light polling — the queue depth changes continuously in production,
    // and stale numbers on a dashboard erode trust faster than a flash of
    // loading state does.
    const t = setInterval(fetchAll, 5000);
    return () => clearInterval(t);
  }, [fetchAll]);

  if (loading && queues.length === 0) {
    return (
      <div style={{ fontFamily: FONT }} className="flex items-center justify-center h-64">
        <Loader2 className="w-5 h-5 animate-spin" style={{ color: THEME.accent }} />
        <span className="ml-2 text-[13px]" style={{ color: THEME.text.muted }}>Loading queues…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ fontFamily: FONT }} className="flex items-center justify-center h-64">
        <div className="text-center">
          <AlertCircle className="w-10 h-10 mx-auto mb-3" style={{ color: THEME.colors.red }} />
          <h3 style={{ fontSize: 16, fontWeight: 600, color: THEME.text.primary }}>Failed to load queues</h3>
          <p style={{ fontSize: 13, color: THEME.text.muted, marginBottom: 12 }}>{error}</p>
          <SharpButton onClick={fetchAll}>Try Again</SharpButton>
        </div>
      </div>
    );
  }

  const MONO = "'IBM Plex Sans Thai', 'IBM Plex Sans', system-ui, sans-serif";
  const totalPending = queues.reduce((n, q) => n + (statsMap[q.name]?.counts?.PENDING || 0), 0);
  const totalDlq = queues.reduce((n, q) => n + (statsMap[q.name]?.counts?.DLQ || 0), 0);
  // How many queues currently have at least one critical alert? Drives
  // the "alerts" chip in the hero so an operator can see the situation
  // before scrolling.
  const criticalQueueCount = queues.reduce((n, q) => {
    const s = statsMap[q.name] || { counts: {}, oldestPendingSec: 0 };
    return n + (alertsFor(q, s).some((a) => a.level === 'critical') ? 1 : 0);
  }, 0);

  return (
    <div style={{ fontFamily: FONT }}>
      <HeroHeader
        title="Queues"
        subtitle="Producers push jobs, workers pull and run the bound flow."
        metrics={<>
          <MetricChip label="queues"  value={String(queues.length)} />
          <MetricChip label="pending" value={String(totalPending)} />
          {totalDlq > 0 && <MetricChip label="dlq" value={String(totalDlq)} />}
          {criticalQueueCount > 0 && (
            <MetricChip label="alerts" value={String(criticalQueueCount)} />
          )}
        </>}
        right={
          <SharpButton href={`/p/${projectId}/queues/new`}>
            <Plus className="w-3.5 h-3.5" /> New Queue
          </SharpButton>
        }
      />

      {queues.length === 0 ? (
        <div className="text-center py-16">
          <div
            style={{ width: 56, height: 56, background: THEME.panel, border: `1px solid ${THEME.border}`, borderRadius: 0 }}
            className="mx-auto mb-4 flex items-center justify-center"
          >
            <Inbox className="w-7 h-7" style={{ color: THEME.text.muted }} />
          </div>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: THEME.text.primary, marginBottom: 4 }}>No queues yet</h3>
          <p style={{ fontSize: 13, color: THEME.text.muted, marginBottom: 12 }}>
            Create a queue to bind a flow to a durable job inbox
          </p>
          <SharpButton href={`/p/${projectId}/queues/new`}>
            <Plus className="w-3.5 h-3.5" /> New Queue
          </SharpButton>
        </div>
      ) : (
        <div style={{ background: THEME.panel, overflow: 'hidden' }}>
          <div className="rl-row rl-th" style={{ ['--cols' as any]: 'minmax(0, 1fr) 72px 72px 72px 72px', ['--cols-sm' as any]: 'minmax(0, 1fr) 72px 72px' }}>
            <span>Queue</span>
            <span style={{ textAlign: 'right' }}>Pending</span>
            <span className="rl-opt" style={{ textAlign: 'right' }}>Running</span>
            <span className="rl-opt" style={{ textAlign: 'right' }}>Done</span>
            <span style={{ textAlign: 'right' }}>DLQ</span>
          </div>
          {queues.map((q) => {
            const meta = BACKEND_META[q.backend] || BACKEND_META.postgres;
            const s = statsMap[q.name] || { counts: {}, oldestPendingSec: 0 };
            const pending = s.counts?.PENDING || 0;
            const processing = s.counts?.PROCESSING || 0;
            const completed = s.counts?.COMPLETED || 0;
            const dlq = s.counts?.DLQ || 0;
            const queueAlerts = alertsFor(q, s);
            const num = (v: number, strong?: boolean, color?: string): React.CSSProperties => ({
              textAlign: 'right', fontSize: 14, fontVariantNumeric: 'tabular-nums',
              fontWeight: strong ? 600 : 400,
              color: color || (v > 0 ? THEME.text.primary : THEME.text.secondary),
            });
            return (
              <Link
                key={q.name}
                href={`/p/${projectId}/queues/${encodeURIComponent(q.name)}`}
                className="rl-row transition-colors hover:bg-[var(--t-panel-hover)]"
                style={{ ['--cols' as any]: 'minmax(0, 1fr) 72px 72px 72px 72px', ['--cols-sm' as any]: 'minmax(0, 1fr) 72px 72px' }}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="truncate" style={{ fontSize: 14, fontWeight: 600, color: THEME.text.primary }} title={q.name}>{q.name}</span>
                    {!q.enabled && <Tag tone="gray">Disabled</Tag>}
                    {queueAlerts
                      .filter((a) => a.label !== 'disabled')
                      .map((a) => (
                        <Tag key={a.label} tone={a.level === 'critical' ? 'red' : 'orange'}>{a.label}</Tag>
                      ))}
                  </div>
                  <p className="truncate" style={{ fontSize: 12, lineHeight: '16px', color: THEME.text.secondary, marginTop: 2 }}>
                    {meta.label} · concurrency {q.concurrency} · up to {q.maxAttempts} attempts
                  </p>
                </div>
                <span style={num(pending)}>{pending}</span>
                <span className="rl-opt" style={num(processing)}>{processing}</span>
                <span className="rl-opt" style={num(completed)}>{completed}</span>
                <span style={num(dlq, dlq > 0, dlq > 0 ? 'var(--t-error)' : undefined)}>{dlq}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color, bold }: { label: string; value: number; color: string; bold?: boolean }) {
  return (
    <div className="flex flex-col items-end min-w-[52px]">
      <span style={{ fontSize: 15, fontWeight: bold ? 700 : 600, color }}>{value}</span>
      <span style={{ fontSize: 14, color: 'var(--t-text-secondary)'}}>
        {label}
      </span>
    </div>
  );
}
