'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  Plus, Inbox, AlertCircle, Loader2, ChevronRight,
  Database as DatabaseIcon, Radio, Rabbit, Waves,
} from 'lucide-react';
import { HeroHeader, MetricChip } from '@/components/ControlChrome';

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
    blue: '#3B82F6', emerald: '#10B981', purple: '#8B5CF6',
    amber: '#F59E0B', red: '#EF4444', cyan: '#06B6D4',
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
          <button onClick={fetchAll} style={{ background: THEME.accent, color: '#fff', borderRadius: 8, padding: '6px 16px', fontSize: 13 }}>
            Try Again
          </button>
        </div>
      </div>
    );
  }

  const MONO = "'IBM Plex Mono', ui-monospace, monospace";
  const totalPending = queues.reduce((n, q) => n + (statsMap[q.name]?.counts?.PENDING || 0), 0);
  const totalDlq = queues.reduce((n, q) => n + (statsMap[q.name]?.counts?.DLQ || 0), 0);

  return (
    <div style={{ fontFamily: FONT }}>
      {/* Schematic breadcrumb */}
      <div
        className="flex items-center gap-2 mb-2"
        style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.14em', color: THEME.text.muted }}
      >
        <span>// CONTROL PLANE / QUEUES</span>
        <span
          className="px-1.5 py-0.5"
          style={{ background: THEME.input, border: `1px solid ${THEME.border}`, color: THEME.text.secondary, borderRadius: 2 }}
        >
          NODE.INBOX
        </span>
        <span className="ml-auto flex items-center gap-3">
          <span>
            <span style={{ color: '#F59E0B' }}>●</span> {totalPending} PENDING
          </span>
          {totalDlq > 0 && (
            <span>
              <span style={{ color: '#EF4444' }}>●</span> {totalDlq} DLQ
            </span>
          )}
        </span>
      </div>

      <HeroHeader
        prompt="$ rl.queues · list"
        title="Queues"
        subtitle="Durable job inboxes — Postgres, Redis, RabbitMQ, Kafka. Producers push, workers pull, retries cascade into DLQ."
        metrics={<>
          <MetricChip label="queues"  value={String(queues.length).padStart(2, '0')} />
          <MetricChip label="pending" value={String(totalPending).padStart(3, '0')} accent={totalPending > 0 ? '#F59E0B' : undefined} />
          {totalDlq > 0 && <MetricChip label="dlq" value={String(totalDlq).padStart(2, '0')} accent="#EF4444" />}
        </>}
        right={
          <Link
            href={`/p/${projectId}/queues/new`}
            style={{ background: THEME.accent, color: '#fff', fontFamily: MONO, borderRadius: 2 }}
            className="flex items-center gap-2 px-4 py-2 text-[12px] font-medium tracking-wide hover:opacity-90 transition"
          >
            <Plus className="w-3.5 h-3.5" /> $ NEW QUEUE →
          </Link>
        }
      />

      {queues.length === 0 ? (
        <div className="text-center py-16">
          <div
            style={{ width: 56, height: 56, background: THEME.panel, border: `1px solid ${THEME.border}`, borderRadius: 12 }}
            className="mx-auto mb-4 flex items-center justify-center"
          >
            <Inbox className="w-7 h-7" style={{ color: THEME.text.muted }} />
          </div>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: THEME.text.primary, marginBottom: 4 }}>No queues yet</h3>
          <p style={{ fontSize: 13, color: THEME.text.muted, marginBottom: 12 }}>
            Create a queue to bind a flow to a durable job inbox
          </p>
          <Link
            href={`/p/${projectId}/queues/new`}
            style={{ background: THEME.accent, color: '#fff', borderRadius: 8, padding: '6px 16px', fontSize: 13 }}
            className="inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> New Queue
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {queues.map((q) => {
            const meta = BACKEND_META[q.backend] || BACKEND_META.postgres;
            const Icon = meta.icon;
            const s = statsMap[q.name] || { counts: {}, oldestPendingSec: 0 };
            const pending = s.counts?.PENDING || 0;
            const processing = s.counts?.PROCESSING || 0;
            const completed = s.counts?.COMPLETED || 0;
            const dlq = s.counts?.DLQ || 0;

            return (
              <Link
                key={q.name}
                href={`/p/${projectId}/queues/${encodeURIComponent(q.name)}`}
                style={{
                  background: THEME.panel,
                  border: `1px solid ${THEME.border}`,
                  borderRadius: 2,
                }}
                className="flex items-center gap-4 px-4 py-3 hover:bg-[var(--t-panel-hover)] transition group"
              >
                <div
                  style={{
                    width: 32, height: 32, borderRadius: 2,
                    background: `${meta.color}18`,
                    border: `1px solid ${meta.color}40`,
                    color: meta.color,
                  }}
                  className="flex items-center justify-center flex-shrink-0"
                >
                  <Icon className="w-4 h-4" style={{ width: 16, height: 16 }} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span style={{ fontSize: 14, fontWeight: 500, color: THEME.text.primary, letterSpacing: '-0.005em' }}>{q.name}</span>
                    <span
                      style={{
                        fontFamily: MONO, fontSize: 9.5, fontWeight: 500, letterSpacing: '0.08em',
                        color: meta.color, background: 'transparent',
                        padding: '1px 5px', borderRadius: 2, textTransform: 'uppercase',
                        border: `1px solid ${meta.color}40`,
                      }}
                    >
                      {meta.label}
                    </span>
                    {!q.enabled && (
                      <span style={{
                        fontFamily: MONO, fontSize: 9.5, fontWeight: 500, color: '#EF4444',
                        background: 'transparent', padding: '1px 5px', borderRadius: 2,
                        border: '1px solid color-mix(in srgb, #EF4444 40%, transparent)',
                        letterSpacing: '0.08em',
                      }}>
                        DISABLED
                      </span>
                    )}
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: 10.5, color: THEME.text.muted, marginTop: 2, letterSpacing: '0.02em' }}>
                    concurrency={q.concurrency} · max_attempts={q.maxAttempts}
                  </div>
                </div>

                {/* Counts strip. Kept compact + dense — the operator's first
                    glance should tell them if anything's on fire. */}
                <div className="flex items-center gap-4" style={{ fontSize: 12 }}>
                  <Stat label="Pending" value={pending} color={pending > 0 ? THEME.colors.amber : THEME.text.muted} />
                  <Stat label="Running" value={processing} color={processing > 0 ? THEME.colors.blue : THEME.text.muted} />
                  <Stat label="Done" value={completed} color={THEME.text.muted} />
                  <Stat label="DLQ" value={dlq} color={dlq > 0 ? THEME.colors.red : THEME.text.muted} bold={dlq > 0} />
                </div>

                <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: THEME.text.muted }} />
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
      <span style={{ fontSize: 10, color: 'var(--t-text-muted)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
        {label}
      </span>
    </div>
  );
}
