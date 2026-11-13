'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  FolderKanban,
  Clock,
  Workflow,
  Activity,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  Plus,
  ChevronRight,
  CheckCircle2,
  Shield,
  BarChart3,
  Server,
  PlayCircle,
} from 'lucide-react';
import { useProject } from '@/context/ProjectContext';
import { SharpButton } from '@/components/ControlChrome';
import type { DashboardStats, Execution } from '@/types';

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
  colors: {
    blue: '#0f62fe',
    emerald: '#24a148',
    purple: '#8a3ffc',
    amber: '#b28600',
    red: '#da1e28',
    cyan: '#1192e8',
  }
};

function tagFor(status: string): React.CSSProperties {
  if (status === 'SUCCESS') return { background: 'var(--tag-green-bg)', color: 'var(--tag-green-text)' };
  if (status === 'FAILED' || status === 'TIMEOUT') return { background: 'var(--tag-red-bg)', color: 'var(--tag-red-text)' };
  if (status === 'RUNNING') return { background: 'var(--tag-blue-bg)', color: 'var(--tag-blue-text)' };
  return { background: 'var(--tag-orange-bg)', color: 'var(--tag-orange-text)' };
}

function relativeTime(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default function DashboardPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const { selectedProject } = useProject();
  const [dashboardData, setDashboardData] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [recentExecutions, setRecentExecutions] = useState<Execution[]>([]);
  const [recentFlows, setRecentFlows] = useState<any[]>([]);

  useEffect(() => {
    async function fetchAll() {
      try {
        const pid = projectId;
        const params = pid ? `?projectId=${pid}` : '';
        const [statsRes, flowsRes] = await Promise.allSettled([
          fetch(`/runloop/api/metrics/dashboard${params}`),
          fetch(`/runloop/api/flows${params}`),
        ]);

        if (statsRes.status === 'fulfilled' && statsRes.value.ok) {
          const data = await statsRes.value.json();
          setDashboardData(data);
          if (data.recentExecutions) {
            setRecentExecutions(data.recentExecutions);
          }
        }
        if (flowsRes.status === 'fulfilled' && flowsRes.value.ok) {
          const data = await flowsRes.value.json();
          setRecentFlows(data.data || []);
        }
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
      } finally {
        setIsLoading(false);
      }
    }
    fetchAll();
  }, [selectedProject]);

  const stats = [
    {
      label: 'Flows',
      value: recentFlows?.length?.toString() || '0',
      sub: `${recentFlows.filter((f: any) => f.status === 'ACTIVE').length} active`,
      icon: Workflow,
      color: THEME.colors.purple,
      href: `/p/${projectId}/flows`,
    },
    {
      label: 'Schedulers',
      value: dashboardData?.totalRunloops?.toString() || '0',
      sub: `${dashboardData?.totalRunloops || 0} configured`,
      icon: Clock,
      color: THEME.colors.emerald,
      href: `/p/${projectId}/schedulers`,
    },
    {
      label: 'Executions',
      value: dashboardData?.totalExecutions?.toLocaleString() || '0',
      sub: `${dashboardData?.successRate ? Math.round(dashboardData.successRate) : 0}% success`,
      icon: Activity,
      color: THEME.colors.amber,
      href: `/p/${projectId}/executions`,
    },
  ];

  const systemServices = [
    { name: 'RunLoop Engine', status: 'online', port: '8080' },
    { name: 'PostgreSQL', status: 'online', port: '5432' },
    { name: 'Worker Pool', status: 'online', port: '10 workers' },
    { name: 'Next.js App', status: 'online', port: '3000' },
  ];

  const quickActions = [
    { href: `/p/${projectId}/flows/new`, icon: Workflow, label: 'New Flow', desc: 'Build workflow pipeline', color: THEME.colors.purple },
    { href: `/p/${projectId}/schedulers/new`, icon: Clock, label: 'New Scheduler', desc: 'Schedule automation', color: THEME.colors.emerald },
  ];

  const JOB_TYPE_COLORS: Record<string, string> = {
    HTTP: THEME.colors.blue, SHELL: THEME.colors.amber, PYTHON: THEME.colors.purple,
    DATABASE: THEME.colors.emerald, NODEJS: THEME.colors.cyan, DOCKER: THEME.colors.red,
  };

  // Tiny "recent runs" sparkline for each stat tile — derived from the
  // data we already have; no new network calls.
  const recentRunDots = recentExecutions.slice(0, 10).map((e) =>
    e.status === 'SUCCESS' ? 'ok' : e.status === 'FAILED' || e.status === 'TIMEOUT' ? 'err' : 'pend'
  );

  return (
    <div style={{ fontFamily: FONT, minHeight: '100%' }}>
      <div className="flex items-end justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 style={{ fontSize: 28, lineHeight: '36px', fontWeight: 400, color: THEME.text.primary }}>
            {selectedProject ? selectedProject.name : 'Dashboard'}
          </h1>
          <p style={{ fontSize: 14, color: THEME.text.secondary, marginTop: 4 }}>
            {selectedProject ? 'Project overview' : 'Overview of RunLoop system'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SharpButton variant="ghost" href={`/p/${projectId}/flows/new`}>
            <Plus className="w-3.5 h-3.5" /> New Flow
          </SharpButton>
          <SharpButton href={`/p/${projectId}/schedulers/new`}>
            <Plus className="w-3.5 h-3.5" /> New Scheduler
          </SharpButton>
        </div>
      </div>

      {/* Instrument-panel tiles */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-5">
        {stats.map((stat, idx) => (
          <Link key={stat.label} href={stat.href} className="group block">
            <div
              style={{
                background: THEME.panel,
                border: `1px solid ${THEME.border}`,
                borderRadius: 2,
                padding: 16,
                transition: 'background 0.1s ease',
                position: 'relative',
                overflow: 'hidden',
              }}
              className="hover:!bg-[var(--t-panel-hover)]"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <stat.icon className="w-3.5 h-3.5" style={{ color: stat.color }} />
                  <span
                    style={{
                      fontSize: 14,
                      color: THEME.text.secondary,
                    }}
                  >
                    {stat.label}
                  </span>
                </div>
              </div>

              <p
                style={{
                  fontSize: 32,
                  fontWeight: 300,
                  fontVariantNumeric: 'tabular-nums',
                  color: THEME.text.primary,
                  lineHeight: '40px',
                  marginBottom: 8,
                  letterSpacing: 0,
                }}
              >
                {isLoading ? <span style={{ opacity: 0.4 }}>–</span> : stat.value}
              </p>

              <div className="flex items-center justify-between">
                <p
                  style={{
                    fontSize: 12,
                    color: THEME.text.secondary,
                  }}
                >
                  {stat.sub}
                </p>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Main Content - 3 columns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Left column - 2/3 width */}
        <div className="lg:col-span-2 space-y-4">

          {/* Recent Executions — terminal-log style */}
          <div style={{ background: THEME.panel, border: `1px solid ${THEME.border}`, borderRadius: 2, overflow: 'hidden' }}>
            <div
              className="flex items-center justify-between px-4 py-2.5"
              style={{ borderBottom: `1px solid ${THEME.border}` }}
            >
              <span
                style={{
                  fontSize: 16,
                  fontWeight: 400,
                  color: THEME.text.primary,
                }}
              >
                Recent executions
              </span>
              <Link
                href={`/p/${projectId}/executions`}
                className="flex items-center gap-1"
                style={{
                  fontSize: 14,
                  color: THEME.accent,
                }}
              >
                View all <ArrowUpRight className="w-3 h-3" />
              </Link>
            </div>
            <div>
              {recentExecutions?.length > 0 ? recentExecutions.slice(0, 5).map((execution: Execution, i: number) => {
                const statusColor =
                  execution.status === 'SUCCESS' ? '#24a148'
                  : execution.status === 'FAILED' || execution.status === 'TIMEOUT' ? '#da1e28'
                  : execution.status === 'RUNNING' ? '#0f62fe'
                  : '#eb6200';
                return (
                  <Link
                    key={execution.id}
                    href={`/p/${projectId}/executions/${execution.id}`}
                    className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-[var(--t-panel-hover)] group"
                    style={{
                      borderBottom: i < Math.min(recentExecutions.length, 5) - 1 ? `1px solid ${THEME.borderLight}` : 'none',
                      fontFamily: MONO,
                    }}
                  >
                    {/* timestamp */}
                    <span style={{ fontSize: 12, color: THEME.text.secondary, minWidth: 64 }}>
                      {relativeTime(execution.startedAt)}
                    </span>
                    {/* name */}
                    <span
                      style={{ fontSize: 14, color: THEME.text.primary }}
                      className="flex-1 truncate"
                    >
                      {execution.runloop?.name
                        || (execution.schedulerId?.startsWith('dryrun_') ? 'Dry-run' : null)
                        || (execution.schedulerId?.startsWith('queue:')
                            ? `Queue: ${execution.schedulerId.slice(6)}`
                            : null)
                        || (execution.triggerType === 'WEBHOOK' ? 'Webhook' : null)
                        || (execution.triggerType === 'API' ? 'API trigger' : null)
                        || (execution.triggerType === 'MANUAL' ? 'Manual run' : null)
                        || 'Untitled run'}
                    </span>
                    {/* status label */}
                    <span
                      style={{
                        fontSize: 12,
                        lineHeight: '16px',
                        padding: '4px 8px',
                        borderRadius: 24,
                        ...tagFor(execution.status),
                      }}
                    >
                      {execution.status.charAt(0) + execution.status.slice(1).toLowerCase()}
                    </span>
                  </Link>
                );
              }) : (
                <div className="px-4 py-10 text-center">
                  <p
                    style={{
                      fontFamily: MONO, fontSize: 11, color: THEME.text.muted,
                      letterSpacing: 0, marginBottom: 12,
                    }}
                    className=""
                  >
                    No executions yet
                  </p>
                  <Link
                    href={`/p/${projectId}/schedulers/new`}
                    className="inline-flex items-center gap-1.5"
                    style={{
                      fontFamily: MONO, fontSize: 11, color: THEME.accent,
                      letterSpacing: 0,
                      
                    }}
                  >
                    Create scheduler
                  </Link>
                </div>
              )}
            </div>
          </div>

          {/* Recent Flows — schematic list */}
          <div style={{ background: THEME.panel, border: `1px solid ${THEME.border}`, borderRadius: 2, overflow: 'hidden' }}>
            <div
              className="flex items-center justify-between px-4 py-2.5"
              style={{ borderBottom: `1px solid ${THEME.border}` }}
            >
              <span
                style={{ fontSize: 16, color: THEME.text.primary }}
              >
                Recent flows
              </span>
              <Link
                href={`/p/${projectId}/flows`}
                className="flex items-center gap-1"
                style={{
                  fontSize: 14,
                  color: THEME.accent,
                }}
              >
                View all <ArrowUpRight className="w-3 h-3" />
              </Link>
            </div>
            <div>
              {recentFlows?.length > 0 ? recentFlows.slice(0, 5).map((flow: any, i: number) => (
                <Link
                  key={flow.id}
                  href={`/p/${projectId}/flows/${flow.id}`}
                  className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-[var(--t-panel-hover)]"
                  style={{
                    borderBottom: i < Math.min(recentFlows.length, 5) - 1 ? `1px solid ${THEME.borderLight}` : 'none',
                    fontFamily: MONO,
                  }}
                >
                  <Workflow className="w-3.5 h-3.5" style={{ color: THEME.colors.purple, flexShrink: 0 }} />
                  <span
                    style={{ fontSize: 14, color: THEME.text.primary }}
                    className="flex-1 truncate"
                  >
                    {flow.name}
                  </span>
                  <span style={{ fontSize: 12, color: THEME.text.secondary }}>
                    {flow.type || 'SIMPLE'}
                  </span>
                  <span
                    style={{
                      fontSize: 12, lineHeight: '16px', padding: '4px 8px', borderRadius: 24,
                      ...(flow.status === 'ACTIVE' || !flow.status
                        ? { background: 'var(--tag-green-bg)', color: 'var(--tag-green-text)' }
                        : { background: 'var(--tag-gray-bg)', color: 'var(--tag-gray-text)' }),
                    }}
                  >
                    {(flow.status || 'ACTIVE').charAt(0) + (flow.status || 'ACTIVE').slice(1).toLowerCase()}
                  </span>
                </Link>
              )) : (
                <div className="px-4 py-10 text-center">
                  <p
                    style={{ fontFamily: MONO, fontSize: 11, color: THEME.text.muted, letterSpacing: 0, marginBottom: 12 }}
                    className=""
                  >
                    No flows yet
                  </p>
                  <Link
                    href={`/p/${projectId}/flows/new`}
                    className="inline-flex items-center gap-1.5"
                    style={{
                      fontFamily: MONO, fontSize: 11, color: THEME.accent,
                      letterSpacing: 0,
                      
                    }}
                  >
                    Create flow
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right column - 1/3 width */}
        <div className="space-y-4">

          {/* System Status — echoes login footer */}
          <div style={{ background: THEME.panel, border: `1px solid ${THEME.border}`, borderRadius: 2, padding: 14 }}>
            <div className="flex items-center justify-between mb-3">
              <span
                style={{
                  fontFamily: MONO, fontSize: 10, letterSpacing: 0,
                  color: THEME.text.muted,
                }}
                className=""
              >
                System
              </span>
              <span
                className="flex items-center gap-1.5"
                style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 0, color: '#24a148' }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 6, height: 6, borderRadius: 999,
                    background: '#24a148',
                    boxShadow: '0 0 0 3px color-mix(in srgb, #24a148 20%, transparent)',
                  }}
                />
                Online
              </span>
            </div>
            <div style={{ fontSize: 14 }}>
              {systemServices.map((svc, i) => (
                <div
                  key={svc.name}
                  className="flex items-center justify-between py-1.5"
                  style={{
                    borderBottom: i < systemServices.length - 1 ? `1px solid ${THEME.borderLight}` : 'none',
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span
                      aria-hidden
                      style={{
                        width: 5, height: 5, borderRadius: 999,
                        background: '#24a148',
                        boxShadow: '0 0 0 2px color-mix(in srgb, #24a148 15%, transparent)',
                      }}
                    />
                    <span style={{ color: THEME.text.secondary, fontSize: 11.5 }}>{svc.name}</span>
                  </div>
                  <span style={{ color: THEME.text.muted, letterSpacing: 0 }}>:{svc.port}</span>
                </div>
              ))}
            </div>
            <div
              style={{
                marginTop: 10,
                paddingTop: 10,
                borderTop: `1px solid ${THEME.borderLight}`,
                fontFamily: MONO, fontSize: 10,
                color: THEME.text.muted,
                letterSpacing: 0,
              }}
            >
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
