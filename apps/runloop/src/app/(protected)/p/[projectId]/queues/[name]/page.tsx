'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Send, Trash2, RefreshCw, AlertCircle, Loader2,
  CheckCircle2, Clock, XCircle, PlayCircle, Inbox, Settings,
} from 'lucide-react';
import {
  ControlBreadcrumb, PageHeader, MonoTag, SharpButton, SchematicPanel, TableHeaderRow, StatusDot, MONO,
} from '@/components/ControlChrome';

const FONT = "'IBM Plex Sans Thai', 'IBM Plex Sans', sans-serif";
const T = {
  panel: 'var(--t-panel)',
  border: 'var(--t-border)',
  input: 'var(--t-input)',
  text: 'var(--t-text)',
  textSec: 'var(--t-text-secondary)',
  textMuted: 'var(--t-text-muted)',
  accent: 'var(--t-accent)',
  bg: 'var(--t-bg)',
};

const STATUS_META: Record<string, { color: string; icon: React.ElementType; label: string }> = {
  PENDING:    { color: '#F59E0B', icon: Clock,        label: 'Pending' },
  PROCESSING: { color: '#3B82F6', icon: PlayCircle,   label: 'Running' },
  COMPLETED:  { color: '#10B981', icon: CheckCircle2, label: 'Done' },
  FAILED:     { color: '#F97316', icon: XCircle,      label: 'Failed' },
  DLQ:        { color: '#EF4444', icon: AlertCircle,  label: 'DLQ' },
};

interface QueueDef {
  Name: string;
  ProjectID: string;
  FlowID: string;
  Backend: string;
  BackendConfig: Record<string, any>;
  Concurrency: number;
  MaxAttempts: number;
  VisibilitySec: number;
  Enabled: boolean;
}

interface Job {
  id: string;
  status: string;
  attempts: number;
  priority: number;
  idempotencyKey?: string;
  lastError?: string;
  visibleAfter?: string;
  createdAt?: string;
  completedAt?: string;
}

export default function QueueDetailPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.projectId as string;
  const name = decodeURIComponent(params.name as string);

  const [def, setDef] = useState<QueueDef | null>(null);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [oldestSec, setOldestSec] = useState(0);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [enqueueOpen, setEnqueueOpen] = useState(false);
  const [enqueuePayload, setEnqueuePayload] = useState('{\n  "example": "value"\n}');
  const [enqueueKey, setEnqueueKey] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [flows, setFlows] = useState<Array<{ id: string; name: string }>>([]);

  // Local edit-form state (loaded from `def` when the modal opens, then
  // diffed against `def` on save so PATCH only carries actual changes).
  const [editFlow, setEditFlow] = useState('');
  const [editConc, setEditConc] = useState(1);
  const [editAttempts, setEditAttempts] = useState(3);
  const [editVisibility, setEditVisibility] = useState(300);
  const [editEnabled, setEditEnabled] = useState(true);

  useEffect(() => {
    fetch(`/runloop/api/flows?projectId=${projectId}`)
      .then((r) => r.json())
      .then((d) => setFlows((d.data || []).map((f: any) => ({ id: f.id, name: f.name }))))
      .catch(() => {});
  }, [projectId]);

  const openEdit = () => {
    if (!def) return;
    setEditFlow(def.FlowID);
    setEditConc(def.Concurrency);
    setEditAttempts(def.MaxAttempts);
    setEditVisibility(def.VisibilitySec);
    setEditEnabled(def.Enabled);
    setEditOpen(true);
  };

  const saveEdit = async () => {
    if (!def) return;
    // Diff against current def — only patch fields that actually changed.
    const patch: Record<string, any> = {};
    if (editFlow && editFlow !== def.FlowID) patch.flowId = editFlow;
    if (editConc !== def.Concurrency) patch.concurrency = editConc;
    if (editAttempts !== def.MaxAttempts) patch.maxAttempts = editAttempts;
    if (editVisibility !== def.VisibilitySec) patch.visibilitySec = editVisibility;
    if (editEnabled !== def.Enabled) patch.enabled = editEnabled;
    if (Object.keys(patch).length === 0) {
      setEditOpen(false);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/runloop/api/queues/${encodeURIComponent(name)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || `HTTP ${res.status}`);
      }
      setToast('Saved');
      setTimeout(() => setToast(null), 2000);
      setEditOpen(false);
      fetchAll();
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Save failed');
      setTimeout(() => setToast(null), 3000);
    } finally {
      setBusy(false);
    }
  };

  const fetchAll = useCallback(async () => {
    try {
      const [d, s, j] = await Promise.all([
        fetch(`/runloop/api/queues/${encodeURIComponent(name)}`).then((r) => r.json()),
        fetch(`/runloop/api/queues/${encodeURIComponent(name)}/stats`).then((r) => r.json()),
        fetch(
          `/runloop/api/queues/${encodeURIComponent(name)}/jobs` +
          (filterStatus !== 'ALL' ? `?status=${filterStatus}` : ''),
        ).then((r) => r.json()),
      ]);
      if (d.data) setDef(d.data);
      if (s.data) {
        setStats(s.data.counts || {});
        setOldestSec(s.data.oldestPendingSec || 0);
      }
      setJobs(j.data || []);
    } catch {
      /* transient; try next tick */
    }
  }, [name, filterStatus]);

  useEffect(() => {
    fetchAll();
    const t = setInterval(fetchAll, 3000);
    return () => clearInterval(t);
  }, [fetchAll]);

  function notify(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  async function enqueue() {
    let payload: any;
    try {
      payload = JSON.parse(enqueuePayload);
    } catch {
      notify('Payload must be valid JSON');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/runloop/api/queues/${encodeURIComponent(name)}/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload, idempotencyKey: enqueueKey || undefined }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'enqueue failed');
      notify(d.duplicate ? `Duplicate — existing job ${d.jobId.slice(0, 8)}…` : `Enqueued ${d.jobId.slice(0, 8)}…`);
      setEnqueueOpen(false);
      setEnqueueKey('');
      fetchAll();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'enqueue failed');
    } finally {
      setBusy(false);
    }
  }

  async function retryJob(id: string) {
    const res = await fetch(`/runloop/api/queues/${encodeURIComponent(name)}/jobs/${id}/retry`, { method: 'POST' });
    notify(res.ok ? 'Requeued' : 'Retry failed');
    fetchAll();
  }

  async function deleteJob(id: string) {
    if (!confirm(`Delete job ${id.slice(0, 8)}…?`)) return;
    const res = await fetch(`/runloop/api/queues/${encodeURIComponent(name)}/jobs/${id}`, { method: 'DELETE' });
    notify(res.ok ? 'Deleted' : 'Delete failed');
    fetchAll();
  }

  async function deleteQueue() {
    if (!confirm(`Delete the entire queue "${name}"? Jobs will be purged. This cannot be undone.`)) return;
    const res = await fetch(`/runloop/api/queues/${encodeURIComponent(name)}`, { method: 'DELETE' });
    if (res.ok) router.push(`/p/${projectId}/queues`);
    else notify('Delete failed');
  }

  if (!def) {
    return (
      <div style={{ fontFamily: FONT }} className="flex items-center justify-center h-64">
        <Loader2 className="w-5 h-5 animate-spin" style={{ color: T.accent }} />
      </div>
    );
  }

  const chipStatuses = ['ALL', 'PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'DLQ'];
  const totalPending = stats.PENDING || 0;
  const totalDlq = stats.DLQ || 0;

  return (
    <div style={{ fontFamily: FONT }}>
      {toast && (
        <div
          className="fixed right-6 top-6 px-4 py-2 shadow-lg z-50"
          style={{
            background: T.panel, border: `1px solid ${T.border}`,
            fontFamily: MONO, fontSize: 12, color: T.text, borderRadius: 2,
            letterSpacing: '0.04em',
          }}
        >
          {toast}
        </div>
      )}

      <Link
        href={`/p/${projectId}/queues`}
        className="inline-flex items-center gap-1.5 mb-4 hover:opacity-80"
        style={{ fontSize: 12, color: T.textMuted }}
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Back to Queues
      </Link>

      <div className="flex items-end justify-between mb-6 gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h1 style={{ fontSize: 24, fontWeight: 600, color: T.text, letterSpacing: '-0.02em' }}>
              {def.Name}
            </h1>
            <MonoTag tone="accent">{def.Backend}</MonoTag>
            {!def.Enabled && <MonoTag tone="danger">DISABLED</MonoTag>}
          </div>
          <p style={{ fontSize: 13, color: T.textMuted }}>
            Flow {def.FlowID} · concurrency={def.Concurrency} · max_attempts={def.MaxAttempts} · visibility={def.VisibilitySec}s
          </p>
        </div>
        <div className="flex items-center gap-2">
            <SharpButton variant="ghost" onClick={openEdit}>
              <Settings className="w-3.5 h-3.5" /> Edit
            </SharpButton>
            <SharpButton onClick={() => setEnqueueOpen((v) => !v)}>
              <Send className="w-3.5 h-3.5" /> Enqueue Job
            </SharpButton>
            <SharpButton variant="danger" size="sm" onClick={deleteQueue}>
              <Trash2 className="w-3.5 h-3.5" />
            </SharpButton>
        </div>
      </div>

      {editOpen && (
        <SchematicPanel className="mb-4">
          <div className="flex items-center justify-between mb-3">
            <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>
              Edit queue · {def.Name}
            </span>
            <button
              onClick={() => setEditOpen(false)}
              style={{ fontSize: 12, color: T.textMuted }}
            >
              Close
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="col-span-2">
              <label style={{ fontSize: 11, color: T.textMuted, display: 'block', marginBottom: 4 }}>
                Flow (which flow each job triggers)
              </label>
              <select
                value={editFlow}
                onChange={(e) => setEditFlow(e.target.value)}
                style={{
                  width: '100%', background: T.input, border: `1px solid ${T.border}`,
                  color: T.text, borderRadius: 2, padding: '8px 10px',
                  fontFamily: MONO, fontSize: 12,
                }}
              >
                {!flows.find((f) => f.id === editFlow) && editFlow && (
                  <option value={editFlow}>{editFlow} (current)</option>
                )}
                {flows.map((f) => (
                  <option key={f.id} value={f.id}>{f.name} · {f.id.slice(0, 10)}…</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ fontSize: 11, color: T.textMuted, display: 'block', marginBottom: 4 }}>
                Concurrency
              </label>
              <input
                type="number" min={1}
                value={editConc}
                onChange={(e) => setEditConc(Number(e.target.value) || 1)}
                style={{
                  width: '100%', background: T.input, border: `1px solid ${T.border}`,
                  color: T.text, borderRadius: 2, padding: '8px 10px',
                  fontFamily: MONO, fontSize: 12,
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: 11, color: T.textMuted, display: 'block', marginBottom: 4 }}>
                Max attempts
              </label>
              <input
                type="number" min={1}
                value={editAttempts}
                onChange={(e) => setEditAttempts(Number(e.target.value) || 1)}
                style={{
                  width: '100%', background: T.input, border: `1px solid ${T.border}`,
                  color: T.text, borderRadius: 2, padding: '8px 10px',
                  fontFamily: MONO, fontSize: 12,
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: 11, color: T.textMuted, display: 'block', marginBottom: 4 }}>
                Visibility (sec)
              </label>
              <input
                type="number" min={1}
                value={editVisibility}
                onChange={(e) => setEditVisibility(Number(e.target.value) || 1)}
                style={{
                  width: '100%', background: T.input, border: `1px solid ${T.border}`,
                  color: T.text, borderRadius: 2, padding: '8px 10px',
                  fontFamily: MONO, fontSize: 12,
                }}
              />
            </div>

            <div className="flex items-end">
              <label className="flex items-center gap-2" style={{ fontSize: 12, color: T.textSec }}>
                <input
                  type="checkbox"
                  checked={editEnabled}
                  onChange={(e) => setEditEnabled(e.target.checked)}
                />
                Enabled
              </label>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <SharpButton onClick={saveEdit} disabled={busy}>
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              Save
            </SharpButton>
            <SharpButton variant="ghost" size="sm" onClick={() => setEditOpen(false)}>
              Cancel
            </SharpButton>
            <span style={{ fontSize: 11, color: T.textMuted, marginLeft: 8 }}>
              Changes apply on next worker pickup. Backend + name can&rsquo;t be changed live — delete and recreate.
            </span>
          </div>
        </SchematicPanel>
      )}

      {enqueueOpen && (
        <SchematicPanel className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span style={{ fontSize: 12, fontWeight: 600, color: T.textSec }}>
              Enqueue payload
            </span>
            <button
              onClick={() => setEnqueueOpen(false)}
              style={{ fontSize: 12, color: T.textMuted }}
            >
              Close
            </button>
          </div>
          <textarea
            value={enqueuePayload}
            onChange={(e) => setEnqueuePayload(e.target.value)}
            rows={6}
            spellCheck={false}
            style={{
              width: '100%', background: T.input, border: `1px solid ${T.border}`,
              color: T.text, borderRadius: 2, padding: 10, fontSize: 12,
              fontFamily: MONO, outline: 'none',
            }}
          />
          <div className="flex items-center gap-2 mt-2">
            <input
              value={enqueueKey}
              onChange={(e) => setEnqueueKey(e.target.value)}
              placeholder="idempotency_key (optional)"
              style={{
                flex: 1, background: T.input, border: `1px solid ${T.border}`,
                color: T.text, borderRadius: 2, padding: '8px 12px',
                fontFamily: MONO, fontSize: 12, outline: 'none',
              }}
            />
            <SharpButton onClick={enqueue} disabled={busy}>
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              $ ENQUEUE →
            </SharpButton>
          </div>
        </SchematicPanel>
      )}

      {/* Lifecycle diagram — explains how a job actually moves through the
          system. Live counters fed from `stats` so you can see backlog flow. */}
      <div
        className="mb-4 p-4"
        style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 2 }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: T.textMuted,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            marginBottom: 12,
          }}
        >
          Lifecycle
        </div>
        <div className="flex items-stretch gap-2 overflow-x-auto">
          {[
            {
              title: 'Producer',
              sub: 'POST /api/queues/' + def.Name + '/jobs',
              note: 'or Enqueue node in another flow',
              count: null as number | null,
              color: T.textSec,
            },
            {
              title: 'Queue',
              sub: def.Backend + ' · concurrency ' + def.Concurrency,
              note: 'pending + scheduled',
              count: (stats.PENDING || 0),
              color: STATUS_META.PENDING.color,
            },
            {
              title: 'Worker',
              sub: 'pulls up to ' + def.Concurrency + ' at a time',
              note: 'in-flight',
              count: (stats.PROCESSING || 0),
              color: STATUS_META.PROCESSING.color,
            },
            {
              title: 'Flow run',
              sub: 'execution of bound flow per job',
              note: 'see Executions for traces',
              count: null,
              color: T.accent,
            },
            {
              title: 'Result',
              sub: 'success → done, fail → retry → DLQ',
              note: 'DLQ = ' + (stats.DLQ || 0) + ' · failed = ' + (stats.FAILED || 0),
              count: (stats.COMPLETED || 0),
              color: STATUS_META.COMPLETED.color,
            },
          ].map((step, i, arr) => (
            <React.Fragment key={step.title}>
              <div
                className="flex-1 min-w-0 p-3"
                style={{
                  border: `1px solid ${T.border}`,
                  background: T.input,
                  borderRadius: 2,
                  minWidth: 160,
                }}
              >
                <div className="flex items-center justify-between mb-1">
                  <span style={{ fontSize: 12, fontWeight: 600, color: T.text }}>{step.title}</span>
                  {step.count !== null && (
                    <span
                      style={{
                        fontFamily: MONO, fontSize: 14, fontWeight: 700,
                        color: step.count > 0 ? step.color : T.textMuted,
                      }}
                    >
                      {step.count}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 10.5, color: T.textMuted, marginBottom: 4 }}>
                  {step.sub}
                </div>
                <div style={{ fontSize: 10, color: T.textMuted, opacity: 0.8 }}>
                  {step.note}
                </div>
              </div>
              {i < arr.length - 1 && (
                <div
                  className="flex items-center"
                  style={{ color: T.textMuted, fontFamily: MONO, fontSize: 14 }}
                  aria-hidden
                >
                  →
                </div>
              )}
            </React.Fragment>
          ))}
        </div>
        <div className="mt-3" style={{ fontSize: 11, color: T.textMuted, lineHeight: 1.5 }}>
          Each enqueued job triggers a separate execution of flow{' '}
          <Link
            href={`/p/${projectId}/flows/${def.FlowID}`}
            style={{ color: T.accent, textDecoration: 'underline', textUnderlineOffset: 2 }}
          >
            {def.FlowID}
          </Link>
          {'. '}
          Failed jobs retry up to {def.MaxAttempts} times, then move to{' '}
          <Link
            href={`/p/${projectId}/executions?filter=needs_review`}
            style={{ color: T.accent, textDecoration: 'underline', textUnderlineOffset: 2 }}
          >
            DLQ (Needs Review)
          </Link>
          .
        </div>
      </div>

      {/* Stats strip — five sharp cells reading like instrument dials */}
      <div className="grid grid-cols-5 gap-2 mb-4">
        {(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'DLQ'] as const).map((s) => {
          const meta = STATUS_META[s];
          const v = stats[s] || 0;
          const Icon = meta.icon;
          return (
            <div
              key={s}
              className="p-3"
              style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 2 }}
            >
              <div className="flex items-center gap-2 mb-2">
                <Icon className="w-3.5 h-3.5" style={{ color: meta.color }} />
                <span
                  style={{
                    fontFamily: MONO, fontSize: 10, fontWeight: 500,
                    color: T.textMuted, letterSpacing: '0.12em', textTransform: 'uppercase',
                  }}
                >
                  {meta.label}
                </span>
              </div>
              <div
                style={{
                  fontFamily: MONO, fontSize: 26, fontWeight: 600,
                  color: v > 0 ? meta.color : T.textMuted, lineHeight: 1,
                  letterSpacing: '-0.02em',
                }}
              >
                {v}
              </div>
              {s === 'PENDING' && oldestSec > 0 && (
                <div
                  style={{ fontFamily: MONO, fontSize: 10, color: T.textMuted, marginTop: 6, letterSpacing: '0.04em' }}
                >
                  oldest {formatAge(oldestSec)}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Filter chips */}
      <div className="flex items-center gap-1.5 mb-3">
        {chipStatuses.map((s) => {
          const active = filterStatus === s;
          return (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              style={{
                padding: '4px 10px', borderRadius: 2,
                fontFamily: MONO, fontSize: 10.5, fontWeight: 500, letterSpacing: '0.08em',
                textTransform: 'uppercase',
                background: active ? T.accent : 'transparent',
                color: active ? '#fff' : T.textSec,
                border: `1px solid ${active ? T.accent : T.border}`,
              }}
            >
              {s === 'ALL' ? 'ALL' : STATUS_META[s]?.label || s}
            </button>
          );
        })}
        <button
          onClick={fetchAll}
          style={{
            marginLeft: 'auto', fontFamily: MONO, fontSize: 10.5,
            color: T.textMuted, letterSpacing: '0.08em',
          }}
          className="flex items-center gap-1.5 hover:opacity-80"
        >
          <RefreshCw className="w-3 h-3" /> REFRESH
        </button>
      </div>

      {/* Jobs table */}
      <div style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 2, overflow: 'hidden' }}>
        <TableHeaderRow
          cols={[
            { label: '#',        width: 40 },
            { label: 'JOB',      width: 220 },
            { label: 'STATUS',   width: 90 },
            { label: 'ATTEMPTS', width: 80, align: 'right' },
            { label: 'LAST ERROR' },
            { label: 'CREATED',  width: 170 },
            { label: 'ACTIONS',  width: 80, align: 'right' },
          ]}
        />
        {jobs.length === 0 ? (
          <div className="text-center py-12" style={{ color: T.textMuted }}>
            <Inbox className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.08em' }}>
              {def.Backend === 'postgres'
                ? '// NO JOBS MATCH THIS FILTER'
                : `// ${def.Backend.toUpperCase()} STORES JOBS IN BROKER — ONLY DLQ MIRRORED`}
            </p>
          </div>
        ) : (
          <div>
            {jobs.map((j, i) => {
              const meta = STATUS_META[j.status] || STATUS_META.PENDING;
              return (
                <div
                  key={j.id}
                  className="flex items-center gap-3 px-4 py-2.5 group"
                  style={{
                    borderTop: i === 0 ? 'none' : `1px solid ${T.border}`,
                    color: T.text,
                  }}
                >
                  <span
                    style={{
                      width: 40, fontFamily: MONO, fontSize: 10.5,
                      color: T.textMuted, letterSpacing: '0.06em',
                    }}
                  >
                    {String(i + 1).padStart(3, '0')}
                  </span>
                  <div style={{ width: 220 }}>
                    <div style={{ fontFamily: MONO, fontSize: 12, color: T.text }}>
                      {j.id.slice(0, 16)}…
                    </div>
                    {j.idempotencyKey && (
                      <div style={{ fontFamily: MONO, fontSize: 10, color: T.textMuted, marginTop: 2 }}>
                        key: {j.idempotencyKey}
                      </div>
                    )}
                  </div>
                  <span
                    className="flex items-center gap-1.5"
                    style={{
                      width: 90, fontFamily: MONO, fontSize: 10.5,
                      color: meta.color, letterSpacing: '0.08em', textTransform: 'uppercase',
                    }}
                  >
                    <StatusDot color={meta.color} soft />
                    {meta.label}
                  </span>
                  <span
                    className="text-right"
                    style={{
                      width: 80, fontFamily: MONO, fontSize: 12,
                      color: j.attempts > 0 ? T.text : T.textMuted,
                    }}
                  >
                    {j.attempts}
                  </span>
                  <div
                    className="flex-1 truncate"
                    style={{ fontFamily: MONO, fontSize: 11, color: T.textMuted }}
                    title={j.lastError || ''}
                  >
                    {j.lastError || '—'}
                  </div>
                  <span
                    style={{
                      width: 170, fontFamily: MONO, fontSize: 10.5,
                      color: T.textMuted, letterSpacing: '0.02em',
                    }}
                  >
                    {j.createdAt ? new Date(j.createdAt).toLocaleString() : '—'}
                  </span>
                  <div
                    className="flex items-center justify-end gap-1 opacity-60 group-hover:opacity-100 transition"
                    style={{ width: 80 }}
                  >
                    {(j.status === 'FAILED' || j.status === 'DLQ' || j.status === 'COMPLETED') && (
                      <button
                        onClick={() => retryJob(j.id)}
                        title="Requeue"
                        style={{ color: T.textSec }}
                        className="p-1 hover:opacity-70"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => deleteJob(j.id)}
                      title="Delete"
                      style={{ color: '#EF4444' }}
                      className="p-1 hover:opacity-70"
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
    </div>
  );
}

function formatAge(sec: number): string {
  if (sec < 60) return `${Math.round(sec)}s`;
  if (sec < 3600) return `${Math.round(sec / 60)}m`;
  if (sec < 86400) return `${Math.round(sec / 3600)}h`;
  return `${Math.round(sec / 86400)}d`;
}
