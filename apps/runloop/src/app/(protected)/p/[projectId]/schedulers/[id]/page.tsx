'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Play, Pause, Trash2, Loader2, Clock, CheckCircle2, XCircle, Activity, History, Settings, RefreshCw, GitBranch, Plus, X, Webhook, Copy, Eye, EyeOff, Mail, Bell, Slack, CalendarClock } from 'lucide-react';
import type { RunLoop, Execution, DependencyCondition } from '@/types';
import {
  ControlBreadcrumb, PageHeader, MonoTag, SharpButton, StatusDot, MONO,
} from '@/components/ControlChrome';

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
  colors: { blue: '#3B82F6', emerald: '#10B981', purple: '#8B5CF6', amber: '#F59E0B', red: '#EF4444' }
};

export default function SchedulerDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const routeParams = useParams();
  const projectId = routeParams.projectId as string;
  const [scheduler, setScheduler] = useState<RunLoop | null>(null);
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isTriggering, setIsTriggering] = useState(false);
  const [toast, setToast] = useState<{ visible: boolean; message: string; type: 'success' | 'error' }>({ visible: false, message: '', type: 'success' });
  const [activeTab, setActiveTab] = useState<'overview' | 'history' | 'dependencies' | 'notifications' | 'settings'>('overview');

  // Notifications state
  const [notifications, setNotifications] = useState<any[]>([]);
  const [isLoadingNotifs, setIsLoadingNotifs] = useState(false);
  const [showAddNotif, setShowAddNotif] = useState(false);

  // Maintenance window state
  const [pausedUntilInput, setPausedUntilInput] = useState('');

  // Attached flows
  const [schedulerFlows, setSchedulerFlows] = useState<any[]>([]);

  // Webhooks bound to this scheduler
  const [webhooks, setWebhooks] = useState<any[]>([]);
  const [showWebhookSecret, setShowWebhookSecret] = useState<Record<string, boolean>>({});

  // Dependencies
  const [dependencies, setDependencies] = useState<{ predecessors: any[]; successors: any[] }>({ predecessors: [], successors: [] });
  const [allSchedulers, setAllSchedulers] = useState<RunLoop[]>([]);
  const [newDepSchedulerId, setNewDepSchedulerId] = useState('');
  const [newDepCondition, setNewDepCondition] = useState<DependencyCondition>('ON_SUCCESS');
  const [isAddingDep, setIsAddingDep] = useState(false);

  useEffect(() => {
    fetchScheduler();
    fetchExecutions();
    fetchSchedulerFlows();
    fetchDependencies();
    fetchWebhooks();
    fetchNotifications();
  }, [params.id]);

  const fetchNotifications = async () => {
    try {
      setIsLoadingNotifs(true);
      const res = await fetch(`/runloop/api/notifications?schedulerId=${params.id}`);
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
      }
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    } finally {
      setIsLoadingNotifs(false);
    }
  };

  const fetchWebhooks = async () => {
    try {
      if (!projectId) return;
      const res = await fetch(`/runloop/api/webhooks?projectId=${projectId}&schedulerId=${params.id}`);
      if (res.ok) {
        const data = await res.json();
        setWebhooks(data.webhooks || []);
      }
    } catch (err) {
      console.error('Failed to fetch webhooks:', err);
    }
  };

  const fetchScheduler = async () => {
    try {
      const res = await fetch(`/runloop/api/schedulers/${params.id}`);
      if (res.ok) {
        const data = await res.json();
        setScheduler(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch scheduler:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchExecutions = async () => {
    try {
      const res = await fetch(`/runloop/api/executions?schedulerId=${params.id}&limit=20`);
      if (res.ok) {
        const data = await res.json();
        setExecutions(data.data || []);
      }
    } catch (error) {
      console.error('Failed to fetch executions:', error);
    }
  };

  const fetchSchedulerFlows = async () => {
    try {
      const res = await fetch(`/runloop/api/schedulers/${params.id}/flows`);
      if (res.ok) {
        const data = await res.json();
        setSchedulerFlows(data.data?.flows || []);
      }
    } catch (error) {
      console.error('Failed to fetch scheduler flows:', error);
    }
  };

  const fetchDependencies = async () => {
    try {
      const res = await fetch(`/runloop/api/schedulers/${params.id}/dependencies`);
      if (res.ok) {
        const data = await res.json();
        setDependencies(data.data || { predecessors: [], successors: [] });
      }
    } catch (error) {
      console.error('Failed to fetch dependencies:', error);
    }
  };

  const fetchAllSchedulers = async () => {
    try {
      const res = await fetch('/runloop/api/schedulers');
      if (res.ok) {
        const data = await res.json();
        setAllSchedulers((data.data || []).filter((s: RunLoop) => s.id !== params.id));
      }
    } catch (error) {
      console.error('Failed to fetch schedulers:', error);
    }
  };

  const handleAddDependency = async () => {
    if (!newDepSchedulerId) return;
    setIsAddingDep(true);
    try {
      const res = await fetch(`/runloop/api/schedulers/${params.id}/dependencies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dependsOnSchedulerId: newDepSchedulerId,
          condition: newDepCondition,
        }),
      });
      if (res.ok) {
        setNewDepSchedulerId('');
        setNewDepCondition('ON_SUCCESS');
        fetchDependencies();
      }
    } catch (error) {
      console.error('Failed to add dependency:', error);
    } finally {
      setIsAddingDep(false);
    }
  };

  const handleDeleteDependency = async (depId: string) => {
    try {
      const res = await fetch(`/runloop/api/schedulers/${params.id}/dependencies/${depId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        fetchDependencies();
      }
    } catch (error) {
      console.error('Failed to delete dependency:', error);
    }
  };

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ visible: true, message, type });
    setTimeout(() => setToast(prev => ({ ...prev, visible: false })), 4000);
  };

  const handleTrigger = async () => {
    setIsTriggering(true);
    try {
      const res = await fetch(`/runloop/api/schedulers/${params.id}/trigger`, {
        method: 'POST',
      });
      if (res.ok) {
        showToast('RunLoop triggered successfully', 'success');
        fetchExecutions();
      } else {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || 'Failed to trigger RunLoop', 'error');
      }
    } catch (error) {
      console.error('Failed to trigger scheduler:', error);
      showToast('Failed to trigger RunLoop', 'error');
    } finally {
      setIsTriggering(false);
    }
  };

  const handleToggleStatus = async () => {
    if (!scheduler) return;

    const newStatus = scheduler.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      const res = await fetch(`/runloop/api/schedulers/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        fetchScheduler();
      }
    } catch (error) {
      console.error('Failed to update status:', error);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this scheduler?')) return;

    try {
      const res = await fetch(`/runloop/api/schedulers/${params.id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        router.push(`/p/${projectId}/schedulers`);
      }
    } catch (error) {
      console.error('Failed to delete scheduler:', error);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'SUCCESS':
        return <CheckCircle2 className="w-5 h-5" style={{ color: THEME.colors.emerald }} />;
      case 'FAILED':
        return <XCircle className="w-5 h-5" style={{ color: THEME.colors.red }} />;
      case 'RUNNING':
        return <Loader2 className="w-5 h-5 animate-spin" style={{ color: THEME.colors.blue }} />;
      case 'PENDING':
        return <Clock className="w-5 h-5" style={{ color: THEME.colors.amber }} />;
      default:
        return <Activity className="w-5 h-5" style={{ color: THEME.text.muted }} />;
    }
  };

  const getConditionStyle = (condition: string) => {
    switch (condition) {
      case 'ON_SUCCESS':
        return { background: `${THEME.colors.emerald}20`, color: THEME.colors.emerald };
      case 'ON_FAILURE':
        return { background: `${THEME.colors.red}20`, color: THEME.colors.red };
      case 'ON_COMPLETE':
        return { background: `${THEME.colors.blue}20`, color: THEME.colors.blue };
      default:
        return { background: THEME.panel, color: THEME.text.secondary };
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64" style={{ fontFamily: FONT }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: THEME.accent }} />
      </div>
    );
  }

  if (!scheduler) {
    return (
      <div className="text-center py-16" style={{ fontFamily: FONT }}>
        <h3 style={{ fontSize: 20, fontWeight: 600, color: THEME.text.primary, marginBottom: 8 }}>Scheduler not found</h3>
        <Link href={`/p/${projectId}/schedulers`} style={{ color: THEME.accent, fontSize: 14 }}>Back to Schedulers</Link>
      </div>
    );
  }

  const statusBg = scheduler.status === 'ACTIVE' ? `${THEME.colors.emerald}20` : `${THEME.colors.amber}20`;
  const statusColor = scheduler.status === 'ACTIVE' ? THEME.colors.emerald : THEME.colors.amber;

  const tabs = [
    { id: 'overview', label: 'Overview', icon: Activity },
    { id: 'history', label: 'Execution History', icon: History },
    { id: 'dependencies', label: 'Dependencies', icon: GitBranch },
    { id: 'notifications', label: 'Notifications', icon: Mail },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  const ToastEl = toast.visible ? (
    <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, background: toast.type === 'success' ? THEME.colors.emerald : THEME.colors.red, color: '#fff', padding: '12px 20px', borderRadius: 2, display: 'flex', alignItems: 'center', gap: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.3)', fontSize: 14, fontWeight: 500 }}>
      {toast.message}
      <button onClick={() => setToast(prev => ({ ...prev, visible: false }))} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', marginLeft: 8, padding: 0 }}><X size={14} /></button>
    </div>
  ) : null;

  return (
    <div style={{ fontFamily: FONT }}>
      {ToastEl}

      <ControlBreadcrumb
        path={`SCHEDULERS / ${scheduler.name}`}
        node={`NODE.${scheduler.triggerType}`}
        right={
          <span className="flex items-center gap-1.5">
            <StatusDot color={statusColor} soft />
            {scheduler.status}
          </span>
        }
      />

      <Link
        href={`/p/${projectId}/schedulers`}
        className="inline-flex items-center gap-1.5 mb-3 hover:opacity-80"
        style={{ fontFamily: MONO, fontSize: 11, color: THEME.text.muted, letterSpacing: '0.08em' }}
      >
        <ArrowLeft className="w-3.5 h-3.5" /> ← BACK TO SCHEDULERS
      </Link>

      <PageHeader
        title={scheduler.name}
        subtitle={scheduler.description || 'No description'}
        right={
          <>
            <MonoTag tone={scheduler.status === 'ACTIVE' ? 'success' : 'warn'}>
              {scheduler.status}
            </MonoTag>
            <SharpButton onClick={handleTrigger} disabled={isTriggering}>
              {isTriggering ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
              $ RUN NOW →
            </SharpButton>
            <SharpButton variant="ghost" onClick={handleToggleStatus}>
              {scheduler.status === 'ACTIVE' ? <><Pause className="w-3.5 h-3.5" /> PAUSE</> : <><Play className="w-3.5 h-3.5" /> RESUME</>}
            </SharpButton>
            <SharpButton variant="danger" size="sm" onClick={handleDelete}>
              <Trash2 className="w-3.5 h-3.5" />
            </SharpButton>
          </>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-5">
        <StatCard label="Total Runs" value={scheduler.successCount + scheduler.failureCount} icon={<Activity className="w-5 h-5" />} color={THEME.colors.blue} />
        <StatCard label="Success" value={scheduler.successCount} icon={<CheckCircle2 className="w-5 h-5" />} color={THEME.colors.emerald} />
        <StatCard label="Failed" value={scheduler.failureCount} icon={<XCircle className="w-5 h-5" />} color={THEME.colors.red} />
        <StatCard label="Next Run" value={scheduler.nextRunAt ? new Date(scheduler.nextRunAt).toLocaleString() : 'Not scheduled'} icon={<Clock className="w-5 h-5" />} color={THEME.colors.amber} />
      </div>

      {/* Tabs */}
      <div className="flex gap-0 mb-5" style={{ borderBottom: `1px solid ${THEME.border}` }}>
        {tabs.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id as any);
                if (tab.id === 'dependencies' && allSchedulers.length === 0) {
                  fetchAllSchedulers();
                }
              }}
              className="flex items-center gap-1.5"
              style={{
                fontFamily: MONO,
                fontSize: 11,
                fontWeight: 500,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: active ? THEME.accent : THEME.text.muted,
                padding: '10px 14px',
                background: 'transparent',
                border: 'none',
                borderBottom: `2px solid ${active ? THEME.accent : 'transparent'}`,
                marginBottom: -1,
                cursor: 'pointer',
              }}
            >
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-2 gap-4">
          <div style={{ background: THEME.panel, border: `1px solid ${THEME.border}`, borderRadius: 2, padding: 20 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: THEME.text.primary, marginBottom: 16 }}>Configuration</h3>
            <div className="space-y-3">
              {[
                { label: 'Type', value: scheduler.type },
                { label: 'Trigger', value: scheduler.triggerType },
                ...(scheduler.schedule ? [{ label: 'Schedule', value: scheduler.schedule, mono: true }] : []),
                { label: 'Timezone', value: scheduler.timezone },
                { label: 'Timeout', value: `${scheduler.timeout}s` },
                { label: 'Retry Count', value: String(scheduler.retryCount) },
              ].map((item, i) => (
                <div key={i} className="flex justify-between">
                  <span style={{ fontSize: 13, color: THEME.text.secondary }}>{item.label}</span>
                  <span style={{ fontSize: 13, color: THEME.text.primary, fontWeight: 500, fontFamily: (item as any).mono ? 'monospace' : FONT }}>{item.value}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ background: THEME.panel, border: `1px solid ${THEME.border}`, borderRadius: 2, padding: 20 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: THEME.text.primary, marginBottom: 16 }}>Attached Flows</h3>
            {schedulerFlows.length > 0 ? (
              <div className="space-y-2">
                {schedulerFlows.map((sf: any, index: number) => (
                  <div key={sf.id} className="flex items-center gap-3" style={{ padding: 10, background: THEME.input, borderRadius: 8 }}>
                    <span className="flex items-center justify-center" style={{ width: 24, height: 24, borderRadius: 12, background: `${THEME.colors.blue}20`, color: THEME.colors.blue, fontSize: 11, fontWeight: 500 }}>
                      {index + 1}
                    </span>
                    <div className="flex-1">
                      <span style={{ color: THEME.text.primary, fontWeight: 500, fontSize: 13 }}>{sf.flowName}</span>
                      <span style={{ marginLeft: 8, fontSize: 11, padding: '1px 6px', borderRadius: 4, background: THEME.panelHover, color: THEME.text.secondary }}>
                        {sf.flowType === 'DAG' ? 'DAG' : sf.flowJobType || 'SIMPLE'}
                      </span>
                    </div>
                    <span style={{
                      fontSize: 11, padding: '1px 8px', borderRadius: 4,
                      background: sf.flowStatus === 'ACTIVE' ? `${THEME.colors.emerald}20` : THEME.panelHover,
                      color: sf.flowStatus === 'ACTIVE' ? THEME.colors.emerald : THEME.text.secondary,
                    }}>
                      {sf.flowStatus}
                    </span>
                  </div>
                ))}
                {schedulerFlows.length > 1 && (
                  <p style={{ fontSize: 11, color: THEME.text.muted }}>
                    Execution order: {schedulerFlows.map((sf: any) => sf.flowName).join(' \u2192 ')}
                  </p>
                )}
              </div>
            ) : (
              <p style={{ color: THEME.text.secondary, fontSize: 13 }}>No flows attached</p>
            )}
          </div>

          {/* Webhooks — only shown if trigger type is WEBHOOK or if any webhooks exist */}
          {(scheduler.triggerType === 'WEBHOOK' || webhooks.length > 0) && (
            <div className="col-span-2" style={{ background: THEME.panel, border: `1px solid ${THEME.border}`, borderRadius: 2, padding: 20 }}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="flex items-center gap-2" style={{ fontSize: 15, fontWeight: 600, color: THEME.text.primary }}>
                  <Webhook className="w-4 h-4" style={{ color: THEME.colors.purple }} />
                  Webhook Endpoints
                </h3>
                {webhooks.length === 0 && (
                  <button
                    type="button"
                    onClick={async () => {
                      if (!projectId || !scheduler) return;
                      const res = await fetch('/runloop/api/webhooks', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          projectId,
                          schedulerId: params.id,
                          name: `${scheduler.name} webhook`,
                        }),
                      });
                      if (res.ok) fetchWebhooks();
                    }}
                    style={{ fontSize: 12, padding: '6px 12px', background: `${THEME.colors.purple}20`, color: THEME.colors.purple, border: `1px solid ${THEME.colors.purple}40`, borderRadius: 6, cursor: 'pointer' }}
                  >
                    + Create webhook
                  </button>
                )}
              </div>
              {webhooks.length === 0 ? (
                <p style={{ color: THEME.text.secondary, fontSize: 13 }}>
                  No webhook endpoints yet. Create one to receive external triggers.
                </p>
              ) : (
                <div className="space-y-3">
                  {webhooks.map((wh) => {
                    const baseUrl = typeof window !== 'undefined' ? `${window.location.origin}/runloop` : '/runloop';
                    const webhookUrl = `${baseUrl}/api/webhooks/${wh.id}`;
                    const showSecret = !!showWebhookSecret[wh.id];
                    return (
                      <div key={wh.id} style={{ padding: 14, background: THEME.input, borderRadius: 8 }}>
                        <div className="flex items-center justify-between mb-2">
                          <span style={{ fontSize: 13, fontWeight: 500, color: THEME.text.primary }}>{wh.name}</span>
                          <span style={{ fontSize: 11, padding: '1px 8px', borderRadius: 4, background: wh.status === 'ACTIVE' ? `${THEME.colors.emerald}20` : THEME.panelHover, color: wh.status === 'ACTIVE' ? THEME.colors.emerald : THEME.text.secondary }}>
                            {wh.status}
                          </span>
                        </div>
                        <div className="space-y-2">
                          <div>
                            <label style={{ fontSize: 11, color: THEME.text.muted, display: 'block', marginBottom: 4 }}>POST URL</label>
                            <div className="flex items-center gap-2">
                              <code style={{ flex: 1, fontSize: 12, fontFamily: 'monospace', color: THEME.text.primary, background: THEME.bg, padding: '6px 10px', borderRadius: 6, border: `1px solid ${THEME.border}`, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {webhookUrl}
                              </code>
                              <button
                                type="button"
                                onClick={() => navigator.clipboard?.writeText(webhookUrl)}
                                style={{ padding: 6, background: 'transparent', border: `1px solid ${THEME.border}`, borderRadius: 6, color: THEME.text.secondary, cursor: 'pointer' }}
                                title="Copy URL"
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                          {wh.secret && (
                            <div>
                              <label style={{ fontSize: 11, color: THEME.text.muted, display: 'block', marginBottom: 4 }}>HMAC Secret (X-Webhook-Signature)</label>
                              <div className="flex items-center gap-2">
                                <code style={{ flex: 1, fontSize: 12, fontFamily: 'monospace', color: THEME.text.primary, background: THEME.bg, padding: '6px 10px', borderRadius: 6, border: `1px solid ${THEME.border}`, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {showSecret ? wh.secret : '••••••••••••••••••••••••••••••••'}
                                </code>
                                <button
                                  type="button"
                                  onClick={() => setShowWebhookSecret((s) => ({ ...s, [wh.id]: !s[wh.id] }))}
                                  style={{ padding: 6, background: 'transparent', border: `1px solid ${THEME.border}`, borderRadius: 6, color: THEME.text.secondary, cursor: 'pointer' }}
                                  title={showSecret ? 'Hide secret' : 'Show secret'}
                                >
                                  {showSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => navigator.clipboard?.writeText(wh.secret)}
                                  style={{ padding: 6, background: 'transparent', border: `1px solid ${THEME.border}`, borderRadius: 6, color: THEME.text.secondary, cursor: 'pointer' }}
                                  title="Copy secret"
                                >
                                  <Copy className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          )}
                          <div className="flex items-center justify-between pt-2">
                            <span style={{ fontSize: 11, color: THEME.text.muted }}>
                              Called {wh.callCount || 0} times{wh.lastCalledAt ? ` · last ${new Date(wh.lastCalledAt).toLocaleString()}` : ''}
                            </span>
                            <button
                              type="button"
                              onClick={async () => {
                                if (!confirm('Delete this webhook? Existing integrations will stop working.')) return;
                                await fetch(`/runloop/api/webhooks/${wh.id}`, { method: 'DELETE' });
                                fetchWebhooks();
                              }}
                              style={{ fontSize: 11, color: THEME.colors.red, background: 'transparent', border: 'none', cursor: 'pointer' }}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === 'history' && (
        <div style={{ background: THEME.panel, border: `1px solid ${THEME.border}`, borderRadius: 2, overflow: 'hidden' }}>
          <table className="w-full">
            <thead>
              <tr style={{ background: THEME.input }}>
                <th style={{ textAlign: 'left', padding: '10px 16px', fontSize: 12, fontWeight: 500, color: THEME.text.secondary }}>Status</th>
                <th style={{ textAlign: 'left', padding: '10px 16px', fontSize: 12, fontWeight: 500, color: THEME.text.secondary }}>Trigger</th>
                <th style={{ textAlign: 'left', padding: '10px 16px', fontSize: 12, fontWeight: 500, color: THEME.text.secondary }}>Started</th>
                <th style={{ textAlign: 'left', padding: '10px 16px', fontSize: 12, fontWeight: 500, color: THEME.text.secondary }}>Duration</th>
                <th style={{ textAlign: 'left', padding: '10px 16px', fontSize: 12, fontWeight: 500, color: THEME.text.secondary }}></th>
              </tr>
            </thead>
            <tbody>
              {executions.map((execution) => (
                <tr key={execution.id} className="transition-colors" style={{ borderTop: `1px solid ${THEME.border}` }}>
                  <td style={{ padding: '10px 16px' }}>
                    <div className="flex items-center gap-2">
                      {getStatusIcon(execution.status)}
                      <span style={{ fontSize: 13, color: THEME.text.primary }}>{execution.status}</span>
                    </div>
                  </td>
                  <td style={{ padding: '10px 16px', fontSize: 13, color: THEME.text.secondary }}>{execution.triggerType}</td>
                  <td style={{ padding: '10px 16px', fontSize: 13, color: THEME.text.secondary }}>
                    {new Date(execution.startedAt).toLocaleString()}
                  </td>
                  <td style={{ padding: '10px 16px', fontSize: 13, color: THEME.text.secondary }}>
                    {execution.durationMs ? `${execution.durationMs}ms` : '-'}
                  </td>
                  <td style={{ padding: '10px 16px' }}>
                    <Link href={`/p/${projectId}/executions/${execution.id}`} style={{ color: THEME.accentLight, fontSize: 13 }}>
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {executions.length === 0 && (
            <div className="text-center py-12">
              <History className="w-12 h-12 mx-auto mb-3" style={{ color: THEME.text.muted }} />
              <p style={{ color: THEME.text.secondary, fontSize: 13 }}>No executions yet</p>
              <button onClick={handleTrigger} style={{ color: THEME.accentLight, fontSize: 13, background: 'transparent', border: 'none', cursor: 'pointer', marginTop: 8 }}>
                Run now to see results
              </button>
            </div>
          )}
        </div>
      )}

      {activeTab === 'dependencies' && (
        <div className="space-y-4">
          {/* Predecessors */}
          <div style={{ background: THEME.panel, border: `1px solid ${THEME.border}`, borderRadius: 2, padding: 20 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: THEME.text.primary, marginBottom: 4 }}>Depends On</h3>
            <p style={{ fontSize: 12, color: THEME.text.muted, marginBottom: 16 }}>Schedulers that must complete before this one runs.</p>
            {(dependencies.predecessors || []).length > 0 ? (
              <div className="space-y-2">
                {(dependencies.predecessors || []).map((dep: any) => (
                  <div key={dep.id} className="flex items-center gap-3" style={{ padding: 10, background: THEME.input, borderRadius: 8 }}>
                    <GitBranch className="w-4 h-4" style={{ color: THEME.text.muted }} />
                    <div className="flex-1">
                      <span style={{ color: THEME.text.primary, fontWeight: 500, fontSize: 13 }}>{dep.dependsOnName || dep.dependsOnSchedulerId}</span>
                    </div>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, fontWeight: 500, ...getConditionStyle(dep.condition) }}>
                      {dep.condition}
                    </span>
                    <button
                      onClick={() => handleDeleteDependency(dep.id)}
                      style={{ padding: 4, borderRadius: 4, color: THEME.text.muted, background: 'transparent', border: 'none', cursor: 'pointer' }}
                      title="Remove dependency"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: THEME.text.secondary, fontSize: 13 }}>No predecessors configured.</p>
            )}
          </div>

          {/* Successors */}
          <div style={{ background: THEME.panel, border: `1px solid ${THEME.border}`, borderRadius: 2, padding: 20 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: THEME.text.primary, marginBottom: 4 }}>Triggers</h3>
            <p style={{ fontSize: 12, color: THEME.text.muted, marginBottom: 16 }}>Schedulers that depend on this one completing.</p>
            {(dependencies.successors || []).length > 0 ? (
              <div className="space-y-2">
                {(dependencies.successors || []).map((dep: any) => (
                  <div key={dep.id} className="flex items-center gap-3" style={{ padding: 10, background: THEME.input, borderRadius: 8 }}>
                    <GitBranch className="w-4 h-4" style={{ color: THEME.text.muted }} />
                    <div className="flex-1">
                      <span style={{ color: THEME.text.primary, fontWeight: 500, fontSize: 13 }}>{dep.schedulerName || dep.schedulerId}</span>
                    </div>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, fontWeight: 500, ...getConditionStyle(dep.condition) }}>
                      {dep.condition}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: THEME.text.secondary, fontSize: 13 }}>No successors configured.</p>
            )}
          </div>

          {/* Add Dependency */}
          <div style={{ background: THEME.panel, border: `1px solid ${THEME.border}`, borderRadius: 2, padding: 20 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: THEME.text.primary, marginBottom: 4 }}>Add Dependency</h3>
            <p style={{ fontSize: 12, color: THEME.text.muted, marginBottom: 16 }}>Add a scheduler that this one depends on.</p>
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label style={{ fontSize: 12, fontWeight: 500, color: THEME.text.secondary, marginBottom: 6, display: 'block' }}>Scheduler</label>
                <select
                  value={newDepSchedulerId}
                  onChange={(e) => setNewDepSchedulerId(e.target.value)}
                  style={{ background: THEME.input, border: `1px solid ${THEME.border}`, color: THEME.text.primary, borderRadius: 8, height: 38, width: '100%', padding: '0 12px', fontSize: 13 }}
                >
                  <option value="">Select a scheduler...</option>
                  {allSchedulers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div style={{ width: 192 }}>
                <label style={{ fontSize: 12, fontWeight: 500, color: THEME.text.secondary, marginBottom: 6, display: 'block' }}>Condition</label>
                <select
                  value={newDepCondition}
                  onChange={(e) => setNewDepCondition(e.target.value as DependencyCondition)}
                  style={{ background: THEME.input, border: `1px solid ${THEME.border}`, color: THEME.text.primary, borderRadius: 8, height: 38, width: '100%', padding: '0 12px', fontSize: 13 }}
                >
                  <option value="ON_SUCCESS">ON_SUCCESS</option>
                  <option value="ON_FAILURE">ON_FAILURE</option>
                  <option value="ON_COMPLETE">ON_COMPLETE</option>
                </select>
              </div>
              <button
                onClick={handleAddDependency}
                disabled={!newDepSchedulerId || isAddingDep}
                className="flex items-center gap-2 whitespace-nowrap disabled:opacity-50"
                style={{ background: THEME.accent, color: '#fff', padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 500, border: 'none', cursor: 'pointer', height: 38 }}
              >
                {isAddingDep ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Add Dependency
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'notifications' && (
        <div className="space-y-4">
          <div style={{ background: THEME.panel, border: `1px solid ${THEME.border}`, borderRadius: 2, padding: 20 }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="flex items-center gap-2" style={{ fontSize: 15, fontWeight: 600, color: THEME.text.primary }}>
                <Bell className="w-4 h-4" style={{ color: THEME.colors.blue }} />
                Notifications
              </h3>
              <button
                onClick={() => setShowAddNotif(true)}
                className="px-3 py-1.5 rounded text-xs font-medium flex items-center gap-1.5"
                style={{ background: THEME.accent, color: '#fff', border: 'none', cursor: 'pointer' }}
              >
                <Plus className="w-3.5 h-3.5" />
                Add Notification
              </button>
            </div>
            {isLoadingNotifs ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin" style={{ color: THEME.accent }} />
              </div>
            ) : notifications.length === 0 ? (
              <div className="text-center py-8" style={{ color: THEME.text.muted, fontSize: 13 }}>
                <Bell className="w-8 h-8 mx-auto mb-2" style={{ color: THEME.text.muted }} />
                No notifications configured. Add one to get alerted on scheduler events.
              </div>
            ) : (
              <div className="space-y-3">
                {notifications.map((n) => {
                  const typeIcon = n.type === 'EMAIL' ? Mail : n.type === 'SLACK' ? Slack : Webhook;
                  const TypeIcon = typeIcon;
                  const typeColor = n.type === 'EMAIL' ? THEME.colors.amber : n.type === 'SLACK' ? THEME.colors.purple : THEME.colors.blue;
                  return (
                    <div key={n.id} style={{ padding: 14, background: THEME.input, borderRadius: 8, borderLeft: `3px solid ${typeColor}` }}>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <TypeIcon className="w-4 h-4" style={{ color: typeColor }} />
                            <span style={{ fontSize: 13, fontWeight: 600, color: THEME.text.primary }}>{n.type}</span>
                            <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 4, background: n.status === 'ACTIVE' ? `${THEME.colors.emerald}20` : THEME.panelHover, color: n.status === 'ACTIVE' ? THEME.colors.emerald : THEME.text.muted }}>
                              {n.status}
                            </span>
                          </div>
                          <div style={{ fontSize: 12, color: THEME.text.secondary, fontFamily: 'monospace', marginBottom: 6 }}>
                            {n.type === 'EMAIL' ? (n.config?.to || n.config?.email) : n.type === 'SLACK' ? 'Slack webhook' : n.config?.url}
                          </div>
                          <div className="flex items-center gap-2 text-xs" style={{ color: THEME.text.muted }}>
                            {n.onStart && <span style={{ padding: '1px 6px', borderRadius: 4, background: `${THEME.colors.blue}15`, color: THEME.colors.blue }}>on start</span>}
                            {n.onSuccess && <span style={{ padding: '1px 6px', borderRadius: 4, background: `${THEME.colors.emerald}15`, color: THEME.colors.emerald }}>on success</span>}
                            {n.onFailure && <span style={{ padding: '1px 6px', borderRadius: 4, background: `${THEME.colors.red}15`, color: THEME.colors.red }}>on failure</span>}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={async () => {
                            if (!confirm('Delete this notification?')) return;
                            await fetch(`/runloop/api/notifications/${n.id}`, { method: 'DELETE' });
                            fetchNotifications();
                          }}
                          style={{ background: 'transparent', color: THEME.colors.red, border: 'none', cursor: 'pointer', padding: 4 }}
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          {showAddNotif && (
            <NotificationModal
              schedulerId={params.id}
              onClose={() => setShowAddNotif(false)}
              onSave={async () => {
                setShowAddNotif(false);
                fetchNotifications();
              }}
            />
          )}
        </div>
      )}

      {activeTab === 'settings' && (
        <div className="space-y-4">
          {/* Maintenance Window */}
          <div style={{ background: THEME.panel, border: `1px solid ${THEME.border}`, borderRadius: 2, padding: 20 }}>
            <h3 className="flex items-center gap-2 mb-4" style={{ fontSize: 15, fontWeight: 600, color: THEME.text.primary }}>
              <CalendarClock className="w-4 h-4" style={{ color: THEME.colors.amber }} />
              Maintenance Window
            </h3>
            <p style={{ fontSize: 12, color: THEME.text.secondary, marginBottom: 12 }}>
              Pause this scheduler until a specific time. Cron triggers and manual triggers will be skipped.
            </p>
            {(scheduler as any).pausedUntil && new Date((scheduler as any).pausedUntil) > new Date() ? (
              <div className="flex items-center gap-3 mb-3" style={{ padding: 12, background: `${THEME.colors.amber}10`, borderRadius: 8, border: `1px solid ${THEME.colors.amber}30` }}>
                <Pause className="w-4 h-4" style={{ color: THEME.colors.amber }} />
                <span style={{ fontSize: 13, color: THEME.colors.amber }}>
                  Paused until {new Date((scheduler as any).pausedUntil).toLocaleString()}
                </span>
                <button
                  onClick={async () => {
                    await fetch(`/runloop/api/schedulers/${params.id}`, {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ pausedUntil: null }),
                    });
                    fetchScheduler();
                  }}
                  className="ml-auto text-xs px-3 py-1 rounded"
                  style={{ background: THEME.colors.emerald + '20', color: THEME.colors.emerald, border: `1px solid ${THEME.colors.emerald}40` }}
                >
                  Resume now
                </button>
              </div>
            ) : null}
            <div className="flex items-center gap-2">
              <input
                type="datetime-local"
                value={pausedUntilInput}
                onChange={(e) => setPausedUntilInput(e.target.value)}
                style={{ background: THEME.input, border: `1px solid ${THEME.border}`, borderRadius: 6, padding: '8px 10px', color: THEME.text.primary, fontSize: 13 }}
              />
              <button
                onClick={async () => {
                  if (!pausedUntilInput) return;
                  await fetch(`/runloop/api/schedulers/${params.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ pausedUntil: new Date(pausedUntilInput).toISOString() }),
                  });
                  setPausedUntilInput('');
                  fetchScheduler();
                }}
                disabled={!pausedUntilInput}
                className="px-4 py-2 rounded text-xs font-medium disabled:opacity-50"
                style={{ background: THEME.accent, color: '#fff', border: 'none', cursor: 'pointer' }}
              >
                Pause until selected time
              </button>
            </div>
          </div>

          <div style={{ background: THEME.panel, border: `1px solid ${THEME.border}`, borderRadius: 2, padding: 20 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: THEME.text.primary, marginBottom: 12 }}>Concurrency</h3>
            <p style={{ fontSize: 12, color: THEME.text.secondary }}>
              Max concurrent runs: <strong style={{ color: THEME.text.primary }}>{(scheduler as any).maxConcurrency ?? 1}</strong>.
              Set to 1 to prevent overlapping runs. Edit via scheduler form or API.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// Notification modal
function NotificationModal({ schedulerId, onClose, onSave }: { schedulerId: string; onClose: () => void; onSave: () => void }) {
  const [type, setType] = useState<'EMAIL' | 'SLACK' | 'WEBHOOK'>('EMAIL');
  const [target, setTarget] = useState('');
  const [onSuccess, setOnSuccess] = useState(false);
  const [onFailure, setOnFailure] = useState(true);
  const [onStart, setOnStart] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!target) return;
    setSaving(true);
    try {
      const config = type === 'EMAIL' ? { to: target } : type === 'SLACK' ? { webhook: target } : { url: target };
      const res = await fetch('/runloop/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schedulerId, type, config, onSuccess, onFailure, onStart }),
      });
      if (res.ok) onSave();
      else alert('Failed to save notification');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div className="w-full max-w-md rounded-xl" style={{ background: THEME.panel, border: `1px solid ${THEME.border}`, fontFamily: FONT }}>
        <div className="p-5" style={{ borderBottom: `1px solid ${THEME.border}` }}>
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold" style={{ color: THEME.text.primary }}>Add Notification</h2>
            <button onClick={onClose} style={{ color: THEME.text.secondary }}><X className="w-4 h-4" /></button>
          </div>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs font-medium block mb-2" style={{ color: THEME.text.secondary }}>Type</label>
            <div className="grid grid-cols-3 gap-2">
              {(['EMAIL', 'SLACK', 'WEBHOOK'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className="py-2 rounded text-xs font-medium"
                  style={{
                    background: type === t ? THEME.accent + '20' : THEME.input,
                    border: `1px solid ${type === t ? THEME.accent : THEME.border}`,
                    color: type === t ? THEME.accent : THEME.text.secondary,
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-medium block mb-2" style={{ color: THEME.text.secondary }}>
              {type === 'EMAIL' ? 'Email address' : type === 'SLACK' ? 'Slack webhook URL' : 'Webhook URL'}
            </label>
            <input
              type={type === 'EMAIL' ? 'email' : 'url'}
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder={type === 'EMAIL' ? 'alert@example.com' : 'https://hooks.slack.com/services/...'}
              className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
              style={{ background: THEME.input, border: `1px solid ${THEME.border}`, color: THEME.text.primary }}
            />
          </div>
          <div>
            <label className="text-xs font-medium block mb-2" style={{ color: THEME.text.secondary }}>Trigger on</label>
            <div className="space-y-2">
              {[
                { key: 'start', label: 'Execution starts', val: onStart, set: setOnStart, color: THEME.colors.blue },
                { key: 'success', label: 'Execution succeeds', val: onSuccess, set: setOnSuccess, color: THEME.colors.emerald },
                { key: 'failure', label: 'Execution fails', val: onFailure, set: setOnFailure, color: THEME.colors.red },
              ].map((e) => (
                <label key={e.key} className="flex items-center gap-3 cursor-pointer" style={{ padding: 8, background: e.val ? e.color + '10' : 'transparent', borderRadius: 6, border: `1px solid ${e.val ? e.color + '40' : THEME.border}` }}>
                  <input type="checkbox" checked={e.val} onChange={(ev) => e.set(ev.target.checked)} />
                  <span style={{ fontSize: 13, color: e.val ? e.color : THEME.text.secondary }}>{e.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="p-5 flex justify-end gap-2" style={{ borderTop: `1px solid ${THEME.border}` }}>
          <button onClick={onClose} className="px-4 py-2 text-xs" style={{ color: THEME.text.secondary, background: 'transparent', border: 'none', cursor: 'pointer' }}>Cancel</button>
          <button
            onClick={handleSubmit}
            disabled={!target || saving}
            className="px-4 py-2 rounded text-xs font-semibold text-white disabled:opacity-50"
            style={{ background: THEME.accent, border: 'none', cursor: 'pointer' }}
          >
            {saving ? 'Saving…' : 'Add Notification'}
          </button>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon, color }: { label: string; value: string | number; icon: React.ReactNode; color: string }) {
  return (
    <div style={{ background: THEME.panel, border: `1px solid ${THEME.border}`, borderRadius: 2, padding: 14 }}>
      <div className="flex items-start justify-between">
        <div>
          <p
            style={{
              fontFamily: MONO, fontSize: 10, color: THEME.text.muted,
              letterSpacing: '0.12em', textTransform: 'uppercase',
            }}
          >
            {label}
          </p>
          <p
            style={{
              fontFamily: MONO, fontSize: 22, fontWeight: 600,
              color: THEME.text.primary, marginTop: 6, letterSpacing: '-0.02em',
              lineHeight: 1.2,
            }}
          >
            {value}
          </p>
        </div>
        <div
          className="flex items-center justify-center"
          style={{
            width: 32, height: 32, borderRadius: 2,
            background: `color-mix(in srgb, ${color} 12%, transparent)`,
            border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
            color,
          }}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}
