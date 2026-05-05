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
  colors: {
    blue: '#3B82F6',
    emerald: '#10B981',
    purple: '#8B5CF6',
    amber: '#F59E0B',
    red: '#EF4444',
    cyan: '#06B6D4',
  }
};

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
          <h1 style={{ fontSize: 24, fontWeight: 600, color: THEME.text.primary, letterSpacing: '-0.02em' }}>
            {selectedProject ? selectedProject.name : 'Dashboard'}
          </h1>
          <p style={{ fontSize: 13, color: THEME.text.muted, marginTop: 6 }}>
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
                padding: '14px 16px 12px',
                transition: 'border-color 0.15s ease, transform 0.15s ease',
                position: 'relative',
                overflow: 'hidden',
              }}
              className="hover:!border-[color:var(--t-accent)]"
            >
              {/* Corner tick — schematic detail */}
              <span
                aria-hidden
                style={{ position: 'absolute', top: 0, right: 0, width: 8, height: 1, background: stat.color, opacity: 0.65 }}
              />
              <span
                aria-hidden
                style={{ position: 'absolute', top: 0, right: 0, width: 1, height: 8, background: stat.color, opacity: 0.65 }}
              />

              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <stat.icon className="w-3.5 h-3.5" style={{ color: stat.color }} />
                  <span
                    style={{
                      fontFamily: MONO,
                      fontSize: 10,
                      letterSpacing: '0.16em',
                      color: THEME.text.muted,
                    }}
                    className="uppercase"
                  >
                    {stat.label}
                  </span>
                </div>
                <span
                  style={{
                    fontFamily: MONO,
                    fontSize: 9,
                    letterSpacing: '0.08em',
                    color: THEME.text.muted,
                    opacity: 0.55,
                  }}
                >
                  node.{String(idx + 1).padStart(2, '0')}
                </span>
              </div>

              <p
                style={{
                  fontFamily: MONO,
                  fontSize: 30,
                  fontWeight: 500,
                  color: THEME.text.primary,
                  lineHeight: 1,
                  marginBottom: 8,
                  letterSpacing: '-0.02em',
                }}
              >
                {isLoading ? <span style={{ opacity: 0.4 }}>--</span> : stat.value}
              </p>

              <div className="flex items-center justify-between">
                {/* Dot-trail: recent run history */}
                <div className="flex items-center gap-[3px]">
                  {recentRunDots.length === 0 ? (
                    <span style={{ fontFamily: MONO, fontSize: 10, color: THEME.text.muted, opacity: 0.5 }}>
                      no recent runs
                    </span>
                  ) : (
                    recentRunDots.map((d, i) => (
                      <span
                        key={i}
                        style={{
                          width: 4,
                          height: 10,
                          background:
                            d === 'ok' ? '#10B981' : d === 'err' ? '#EF4444' : THEME.text.muted,
                          opacity: d === 'pend' ? 0.45 : 0.85,
                        }}
                      />
                    ))
                  )}
                </div>
                <p
                  style={{
                    fontFamily: MONO,
                    fontSize: 10,
                    color: THEME.text.secondary,
                    letterSpacing: '0.04em',
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
              style={{ borderBottom: `1px solid ${THEME.border}`, background: 'var(--t-input)' }}
            >
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: THEME.text.primary,
                }}
              >
                Recent executions
              </span>
              <Link
                href={`/p/${projectId}/executions`}
                className="flex items-center gap-1"
                style={{
                  fontFamily: MONO, fontSize: 10, letterSpacing: '0.14em',
                  color: THEME.accent, textTransform: 'uppercase',
                }}
              >
                view all <ArrowUpRight className="w-3 h-3" />
              </Link>
            </div>
            <div>
              {recentExecutions?.length > 0 ? recentExecutions.slice(0, 5).map((execution: Execution, i: number) => {
                const statusColor =
                  execution.status === 'SUCCESS' ? '#10B981'
                  : execution.status === 'FAILED' || execution.status === 'TIMEOUT' ? '#EF4444'
                  : execution.status === 'RUNNING' ? '#3B82F6'
                  : '#F59E0B';
                return (
                  <Link
                    key={execution.id}
                    href={`/p/${projectId}/executions/${execution.id}`}
                    className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-[var(--t-panel-hover)] group"
                    style={{
                      borderBottom: i < Math.min(recentExecutions.length, 5) - 1 ? `1px dashed ${THEME.borderLight}` : 'none',
                      fontFamily: MONO,
                    }}
                  >
                    {/* line-number gutter */}
                    <span style={{ fontSize: 10, color: THEME.text.muted, opacity: 0.5, width: 22, textAlign: 'right' }}>
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    {/* status dot */}
                    <span
                      style={{
                        width: 7, height: 7, borderRadius: 999,
                        background: statusColor,
                        boxShadow: `0 0 0 2px color-mix(in srgb, ${statusColor} 20%, transparent)`,
                        flexShrink: 0,
                      }}
                    />
                    {/* timestamp */}
                    <span style={{ fontSize: 10.5, color: THEME.text.muted, minWidth: 56 }}>
                      {relativeTime(execution.startedAt)}
                    </span>
                    {/* name */}
                    <span
                      style={{ fontSize: 12, color: THEME.text.primary, fontWeight: 500 }}
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
                        fontSize: 10,
                        letterSpacing: '0.1em',
                        color: statusColor,
                        padding: '1px 6px',
                        border: `1px solid color-mix(in srgb, ${statusColor} 35%, transparent)`,
                      }}
                      className="uppercase"
                    >
                      {execution.status}
                    </span>
                  </Link>
                );
              }) : (
                <div className="px-4 py-10 text-center">
                  <p
                    style={{
                      fontFamily: MONO, fontSize: 11, color: THEME.text.muted,
                      letterSpacing: '0.08em', marginBottom: 12,
                    }}
                    className="uppercase"
                  >
                    No executions yet
                  </p>
                  <Link
                    href={`/p/${projectId}/schedulers/new`}
                    className="inline-flex items-center gap-1.5"
                    style={{
                      fontFamily: MONO, fontSize: 11, color: THEME.accent,
                      letterSpacing: '0.12em', textTransform: 'uppercase',
                      borderBottom: `1px dashed ${THEME.accent}`,
                    }}
                  >
                    $ create first scheduler →
                  </Link>
                </div>
              )}
            </div>
          </div>

          {/* Recent Flows — schematic list */}
          <div style={{ background: THEME.panel, border: `1px solid ${THEME.border}`, borderRadius: 2, overflow: 'hidden' }}>
            <div
              className="flex items-center justify-between px-4 py-2.5"
              style={{ borderBottom: `1px solid ${THEME.border}`, background: 'var(--t-input)' }}
            >
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: 10,
                  letterSpacing: '0.16em',
                  color: THEME.text.muted,
                }}
                className="uppercase"
              >
                Recent flows
              </span>
              <Link
                href={`/p/${projectId}/flows`}
                className="flex items-center gap-1"
                style={{
                  fontFamily: MONO, fontSize: 10, letterSpacing: '0.14em',
                  color: THEME.accent, textTransform: 'uppercase',
                }}
              >
                view all <ArrowUpRight className="w-3 h-3" />
              </Link>
            </div>
            <div>
              {recentFlows?.length > 0 ? recentFlows.slice(0, 5).map((flow: any, i: number) => (
                <Link
                  key={flow.id}
                  href={`/p/${projectId}/flows/${flow.id}`}
                  className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-[var(--t-panel-hover)]"
                  style={{
                    borderBottom: i < Math.min(recentFlows.length, 5) - 1 ? `1px dashed ${THEME.borderLight}` : 'none',
                    fontFamily: MONO,
                  }}
                >
                  <span style={{ fontSize: 10, color: THEME.text.muted, opacity: 0.5, width: 22, textAlign: 'right' }}>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <Workflow className="w-3.5 h-3.5" style={{ color: THEME.colors.purple, flexShrink: 0 }} />
                  <span
                    style={{ fontSize: 12, color: THEME.text.primary, fontWeight: 500 }}
                    className="flex-1 truncate"
                  >
                    {flow.name}
                  </span>
                  <span
                    style={{
                      fontSize: 9, letterSpacing: '0.12em',
                      color: THEME.text.muted,
                      padding: '1px 5px', border: `1px solid ${THEME.border}`,
                    }}
                    className="uppercase"
                  >
                    {flow.type || 'SIMPLE'}
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      letterSpacing: '0.1em',
                      color: flow.status === 'ACTIVE' ? '#10B981' : '#F59E0B',
                      padding: '1px 6px',
                      border: `1px solid color-mix(in srgb, ${flow.status === 'ACTIVE' ? '#10B981' : '#F59E0B'} 35%, transparent)`,
                    }}
                    className="uppercase"
                  >
                    {flow.status || 'ACTIVE'}
                  </span>
                </Link>
              )) : (
                <div className="px-4 py-10 text-center">
                  <p
                    style={{ fontFamily: MONO, fontSize: 11, color: THEME.text.muted, letterSpacing: '0.08em', marginBottom: 12 }}
                    className="uppercase"
                  >
                    No flows yet
                  </p>
                  <Link
                    href={`/p/${projectId}/flows/new`}
                    className="inline-flex items-center gap-1.5"
                    style={{
                      fontFamily: MONO, fontSize: 11, color: THEME.accent,
                      letterSpacing: '0.12em', textTransform: 'uppercase',
                      borderBottom: `1px dashed ${THEME.accent}`,
                    }}
                  >
                    $ create first flow →
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right column - 1/3 width */}
        <div className="space-y-4">

          {/* Quick Actions — run-action tiles */}
          <div style={{ background: THEME.panel, border: `1px solid ${THEME.border}`, borderRadius: 2, padding: 14 }}>
            <div
              style={{
                fontFamily: MONO, fontSize: 10, letterSpacing: '0.18em',
                color: THEME.text.muted, marginBottom: 10,
              }}
              className="uppercase"
            >
              Quick actions
            </div>
            <div className="space-y-1.5">
              {quickActions.map((action) => (
                <Link
                  key={action.href}
                  href={action.href}
                  className="flex items-center gap-3 px-3 py-2.5 transition-all hover:bg-[var(--t-panel-hover)] group"
                  style={{
                    background: 'var(--t-input)',
                    border: `1px solid ${THEME.border}`,
                    borderRadius: 2,
                  }}
                >
                  <action.icon className="w-4 h-4" style={{ color: action.color, flexShrink: 0 }} />
                  <div className="flex-1 min-w-0">
                    <p
                      style={{
                        fontFamily: MONO, fontSize: 11, fontWeight: 500,
                        letterSpacing: '0.1em', color: THEME.text.primary,
                      }}
                      className="uppercase"
                    >
                      <span style={{ opacity: 0.5 }}>$ </span>{action.label}
                    </p>
                    <p style={{ fontSize: 11, color: THEME.text.muted, marginTop: 1 }}>{action.desc}</p>
                  </div>
                  <ArrowUpRight
                    className="w-3.5 h-3.5 opacity-40 group-hover:opacity-100 transition-all group-hover:translate-x-0.5"
                    style={{ color: action.color }}
                  />
                </Link>
              ))}
            </div>
          </div>

          {/* System Status — echoes login footer */}
          <div style={{ background: THEME.panel, border: `1px solid ${THEME.border}`, borderRadius: 2, padding: 14 }}>
            <div className="flex items-center justify-between mb-3">
              <span
                style={{
                  fontFamily: MONO, fontSize: 10, letterSpacing: '0.18em',
                  color: THEME.text.muted,
                }}
                className="uppercase"
              >
                System
              </span>
              <span
                className="flex items-center gap-1.5"
                style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.14em', color: '#10B981' }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 6, height: 6, borderRadius: 999,
                    background: '#10B981',
                    boxShadow: '0 0 0 3px color-mix(in srgb, #10B981 20%, transparent)',
                  }}
                />
                ONLINE
              </span>
            </div>
            <div style={{ fontFamily: MONO, fontSize: 11 }}>
              {systemServices.map((svc, i) => (
                <div
                  key={svc.name}
                  className="flex items-center justify-between py-1.5"
                  style={{
                    borderBottom: i < systemServices.length - 1 ? `1px dashed ${THEME.borderLight}` : 'none',
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span
                      aria-hidden
                      style={{
                        width: 5, height: 5, borderRadius: 999,
                        background: '#10B981',
                        boxShadow: '0 0 0 2px color-mix(in srgb, #10B981 15%, transparent)',
                      }}
                    />
                    <span style={{ color: THEME.text.secondary, fontSize: 11.5 }}>{svc.name}</span>
                  </div>
                  <span style={{ color: THEME.text.muted, letterSpacing: '0.04em' }}>:{svc.port}</span>
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
                letterSpacing: '0.1em',
              }}
            >
              engine: fiber+gocron · base: /rl
            </div>
          </div>

          {/* Shortcuts — mono link list */}
          <div style={{ background: THEME.panel, border: `1px solid ${THEME.border}`, borderRadius: 2, padding: 14 }}>
            <div
              style={{
                fontFamily: MONO, fontSize: 10, letterSpacing: '0.18em',
                color: THEME.text.muted, marginBottom: 8,
              }}
              className="uppercase"
            >
              Shortcuts
            </div>
            <div>
              {[
                { href: `/p/${projectId}/executions`, icon: PlayCircle, label: 'Executions' },
                { href: `/p/${projectId}/schedulers`, icon: Clock, label: 'Schedulers' },
                { href: '/secrets', icon: Shield, label: 'Secrets' },
                { href: '/settings', icon: Server, label: 'Settings' },
              ].map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-2.5 px-2 py-1.5 transition-colors hover:bg-[var(--t-panel-hover)] group"
                  style={{ fontFamily: MONO, borderRadius: 0 }}
                >
                  <item.icon className="w-3.5 h-3.5" style={{ color: THEME.text.muted }} />
                  <span
                    style={{ fontSize: 11, color: THEME.text.secondary, letterSpacing: '0.08em' }}
                    className="flex-1 uppercase group-hover:text-[var(--t-text)] transition-colors"
                  >
                    {item.label}
                  </span>
                  <span
                    style={{
                      fontSize: 10, color: THEME.text.muted, opacity: 0.5,
                      transition: 'all 0.15s',
                    }}
                    className="group-hover:opacity-100 group-hover:text-[var(--t-accent)]"
                  >
                    →
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
