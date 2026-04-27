'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2, CheckCircle2, XCircle, Clock, PlayCircle, Terminal, FileJson, AlertCircle, Radio, Ban, Boxes } from 'lucide-react';
import type { Execution } from '@/types';
import { useWebSocket } from '@/hooks/useWebSocket';
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

export default function ExecutionDetailPage({ params }: { params: { id: string } }) {
  const routeParams = useParams();
  const projectId = routeParams.projectId as string;
  const [execution, setExecution] = useState<Execution | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'nodes' | 'logs' | 'input' | 'output'>('nodes');

  const fetchExecution = useCallback(async () => {
    try {
      const res = await fetch(`/runloop/api/executions/${params.id}`);
      if (res.ok) {
        const data = await res.json();
        setExecution(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch execution:', error);
    } finally {
      setIsLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    fetchExecution();
  }, [fetchExecution]);

  // Subscribe to live updates only while the execution is in-progress
  const isActive = execution?.status === 'RUNNING' || execution?.status === 'PENDING';
  const { isConnected: liveConnected } = useWebSocket({
    executionId: isActive ? params.id : null,
    onMessage: (msg) => {
      setExecution((prev) => {
        if (!prev) return prev;
        const updated: Execution = { ...prev };
        if (msg.status) updated.status = msg.status as Execution['status'];
        if (typeof msg.durationMs === 'number') updated.durationMs = msg.durationMs;
        if (msg.logs) updated.logs = (prev.logs || '') + msg.logs;
        if (msg.output) updated.output = { ...(prev.output || {}), ...msg.output };
        if (msg.error) updated.errorMessage = msg.error;
        if (msg.status && (msg.status === 'SUCCESS' || msg.status === 'FAILED' || msg.status === 'CANCELLED' || msg.status === 'TIMEOUT')) {
          updated.completedAt = new Date(msg.timestamp || Date.now()).toISOString();
        }
        return updated;
      });
    },
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'SUCCESS': return <CheckCircle2 className="w-6 h-6" style={{ color: THEME.colors.emerald }} />;
      case 'FAILED': return <XCircle className="w-6 h-6" style={{ color: THEME.colors.red }} />;
      case 'RUNNING': return <Loader2 className="w-6 h-6 animate-spin" style={{ color: THEME.colors.blue }} />;
      case 'PENDING': return <Clock className="w-6 h-6" style={{ color: THEME.colors.amber }} />;
      default: return <PlayCircle className="w-6 h-6" style={{ color: THEME.text.muted }} />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'SUCCESS': return THEME.colors.emerald;
      case 'FAILED': return THEME.colors.red;
      case 'RUNNING': return THEME.colors.blue;
      case 'PENDING': return THEME.colors.amber;
      default: return THEME.text.muted;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64" style={{ fontFamily: FONT }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: THEME.accent }} />
      </div>
    );
  }

  if (!execution) {
    return (
      <div className="text-center py-16" style={{ fontFamily: FONT }}>
        <h3 style={{ fontSize: 20, fontWeight: 600, color: THEME.text.primary, marginBottom: 8 }}>Execution not found</h3>
        <Link href={`/p/${projectId}/executions`} style={{ color: THEME.accent, fontSize: 14 }}>Back to Executions</Link>
      </div>
    );
  }

  const tabs = [
    { id: 'nodes', label: 'Nodes', icon: Boxes },
    { id: 'logs', label: 'Logs', icon: Terminal },
    { id: 'input', label: 'Input', icon: FileJson },
    { id: 'output', label: 'Output', icon: FileJson },
  ];

  // Parse per-node status from execution.logs. Flow executor emits lines
  // like "[nodeID] STATUS: msg (Nms, R retries)". Breaking them out into a
  // structured list lets operators scan failures without reading prose.
  const nodeRows: NodeRow[] = parseNodeLogs(execution.logs || '', execution.output || {});

  return (
    <div style={{ fontFamily: FONT }}>
      <Link
        href={`/p/${projectId}/executions`}
        className="inline-flex items-center gap-1.5 mb-4 hover:opacity-80"
        style={{ fontSize: 12, color: THEME.text.muted }}
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Back to Executions
      </Link>

      <div className="flex items-end justify-between mb-6 gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h1 style={{ fontSize: 24, fontWeight: 600, color: THEME.text.primary, letterSpacing: '-0.02em' }}>
              Execution {execution.id.slice(0, 8)}
            </h1>
            <MonoTag
              tone={
                execution.status === 'SUCCESS' ? 'success'
                : execution.status === 'FAILED' ? 'danger'
                : execution.status === 'RUNNING' ? 'accent'
                : 'warn'
              }
            >
              {execution.status}
            </MonoTag>
            {isActive && liveConnected && (
              <span
                className="flex items-center gap-1 text-xs"
                style={{ color: THEME.colors.emerald, fontFamily: MONO, letterSpacing: '0.08em' }}
              >
                <Radio className="w-3 h-3 animate-pulse" /> LIVE
              </span>
            )}
          </div>
          <p style={{ fontSize: 13, color: THEME.text.muted }}>
            {execution.schedulerId?.startsWith('queue:')
              ? `Queue: ${execution.schedulerId.slice(6)}`
              : execution.schedulerName || execution.runloop?.name || 'Unknown RunLoop'}
            {' · '}
            {execution.durationMs ? `${execution.durationMs}ms` : 'running…'}
          </p>
        </div>
        {isActive && (
          <SharpButton
            variant="danger"
            size="sm"
            onClick={async () => {
              if (!confirm('Cancel this running execution?')) return;
              const res = await fetch(`/runloop/api/executions/${params.id}/cancel`, { method: 'POST' });
              if (res.ok) fetchExecution();
              else alert('Cancel failed');
            }}
          >
            <Ban className="w-3.5 h-3.5" /> Cancel
          </SharpButton>
        )}
      </div>

      {/* Timeline — mono timestamps, schematic progress bar. */}
      <div
        style={{
          background: THEME.panel,
          border: `1px solid ${THEME.border}`,
          borderRadius: 2,
          padding: 20,
          position: 'relative',
        }}
        className="mb-5"
      >
        {/* Corner ticks for schematic feel */}
        <span style={{ position: 'absolute', top: -1, left: -1, width: 8, height: 1, background: THEME.accent }} />
        <span style={{ position: 'absolute', top: -1, left: -1, width: 1, height: 8, background: THEME.accent }} />
        <span style={{ position: 'absolute', top: -1, right: -1, width: 8, height: 1, background: THEME.accent }} />
        <span style={{ position: 'absolute', top: -1, right: -1, width: 1, height: 8, background: THEME.accent }} />
        <span style={{ position: 'absolute', bottom: -1, left: -1, width: 8, height: 1, background: THEME.accent }} />
        <span style={{ position: 'absolute', bottom: -1, left: -1, width: 1, height: 8, background: THEME.accent }} />
        <span style={{ position: 'absolute', bottom: -1, right: -1, width: 8, height: 1, background: THEME.accent }} />
        <span style={{ position: 'absolute', bottom: -1, right: -1, width: 1, height: 8, background: THEME.accent }} />

        <div className="flex items-center justify-between">
          <div className="flex-1">
            <p
              style={{
                fontFamily: MONO,
                fontSize: 10,
                letterSpacing: '0.14em',
                color: THEME.text.muted,
                textTransform: 'uppercase',
              }}
            >
              <span style={{ opacity: 0.5 }}>{'//'}</span> started
            </p>
            <p
              style={{
                fontFamily: MONO,
                fontSize: 12.5,
                color: THEME.text.primary,
                marginTop: 2,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {new Date(execution.startedAt).toLocaleString()}
            </p>
          </div>
          <div className="flex-1 px-4">
            <div style={{ height: 2, background: THEME.border, position: 'relative' }}>
              <div
                style={{
                  position: 'absolute', top: 0, left: 0, height: '100%',
                  background:
                    execution.status === 'SUCCESS' ? THEME.colors.emerald :
                    execution.status === 'FAILED' ? THEME.colors.red :
                    execution.status === 'RUNNING' ? THEME.colors.blue : THEME.colors.amber,
                  width: execution.status === 'RUNNING' ? '50%' : execution.status === 'PENDING' ? '0%' : '100%',
                  transition: 'width 0.3s',
                }}
              />
            </div>
          </div>
          <div className="flex-1 text-right">
            <p
              style={{
                fontFamily: MONO,
                fontSize: 10,
                letterSpacing: '0.14em',
                color: THEME.text.muted,
                textTransform: 'uppercase',
              }}
            >
              <span style={{ opacity: 0.5 }}>{'//'}</span> completed
            </p>
            <p
              style={{
                fontFamily: MONO,
                fontSize: 12.5,
                color: THEME.text.primary,
                marginTop: 2,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {execution.completedAt ? new Date(execution.completedAt).toLocaleString() : '—'}
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 mb-5" style={{ borderBottom: `1px solid ${THEME.border}` }}>
        {tabs.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className="flex items-center gap-1.5"
              style={{
                fontFamily: MONO, fontSize: 11, fontWeight: 500,
                letterSpacing: '0.1em', textTransform: 'uppercase',
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
      <div style={{ background: THEME.panel, border: `1px solid ${THEME.border}`, borderRadius: 2, overflow: 'hidden' }} className="mb-5">
        {activeTab === 'nodes' && (
          <div style={{ padding: 16 }}>
            <h3 style={{ fontSize: 13, fontWeight: 500, color: THEME.text.primary, marginBottom: 12 }}>
              Node execution breakdown
            </h3>
            {nodeRows.length === 0 ? (
              <div className="text-center py-12" style={{ background: THEME.input, borderRadius: 8 }}>
                <Boxes className="w-12 h-12 mx-auto mb-3" style={{ color: THEME.text.muted }} />
                <p style={{ color: THEME.text.muted, fontSize: 13 }}>
                  {execution.status === 'RUNNING' ? 'Waiting for nodes to run…' : 'No per-node data recorded for this execution'}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {nodeRows.map((row) => (
                  <div
                    key={row.nodeId}
                    style={{
                      background: THEME.input,
                      border: `1px solid ${row.status === 'FAILED' ? THEME.colors.red + '60' : THEME.border}`,
                      borderRadius: 8,
                      padding: 12,
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        style={{
                          fontSize: 11, fontWeight: 600,
                          padding: '3px 8px', borderRadius: 4,
                          color: nodeStatusColor(row.status),
                          background: nodeStatusColor(row.status) + '18',
                          minWidth: 70, textAlign: 'center',
                        }}
                      >
                        {row.status}
                      </span>
                      <span style={{ fontFamily: 'monospace', fontSize: 13, color: THEME.text.primary, flex: 1 }}>
                        {row.nodeId}
                      </span>
                      <span style={{ fontSize: 12, color: THEME.text.muted }}>
                        {row.durationMs >= 0 ? `${row.durationMs}ms` : '—'}
                        {row.retries > 0 && ` · ${row.retries} retries`}
                      </span>
                    </div>
                    {row.error && (
                      <p style={{ fontSize: 12, color: THEME.colors.red, marginTop: 6, fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
                        {row.error}
                      </p>
                    )}
                    {row.output && (
                      <details style={{ marginTop: 8 }}>
                        <summary style={{ fontSize: 11, color: THEME.text.muted, cursor: 'pointer' }}>
                          Output ({Object.keys(row.output).length} keys)
                        </summary>
                        <pre style={{
                          marginTop: 4, fontSize: 11, fontFamily: 'monospace',
                          color: THEME.text.secondary, whiteSpace: 'pre-wrap',
                          maxHeight: 200, overflow: 'auto',
                        }}>
                          {JSON.stringify(row.output, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'logs' && (
          <div style={{ padding: 16 }}>
            <div className="flex items-center justify-between mb-3">
              <h3 style={{ fontSize: 13, fontWeight: 500, color: THEME.text.primary }}>Execution Logs</h3>
              {execution.status === 'RUNNING' && (
                <button onClick={fetchExecution} style={{ fontSize: 12, color: THEME.accentLight, background: 'transparent', border: 'none', cursor: 'pointer' }}>Refresh</button>
              )}
            </div>
            {execution.logs ? (
              <pre style={{ background: THEME.input, borderRadius: 8, padding: 16, overflow: 'auto', fontSize: 13, fontFamily: 'monospace', color: THEME.text.secondary, maxHeight: 384, whiteSpace: 'pre-wrap' }}>
                {execution.logs}
              </pre>
            ) : (
              <div className="text-center py-12" style={{ background: THEME.input, borderRadius: 8 }}>
                <Terminal className="w-12 h-12 mx-auto mb-3" style={{ color: THEME.text.muted }} />
                <p style={{ color: THEME.text.muted, fontSize: 13 }}>
                  {execution.status === 'RUNNING' ? 'Logs will appear here...' : 'No logs available'}
                </p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'input' && (
          <div style={{ padding: 16 }}>
            <h3 style={{ fontSize: 13, fontWeight: 500, color: THEME.text.primary, marginBottom: 12 }}>Input Parameters</h3>
            {execution.input && Object.keys(execution.input).length > 0 ? (
              <pre style={{ background: THEME.input, borderRadius: 8, padding: 16, overflow: 'auto', fontSize: 13, fontFamily: 'monospace', color: THEME.text.secondary }}>
                {JSON.stringify(execution.input, null, 2)}
              </pre>
            ) : (
              <div className="text-center py-12" style={{ background: THEME.input, borderRadius: 8 }}>
                <FileJson className="w-12 h-12 mx-auto mb-3" style={{ color: THEME.text.muted }} />
                <p style={{ color: THEME.text.muted, fontSize: 13 }}>No input data</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'output' && (
          <div style={{ padding: 16 }}>
            <h3 style={{ fontSize: 13, fontWeight: 500, color: THEME.text.primary, marginBottom: 12 }}>Output Data</h3>
            {execution.output && Object.keys(execution.output).length > 0 ? (
              <pre style={{ background: THEME.input, borderRadius: 8, padding: 16, overflow: 'auto', fontSize: 13, fontFamily: 'monospace', color: THEME.text.secondary }}>
                {JSON.stringify(execution.output, null, 2)}
              </pre>
            ) : execution.errorMessage ? (
              <div style={{ background: `${THEME.colors.red}10`, border: `1px solid ${THEME.colors.red}30`, borderRadius: 8, padding: 16 }}>
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle className="w-5 h-5" style={{ color: THEME.colors.red }} />
                  <span style={{ fontWeight: 500, color: THEME.colors.red, fontSize: 13 }}>Error</span>
                </div>
                <pre style={{ color: `${THEME.colors.red}CC`, fontSize: 13, fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
                  {execution.errorMessage}
                </pre>
              </div>
            ) : (
              <div className="text-center py-12" style={{ background: THEME.input, borderRadius: 8 }}>
                <FileJson className="w-12 h-12 mx-auto mb-3" style={{ color: THEME.text.muted }} />
                <p style={{ color: THEME.text.muted, fontSize: 13 }}>
                  {execution.status === 'RUNNING' ? 'Waiting for output...' : 'No output data'}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Trigger Type', value: execution.triggerType },
          { label: 'Worker ID', value: execution.workerId || '-', mono: true },
          { label: 'IP Address', value: execution.ipAddress || '-', mono: true },
        ].map((item, i) => (
          <div key={i} style={{ background: THEME.panel, border: `1px solid ${THEME.border}`, borderRadius: 2, padding: 16 }}>
            <p style={{ fontSize: 12, color: THEME.text.secondary }}>{item.label}</p>
            <p style={{ fontSize: 13, fontWeight: 500, color: THEME.text.primary, fontFamily: item.mono ? 'monospace' : FONT }}>{item.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Node-logs parser
// ─────────────────────────────────────────────────────────────────────────

interface NodeRow {
  nodeId: string;
  status: string;
  error: string;
  durationMs: number;
  retries: number;
  output: Record<string, unknown> | null;
}

// Flow executor emits lines like:
//   [nodeID] SUCCESS:  (12ms, 0 retries)
//   [nodeID] FAILED: some error msg (8ms, 3 retries)
//   [nodeID] SKIPPED:  (0ms, 0 retries)
//
// We regex out the pieces. `output` comes from the execution's `output`
// field which the flow executor stores as {nodeID: nodeOutput}.
function parseNodeLogs(logs: string, output: Record<string, unknown>): NodeRow[] {
  const lineRe = /^\[([^\]]+)\]\s+(\w+):\s*(.*?)\s*\((-?\d+)ms,\s*(\d+)\s+retries\)\s*$/;
  const rows: NodeRow[] = [];
  for (const raw of logs.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(lineRe);
    if (!m) continue;
    const [, nodeId, status, err, dur, retries] = m;
    rows.push({
      nodeId,
      status,
      error: err,
      durationMs: parseInt(dur) || -1,
      retries: parseInt(retries) || 0,
      output: (output && typeof output === 'object' && nodeId in output) ? output[nodeId] as Record<string, unknown> : null,
    });
  }
  return rows;
}

function nodeStatusColor(status: string): string {
  switch (status.toUpperCase()) {
    case 'SUCCESS': return '#10B981';
    case 'FAILED': return '#EF4444';
    case 'SKIPPED': return '#6B7280';
    default: return '#3B82F6';
  }
}
