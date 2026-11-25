'use client';
import { BASE_PATH } from '@/lib/base-path';

import { useEffect, useState, useCallback, useRef, useMemo, Fragment } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useProject } from '@/context/ProjectContext';
import {
  DataTable,
  Table,
  TableContainer,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  TableToolbar,
  TableToolbarContent,
  TableToolbarSearch,
  TableBatchActions,
  TableBatchAction,
  TableSelectAll,
  TableSelectRow,
  TableExpandHeader,
  TableExpandRow,
  TableExpandedRow,
  Tabs,
  TabList,
  Tab,
  Accordion,
  AccordionItem,
  Button,
  Tag,
  Loading,
} from '@carbon/react';
import {
  Renew,
  TrashCan,
  CheckmarkFilled,
  MisuseOutline,
  Calendar,
  Terminal as TerminalIcon,
  Webhook,
  TouchInteraction,
  Launch,
  WarningAlt,
} from '@carbon/icons-react';
import type { Execution } from '@/types';

const FONT = "'IBM Plex Sans Thai', 'IBM Plex Sans', sans-serif";
const MONO = "'IBM Plex Mono', monospace";
import { HeroHeader, MetricChip } from '@/components/ControlChrome';

type TagType = 'green' | 'red' | 'blue' | 'gray' | 'warm-gray' | 'magenta' | 'purple' | 'cyan' | 'teal' | 'cool-gray';

const statusTag: Record<string, { type: TagType; label: string }> = {
  SUCCESS: { type: 'green', label: 'Success' },
  FAILED: { type: 'red', label: 'Failed' },
  RUNNING: { type: 'blue', label: 'Running' },
  PENDING: { type: 'warm-gray', label: 'Pending' },
  CANCELLED: { type: 'gray', label: 'Cancelled' },
  TIMEOUT: { type: 'red', label: 'Timeout' },
};

const triggerIcon: Record<string, typeof Calendar> = {
  SCHEDULE: Calendar,
  MANUAL: TouchInteraction,
  WEBHOOK: Webhook,
  API: TerminalIcon,
};

function relativeTime(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  if (diffMs < 0) return 'just now';
  const s = Math.floor(diffMs / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  const w = Math.floor(d / 7);
  if (w < 4) return `${w}w ago`;
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

function queueNameFromSchedulerId(id?: string): string | null {
  if (!id) return null;
  if (id.startsWith('queue:')) return `Queue: ${id.slice(6)}`;
  return null;
}

function syntheticLabel(e: { schedulerId?: string; triggerType?: string }): string | null {
  if (e.schedulerId?.startsWith('dryrun_')) return 'Dry-run';
  if (e.schedulerId?.startsWith('webhook_')) return 'Webhook';
  switch (e.triggerType) {
    case 'WEBHOOK': return 'Webhook trigger';
    case 'API': return 'API trigger';
    case 'MANUAL': return 'Manual run';
    case 'QUEUE': return 'Queue trigger';
    default: return null;
  }
}

function runName(e: Execution): string {
  return (
    queueNameFromSchedulerId(e.schedulerId) ||
    e.schedulerName ||
    e.runloop?.name ||
    syntheticLabel(e) ||
    'Untitled run'
  );
}

const STATUS_TABS = ['All', 'Running', 'Success', 'Failed', 'Pending', 'Needs Review'] as const;

const HEADERS = [
  { key: 'run', header: 'Run' },
  { key: 'trigger', header: 'Trigger' },
  { key: 'status', header: 'Status' },
];
const COL_WIDTH: Record<string, string | undefined> = { run: 'auto', trigger: '160px', status: '140px' };

interface DLQEntry {
  id: string;
  execution_id: string;
  scheduler_id: string;
  project_id: string;
  reason: string;
  error_message: string;
  retry_count: number;
  node_id?: string;
  node_type?: string;
  status: 'PENDING' | 'REVIEWING' | 'RESOLVED' | 'DISCARDED' | 'REPLAYED';
  created_at: string;
}

export default function ExecutionsPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const router = useRouter();
  const { selectedProject } = useProject();
  const searchParams = useSearchParams();
  const initialFilter = searchParams?.get('filter') === 'needs_review' ? 'Needs Review' : 'All';
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>(initialFilter);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const [dlqEntries, setDlqEntries] = useState<DLQEntry[]>([]);
  const [dlqLoading, setDlqLoading] = useState(false);
  const [dlqActingOn, setDlqActingOn] = useState<string | null>(null);

  const fetchExecutions = useCallback(async () => {
    try {
      const qs = projectId ? `?projectId=${projectId}` : '';
      const res = await fetch(`${BASE_PATH}/api/executions${qs}`);
      if (res.ok) {
        const data = await res.json();
        setExecutions(data.data || []);
      }
    } catch (error) {
      console.error('Failed to fetch executions:', error);
    } finally {
      setIsLoading(false);
    }
  }, [selectedProject]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchDLQ = useCallback(async () => {
    if (!projectId) return;
    setDlqLoading(true);
    try {
      const [pending, reviewing] = await Promise.all([
        fetch(`${BASE_PATH}/api/dlq?projectId=${projectId}&status=PENDING&limit=200`),
        fetch(`${BASE_PATH}/api/dlq?projectId=${projectId}&status=REVIEWING&limit=200`),
      ]);
      const combined: DLQEntry[] = [];
      if (pending.ok) combined.push(...(((await pending.json()).data as DLQEntry[]) || []));
      if (reviewing.ok) combined.push(...(((await reviewing.json()).data as DLQEntry[]) || []));
      combined.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
      setDlqEntries(combined);
    } finally {
      setDlqLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchExecutions(); }, [fetchExecutions]);
  useEffect(() => { if (filterStatus === 'Needs Review') fetchDLQ(); }, [filterStatus, fetchDLQ]);
  useEffect(() => {
    if (autoRefresh) intervalRef.current = setInterval(fetchExecutions, 5000);
    else if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [autoRefresh, fetchExecutions]);

  const bulkAction = async (kind: 'bulk-delete' | 'bulk-retry', ids: string[]) => {
    if (ids.length === 0) return;
    const verb = kind === 'bulk-delete' ? 'Delete' : 'Retry';
    if (!confirm(`${verb} ${ids.length} execution(s)?${kind === 'bulk-delete' ? ' This cannot be undone.' : ''}`)) return;
    const res = await fetch(`${BASE_PATH}/api/executions/${kind}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }),
    });
    if (res.ok) fetchExecutions();
    else alert(`Bulk ${verb.toLowerCase()} failed`);
  };

  const replayDLQ = async (id: string) => {
    setDlqActingOn(id);
    try {
      const res = await fetch(`${BASE_PATH}/api/dlq/${id}/replay`, { method: 'POST' });
      if (!res.ok) { const e = await res.json().catch(() => ({})); alert(`Replay failed: ${e.error || res.statusText}`); return; }
      await fetchDLQ();
    } finally { setDlqActingOn(null); }
  };
  const discardDLQ = async (id: string) => {
    if (!confirm('Discard this entry? It will be removed from Needs Review.')) return;
    setDlqActingOn(id);
    try {
      const res = await fetch(`${BASE_PATH}/api/dlq/${id}/discard`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: 'discarded by operator' }),
      });
      if (!res.ok) { alert('Discard failed'); return; }
      await fetchDLQ();
    } finally { setDlqActingOn(null); }
  };

  const totalCount = executions.length;
  const successCount = executions.filter((e) => e.status === 'SUCCESS').length;
  const failedCount = executions.filter((e) => e.status === 'FAILED').length;
  const successRate = totalCount > 0 ? ((successCount / totalCount) * 100).toFixed(1) : '0.0';
  const withDuration = executions.filter((e) => e.durationMs);
  const avgDuration = withDuration.length > 0
    ? Math.round(withDuration.reduce((sum, e) => sum + (e.durationMs || 0), 0) / withDuration.length)
    : 0;

  const isReviewMode = filterStatus === 'Needs Review';

  const filtered = useMemo(() => executions.filter((e) => {
    const matchesSearch = (e.runloop?.name || e.id || '').toLowerCase().includes(searchQuery.toLowerCase());
    let matchesFilter = true;
    if (filterStatus === 'Needs Review') matchesFilter = ['FAILED', 'TIMEOUT'].includes(e.status);
    else if (filterStatus !== 'All') matchesFilter = e.status.toLowerCase() === filterStatus.toLowerCase();
    return matchesSearch && matchesFilter;
  }), [executions, searchQuery, filterStatus]);

  const byId = useMemo(() => Object.fromEntries(executions.map((e) => [e.id, e])), [executions]);

  const rows = filtered.map((e) => ({
    id: e.id,
    run: runName(e),
    trigger: e.triggerType.charAt(0) + e.triggerType.slice(1).toLowerCase(),
    status: e.status,
  }));

  return (
    <div style={{ fontFamily: FONT }}>
      <HeroHeader
        title="Executions"
        subtitle="Every run, every node, every millisecond — the raw log of what the engine actually did."
        metrics={
          <>
            <MetricChip label="total" value={String(totalCount)} />
            <MetricChip label="success" value={`${successRate}%`} />
            <MetricChip label="failed" value={String(failedCount)} />
            <MetricChip label="avg" value={formatDuration(avgDuration)} />
          </>
        }
      />

      <div className="mb-4" style={{ overflowX: 'auto' }}>
        <Tabs
          selectedIndex={Math.max(0, STATUS_TABS.indexOf(filterStatus as (typeof STATUS_TABS)[number]))}
          onChange={({ selectedIndex }) => setFilterStatus(STATUS_TABS[selectedIndex] as string)}
        >
          <TabList aria-label="Filter executions by status">
            {STATUS_TABS.map((t) => <Tab key={t}>{t}</Tab>)}
          </TabList>
        </Tabs>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center" style={{ height: 240 }}>
          <Loading withOverlay={false} description="Loading executions" />
        </div>
      ) : isReviewMode ? (
        <NeedsReview
          loading={dlqLoading}
          entries={dlqEntries}
          actingOn={dlqActingOn}
          projectId={projectId}
          onReplay={replayDLQ}
          onDiscard={discardDLQ}
        />
      ) : (
        <DataTable rows={rows} headers={HEADERS} isSortable>
          {({
            rows: dtRows, headers, getHeaderProps, getRowProps, getSelectionProps,
            getBatchActionProps, getTableProps, getTableContainerProps, getExpandHeaderProps,
            getExpandedRowProps, selectedRows,
          }) => {
            const batch = getBatchActionProps();
            const selectedIds = selectedRows.map((r) => r.id);
            return (
              <TableContainer {...getTableContainerProps()}>
                <TableToolbar>
                  <TableBatchActions {...batch}>
                    <TableBatchAction renderIcon={Renew} onClick={() => { bulkAction('bulk-retry', selectedIds); batch.onCancel(); }}>
                      Retry
                    </TableBatchAction>
                    <TableBatchAction renderIcon={TrashCan} onClick={() => { bulkAction('bulk-delete', selectedIds); batch.onCancel(); }}>
                      Delete
                    </TableBatchAction>
                  </TableBatchActions>
                  <TableToolbarContent>
                    <TableToolbarSearch
                      persistent
                      placeholder="Search by name or ID"
                      onChange={(e) => setSearchQuery(e && 'target' in e ? (e.target as HTMLInputElement).value : '')}
                    />
                    <Button
                      kind={autoRefresh ? 'primary' : 'ghost'}
                      size="lg"
                      renderIcon={Renew}
                      onClick={() => setAutoRefresh((v) => !v)}
                    >
                      Auto
                    </Button>
                  </TableToolbarContent>
                </TableToolbar>
                <Table {...getTableProps()} size="md" useZebraStyles={false}>
                  <TableHead>
                    <TableRow>
                      <TableExpandHeader enableToggle {...getExpandHeaderProps()} />
                      <TableSelectAll {...getSelectionProps()} />
                      {headers.map((header) => {
                        const { key, ...rest } = getHeaderProps({ header });
                        return <TableHeader key={header.key} {...rest} style={{ width: COL_WIDTH[header.key] }}>{header.header}</TableHeader>;
                      })}
                      <TableHeader style={{ width: 48 }} aria-label="Open" />
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {dtRows.map((row) => {
                      const e = byId[row.id];
                      const { key, ...rowProps } = getRowProps({ row });
                      const { key: selKey, ...selProps } = getSelectionProps({ row });
                      const TriggerIcon = e ? (triggerIcon[e.triggerType] || TouchInteraction) : TouchInteraction;
                      return (
                        <Fragment key={row.id}>
                          <TableExpandRow {...rowProps}>
                            <TableSelectRow {...selProps} />
                            {row.cells.map((cell) => {
                              if (cell.info.header === 'run') {
                                return (
                                  <TableCell key={cell.id}>
                                    <div className="rl-ellipsis" style={{ fontWeight: 600, color: 'var(--cds-text-primary)' }} title={row.cells[0].value}>
                                      {row.cells[0].value}
                                    </div>
                                    <div style={{ fontSize: 12, color: 'var(--cds-text-secondary)', marginTop: 2 }}>
                                      {e ? relativeTime(e.startedAt) : ''}
                                      {e && e.durationMs != null ? ` · ${formatDuration(e.durationMs)}` : ''}
                                    </div>
                                  </TableCell>
                                );
                              }
                              if (cell.info.header === 'trigger') {
                                return (
                                  <TableCell key={cell.id}>
                                    <span className="flex items-center gap-2" style={{ color: 'var(--cds-text-secondary)' }}>
                                      <TriggerIcon size={16} /> {cell.value}
                                    </span>
                                  </TableCell>
                                );
                              }
                              if (cell.info.header === 'status') {
                                const st = statusTag[cell.value] ?? statusTag.PENDING;
                                return <TableCell key={cell.id}><Tag type={st.type} size="sm">{st.label}</Tag></TableCell>;
                              }
                              return <TableCell key={cell.id}>{cell.value}</TableCell>;
                            })}
                            <TableCell>
                              <Button
                                kind="ghost" size="sm" hasIconOnly renderIcon={Launch} iconDescription="Open run"
                                onClick={(ev) => { ev.stopPropagation(); router.push(`/p/${projectId}/executions/${row.id}`); }}
                              />
                            </TableCell>
                          </TableExpandRow>
                          <TableExpandedRow colSpan={headers.length + 3} {...getExpandedRowProps({ row })}>
                            {e && <ExpandedDetail e={e} />}
                          </TableExpandedRow>
                        </Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
                {dtRows.length === 0 && (
                  <div className="text-center" style={{ padding: '48px 0' }}>
                    <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>No executions found</h3>
                    <p style={{ fontSize: 13, color: 'var(--cds-text-secondary)' }}>
                      {searchQuery || filterStatus !== 'All' ? 'Try adjusting your filters' : 'Run a runloop to see executions here'}
                    </p>
                  </div>
                )}
              </TableContainer>
            );
          }}
        </DataTable>
      )}

      {!isReviewMode && !isLoading && filtered.length > 0 && (
        <div style={{ fontSize: 12, color: 'var(--cds-text-secondary)', marginTop: 10, textAlign: 'right' }}>
          Showing {filtered.length} of {totalCount} execution{totalCount !== 1 ? 's' : ''}
          {autoRefresh && <span style={{ color: 'var(--cds-support-success)', marginLeft: 8 }}>Auto-refreshing every 5s</span>}
        </div>
      )}
    </div>
  );
}

function ExpandedDetail({ e }: { e: Execution }) {
  const pre = (body: React.ReactNode, tone?: 'error') => (
    <pre style={{ fontSize: 11.5, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: MONO, lineHeight: 1.6, color: tone === 'error' ? 'var(--cds-text-error)' : 'var(--cds-text-secondary)' }}>{body}</pre>
  );
  const hasOutput = e.output && Object.keys(e.output).length > 0;
  return (
    <Accordion align="start" size="sm">
      {e.errorMessage && (
        <AccordionItem
          open
          title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--cds-text-error)', fontWeight: 600 }}><WarningAlt size={14} /> Error</span>}
        >
          <div style={{ boxShadow: 'inset 3px 0 0 var(--cds-support-error, #da1e28)', background: 'var(--cds-notification-background-error, #fff1f1)', padding: '10px 14px' }}>{pre(e.errorMessage, 'error')}</div>
        </AccordionItem>
      )}
      {e.logs && <AccordionItem title="Logs">{pre(e.logs)}</AccordionItem>}
      {hasOutput && <AccordionItem title="Output">{pre(JSON.stringify(e.output, null, 2))}</AccordionItem>}
      <AccordionItem open={!e.errorMessage && !e.logs && !hasOutput} title="Details">
        <div className="flex items-center gap-4 flex-wrap" style={{ fontSize: 12, color: 'var(--cds-text-secondary)' }}>
          <span>ID: <span style={{ fontFamily: MONO, color: 'var(--cds-text-primary)' }}>{e.id}</span></span>
          {e.workerId && <span>Worker: <span style={{ fontFamily: MONO, color: 'var(--cds-text-primary)' }}>{e.workerId}</span></span>}
          {e.retryAttempt > 0 && <span>Retry: #{e.retryAttempt}</span>}
          <span>Started: {new Date(e.startedAt).toLocaleString()}</span>
          {e.completedAt && <span>Completed: {new Date(e.completedAt).toLocaleString()}</span>}
        </div>
      </AccordionItem>
    </Accordion>
  );
}

function NeedsReview({
  loading, entries, actingOn, projectId, onReplay, onDiscard,
}: {
  loading: boolean; entries: DLQEntry[]; actingOn: string | null; projectId: string;
  onReplay: (id: string) => void; onDiscard: (id: string) => void;
}) {
  if (loading) {
    return <div className="flex items-center justify-center" style={{ height: 160 }}><Loading withOverlay={false} description="Loading dead-letter queue" /></div>;
  }
  if (entries.length === 0) {
    return (
      <div className="text-center" style={{ padding: '64px 0' }}>
        <CheckmarkFilled size={32} style={{ color: 'var(--cds-support-success)', marginBottom: 12 }} />
        <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Nothing to review</h3>
        <p style={{ fontSize: 13, color: 'var(--cds-text-secondary)' }}>Items appear here when an execution exhausts retries or trips a circuit breaker.</p>
      </div>
    );
  }
  return (
    <div style={{ background: 'var(--cds-layer-01)' }}>
      {entries.map((entry, i) => {
        const source = entry.scheduler_id?.startsWith('queue:') ? `queue · ${entry.scheduler_id.slice(6)}` : `scheduler · ${entry.scheduler_id}`;
        const acting = actingOn === entry.id;
        return (
          <div key={entry.id} className="flex items-start gap-4" style={{ padding: '16px', borderTop: i > 0 ? '1px solid var(--cds-border-subtle)' : 'none' }}>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <Tag type="red" size="sm">{String(entry.reason || '').replace(/_/g, ' ')}</Tag>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{entry.node_id ? `Step ${entry.node_id}` : 'Flow run'}</span>
                {entry.node_type && <Tag type="gray" size="sm">{entry.node_type}</Tag>}
              </div>
              <div style={{ fontSize: 14, marginBottom: 4 }}>{entry.error_message || '—'}</div>
              <div className="flex items-center gap-3 flex-wrap" style={{ fontSize: 12, color: 'var(--cds-text-secondary)' }}>
                <span>{source}</span>
                <span>{entry.retry_count} retries</span>
                <span>{relativeTime(entry.created_at)}</span>
                <Link href={`/p/${projectId}/executions/${entry.execution_id}`} style={{ color: 'var(--cds-link-primary)' }}>View run</Link>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button kind="tertiary" size="sm" renderIcon={Renew} disabled={acting} onClick={() => onReplay(entry.id)}>Replay</Button>
              <Button kind="ghost" size="sm" renderIcon={MisuseOutline} disabled={acting} onClick={() => onDiscard(entry.id)}>Discard</Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
