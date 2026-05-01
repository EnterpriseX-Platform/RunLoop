'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  Plus,
  Workflow,
  Search,
  AlertCircle,
  Loader2,
  ChevronRight,
  GitBranch,
  Zap,
} from 'lucide-react';
import { useProject } from '@/context/ProjectContext';
import type { Flow, FlowStatus, FlowType, JobType } from '@/types';
import { HeroHeader, MetricChip, SharpButton } from '@/components/ControlChrome';

const FONT = "'IBM Plex Sans Thai', 'IBM Plex Sans', sans-serif";
const MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace";
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

const statusColors: Record<FlowStatus, { bg: string; color: string; label: string }> = {
  ACTIVE: { bg: `${THEME.colors.emerald}18`, color: THEME.colors.emerald, label: 'Active' },
  INACTIVE: { bg: '#64748B18', color: '#64748B', label: 'Inactive' },
  DRAFT: { bg: `${THEME.colors.amber}18`, color: THEME.colors.amber, label: 'Draft' },
};

const typeColors: Record<FlowType, { color: string; label: string }> = {
  SIMPLE: { color: THEME.colors.blue, label: 'Simple' },
  DAG: { color: THEME.colors.purple, label: 'DAG' },
};

const jobTypeLabels: Record<JobType, string> = {
  HTTP: 'HTTP',
  DATABASE: 'Database',
  SHELL: 'Shell',
  PYTHON: 'Python',
  NODEJS: 'Node.js',
  DOCKER: 'Docker',
};

export default function FlowsPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const { selectedProject } = useProject();
  const [flows, setFlows] = useState<Flow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'All' | 'Active' | 'Draft'>('All');

  const fetchFlows = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const pid = projectId;
      const params = pid ? `?projectId=${pid}` : '';
      const res = await fetch(`/runloop/api/flows${params}`);
      if (!res.ok) throw new Error('Failed to fetch flows');
      const data = await res.json();
      setFlows(data.data || []);
    } catch (err) {
      console.error('Failed to fetch flows:', err);
      setError(err instanceof Error ? err.message : 'Failed to load flows');
    } finally {
      setIsLoading(false);
    }
  }, [selectedProject]);

  useEffect(() => {
    fetchFlows();
  }, [fetchFlows]);

  const tabs = ['All', 'Active', 'Draft'] as const;

  const filtered = flows.filter((f) => {
    const matchesSearch =
      f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (f.description || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter =
      filterStatus === 'All' || f.status.toLowerCase() === filterStatus.toLowerCase();
    return matchesSearch && matchesFilter;
  });

  if (isLoading) {
    return (
      <div style={{ fontFamily: FONT }} className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3">
          <Loader2 className="w-5 h-5 animate-spin" style={{ color: THEME.accent }} />
          <span style={{ fontSize: 13, color: THEME.text.muted }}>Loading flows...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ fontFamily: FONT }} className="flex items-center justify-center h-64">
        <div className="text-center">
          <AlertCircle className="w-10 h-10 mx-auto mb-3" style={{ color: THEME.colors.red }} />
          <h3 style={{ fontSize: 16, fontWeight: 600, color: THEME.text.primary, marginBottom: 4 }}>Failed to load flows</h3>
          <p style={{ fontSize: 13, color: THEME.text.muted, marginBottom: 12 }}>{error}</p>
          <button onClick={fetchFlows} style={{ background: THEME.accent, color: '#fff', borderRadius: 8, padding: '6px 16px', fontSize: 13, fontWeight: 500 }}>
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // Monospace font chain reused across headings/tags. Kept local so the
  // component file stays self-contained; Layout.tsx ships the same chain.
  const MONO = "'IBM Plex Mono', ui-monospace, monospace";
  const activeCount = flows.filter((f) => f.status === 'ACTIVE').length;
  const draftCount = flows.filter((f) => f.status === 'DRAFT').length;

  return (
    <div style={{ fontFamily: FONT }}>
      <HeroHeader
        title="Flows"
        subtitle="Build and manage workflow pipelines — drag nodes, wire edges, schedule runs."
        metrics={<>
          <MetricChip label="active" value={String(activeCount).padStart(2, '0')} accent="#10B981" />
          <MetricChip label="draft"  value={String(draftCount).padStart(2, '0')}  accent="#F59E0B" />
          <MetricChip label="total"  value={String(activeCount + draftCount).padStart(2, '0')} />
        </>}
        right={
          <SharpButton href={`/p/${projectId}/flows/new`}>
            <Plus className="w-3.5 h-3.5" /> New Flow
          </SharpButton>
        }
      />

      {/* Filter tabs — sharp-corner pills to match the aesthetic */}
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
            <span style={{ color: '#10B981' }}>●</span> {activeCount} ACTIVE
          </span>
          <span>
            <span style={{ color: '#F59E0B' }}>●</span> {draftCount} DRAFT
          </span>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: THEME.text.muted }} />
        <input
          type="text"
          placeholder="search flows..."
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
            <Workflow className="w-7 h-7" style={{ color: THEME.text.muted }} />
          </div>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: THEME.text.primary, marginBottom: 4 }}>No flows found</h3>
          <p style={{ fontSize: 13, color: THEME.text.muted, marginBottom: 12 }}>Create a flow to define your workflow pipelines</p>
          <Link href={`/p/${projectId}/flows/new`} style={{ background: THEME.accent, color: '#fff', borderRadius: 8, padding: '6px 16px', fontSize: 13, fontWeight: 500 }} className="inline-flex items-center gap-2">
            <Plus className="w-4 h-4" /> Create Flow
          </Link>
        </div>
      ) : (
        <div
          style={{ background: THEME.panel, border: `1px solid ${THEME.border}`, borderRadius: 2, overflow: 'hidden' }}
        >
          {/* Table header row — mono column labels, thin underline */}
          <div
            className="flex items-center gap-3 px-4 py-2"
            style={{
              fontFamily: MONO,
              fontSize: 10,
              letterSpacing: '0.14em',
              color: THEME.text.muted,
              borderBottom: `1px solid ${THEME.border}`,
              background: 'color-mix(in srgb, var(--t-bg) 40%, transparent)',
            }}
          >
            <span style={{ width: 28 }} aria-hidden />
            <span className="flex-1">FLOW</span>
            <span style={{ width: 70, textAlign: 'right' }}>STATUS</span>
            <span style={{ width: 60, textAlign: 'right' }}>TYPE</span>
            <span style={{ width: 16 }} aria-hidden />
          </div>

          {filtered.map((flow, i) => {
            const status = statusColors[flow.status];
            const ft = typeColors[flow.type];
            const iconColor = ft.color;
            const idx = String(i + 1).padStart(2, '0');
            return (
              <Link
                key={flow.id}
                href={`/p/${projectId}/flows/${flow.id}`}
                className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-[var(--t-panel-hover)] group"
                style={{ borderBottom: i < filtered.length - 1 ? `1px solid ${THEME.borderLight}` : 'none' }}
              >
                {/* Row index as a mono tag — gives the list a log-line feel */}
                <span
                  style={{
                    fontFamily: MONO, fontSize: 10,
                    color: THEME.text.muted,
                    width: 22, textAlign: 'right',
                  }}
                >
                  {idx}
                </span>
                {/* Icon — sharp square to match schematic aesthetic */}
                <div
                  style={{ width: 26, height: 26, background: `${iconColor}15`, border: `1px solid ${iconColor}40`, borderRadius: 2 }}
                  className="flex items-center justify-center flex-shrink-0"
                >
                  {flow.type === 'DAG' ? (
                    <GitBranch className="w-3 h-3" style={{ color: iconColor }} />
                  ) : (
                    <Zap className="w-3 h-3" style={{ color: iconColor }} />
                  )}
                </div>
                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p style={{ fontSize: 13, fontWeight: 500, color: THEME.text.primary, letterSpacing: '-0.005em' }} className="truncate">
                    {flow.name}
                  </p>
                  <p
                    style={{ fontFamily: MONO, fontSize: 10.5, color: THEME.text.muted }}
                    className="truncate"
                  >
                    {flow.description || ft.label.toLowerCase() + ' flow'} · {new Date(flow.createdAt).toLocaleDateString()}
                  </p>
                </div>
                {/* Status dot + label — denser than the old pill badges */}
                <span
                  className="flex items-center justify-end gap-1.5"
                  style={{ width: 70, fontFamily: MONO, fontSize: 10.5, color: status.color, letterSpacing: '0.04em' }}
                >
                  <span
                    style={{
                      width: 6, height: 6, borderRadius: 999,
                      background: status.color,
                      boxShadow: `0 0 0 3px color-mix(in srgb, ${status.color} 15%, transparent)`,
                    }}
                  />
                  {status.label.toUpperCase()}
                </span>
                <span
                  style={{
                    width: 60, textAlign: 'right',
                    fontFamily: MONO, fontSize: 10.5, color: iconColor, letterSpacing: '0.04em',
                  }}
                >
                  {ft.label.toUpperCase()}
                </span>
                <ChevronRight
                  className="w-3.5 h-3.5 flex-shrink-0 opacity-40 group-hover:opacity-100 transition-opacity"
                  style={{ color: THEME.text.muted }}
                />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
