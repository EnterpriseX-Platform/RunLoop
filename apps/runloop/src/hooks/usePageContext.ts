'use client';

// usePageContext — derives a short, human-readable description of what
// the user is looking at and (when applicable) fetches enough live data
// from the engine to ground an AI answer. Result is fed into the system
// prompt of /api/ai/chat so questions like "why did this fail?" /
// "what does this flow do?" can answer from real state instead of guesswork.
//
// Scope intentionally narrow:
//   * Only reads data the user already sees on screen.
//   * Caps any payload at ~2 KB so we don't blow the model's context.
//   * One round-trip per page change; cached until path or projectId changes.

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

export interface PageContext {
  // Short label for the chip — e.g. "execution etx05u…" or "flow BPN03 load 0400".
  label: string;
  // Multi-line text appended to the system prompt. Empty when there's
  // nothing relevant (login page, generic dashboard, etc.).
  prompt: string;
  loading: boolean;
}

const MAX_LEN = 2000;

function truncate(s: string, max = MAX_LEN) {
  return s.length > max ? s.slice(0, max) + '\n…(truncated)' : s;
}

async function fetchJSON(url: string): Promise<any | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

export function usePageContext(projectId?: string): PageContext {
  const pathname = usePathname() || '';
  const [ctx, setCtx] = useState<PageContext>({ label: '', prompt: '', loading: false });

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      // ─── Execution detail: /p/{pid}/executions/{id} ────────────────
      const execMatch = pathname.match(/\/p\/[^/]+\/executions\/([^/?#]+)/);
      if (execMatch) {
        setCtx({ label: 'loading…', prompt: '', loading: true });
        const data = await fetchJSON(`/runloop/api/executions/${execMatch[1]}`);
        if (cancelled) return;
        const e = data?.data || data;
        if (!e) {
          setCtx({ label: `execution ${execMatch[1].slice(0, 8)}…`, prompt: '', loading: false });
          return;
        }
        const prompt = truncate(
          [
            `## Current page: execution detail`,
            `id: ${e.id}`,
            `status: ${e.status}`,
            `triggerType: ${e.triggerType}`,
            `durationMs: ${e.durationMs}`,
            `startedAt: ${e.startedAt}  completedAt: ${e.completedAt || '(running)'}`,
            e.error ? `error: ${e.error}` : '',
            e.logs ? `logs:\n${e.logs}` : '',
          ].filter(Boolean).join('\n'),
        );
        setCtx({ label: `execution ${e.id.slice(0, 8)}… (${e.status})`, prompt, loading: false });
        return;
      }

      // ─── Flow detail: /p/{pid}/flows/{id} ──────────────────────────
      const flowMatch = pathname.match(/\/p\/[^/]+\/flows\/([^/?#]+)/);
      if (flowMatch && flowMatch[1] !== 'new') {
        setCtx({ label: 'loading…', prompt: '', loading: true });
        const data = await fetchJSON(`/runloop/api/flows/${flowMatch[1]}`);
        if (cancelled) return;
        const f = data?.data || data;
        if (!f) {
          setCtx({ label: `flow ${flowMatch[1].slice(0, 8)}…`, prompt: '', loading: false });
          return;
        }
        const nodes = (f.flowConfig?.nodes || []).map(
          (n: any) => `  - ${n.id} (${n.type}) ${n.name || ''}`,
        ).join('\n');
        const edges = (f.flowConfig?.edges || []).map(
          (ed: any) => `  - ${ed.source} → ${ed.target} [${ed.condition || 'ON_SUCCESS'}]`,
        ).join('\n');
        const prompt = truncate(
          [
            `## Current page: flow detail`,
            `name: ${f.name}`,
            `type: ${f.type}`,
            `description: ${f.description || '(none)'}`,
            ``,
            `nodes (${(f.flowConfig?.nodes || []).length}):`,
            nodes || '  (none)',
            ``,
            `edges (${(f.flowConfig?.edges || []).length}):`,
            edges || '  (none)',
          ].join('\n'),
        );
        setCtx({ label: `flow ${f.name}`, prompt, loading: false });
        return;
      }

      // ─── Scheduler detail: /p/{pid}/schedulers/{id} ───────────────
      const schedMatch = pathname.match(/\/p\/[^/]+\/schedulers\/([^/?#]+)/);
      if (schedMatch && schedMatch[1] !== 'new') {
        setCtx({ label: 'loading…', prompt: '', loading: true });
        const data = await fetchJSON(`/runloop/api/schedulers/${schedMatch[1]}`);
        if (cancelled) return;
        const s = data?.data || data;
        if (!s) {
          setCtx({ label: `scheduler ${schedMatch[1].slice(0, 8)}…`, prompt: '', loading: false });
          return;
        }
        const prompt = truncate(
          [
            `## Current page: scheduler detail`,
            `name: ${s.name}`,
            `triggerType: ${s.triggerType}`,
            `cron: ${s.cronExpression || '(none)'}`,
            `timezone: ${s.timezone || 'UTC'}`,
            `status: ${s.status}`,
            `jobType: ${s.jobType}`,
            s.config ? `config: ${JSON.stringify(s.config).slice(0, 600)}` : '',
          ].filter(Boolean).join('\n'),
        );
        setCtx({ label: `scheduler ${s.name}`, prompt, loading: false });
        return;
      }

      // ─── Queue detail: /p/{pid}/queues/{name} ─────────────────────
      const queueMatch = pathname.match(/\/p\/[^/]+\/queues\/([^/?#]+)/);
      if (queueMatch && queueMatch[1] !== 'new') {
        setCtx({ label: 'loading…', prompt: '', loading: true });
        const [qd, jd] = await Promise.all([
          fetchJSON(`/runloop/api/queues?projectId=${projectId || ''}`),
          fetchJSON(`/runloop/api/queues/${queueMatch[1]}/jobs`),
        ]);
        if (cancelled) return;
        const q = (qd?.data || []).find((x: any) => x.name === queueMatch[1]);
        const jobs = (jd?.data || []).slice(0, 5);
        const prompt = truncate(
          [
            `## Current page: queue detail`,
            q ? `name: ${q.name}  backend: ${q.backend}  flowId: ${q.flowId}  concurrency: ${q.concurrency}  enabled: ${q.enabled}` : `name: ${queueMatch[1]}`,
            ``,
            `recent jobs (${jobs.length}):`,
            jobs.map((j: any) => `  - ${j.id} ${j.status} attempts=${j.attempts}${j.lastError ? ' err=' + j.lastError.slice(0, 80) : ''}`).join('\n') || '  (none)',
          ].join('\n'),
        );
        setCtx({ label: `queue ${queueMatch[1]}`, prompt, loading: false });
        return;
      }

      // ─── Channels list ────────────────────────────────────────────
      if (pathname.match(/\/p\/[^/]+\/channels$/)) {
        setCtx({ label: 'loading…', prompt: '', loading: true });
        const data = await fetchJSON(`/runloop/api/channels?projectId=${projectId || ''}`);
        if (cancelled) return;
        const channels = data?.data || [];
        const prompt = truncate(
          [
            `## Current page: pub/sub channels`,
            `active channels (${channels.length}):`,
            channels.map((c: any) => `  - ${c.name}: ${c.subscribers} live subscribers`).join('\n') || '  (none)',
          ].join('\n'),
        );
        setCtx({ label: `channels (${channels.length})`, prompt, loading: false });
        return;
      }

      // ─── DLQ filter on Executions ─────────────────────────────────
      if (pathname.match(/\/executions\?.*filter=needs_review/) || pathname.includes('filter=needs_review')) {
        setCtx({ label: 'DLQ', prompt: '## Current page: dead letter queue (needs review)', loading: false });
        return;
      }

      // ─── Generic fallback ─────────────────────────────────────────
      setCtx({ label: '', prompt: '', loading: false });
    };
    run();
    return () => { cancelled = true; };
  }, [pathname, projectId]);

  return ctx;
}
