'use client';
import { BASE_PATH } from '@/lib/base-path';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useProject } from '@/context/ProjectContext';
import {
  Plus,
  Clock,
  Calendar,
  Play,
  Pause,
  AlertCircle,
  CheckCircle2,
  XCircle,
  ChevronRight,
  Search,
  Loader2,
  Check,
  X,
} from 'lucide-react';
import { HeroHeader, MetricChip, SharpButton, ContentSwitcher, SearchField } from '@/components/ControlChrome';

const FONT = "'IBM Plex Sans Thai', 'IBM Plex Sans', sans-serif";
const THEME = {
  bg: 'var(--t-bg)',
  panel: 'var(--t-panel)',
  panelHover: 'var(--t-panel-hover)',
  border: 'var(--t-border)',
  borderLight: 'var(--t-border-light)',
  text: { primary: 'var(--t-text)', secondary: 'var(--t-text-secondary)', muted: 'var(--t-text-muted)' },
  accent: 'var(--t-accent)',
  accentLight: 'var(--t-accent-light)',
  input: 'var(--t-input)',
  colors: { blue: '#0f62fe', emerald: '#24a148', purple: '#8a3ffc', amber: '#eb6200', red: '#da1e28', cyan: '#1192e8' }
};

interface Scheduler {
  id: string;
  name: string;
  taskName: string;
  taskId: string;
  schedule: string;
  scheduleType: 'CRON' | 'INTERVAL' | 'MANUAL';
  status: 'ACTIVE' | 'PAUSED' | 'ERROR';
  lastRun?: string;
  lastRunStatus?: 'SUCCESS' | 'FAILED' | 'RUNNING';
  nextRun?: string;
  successRate: number;
  totalRuns: number;
}

function formatRelativeTime(dateString?: string): string | undefined {
  if (!dateString) return undefined;
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function formatNextRun(dateString?: string): string | undefined {
  if (!dateString) return undefined;
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMs < 0) return 'Overdue';
  if (diffMins < 60) return `In ${diffMins}m`;
  if (diffHours < 24) return `In ${diffHours}h`;
  if (diffDays < 7) return `In ${diffDays}d`;
  return date.toLocaleDateString();
}

function transformScheduler(scheduler: any): Scheduler {
  const successCount = scheduler.successCount || 0;
  const failureCount = scheduler.failureCount || 0;
  const totalRuns = successCount + failureCount;
  const successRate = totalRuns > 0 ? Math.round((successCount / totalRuns) * 100) : 100;
  return {
    id: scheduler.id,
    name: scheduler.name,
    taskName: scheduler.name,
    taskId: scheduler.id,
    schedule: scheduler.schedule || 'Manual',
    scheduleType: scheduler.schedule ? 'CRON' : 'MANUAL',
    status: scheduler.status === 'ACTIVE' ? 'ACTIVE' : 'PAUSED',
    lastRun: formatRelativeTime(scheduler.lastRunAt),
    nextRun: formatNextRun(scheduler.nextRunAt),
    successRate,
    totalRuns,
  };
}

const statusStyle: Record<string, { bg: string; color: string; label: string }> = {
  ACTIVE: { bg: `${THEME.colors.emerald}18`, color: THEME.colors.emerald, label: 'Active' },
  PAUSED: { bg: `${THEME.colors.amber}18`, color: THEME.colors.amber, label: 'Paused' },
  ERROR: { bg: `${THEME.colors.red}18`, color: THEME.colors.red, label: 'Error' },
};

// humanizeCron turns a 5-field cron into an English phrase for the common
// shapes. Falls back to the raw expression for anything we don't recognize
// — better to surface the real value than a misleading translation.
function humanizeCron(expr: string): string {
  if (!expr || expr === 'Manual') return 'Manual trigger';
  if (expr.startsWith('@')) return expr.replace('@', 'every ');
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return expr;
  const [min, hr, dom, mon, dow] = parts;

  const everyMin = min === '*' || min.startsWith('*/');
  const specificHour = /^\d+$/.test(hr);
  const everyHour = hr === '*';

  // */N * * * *   →   every N minutes
  if (min.startsWith('*/') && everyHour && dom === '*' && mon === '*' && dow === '*') {
    return `Every ${min.slice(2)} minutes`;
  }
  // 0 * * * *
  if (min === '0' && everyHour && dom === '*' && mon === '*' && dow === '*') {
    return 'Hourly';
  }
  // 0 H * * *
  if (/^\d+$/.test(min) && specificHour && dom === '*' && mon === '*' && dow === '*') {
    const h = parseInt(hr), m = parseInt(min);
    return `Daily at ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  // 0 H * * N (weekly)
  if (/^\d+$/.test(min) && specificHour && dom === '*' && mon === '*' && /^\d+$/.test(dow)) {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const h = parseInt(hr), m = parseInt(min);
    return `Weekly ${days[parseInt(dow)] || dow} at ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  if (everyMin && everyHour && dom === '*' && mon === '*' && dow === '*') {
    return 'Every minute';
  }
  return expr;
}

function RunTrail({ statuses }: { statuses: string[] }) {
  if (statuses.length === 0) {
    return <span style={{ fontSize: 12, color: 'var(--t-text-secondary)' }}>No runs yet</span>;
  }
  const color = (s: string) => {
    switch (s) {
      case 'SUCCESS': return 'var(--t-success)';
      case 'FAILED':
      case 'TIMEOUT': return 'var(--t-error)';
      case 'RUNNING':
      case 'PENDING': return 'var(--t-accent)';
      default: return 'var(--t-border-strong)';
    }
  };
  return (
    <div className="flex items-center gap-0.5" title="Recent executions (newest left)">
      {statuses.map((s, i) => (
        <span
          key={i}
          style={{
            width: 6, height: 16,
            background: color(s),
          }}
        />
      ))}
    </div>
  );
}

type ToastState = { visible: boolean; message: string; type: 'success' | 'error' };

function Toast({ toast, onClose }: { toast: ToastState; onClose: () => void }) {
  if (!toast.visible) return null;
  const bgColor = toast.type === 'success' ? THEME.colors.emerald : THEME.colors.red;
  return (
    <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, background: bgColor, color: '#fff', padding: '12px 20px', borderRadius: 0, display: 'flex', alignItems: 'center', gap: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.3)', fontSize: 14, fontWeight: 500 }}>
      {toast.type === 'success' ? <Check size={16} /> : <AlertCircle size={16} />}
      {toast.message}
      <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', marginLeft: 8, padding: 0, display: 'flex' }}><X size={14} /></button>
    </div>
  );
}

export default function SchedulersPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const { selectedProject } = useProject();
  const [schedulers, setSchedulers] = useState<Scheduler[]>([]);
  // schedulerId → recent execution statuses (newest first, max 7). Rendered
  // as a tiny status trail so operators spot a pattern of failures instantly.
  const [recentRuns, setRecentRuns] = useState<Record<string, string[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>({ visible: false, message: '', type: 'success' });
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'All' | 'Active' | 'Paused'>('All');

  const fetchSchedulers = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const pid = projectId;
      const params = pid ? `?projectId=${pid}` : '';

      // Parallel: scheduler definitions + recent executions for the whole
      // project (we bucket by schedulerId client-side). 200 rows is enough
      // for a 7-dot sparkline across dozens of schedulers.
      const [schedRes, execRes] = await Promise.all([
        fetch(`${BASE_PATH}/api/schedulers${params}`),
        fetch(`${BASE_PATH}/api/executions${params}${params ? '&' : '?'}limit=200`).catch(() => null),
      ]);

      if (!schedRes.ok) throw new Error('Failed to fetch schedulers');
      const data = await schedRes.json();
      setSchedulers((data.data || []).map(transformScheduler));

      if (execRes && execRes.ok) {
        const ex = await execRes.json();
        const buckets: Record<string, string[]> = {};
        for (const e of ex.data || []) {
          const sid = e.schedulerId;
          if (!sid) continue;
          if (!buckets[sid]) buckets[sid] = [];
          if (buckets[sid].length < 7) buckets[sid].push(e.status);
        }
        setRecentRuns(buckets);
      }
    } catch (err) {
      console.error('Failed to fetch schedulers:', err);
      setError(err instanceof Error ? err.message : 'Failed to load schedulers');
    } finally {
      setIsLoading(false);
    }
  }, [selectedProject]);

  useEffect(() => {
    fetchSchedulers();
  }, [fetchSchedulers]);

  const handleToggleStatus = async (id: string, currentStatus: string) => {
    try {
      const newStatus = currentStatus === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
      // The scheduler update route (web proxy and engine) is PUT-only;
      // PATCH answered 405 and the toggle silently did nothing.
      const res = await fetch(`${BASE_PATH}/api/schedulers/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) fetchSchedulers();
      else showToast(newStatus === 'PAUSED' ? 'Could not pause scheduler' : 'Could not resume scheduler', 'error');
    } catch (err) {
      console.error('Failed to toggle scheduler status:', err);
    }
  };

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ visible: true, message, type });
    setTimeout(() => setToast(prev => ({ ...prev, visible: false })), 4000);
  };

  const handleTrigger = async (id: string) => {
    try {
      const res = await fetch(`${BASE_PATH}/api/schedulers/${id}/trigger`, { method: 'POST' });
      if (res.ok) {
        showToast('RunLoop triggered successfully', 'success');
        setTimeout(fetchSchedulers, 1000);
      } else {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || 'Failed to trigger RunLoop', 'error');
      }
    } catch (err) {
      console.error('Failed to trigger scheduler:', err);
      showToast('Failed to trigger RunLoop', 'error');
    }
  };

  const tabs = ['All', 'Active', 'Paused'] as const;

  const filtered = schedulers.filter((s) => {
    const matchesSearch = s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         s.taskName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filterStatus === 'All' || s.status.toLowerCase() === filterStatus.toLowerCase();
    return matchesSearch && matchesFilter;
  });

  if (isLoading) {
    return (
      <div style={{ fontFamily: FONT }} className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3">
          <Loader2 className="w-5 h-5 animate-spin" style={{ color: THEME.accent }} />
          <span style={{ fontSize: 13, color: THEME.text.muted }}>Loading schedulers...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ fontFamily: FONT }} className="flex items-center justify-center h-64">
        <div className="text-center">
          <AlertCircle className="w-10 h-10 mx-auto mb-3" style={{ color: THEME.colors.red }} />
          <h3 style={{ fontSize: 16, fontWeight: 600, color: THEME.text.primary, marginBottom: 4 }}>Failed to load schedulers</h3>
          <p style={{ fontSize: 13, color: THEME.text.muted, marginBottom: 12 }}>{error}</p>
          <button onClick={fetchSchedulers} style={{ background: THEME.accent, color: '#fff', borderRadius: 0, padding: '6px 16px', fontSize: 13, fontWeight: 500 }}>
            Try Again
          </button>
        </div>
      </div>
    );
  }

  const MONO = "'IBM Plex Sans Thai', 'IBM Plex Sans', system-ui, sans-serif";
  const runningCount = schedulers.filter((s) => s.status === 'ACTIVE').length;
  const pausedCount = schedulers.filter((s) => s.status === 'PAUSED').length;

  return (
    <div style={{ fontFamily: FONT }}>
      <Toast toast={toast} onClose={() => setToast(prev => ({ ...prev, visible: false }))} />

      <HeroHeader
        title="Schedulers"
        subtitle="Cron, webhook, and manual triggers — decide when and how each flow fires."
        metrics={<>
          <MetricChip label="active" value={String(runningCount)} />
          <MetricChip label="paused" value={String(pausedCount)} />
          <MetricChip label="total"  value={String(runningCount + pausedCount)} />
        </>}
        right={
          <SharpButton href={`/p/${projectId}/schedulers/new`}>
            <Plus className="w-3.5 h-3.5" /> New Scheduler
          </SharpButton>
        }
      />

      <div className="flex flex-col gap-4 mb-4">
        <ContentSwitcher options={tabs} value={filterStatus} onChange={setFilterStatus} />
        <SearchField value={searchQuery} onChange={setSearchQuery} placeholder="Search schedulers" />
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <div style={{ width: 56, height: 56, background: THEME.panel, border: `1px solid ${THEME.border}`, borderRadius: 0 }} className="mx-auto mb-4 flex items-center justify-center">
            <Clock className="w-7 h-7" style={{ color: THEME.text.muted }} />
          </div>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: THEME.text.primary, marginBottom: 4 }}>No schedulers found</h3>
          <p style={{ fontSize: 13, color: THEME.text.muted, marginBottom: 12 }}>Create a schedule to run your tasks automatically</p>
          <Link href={`/p/${projectId}/schedulers/new`} style={{ background: THEME.accent, color: '#fff', borderRadius: 0, padding: '6px 16px', fontSize: 13, fontWeight: 500 }} className="inline-flex items-center gap-2">
            <Plus className="w-4 h-4" /> Create Schedule
          </Link>
        </div>
      ) : (
        <div style={{ background: THEME.panel, overflow: 'hidden' }}>
          {/* Table header: name takes the room; History and Success drop out on narrow screens */}
          <div className="sched-row" style={{ minHeight: 48, background: 'var(--t-selected)', fontSize: 14, fontWeight: 600, color: THEME.text.primary }}>
            <span>Scheduler</span>
            <span className="sched-opt">Recent runs</span>
            <span className="sched-opt" style={{ textAlign: 'right' }}>Success</span>
            <span>Status</span>
            <span aria-hidden />
          </div>
          {filtered.map((scheduler, i) => {
            const st = statusStyle[scheduler.status] || statusStyle.PAUSED;
            const tag = scheduler.status === 'ACTIVE'
              ? { background: 'var(--tag-green-bg)', color: 'var(--tag-green-text)' }
              : scheduler.status === 'ERROR'
                ? { background: 'var(--tag-red-bg)', color: 'var(--tag-red-text)' }
                : { background: 'var(--tag-gray-bg)', color: 'var(--tag-gray-text)' };
            return (
              <div
                key={scheduler.id}
                className="sched-row group transition-colors hover:bg-[var(--t-panel-hover)]"
                style={{ minHeight: 64, borderTop: i === 0 ? 'none' : `1px solid ${THEME.border}` }}
              >
                <div className="min-w-0">
                  <Link href={`/p/${projectId}/schedulers/${scheduler.id}`} className="block truncate hover:underline" style={{ fontSize: 14, fontWeight: 600, color: THEME.text.primary }} title={scheduler.name}>
                    {scheduler.name}
                  </Link>
                  <p style={{ fontSize: 12, lineHeight: '16px', color: THEME.text.secondary, marginTop: 2 }} className="truncate">
                    <span title={scheduler.schedule}>{humanizeCron(scheduler.schedule)}</span>
                    {scheduler.lastRun && <> · last {scheduler.lastRun}</>}
                    {scheduler.nextRun && <> · next {scheduler.nextRun}</>}
                  </p>
                </div>
                <span className="sched-opt">
                  <RunTrail statuses={recentRuns[scheduler.id] || []} />
                </span>
                <span className="sched-opt" style={{ textAlign: 'right', fontSize: 14, fontVariantNumeric: 'tabular-nums', color: THEME.text.primary }}>
                  {scheduler.successRate}%
                  <span style={{ color: THEME.text.secondary, fontSize: 12 }}> of {scheduler.totalRuns}</span>
                </span>
                <span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: 12, lineHeight: '16px', padding: '4px 8px', borderRadius: 24, ...tag }}>
                    {st.label}
                  </span>
                </span>
                <div className="flex items-center justify-end">
                  <button
                    onClick={(e) => { e.preventDefault(); handleTrigger(scheduler.id); }}
                    className="hover:bg-[var(--t-selected)]"
                    style={{ width: 32, height: 32, display: 'grid', placeItems: 'center', background: 'transparent', border: 'none', color: THEME.text.primary }}
                    title="Run now"
                    aria-label="Run now"
                  >
                    <Play className="w-4 h-4" />
                  </button>
                  <button
                    onClick={(e) => { e.preventDefault(); handleToggleStatus(scheduler.id, scheduler.status); }}
                    className="hover:bg-[var(--t-selected)]"
                    style={{ height: 32, padding: '0 12px', fontSize: 14, background: 'transparent', border: 'none', color: 'var(--t-accent)' }}
                    title={scheduler.status === 'ACTIVE' ? 'Pause' : 'Resume'}
                    aria-label={scheduler.status === 'ACTIVE' ? 'Pause' : 'Resume'}
                  >
                    {scheduler.status === 'ACTIVE' ? 'Pause' : 'Resume'}
                  </button>
                </div>
              </div>
            );
          })}
          <style jsx>{`
            .sched-row {
              display: grid;
              grid-template-columns: minmax(0, 1fr) 132px 112px 96px 112px;
              align-items: center;
              column-gap: 16px;
              padding: 0 16px;
            }
            @media (max-width: 1023px) {
              .sched-row { grid-template-columns: minmax(0, 1fr) 80px 112px; }
              .sched-opt { display: none; }
            }
          `}</style>
        </div>
      )}
    </div>
  );
}
