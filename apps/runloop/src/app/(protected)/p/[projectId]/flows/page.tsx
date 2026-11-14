'use client';
import { BASE_PATH } from '@/lib/base-path';

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
import { HeroHeader, MetricChip, SharpButton, ContentSwitcher, SearchField, Tag, sentence } from '@/components/ControlChrome';

const FONT = "'IBM Plex Sans Thai', 'IBM Plex Sans', sans-serif";
const MONO = "'IBM Plex Sans Thai', 'IBM Plex Sans', system-ui, sans-serif";
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

const statusColors: Record<FlowStatus, { bg: string; color: string; label: string }> = {
  ACTIVE: { bg: `${THEME.colors.emerald}18`, color: THEME.colors.emerald, label: 'Active' },
  INACTIVE: { bg: '#64748B18', color: '#6f6f6f', label: 'Inactive' },
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
      const res = await fetch(`${BASE_PATH}/api/flows${params}`);
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
          <button onClick={fetchFlows} style={{ background: THEME.accent, color: '#fff', borderRadius: 0, padding: '6px 16px', fontSize: 13, fontWeight: 500 }}>
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // Monospace font chain reused across headings/tags. Kept local so the
  // component file stays self-contained; Layout.tsx ships the same chain.
  const MONO = "'IBM Plex Sans Thai', 'IBM Plex Sans', system-ui, sans-serif";
  const activeCount = flows.filter((f) => f.status === 'ACTIVE').length;
  const draftCount = flows.filter((f) => f.status === 'DRAFT').length;

  return (
    <div style={{ fontFamily: FONT }}>
      <HeroHeader
        title="Flows"
        subtitle="Build and manage workflow pipelines — drag nodes, wire edges, schedule runs."
        metrics={<>
          <MetricChip label="active" value={String(activeCount)} />
          <MetricChip label="draft"  value={String(draftCount)} />
          <MetricChip label="total"  value={String(activeCount + draftCount)} />
        </>}
        right={
          <SharpButton href={`/p/${projectId}/flows/new`}>
            <Plus className="w-3.5 h-3.5" /> New Flow
          </SharpButton>
        }
      />

      <div className="flex flex-col gap-4 mb-4">
        <ContentSwitcher options={tabs} value={filterStatus} onChange={setFilterStatus} />
        <SearchField value={searchQuery} onChange={setSearchQuery} placeholder="Search flows" />
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <div style={{ width: 56, height: 56, background: THEME.panel, border: `1px solid ${THEME.border}`, borderRadius: 0 }} className="mx-auto mb-4 flex items-center justify-center">
            <Workflow className="w-7 h-7" style={{ color: THEME.text.muted }} />
          </div>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: THEME.text.primary, marginBottom: 4 }}>No flows found</h3>
          <p style={{ fontSize: 13, color: THEME.text.muted, marginBottom: 12 }}>Create a flow to define your workflow pipelines</p>
          <Link href={`/p/${projectId}/flows/new`} style={{ background: THEME.accent, color: '#fff', borderRadius: 0, padding: '6px 16px', fontSize: 13, fontWeight: 500 }} className="inline-flex items-center gap-2">
            <Plus className="w-4 h-4" /> Create Flow
          </Link>
        </div>
      ) : (
        <div
          style={{ background: THEME.panel, overflow: 'hidden' }}
        >
          <div
            className="rl-row rl-th"
            style={{ ['--cols' as any]: 'minmax(0, 1fr) 96px 112px 120px', ['--cols-sm' as any]: 'minmax(0, 1fr) 96px' }}
          >
            <span>Flow</span>
            <span>Status</span>
            <span className="rl-opt">Type</span>
            <span className="rl-opt" style={{ textAlign: 'right' }}>Created</span>
          </div>
          {filtered.map((flow) => {
            const ft = typeColors[flow.type];
            return (
              <Link
                key={flow.id}
                href={`/p/${projectId}/flows/${flow.id}`}
                className="rl-row transition-colors hover:bg-[var(--t-panel-hover)]"
                style={{ ['--cols' as any]: 'minmax(0, 1fr) 96px 112px 120px', ['--cols-sm' as any]: 'minmax(0, 1fr) 96px' }}
              >
                <div className="min-w-0">
                  <p className="truncate" style={{ fontSize: 14, fontWeight: 600, color: THEME.text.primary }} title={flow.name}>
                    {flow.name}
                  </p>
                  <p className="truncate" style={{ fontSize: 12, lineHeight: '16px', color: THEME.text.secondary, marginTop: 2 }}>
                    {flow.description || `${ft.label} flow`}
                  </p>
                </div>
                <span>
                  <Tag tone={flow.status === 'ACTIVE' ? 'green' : flow.status === 'DRAFT' ? 'gray' : 'orange'}>
                    {sentence(flow.status)}
                  </Tag>
                </span>
                <span className="rl-opt" style={{ fontSize: 14, color: THEME.text.secondary }}>{ft.label}</span>
                <span className="rl-opt" style={{ fontSize: 14, color: THEME.text.secondary, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {new Date(flow.createdAt).toLocaleDateString()}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
