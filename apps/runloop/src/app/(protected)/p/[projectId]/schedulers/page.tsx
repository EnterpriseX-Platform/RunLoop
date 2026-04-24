'use client';

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
import { HeroHeader, MetricChip } from '@/components/ControlChrome';

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
  colors: { blue: '#3B82F6', emerald: '#10B981', purple: '#8B5CF6', amber: '#F59E0B', red: '#EF4444', cyan: '#06B6D4' }
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
    return <span style={{ fontSize: 11, color: 'var(--t-text-muted)', fontStyle: 'italic' }}>no runs</span>;
  }
  const color = (s: string) => {
    switch (s) {
      case 'SUCCESS': return '#10B981';
      case 'FAILED':
      case 'TIMEOUT': return '#EF4444';
      case 'RUNNING':
      case 'PENDING': return '#3B82F6';
      case 'CANCELLED': return '#6B7280';
      default: return '#9CA3AF';
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
            borderRadius: 2,
            opacity: 1 - i * 0.08,
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
    <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, background: bgColor, color: '#fff', padding: '12px 20px', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.3)', fontSize: 14, fontWeight: 500 }}>
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
        fetch(`/runloop/api/schedulers${params}`),
        fetch(`/runloop/api/executions${params}${params ? '&' : '?'}limit=200`).catch(() => null),
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
      const res = await fetch(`/runloop/api/schedulers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) fetchSchedulers();
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
      const res = await fetch(`/runloop/api/schedulers/${id}/trigger`, { method: 'POST' });
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
          <button onClick={fetchSchedulers} style={{ background: THEME.accent, color: '#fff', borderRadius: 8, padding: '6px 16px', fontSize: 13, fontWeight: 500 }}>
            Try Again
          </button>
        </div>
      </div>
    );
  }

  const MONO = "'IBM Plex Mono', ui-monospace, monospace";
  const runningCount = schedulers.filter((s) => s.status === 'ACTIVE').length;
  const pausedCount = schedulers.filter((s) => s.status === 'PAUSED').length;

  return (
    <div style={{ fontFamily: FONT }}>
      <Toast toast={toast} onClose={() => setToast(prev => ({ ...prev, visible: false }))} />

      {/* Schematic breadcrumb */}
      <div
        className="flex items-center gap-2 mb-2"
        style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.14em', color: THEME.text.muted }}
      >
        <span>// CONTROL PLANE / SCHEDULERS</span>
        <span
          className="px-1.5 py-0.5"
          style={{ background: THEME.input, border: `1px solid ${THEME.border}`, color: THEME.text.secondary, borderRadius: 2 }}
        >
          NODE.CRON
        </span>
        <span className="ml-auto flex items-center gap-1.5">
          <span style={{ width: 5, height: 5, borderRadius: 999, background: runningCount > 0 ? '#10B981' : '#6B7280' }} aria-hidden />
          {runningCount > 0 ? 'ACTIVE' : 'IDLE'}
        </span>
      </div>

      <HeroHeader
        prompt="$ rl.schedulers · list"
        title="Schedulers"
        subtitle="Cron, webhook, and manual triggers — decide when and how each flow fires."
        metrics={<>
          <MetricChip label="active" value={String(runningCount).padStart(2, '0')} accent="#10B981" />
          <MetricChip label="paused" value={String(pausedCount).padStart(2, '0')} accent="#F59E0B" />
          <MetricChip label="total"  value={String(runningCount + pausedCount).padStart(2, '0')} />
        </>}
        right={
          <Link
            href={`/p/${projectId}/schedulers/new`}
            style={{ background: THEME.accent, color: '#fff', fontFamily: MONO, borderRadius: 2 }}
            className="flex items-center gap-2 px-4 py-2 text-[12px] font-medium tracking-wide hover:opacity-90 transition"
          >
            <Plus className="w-3.5 h-3.5" /> $ NEW SCHEDULER →
          </Link>
        }
      />

      {/* Filter tabs — mono pills */}
      <div className="flex items-center gap-1.5 mb-3">
        {tabs.map((tab) => {
          const active = filterStatus === tab;
          return (
            <button
              key={tab}
              onClick={() => setFilterStatus(tab)}
              style={{
                background: active ? 'color-mix(in srgb, var(--t-accent) 12%, transparent)' : 'transparent',
                color: active ? 'var(--t-accent)' : THEME.text.secondary,
                border: `1px solid ${active ? 'color-mix(in srgb, var(--t-accent) 40%, transparent)' : THEME.border}`,
                borderRadius: 2,
                padding: '5px 12px',
                fontFamily: MONO,
                fontSize: 11,
                fontWeight: 500,
                letterSpacing: '0.06em',
              }}
            >
              {tab.toUpperCase()}
            </button>
          );
        })}
        <div
          className="ml-auto flex items-center gap-3"
          style={{ fontFamily: MONO, fontSize: 10.5, color: THEME.text.muted, letterSpacing: '0.04em' }}
        >
          <span>
            <span style={{ color: '#10B981' }}>●</span> {runningCount} ACTIVE
          </span>
          <span>
            <span style={{ color: '#F59E0B' }}>●</span> {pausedCount} PAUSED
          </span>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: THEME.text.muted }} />
        <input
          type="text"
          placeholder="search schedulers..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ background: THEME.panel, border: `1px solid ${THEME.border}`, color: THEME.text.primary, borderRadius: 2, height: 36, fontFamily: MONO, fontSize: 12 }}
          className="w-full pl-9 pr-4 outline-none"
        />
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <div style={{ width: 56, height: 56, background: THEME.panel, border: `1px solid ${THEME.border}`, borderRadius: 12 }} className="mx-auto mb-4 flex items-center justify-center">
            <Clock className="w-7 h-7" style={{ color: THEME.text.muted }} />
          </div>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: THEME.text.primary, marginBottom: 4 }}>No schedulers found</h3>
          <p style={{ fontSize: 13, color: THEME.text.muted, marginBottom: 12 }}>Create a schedule to run your tasks automatically</p>
          <Link href={`/p/${projectId}/schedulers/new`} style={{ background: THEME.accent, color: '#fff', borderRadius: 8, padding: '6px 16px', fontSize: 13, fontWeight: 500 }} className="inline-flex items-center gap-2">
            <Plus className="w-4 h-4" /> Create Schedule
          </Link>
        </div>
      ) : (
        <div style={{ background: THEME.panel, border: `1px solid ${THEME.border}`, borderRadius: 2, overflow: 'hidden' }}>
          {/* Table header */}
          <div
            className="flex items-center gap-3 px-4 py-2"
            style={{
              fontFamily: MONO, fontSize: 10, letterSpacing: '0.14em',
              color: THEME.text.muted,
              borderBottom: `1px solid ${THEME.border}`,
              background: 'color-mix(in srgb, var(--t-bg) 40%, transparent)',
            }}
          >
            <span style={{ width: 22 }} aria-hidden />
            <span style={{ width: 26 }} aria-hidden />
            <span className="flex-1">SCHEDULER</span>
            <span style={{ width: 90, textAlign: 'right' }}>HISTORY</span>
            <span style={{ width: 70, textAlign: 'right' }}>SUCCESS</span>
            <span style={{ width: 70, textAlign: 'right' }}>STATUS</span>
            <span style={{ width: 100 }} aria-hidden />
          </div>
          {filtered.map((scheduler, i) => {
            const st = statusStyle[scheduler.status] || statusStyle.PAUSED;
            const idx = String(i + 1).padStart(2, '0');
            return (
              <div
                key={scheduler.id}
                className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-[var(--t-panel-hover)] group"
                style={{ borderBottom: i < filtered.length - 1 ? `1px solid ${THEME.borderLight}` : 'none' }}
              >
                {/* Row index */}
                <span style={{ fontFamily: MONO, fontSize: 10, color: THEME.text.muted, width: 22, textAlign: 'right' }}>{idx}</span>
                {/* Icon */}
                <div style={{ width: 26, height: 26, background: `${st.color}18`, border: `1px solid ${st.color}40`, borderRadius: 2 }} className="flex items-center justify-center flex-shrink-0">
                  <Clock className="w-3 h-3" style={{ color: st.color }} />
                </div>
                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p style={{ fontSize: 13, fontWeight: 500, color: THEME.text.primary, letterSpacing: '-0.005em' }} className="truncate">
                    {scheduler.name}
                  </p>
                  <p style={{ fontFamily: MONO, fontSize: 10.5, color: THEME.text.muted }} className="truncate">
                    <span title={scheduler.schedule}>{humanizeCron(scheduler.schedule)}</span>
                    {scheduler.lastRun && <> · last {scheduler.lastRun}</>}
                    {scheduler.nextRun && <> · next {scheduler.nextRun}</>}
                  </p>
                </div>
                <span style={{ width: 90 }} className="flex justify-end">
                  <RunTrail statuses={recentRuns[scheduler.id] || []} />
                </span>
                <span style={{ width: 70, textAlign: 'right', fontFamily: MONO, fontSize: 11, color: THEME.text.secondary }}>
                  {scheduler.successRate}% / {scheduler.totalRuns}
                </span>
                <span
                  className="flex items-center justify-end gap-1.5"
                  style={{ width: 70, fontFamily: MONO, fontSize: 10.5, color: st.color, letterSpacing: '0.04em' }}
                >
                  <span
                    style={{
                      width: 6, height: 6, borderRadius: 999,
                      background: st.color,
                      boxShadow: `0 0 0 3px color-mix(in srgb, ${st.color} 15%, transparent)`,
                    }}
                  />
                  {st.label.toUpperCase()}
                </span>
                {/* Actions — sharp buttons, revealed on hover for density */}
                <div className="flex items-center gap-1" style={{ width: 100, justifyContent: 'flex-end' }}>
                  <button
                    onClick={(e) => { e.preventDefault(); handleToggleStatus(scheduler.id, scheduler.status); }}
                    style={{ width: 24, height: 24, borderRadius: 2, background: 'transparent', border: `1px solid ${THEME.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    title={scheduler.status === 'ACTIVE' ? 'Pause' : 'Resume'}
                    className="opacity-60 group-hover:opacity-100 transition-opacity"
                  >
                    {scheduler.status === 'ACTIVE' ? (
                      <Pause className="w-3 h-3" style={{ color: THEME.text.secondary }} />
                    ) : (
                      <Play className="w-3 h-3" style={{ color: THEME.text.secondary }} />
                    )}
                  </button>
                  <button
                    onClick={(e) => { e.preventDefault(); handleTrigger(scheduler.id); }}
                    style={{ width: 24, height: 24, borderRadius: 2, background: `${THEME.colors.blue}15`, border: `1px solid ${THEME.colors.blue}40`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    title="Run now"
                  >
                    <Play className="w-3 h-3" style={{ color: THEME.colors.blue, fill: THEME.colors.blue }} />
                  </button>
                  <Link href={`/p/${projectId}/schedulers/${scheduler.id}`} className="opacity-40 group-hover:opacity-100 transition-opacity">
                    <ChevronRight className="w-4 h-4" style={{ color: THEME.text.muted }} />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
