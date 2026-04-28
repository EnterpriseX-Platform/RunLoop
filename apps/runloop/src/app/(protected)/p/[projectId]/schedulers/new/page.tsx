'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2, AlertCircle, Plus, X, Workflow, Webhook } from 'lucide-react';
import type { TriggerType, Flow } from '@/types';
import {
  ControlBreadcrumb, PageHeader, SchematicPanel, SharpButton, MonoTag, MONO,
} from '@/components/ControlChrome';

const FONT = "'IBM Plex Sans Thai', 'IBM Plex Sans', sans-serif";
const T = {
  bg: 'var(--t-bg)',
  panel: 'var(--t-panel)',
  panelHover: 'var(--t-panel-hover)',
  border: 'var(--t-border)',
  text: 'var(--t-text)',
  textSec: 'var(--t-text-secondary)',
  textMuted: 'var(--t-text-muted)',
  accent: 'var(--t-accent)',
  input: 'var(--t-input)',
  red: '#EF4444',
  amber: '#F59E0B',
  blue: '#3B82F6',
  emerald: '#10B981',
  purple: '#8B5CF6',
};

const TRIGGER_TYPES: { value: TriggerType; label: string }[] = [
  { value: 'SCHEDULE', label: 'Scheduled (Cron)' },
  { value: 'MANUAL', label: 'Manual Only' },
  { value: 'WEBHOOK', label: 'Webhook' },
  { value: 'API', label: 'API Call' },
];

export default function NewSchedulerPage() {
  const router = useRouter();
  const routeParams = useParams();
  const projectId = routeParams.projectId as string;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [availableFlows, setAvailableFlows] = useState<Flow[]>([]);
  const [isLoadingFlows, setIsLoadingFlows] = useState(true);
  const [selectedFlowIds, setSelectedFlowIds] = useState<string[]>([]);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    triggerType: 'SCHEDULE' as TriggerType,
    schedule: '*/5 * * * *',
    timezone: 'Asia/Bangkok',
    timeout: 300,
    retryCount: 0,
    retryDelay: 60,
    maxConcurrency: 1,
  });
  // Parameters JSON — passed to the bound flow as the `${{input.*}}`
  // variable on each trigger. Supports built-in dynamic vars:
  //   ${{NOW}}        — RFC3339 timestamp
  //   ${{TODAY}}      — YYYY-MM-DD
  //   ${{TIMESTAMP}}  — Unix seconds
  //   ${{TIMESTAMP_MS}}
  // Engine substitutes these at execution time so daily reports get the
  // run's actual date even if the cron fires a few seconds late.
  const [paramsJson, setParamsJson] = useState<string>('{\n  "runDate": "${{TODAY}}"\n}');
  const [paramsValid, setParamsValid] = useState<boolean>(true);

  useEffect(() => {
    fetchFlows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchFlows = async () => {
    try {
      setIsLoadingFlows(true);
      const params = projectId ? `?projectId=${projectId}` : '';
      const res = await fetch(`/runloop/api/flows${params}`);
      if (res.ok) {
        const data = await res.json();
        setAvailableFlows(data.data || []);
      }
    } finally {
      setIsLoadingFlows(false);
    }
  };

  const toggleFlow = (flowId: string) => {
    setSelectedFlowIds((prev) =>
      prev.includes(flowId) ? prev.filter((id) => id !== flowId) : [...prev, flowId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId) return;

    setIsSubmitting(true);
    setSubmitError(null);
    try {
      // Parse Parameters JSON before submitting. Soft-fail with a clear
      // error rather than letting the API choke on malformed JSON.
      let parsedParams: unknown = undefined;
      if (paramsJson.trim() && paramsJson.trim() !== '{}') {
        try {
          parsedParams = JSON.parse(paramsJson);
        } catch (err) {
          setSubmitError('Parameters: invalid JSON — fix and try again');
          setIsSubmitting(false);
          return;
        }
      }

      const { schedule, ...rest } = formData;
      const payload: Record<string, unknown> = {
        ...rest,
        projectId,
        status: 'ACTIVE',
        type: 'HTTP',
        // `input` is what the engine reads as ${{input.*}} when the
        // scheduler fires. Stored alongside other config so it's edited
        // and versioned with the scheduler.
        config: parsedParams ? { input: parsedParams } : {},
      };
      if (schedule && schedule.trim()) payload.schedule = schedule.trim();

      const res = await fetch('/runloop/api/schedulers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const error = await res.json();
        setSubmitError(error.error || error.details || 'Failed to create scheduler');
        return;
      }

      const data = await res.json();
      const schedulerId = data.data.id;

      if (formData.triggerType === 'WEBHOOK') {
        try {
          await fetch('/runloop/api/webhooks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              projectId,
              schedulerId,
              name: `${formData.name} webhook`,
              description: `Auto-created for scheduler ${formData.name}`,
            }),
          });
        } catch {
          /* non-fatal */
        }
      }

      if (selectedFlowIds.length > 0) {
        const edges = selectedFlowIds.slice(0, -1).map((sourceId, i) => ({
          sourceFlowId: sourceId,
          targetFlowId: selectedFlowIds[i + 1],
          condition: 'ON_SUCCESS',
        }));
        await fetch(`/runloop/api/schedulers/${schedulerId}/flows`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ flowIds: selectedFlowIds, edges }),
        });
      }

      router.push(`/p/${projectId}/schedulers/${schedulerId}`);
    } catch {
      setSubmitError('Failed to create scheduler');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!projectId) {
    return (
      <div className="max-w-5xl" style={{ fontFamily: FONT }}>
        <ControlBreadcrumb path="SCHEDULERS / NEW" node="NODE.CRON.INIT" />
        <SchematicPanel className="text-center" padded>
          <AlertCircle className="w-10 h-10 mx-auto mb-3" style={{ color: T.amber }} />
          <h3 style={{ fontSize: 15, fontWeight: 600, color: T.text, marginBottom: 6 }}>No Project Selected</h3>
          <p style={{ color: T.textSec, fontSize: 13, marginBottom: 12 }}>Select a project first.</p>
          <SharpButton href="/projects">$ GO TO PROJECTS →</SharpButton>
        </SchematicPanel>
      </div>
    );
  }

  const selectedFlows = availableFlows.filter((f) => selectedFlowIds.includes(f.id));
  const unselectedFlows = availableFlows.filter((f) => !selectedFlowIds.includes(f.id));

  return (
    <div className="max-w-6xl" style={{ fontFamily: FONT }}>
      <Link
        href={`/p/${projectId}/schedulers`}
        className="inline-flex items-center gap-1.5 mb-4 hover:opacity-80"
        style={{ fontSize: 12, color: T.textMuted }}
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Back to Schedulers
      </Link>

      <div className="mb-6">
        <h1 style={{ fontSize: 24, fontWeight: 600, color: T.text, letterSpacing: '-0.02em' }}>
          New Scheduler
        </h1>
        <p style={{ fontSize: 13, color: T.textMuted, marginTop: 6 }}>
          Define when and how to run your flows.
        </p>
      </div>

      {submitError && (
        <div
          className="flex items-center gap-2 mb-4 p-3"
          style={{
            background: 'color-mix(in srgb, #EF4444 10%, transparent)',
            border: '1px solid color-mix(in srgb, #EF4444 30%, transparent)',
            borderRadius: 2,
          }}
        >
          <AlertCircle className="w-4 h-4 flex-shrink-0" style={{ color: T.red }} />
          <span style={{ fontFamily: MONO, fontSize: 12, color: T.red, letterSpacing: '0.04em' }}>
            {submitError}
          </span>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="flex gap-4" style={{ alignItems: 'flex-start' }}>
          {/* Left — form */}
          <div className="flex-1" style={{ minWidth: 0 }}>
            <Section title="BASIC INFORMATION">
              <Field label="Name" required>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  style={inp()}
                  placeholder="e.g., Daily Pipeline"
                  required
                  minLength={3}
                />
              </Field>
              <Field label="Description">
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  style={{ ...inp(), height: 'auto', padding: '8px 12px' }}
                  placeholder="What does this scheduler do?"
                  rows={2}
                />
              </Field>
            </Section>

            <Section title="TRIGGER SETTINGS">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Trigger Type">
                  <select
                    value={formData.triggerType}
                    onChange={(e) => setFormData({ ...formData, triggerType: e.target.value as TriggerType })}
                    style={inp()}
                  >
                    {TRIGGER_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>{type.label}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Timezone">
                  <select
                    value={formData.timezone}
                    onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
                    style={inp()}
                  >
                    <option value="UTC">UTC</option>
                    <option value="Asia/Bangkok">Asia/Bangkok (GMT+7)</option>
                    <option value="Asia/Singapore">Asia/Singapore (GMT+8)</option>
                    <option value="Asia/Tokyo">Asia/Tokyo (GMT+9)</option>
                    <option value="America/New_York">America/New_York (EST)</option>
                    <option value="America/Los_Angeles">America/Los_Angeles (PST)</option>
                    <option value="Europe/London">Europe/London (GMT)</option>
                  </select>
                </Field>
              </div>

              {formData.triggerType === 'WEBHOOK' && (
                <Callout color={T.purple} icon={Webhook} label="WEBHOOK ENDPOINT">
                  <p style={{ fontSize: 12, color: T.textSec, lineHeight: 1.5 }}>
                    A public webhook URL + HMAC secret will be generated after saving. Anyone with the URL and
                    secret can trigger this scheduler by POSTing JSON.
                  </p>
                  <pre style={preStyle()}>
{`POST /runloop/api/webhooks/:id
Header: X-Webhook-Signature: <HMAC-SHA256 of body using secret>`}
                  </pre>
                </Callout>
              )}

              {formData.triggerType === 'API' && (
                <Callout color={T.blue} icon={Workflow} label="API TRIGGER">
                  <p style={{ fontSize: 12, color: T.textSec, lineHeight: 1.5 }}>
                    Trigger this scheduler by calling the authenticated trigger endpoint:
                  </p>
                  <pre style={preStyle()}>
{`POST /runloop/api/schedulers/<id>/trigger
Header: Authorization: Bearer <jwt-token>
Body: { "input": {...} }`}
                  </pre>
                </Callout>
              )}

              {formData.triggerType === 'SCHEDULE' && (
                <div style={{ marginTop: 12 }}>
                  <Field
                    label="Cron Expression"
                    hint={
                      <a
                        href="https://crontab.guru/"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: T.accent }}
                      >
                        crontab.guru →
                      </a>
                    }
                  >
                    <input
                      type="text"
                      value={formData.schedule}
                      onChange={(e) => setFormData({ ...formData, schedule: e.target.value })}
                      style={{ ...inp(), fontFamily: MONO }}
                      placeholder="*/5 * * * *"
                      required={formData.triggerType === 'SCHEDULE'}
                    />
                  </Field>
                  <div className="flex gap-1.5 mt-2 flex-wrap">
                    {[
                      { label: 'every 5m', cron: '*/5 * * * *' },
                      { label: 'hourly',   cron: '0 * * * *' },
                      { label: 'daily 9a', cron: '0 9 * * *' },
                      { label: 'weekly',   cron: '0 9 * * 1' },
                    ].map((preset) => (
                      <button
                        key={preset.cron}
                        type="button"
                        onClick={() => setFormData({ ...formData, schedule: preset.cron })}
                        style={{
                          fontFamily: MONO, fontSize: 10.5, padding: '4px 8px',
                          borderRadius: 2, background: 'transparent', color: T.textSec,
                          border: `1px solid ${T.border}`, letterSpacing: '0.06em',
                          textTransform: 'uppercase', cursor: 'pointer',
                        }}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </Section>

            <Section title="PARAMETERS">
              <Field
                label="Input (JSON)"
                hint={
                  <>
                    Passed to the bound flow as <code style={{ color: 'var(--t-accent)' }}>{'${{input.<field>}}'}</code>.
                    {' '}Built-in dynamic vars: <code style={{ color: 'var(--t-accent)' }}>{'${{NOW}}'}</code>,{' '}
                    <code style={{ color: 'var(--t-accent)' }}>{'${{TODAY}}'}</code>,{' '}
                    <code style={{ color: 'var(--t-accent)' }}>{'${{TIMESTAMP}}'}</code>,{' '}
                    <code style={{ color: 'var(--t-accent)' }}>{'${{TIMESTAMP_MS}}'}</code> — evaluated each run.
                  </>
                }
              >
                <textarea
                  value={paramsJson}
                  onChange={(e) => {
                    setParamsJson(e.target.value);
                    try {
                      JSON.parse(e.target.value || '{}');
                      setParamsValid(true);
                    } catch {
                      setParamsValid(false);
                    }
                  }}
                  rows={6}
                  spellCheck={false}
                  style={{
                    ...inp(),
                    fontFamily: 'IBM Plex Mono, ui-monospace, SFMono-Regular, monospace',
                    resize: 'vertical' as const,
                    borderColor: paramsValid ? 'var(--t-border)' : '#EF4444',
                  }}
                />
                {!paramsValid && (
                  <p style={{ fontSize: 11, color: '#EF4444', marginTop: 4 }}>
                    Invalid JSON — fix syntax before saving
                  </p>
                )}
              </Field>
            </Section>

            <Section title="EXECUTION SETTINGS">
              <div className="grid grid-cols-4 gap-3">
                <Field label="Timeout (s)">
                  <input type="number" value={formData.timeout}
                    onChange={(e) => setFormData({ ...formData, timeout: parseInt(e.target.value) || 300 })}
                    style={inp()} min={1} max={3600} />
                </Field>
                <Field label="Retry Count">
                  <input type="number" value={formData.retryCount}
                    onChange={(e) => setFormData({ ...formData, retryCount: parseInt(e.target.value) || 0 })}
                    style={inp()} min={0} max={10} />
                </Field>
                <Field label="Retry Delay (s)">
                  <input type="number" value={formData.retryDelay}
                    onChange={(e) => setFormData({ ...formData, retryDelay: parseInt(e.target.value) || 60 })}
                    style={inp()} min={0} max={3600} />
                </Field>
                <Field label="Max Concurrency">
                  <input type="number" value={formData.maxConcurrency}
                    onChange={(e) => setFormData({ ...formData, maxConcurrency: parseInt(e.target.value) || 1 })}
                    style={inp()} min={1} max={100} />
                </Field>
              </div>
            </Section>

            <div className="flex items-center gap-2 pt-2">
              <SharpButton type="submit" disabled={isSubmitting || !formData.name}>
                {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                {isSubmitting ? 'Creating…' : 'Create Scheduler'}
              </SharpButton>
              <SharpButton variant="ghost" href={`/p/${projectId}/schedulers`}>
                Cancel
              </SharpButton>
            </div>
          </div>

          {/* Right — flows picker */}
          <div style={{ width: 380, flexShrink: 0 }}>
            <SchematicPanel>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3
                    style={{
                      fontFamily: MONO, fontSize: 10, fontWeight: 600, color: T.textSec,
                      letterSpacing: '0.14em', textTransform: 'uppercase',
                    }}
                  >
                    // FLOWS TO RUN
                  </h3>
                  <p style={{ fontSize: 11, color: T.textMuted, marginTop: 4 }}>
                    Select flows — they execute in order.
                  </p>
                </div>
                <Link
                  href={`/p/${projectId}/flows/new`}
                  style={{ fontFamily: MONO, fontSize: 10.5, color: T.accent, letterSpacing: '0.08em' }}
                >
                  + NEW FLOW
                </Link>
              </div>

              {selectedFlows.length > 0 && (
                <div className="space-y-1.5 mb-3">
                  {selectedFlows.map((flow, index) => (
                    <div
                      key={flow.id}
                      className="flex items-center gap-2"
                      style={{
                        padding: 9,
                        background: 'color-mix(in srgb, var(--t-accent) 8%, transparent)',
                        border: '1px solid color-mix(in srgb, var(--t-accent) 30%, transparent)',
                        borderRadius: 2,
                      }}
                    >
                      <span
                        className="flex items-center justify-center"
                        style={{
                          width: 20, height: 20, borderRadius: 2,
                          background: 'color-mix(in srgb, var(--t-accent) 20%, transparent)',
                          color: T.accent,
                          fontFamily: MONO, fontSize: 10, fontWeight: 600,
                        }}
                      >
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <Workflow className="w-3.5 h-3.5" style={{ color: T.accent }} />
                      <span
                        className="flex-1 truncate"
                        style={{ color: T.text, fontWeight: 500, fontSize: 12 }}
                      >
                        {flow.name}
                      </span>
                      <MonoTag tone="muted">
                        {flow.type === 'DAG' ? 'DAG' : flow.jobType || 'SIMPLE'}
                      </MonoTag>
                      <button
                        type="button"
                        onClick={() => toggleFlow(flow.id)}
                        style={{ padding: 2, color: T.textSec, background: 'transparent', border: 'none', cursor: 'pointer' }}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  {selectedFlows.length > 1 && (
                    <p style={{ fontFamily: MONO, fontSize: 10, color: T.textMuted, paddingLeft: 4 }}>
                      pipeline: {selectedFlows.map((f) => f.name).join(' → ')}
                    </p>
                  )}
                </div>
              )}

              <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                {isLoadingFlows ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin" style={{ color: T.accent }} />
                  </div>
                ) : unselectedFlows.length > 0 ? (
                  <div className="space-y-1.5">
                    {unselectedFlows.map((flow) => (
                      <button
                        key={flow.id}
                        type="button"
                        onClick={() => toggleFlow(flow.id)}
                        className="flex items-center gap-2 w-full text-left transition"
                        style={{
                          padding: 9, border: `1px solid ${T.border}`, borderRadius: 2,
                          background: 'transparent', cursor: 'pointer',
                        }}
                      >
                        <Plus className="w-3.5 h-3.5 flex-shrink-0" style={{ color: T.textSec }} />
                        <span className="flex-1 truncate" style={{ color: T.text, fontSize: 12 }}>
                          {flow.name}
                        </span>
                        <MonoTag tone="muted">
                          {flow.type === 'DAG' ? 'DAG' : flow.jobType || 'SIMPLE'}
                        </MonoTag>
                        <MonoTag tone={flow.status === 'ACTIVE' ? 'success' : 'muted'}>
                          {flow.status}
                        </MonoTag>
                      </button>
                    ))}
                  </div>
                ) : availableFlows.length === 0 ? (
                  <div className="text-center py-8">
                    <Workflow className="w-7 h-7 mx-auto mb-2" style={{ color: T.textMuted }} />
                    <p style={{ color: T.textSec, fontSize: 12 }}>No flows found</p>
                    <Link
                      href={`/p/${projectId}/flows/new`}
                      style={{ color: T.accent, fontFamily: MONO, fontSize: 11, display: 'inline-block', marginTop: 6, letterSpacing: '0.06em' }}
                    >
                      + CREATE YOUR FIRST FLOW
                    </Link>
                  </div>
                ) : null}
              </div>
            </SchematicPanel>
          </div>
        </div>
      </form>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <SchematicPanel className="mb-3">
      <h3
        style={{
          fontFamily: MONO, fontSize: 10, fontWeight: 600, color: T.textSec,
          marginBottom: 14, letterSpacing: '0.14em', textTransform: 'uppercase',
        }}
      >
        // {title}
      </h3>
      <div className="space-y-3">{children}</div>
    </SchematicPanel>
  );
}

function Field({
  label, hint, required, children,
}: {
  label: string;
  hint?: React.ReactNode;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        style={{
          fontFamily: MONO, fontSize: 10.5, fontWeight: 500, color: T.textSec,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 5, letterSpacing: '0.08em', textTransform: 'uppercase',
        }}
      >
        <span>
          {label} {required && <span style={{ color: T.accent }}>*</span>}
        </span>
        {hint && <span style={{ textTransform: 'none', letterSpacing: 0 }}>{hint}</span>}
      </label>
      {children}
    </div>
  );
}

function Callout({
  color, icon: Icon, label, children,
}: { color: string; icon: React.ElementType; label: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        marginTop: 12, padding: 12,
        background: `color-mix(in srgb, ${color} 8%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 28%, transparent)`,
        borderRadius: 2,
      }}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <Icon className="w-3.5 h-3.5" style={{ color }} />
        <span style={{ fontFamily: MONO, fontSize: 10.5, color, fontWeight: 600, letterSpacing: '0.1em' }}>
          {label}
        </span>
      </div>
      {children}
    </div>
  );
}

function preStyle(): React.CSSProperties {
  return {
    fontFamily: MONO, fontSize: 10.5, color: T.textMuted,
    marginTop: 8, lineHeight: 1.5, whiteSpace: 'pre-wrap', letterSpacing: '0.02em',
  };
}

function inp(): React.CSSProperties {
  return {
    width: '100%',
    background: T.input,
    border: `1px solid ${T.border}`,
    color: T.text,
    borderRadius: 2,
    padding: '8px 12px',
    fontFamily: MONO,
    fontSize: 12,
    outline: 'none',
  };
}
