'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useProject } from '@/context/ProjectContext';
import {
  PlayCircle,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  Search,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  Activity,
  TrendingUp,
  Timer,
  RefreshCw,
  Zap,
  Calendar,
  Terminal,
  Webhook,
  MousePointerClick,
} from 'lucide-react';
import type { Execution } from '@/types';
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
  colors: { blue: '#3B82F6', emerald: '#10B981', purple: '#8B5CF6', amber: '#F59E0B', red: '#EF4444', cyan: '#06B6D4' },
};

const statusConfig: Record<string, { bg: string; color: string; label: string }> = {
  SUCCESS: { bg: `${THEME.colors.emerald}18`, color: THEME.colors.emerald, label: 'Success' },
  FAILED: { bg: `${THEME.colors.red}18`, color: THEME.colors.red, label: 'Failed' },
  RUNNING: { bg: `${THEME.colors.blue}18`, color: THEME.colors.blue, label: 'Running' },
  PENDING: { bg: `${THEME.colors.amber}18`, color: THEME.colors.amber, label: 'Pending' },
  CANCELLED: { bg: '#64748B18', color: '#64748B', label: 'Cancelled' },
  TIMEOUT: { bg: `${THEME.colors.red}18`, color: THEME.colors.red, label: 'Timeout' },
};

const triggerConfig: Record<string, { color: string; bg: string; icon: typeof Zap }> = {
  SCHEDULE: { color: THEME.colors.purple, bg: `${THEME.colors.purple}18`, icon: Calendar },
  MANUAL: { color: THEME.colors.cyan, bg: `${THEME.colors.cyan}18`, icon: MousePointerClick },
  WEBHOOK: { color: THEME.colors.amber, bg: `${THEME.colors.amber}18`, icon: Webhook },
  API: { color: THEME.colors.blue, bg: `${THEME.colors.blue}18`, icon: Terminal },
};

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;

  if (diffMs < 0) return 'just now';

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w ago`;

  return new Date(dateStr).toLocaleDateString();
}

function formatDuration(ms: number | undefined): string {
  if (ms === undefined || ms === null) return '--';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

// Queue-triggered executions use a synthetic schedulerId "queue:<name>".
// Extract the display name so the list reads "Queue: email-outbox" instead
// of the cryptic "Unknown RunLoop" fallback.
function queueNameFromSchedulerId(id?: string): string | null {
  if (!id) return null;
  if (id.startsWith('queue:')) return `Queue: ${id.slice(6)}`;
  return null;
}

// "Needs Review" replaces the old Dead Letter Queue page — it's just a
// pre-filter for failed executions with retry/discard actions inline.
const STATUS_TABS = ['All', 'Running', 'Success', 'Failed', 'Pending', 'Needs Review'] as const;

export default function ExecutionsPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const { selectedProject } = useProject();
  const searchParams = useSearchParams();
  // Map the `?filter=needs_review` query param (set by the DLQ redirect) to
  // the corresponding tab so links from old DLQ bookmarks still work.
  const initialFilter = searchParams?.get('filter') === 'needs_review' ? 'Needs Review' : 'All';
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>(initialFilter);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Bulk actions
  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const selectAllFiltered = (ids: string[]) => {
    setSelectedIds(new Set(ids));
  };
  const clearSelection = () => setSelectedIds(new Set());

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (!confirm(`Delete ${ids.length} execution(s)? This cannot be undone.`)) return;
    const res = await fetch('/runloop/api/executions/bulk-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });
    if (res.ok) {
      clearSelection();
      // Refetch
      const pid = projectId;
      const qs = pid ? `?projectId=${pid}` : '';
      const refreshRes = await fetch(`/runloop/api/executions${qs}`);
      if (refreshRes.ok) {
        const data = await refreshRes.json();
        setExecutions(data.data || []);
      }
    } else {
      alert('Bulk delete failed');
    }
  };

  const handleBulkRetry = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (!confirm(`Retry ${ids.length} execution(s)?`)) return;
    const res = await fetch('/runloop/api/executions/bulk-retry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });
    if (res.ok) {
      clearSelection();
      const pid = projectId;
      const qs = pid ? `?projectId=${pid}` : '';
      const refreshRes = await fetch(`/runloop/api/executions${qs}`);
      if (refreshRes.ok) {
        const data = await refreshRes.json();
        setExecutions(data.data || []);
      }
    } else {
      alert('Bulk retry failed');
    }
  };

  const fetchExecutions = useCallback(async () => {
    try {
      const pid = projectId;
      const params = pid ? `?projectId=${pid}` : '';
      const res = await fetch(`/runloop/api/executions${params}`);
      if (res.ok) {
        const data = await res.json();
        setExecutions(data.data || []);
      }
    } catch (error) {
      console.error('Failed to fetch executions:', error);
    } finally {
      setIsLoading(false);
    }
  }, [selectedProject]);

  useEffect(() => {
    fetchExecutions();
  }, [fetchExecutions]);

  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(fetchExecutions, 5000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [autoRefresh, fetchExecutions]);

  // --- Computed stats ---
  const totalCount = executions.length;
  const successCount = executions.filter((e) => e.status === 'SUCCESS').length;
  const failedCount = executions.filter((e) => e.status === 'FAILED').length;
  const successRate = totalCount > 0 ? ((successCount / totalCount) * 100).toFixed(1) : '0.0';
  const avgDuration =
    totalCount > 0
      ? Math.round(
          executions.reduce((sum, e) => sum + (e.durationMs || 0), 0) /
            executions.filter((e) => e.durationMs).length || 0
        )
      : 0;

  // --- Filtered list ---
  // "Needs Review" shows executions that ended in a terminal failure state
  // — this replaces the standalone DLQ page and makes retry/discard actions
  // available inline.
  const filtered = executions.filter((e) => {
    const matchesSearch = (e.runloop?.name || e.id || '').toLowerCase().includes(searchQuery.toLowerCase());
    let matchesFilter = true;
    if (filterStatus === 'Needs Review') {
      matchesFilter = ['FAILED', 'TIMEOUT'].includes(e.status);
    } else if (filterStatus !== 'All') {
      matchesFilter = e.status.toLowerCase() === filterStatus.toLowerCase();
    }
    return matchesSearch && matchesFilter;
  });
  const isReviewMode = filterStatus === 'Needs Review';

  const getStatusIcon = (status: string, size = 14) => {
    const s = `w-[${size}px] h-[${size}px]`;
    switch (status) {
      case 'SUCCESS':
        return <CheckCircle2 style={{ width: size, height: size, color: THEME.colors.emerald }} />;
      case 'FAILED':
        return <XCircle style={{ width: size, height: size, color: THEME.colors.red }} />;
      case 'RUNNING':
        return <Loader2 className="animate-spin" style={{ width: size, height: size, color: THEME.colors.blue }} />;
      case 'CANCELLED':
        return <AlertCircle style={{ width: size, height: size, color: '#64748B' }} />;
      case 'TIMEOUT':
        return <XCircle style={{ width: size, height: size, color: THEME.colors.red }} />;
      default:
        return <Clock style={{ width: size, height: size, color: THEME.colors.amber }} />;
    }
  };

  if (isLoading) {
    return (
      <div style={{ fontFamily: FONT }} className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3">
          <Loader2 className="w-5 h-5 animate-spin" style={{ color: THEME.accent }} />
          <span style={{ fontSize: 13, color: THEME.text.muted }}>Loading executions...</span>
        </div>
      </div>
    );
  }

  const MONO = "'IBM Plex Mono', ui-monospace, monospace";
  return (
    <div style={{ fontFamily: FONT }}>
      {/* Schematic breadcrumb — consistent with Dashboard/Flows chrome */}
      <div
        className="flex items-center gap-2 mb-2"
        style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.14em', color: THEME.text.muted }}
      >
        <span>// CONTROL PLANE / EXECUTIONS</span>
        <span
          className="px-1.5 py-0.5"
          style={{ background: THEME.input, border: `1px solid ${THEME.border}`, color: THEME.text.secondary, borderRadius: 2 }}
        >
          NODE.EXEC
        </span>
        <span className="ml-auto flex items-center gap-1.5">
          <span style={{ width: 5, height: 5, borderRadius: 999, background: '#10B981' }} aria-hidden />
          STREAMING
        </span>
      </div>

      <HeroHeader
        prompt="$ rl.executions · tail"
        title="Executions"
        subtitle="Every run, every node, every millisecond — the raw log of what the engine actually did."
        metrics={<>
          <MetricChip label="total"    value={String(totalCount).padStart(3, '0')} />
          <MetricChip label="success"  value={`${successRate}%`} accent="#10B981" />
          <MetricChip label="failed"   value={String(failedCount).padStart(2, '0')} accent={failedCount > 0 ? '#EF4444' : undefined} />
          <MetricChip label="avg"      value={formatDuration(avgDuration)} />
        </>}
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {/* Total Executions */}
        <div
          style={{
            background: THEME.panel,
            border: `1px solid ${THEME.border}`,
            borderRadius: 10,
            padding: '16px 18px',
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 7,
                background: `${THEME.colors.blue}14`,
                border: `1px solid ${THEME.colors.blue}30`,
              }}
              className="flex items-center justify-center"
            >
              <Activity style={{ width: 14, height: 14, color: THEME.colors.blue }} />
            </div>
            <span style={{ fontSize: 11, fontWeight: 500, color: THEME.text.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Total Executions
            </span>
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, color: THEME.text.primary, lineHeight: 1 }}>
            {totalCount}
          </div>
        </div>

        {/* Success Rate */}
        <div
          style={{
            background: THEME.panel,
            border: `1px solid ${THEME.border}`,
            borderRadius: 10,
            padding: '16px 18px',
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 7,
                background: `${THEME.colors.emerald}14`,
                border: `1px solid ${THEME.colors.emerald}30`,
              }}
              className="flex items-center justify-center"
            >
              <TrendingUp style={{ width: 14, height: 14, color: THEME.colors.emerald }} />
            </div>
            <span style={{ fontSize: 11, fontWeight: 500, color: THEME.text.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Success Rate
            </span>
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, color: THEME.colors.emerald, lineHeight: 1 }}>
            {successRate}%
          </div>
        </div>

        {/* Failed */}
        <div
          style={{
            background: THEME.panel,
            border: `1px solid ${THEME.border}`,
            borderRadius: 10,
            padding: '16px 18px',
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 7,
                background: `${THEME.colors.red}14`,
                border: `1px solid ${THEME.colors.red}30`,
              }}
              className="flex items-center justify-center"
            >
              <XCircle style={{ width: 14, height: 14, color: THEME.colors.red }} />
            </div>
            <span style={{ fontSize: 11, fontWeight: 500, color: THEME.text.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Failed
            </span>
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, color: THEME.colors.red, lineHeight: 1 }}>
            {failedCount}
          </div>
        </div>

        {/* Avg Duration */}
        <div
          style={{
            background: THEME.panel,
            border: `1px solid ${THEME.border}`,
            borderRadius: 10,
            padding: '16px 18px',
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 7,
                background: `${THEME.colors.purple}14`,
                border: `1px solid ${THEME.colors.purple}30`,
              }}
              className="flex items-center justify-center"
            >
              <Timer style={{ width: 14, height: 14, color: THEME.colors.purple }} />
            </div>
            <span style={{ fontSize: 11, fontWeight: 500, color: THEME.text.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Avg Duration
            </span>
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, color: THEME.text.primary, lineHeight: 1 }}>
            {formatDuration(avgDuration)}
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex items-center gap-3 mb-4">
        {/* Status tabs */}
        <div
          className="flex items-center gap-0.5"
          style={{
            background: THEME.panel,
            border: `1px solid ${THEME.border}`,
            borderRadius: 9,
            padding: 3,
          }}
        >
          {STATUS_TABS.map((tab) => {
            const isActive = filterStatus === tab;
            return (
              <button
                key={tab}
                onClick={() => setFilterStatus(tab)}
                style={{
                  background: isActive ? THEME.accent : 'transparent',
                  color: isActive ? '#fff' : THEME.text.secondary,
                  borderRadius: 7,
                  padding: '5px 14px',
                  fontSize: 12,
                  fontWeight: 500,
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {tab}
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="relative flex-1">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2"
            style={{ width: 14, height: 14, color: THEME.text.muted }}
          />
          <input
            type="text"
            placeholder="Search by name or ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              background: THEME.panel,
              border: `1px solid ${THEME.border}`,
              color: THEME.text.primary,
              borderRadius: 9,
              height: 36,
              fontSize: 12,
            }}
            className="w-full pl-9 pr-4 outline-none"
          />
        </div>

        {/* Select all */}
        <button
          onClick={() => selectedIds.size === filtered.length ? clearSelection() : selectAllFiltered(filtered.map((e) => e.id))}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: selectedIds.size > 0 ? `${THEME.colors.blue}14` : THEME.panel,
            border: `1px solid ${selectedIds.size > 0 ? `${THEME.colors.blue}40` : THEME.border}`,
            color: selectedIds.size > 0 ? THEME.colors.blue : THEME.text.muted,
            borderRadius: 9,
            padding: '5px 12px',
            fontSize: 12,
            fontWeight: 500,
            cursor: 'pointer',
            height: 36,
          }}
        >
          {selectedIds.size === filtered.length && filtered.length > 0 ? 'Deselect all' : 'Select all'}
        </button>

        {/* Auto-refresh toggle */}
        <button
          onClick={() => setAutoRefresh((v) => !v)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: autoRefresh ? `${THEME.colors.emerald}14` : THEME.panel,
            border: `1px solid ${autoRefresh ? `${THEME.colors.emerald}40` : THEME.border}`,
            color: autoRefresh ? THEME.colors.emerald : THEME.text.muted,
            borderRadius: 9,
            padding: '5px 12px',
            fontSize: 12,
            fontWeight: 500,
            cursor: 'pointer',
            height: 36,
            transition: 'all 0.15s ease',
          }}
        >
          <RefreshCw
            className={autoRefresh ? 'animate-spin' : ''}
            style={{ width: 13, height: 13, animationDuration: '2s' }}
          />
          Auto
        </button>
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div
          style={{
            position: 'sticky',
            top: 16,
            zIndex: 20,
            marginBottom: 12,
            padding: '10px 16px',
            background: THEME.panel,
            border: `1px solid ${THEME.colors.blue}40`,
            borderRadius: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          }}
        >
          <span style={{ fontSize: 13, color: THEME.text.primary, fontWeight: 500 }}>
            {selectedIds.size} selected
          </span>
          <div style={{ flex: 1 }} />
          <button
            onClick={handleBulkRetry}
            style={{
              padding: '6px 14px',
              background: `${THEME.colors.blue}20`,
              color: THEME.colors.blue,
              border: `1px solid ${THEME.colors.blue}40`,
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Retry selected
          </button>
          <button
            onClick={handleBulkDelete}
            style={{
              padding: '6px 14px',
              background: `${THEME.colors.red}20`,
              color: THEME.colors.red,
              border: `1px solid ${THEME.colors.red}40`,
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Delete selected
          </button>
          <button
            onClick={clearSelection}
            style={{
              padding: '6px 10px',
              background: 'transparent',
              color: THEME.text.muted,
              border: 'none',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Execution List */}
      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <div
            style={{
              width: 56,
              height: 56,
              background: THEME.panel,
              border: `1px solid ${THEME.border}`,
              borderRadius: 12,
            }}
            className="mx-auto mb-4 flex items-center justify-center"
          >
            <PlayCircle className="w-7 h-7" style={{ color: THEME.text.muted }} />
          </div>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: THEME.text.primary, marginBottom: 4 }}>
            No executions found
          </h3>
          <p style={{ fontSize: 13, color: THEME.text.muted }}>
            {searchQuery || filterStatus !== 'All'
              ? 'Try adjusting your filters'
              : 'Run a runloop to see executions here'}
          </p>
        </div>
      ) : (
        <div
          style={{
            background: THEME.panel,
            border: `1px solid ${THEME.border}`,
            borderRadius: 2,
            overflow: 'hidden',
          }}
        >
          {/* Header row — mono uppercase columns */}
          <div
            className="flex items-center gap-3 px-4 py-2"
            style={{
              fontFamily: MONO, fontSize: 10, letterSpacing: '0.14em',
              color: THEME.text.muted,
              borderBottom: `1px solid ${THEME.border}`,
              background: 'color-mix(in srgb, var(--t-bg) 40%, transparent)',
            }}
          >
            <span style={{ width: 14 }} aria-hidden />
            <span style={{ width: 14 }} aria-hidden />
            <span style={{ width: 24 }} aria-hidden />
            <span className="flex-1">TARGET</span>
            <span style={{ width: 80, textAlign: 'right' }}>TRIGGER</span>
            <span style={{ width: 70, textAlign: 'right' }}>STATUS</span>
            <span style={{ width: 16 }} aria-hidden />
          </div>
          {filtered.map((execution, i) => {
            const st = statusConfig[execution.status] || statusConfig.PENDING;
            const trigger = triggerConfig[execution.triggerType] || triggerConfig.MANUAL;
            const TriggerIcon = trigger.icon;
            const isExpanded = expandedId === execution.id;
            const idx = String(i + 1).padStart(3, '0');

            return (
              <div
                key={execution.id}
                style={{
                  borderBottom: i < filtered.length - 1 ? `1px solid ${THEME.borderLight}` : 'none',
                }}
              >
                {/* Row */}
                <div
                  className="flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors hover:bg-[var(--t-panel-hover)] group"
                  onClick={() => setExpandedId(isExpanded ? null : execution.id)}
                >
                  {/* Checkbox */}
                  <input
                    type="checkbox"
                    checked={selectedIds.has(execution.id)}
                    onChange={(e) => { e.stopPropagation(); toggleSelection(execution.id); }}
                    onClick={(e) => e.stopPropagation()}
                    style={{ accentColor: THEME.accent, cursor: 'pointer', width: 14, height: 14 }}
                  />

                  {/* Expand chevron */}
                  <div
                    style={{
                      transition: 'transform 0.15s ease',
                      transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                      width: 14,
                    }}
                  >
                    <ChevronRight style={{ width: 12, height: 12, color: THEME.text.muted }} />
                  </div>

                  {/* Row index as log-line id */}
                  <span style={{ fontFamily: MONO, fontSize: 10, color: THEME.text.muted, width: 24, textAlign: 'right' }}>
                    {idx}
                  </span>

                  {/* Name + time — left column */}
                  <div className="flex-1 min-w-0">
                    <p
                      style={{ fontSize: 13, fontWeight: 500, color: THEME.text.primary, letterSpacing: '-0.005em' }}
                      className="truncate"
                    >
                      {queueNameFromSchedulerId(execution.schedulerId) ||
                        execution.schedulerName ||
                        execution.runloop?.name ||
                        'Unknown RunLoop'}
                    </p>
                    <p style={{ fontFamily: MONO, fontSize: 10.5, color: THEME.text.muted, marginTop: 2 }}>
                      {relativeTime(execution.startedAt)}
                      {execution.durationMs !== undefined && execution.durationMs !== null
                        ? ` · ${formatDuration(execution.durationMs)}`
                        : ''}
                    </p>
                  </div>

                  {/* Trigger tag — sharp, mono */}
                  <span
                    className="flex items-center justify-end gap-1.5"
                    style={{ width: 80, fontFamily: MONO, fontSize: 10, color: trigger.color, letterSpacing: '0.08em' }}
                  >
                    <TriggerIcon style={{ width: 10, height: 10 }} />
                    {execution.triggerType}
                  </span>

                  {/* Status dot + label — same pattern as other list pages */}
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

                  {/* Review-mode inline actions: replay and discard */}
                  {isReviewMode && (
                    <>
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (!confirm(`Replay this execution? A new run will be triggered.`)) return;
                          const r = await fetch('/runloop/api/executions/bulk-retry', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ ids: [execution.id] }),
                          });
                          if (r.ok) fetchExecutions();
                        }}
                        title="Replay"
                        style={{
                          display: 'flex', alignItems: 'center', gap: 4,
                          padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 500,
                          background: `${THEME.colors.blue}15`, color: THEME.colors.blue,
                          border: `1px solid ${THEME.colors.blue}40`, cursor: 'pointer',
                        }}
                      >
                        <RefreshCw style={{ width: 11, height: 11 }} />
                        Replay
                      </button>
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (!confirm(`Discard this failed execution?`)) return;
                          const r = await fetch('/runloop/api/executions/bulk-delete', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ ids: [execution.id] }),
                          });
                          if (r.ok) fetchExecutions();
                        }}
                        title="Discard"
                        style={{
                          display: 'flex', alignItems: 'center', gap: 4,
                          padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 500,
                          background: `${THEME.colors.red}15`, color: THEME.colors.red,
                          border: `1px solid ${THEME.colors.red}40`, cursor: 'pointer',
                        }}
                      >
                        Discard
                      </button>
                    </>
                  )}

                  {/* Link to detail page */}
                  <Link
                    href={`/p/${projectId}/executions/${execution.id}`}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 28,
                      height: 28,
                      borderRadius: 6,
                      border: `1px solid ${THEME.border}`,
                      color: THEME.text.muted,
                      transition: 'all 0.15s ease',
                    }}
                    className="flex-shrink-0 hover:bg-[var(--t-panel-hover)]"
                    title="View full details"
                  >
                    <Zap style={{ width: 12, height: 12 }} />
                  </Link>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div
                    style={{
                      padding: '0 16px 14px 58px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                    }}
                  >
                    {/* Error message */}
                    {execution.errorMessage && (
                      <div
                        style={{
                          background: `${THEME.colors.red}0C`,
                          border: `1px solid ${THEME.colors.red}25`,
                          borderRadius: 8,
                          padding: '10px 14px',
                        }}
                      >
                        <div
                          className="flex items-center gap-2 mb-1"
                          style={{ fontSize: 11, fontWeight: 600, color: THEME.colors.red }}
                        >
                          <AlertCircle style={{ width: 12, height: 12 }} />
                          Error
                        </div>
                        <pre
                          style={{
                            fontSize: 11,
                            color: THEME.colors.red,
                            margin: 0,
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                            fontFamily: "'IBM Plex Mono', monospace",
                            lineHeight: 1.5,
                            opacity: 0.85,
                          }}
                        >
                          {execution.errorMessage}
                        </pre>
                      </div>
                    )}

                    {/* Logs preview */}
                    {execution.logs && (
                      <div
                        style={{
                          background: '#0D1117',
                          border: `1px solid ${THEME.border}`,
                          borderRadius: 8,
                          padding: '10px 14px',
                          maxHeight: 180,
                          overflow: 'auto',
                        }}
                      >
                        <div
                          className="flex items-center gap-2 mb-2"
                          style={{ fontSize: 11, fontWeight: 600, color: THEME.text.muted }}
                        >
                          <Terminal style={{ width: 12, height: 12 }} />
                          Logs
                        </div>
                        <pre
                          style={{
                            fontSize: 11,
                            color: '#C9D1D9',
                            margin: 0,
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                            fontFamily: "'IBM Plex Mono', monospace",
                            lineHeight: 1.6,
                          }}
                        >
                          {execution.logs}
                        </pre>
                      </div>
                    )}

                    {/* Output JSON */}
                    {execution.output && Object.keys(execution.output).length > 0 && (
                      <div
                        style={{
                          background: '#0D1117',
                          border: `1px solid ${THEME.border}`,
                          borderRadius: 8,
                          padding: '10px 14px',
                          maxHeight: 180,
                          overflow: 'auto',
                        }}
                      >
                        <div
                          className="flex items-center gap-2 mb-2"
                          style={{ fontSize: 11, fontWeight: 600, color: THEME.text.muted }}
                        >
                          <Zap style={{ width: 12, height: 12 }} />
                          Output
                        </div>
                        <pre
                          style={{
                            fontSize: 11,
                            color: '#C9D1D9',
                            margin: 0,
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                            fontFamily: "'IBM Plex Mono', monospace",
                            lineHeight: 1.6,
                          }}
                        >
                          {JSON.stringify(execution.output, null, 2)}
                        </pre>
                      </div>
                    )}

                    {/* Meta info row */}
                    <div className="flex items-center gap-4 flex-wrap" style={{ fontSize: 11, color: THEME.text.muted }}>
                      <span>ID: <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: THEME.text.secondary }}>{execution.id}</span></span>
                      {execution.workerId && (
                        <span>Worker: <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: THEME.text.secondary }}>{execution.workerId}</span></span>
                      )}
                      {execution.retryAttempt > 0 && (
                        <span>Retry: <span style={{ color: THEME.colors.amber }}>#{execution.retryAttempt}</span></span>
                      )}
                      <span>Started: {new Date(execution.startedAt).toLocaleString()}</span>
                      {execution.completedAt && (
                        <span>Completed: {new Date(execution.completedAt).toLocaleString()}</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Footer count */}
      {filtered.length > 0 && (
        <div style={{ fontSize: 11, color: THEME.text.muted, marginTop: 10, textAlign: 'right' }}>
          Showing {filtered.length} of {totalCount} execution{totalCount !== 1 ? 's' : ''}
          {autoRefresh && (
            <span style={{ color: THEME.colors.emerald, marginLeft: 8 }}>
              Auto-refreshing every 5s
            </span>
          )}
        </div>
      )}
    </div>
  );
}
