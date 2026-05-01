'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  ScrollText,
  Search,
  Loader2,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  RefreshCw,
  Filter,
  X,
} from 'lucide-react';

const FONT = "'IBM Plex Sans Thai', 'IBM Plex Sans', sans-serif";
const THEME = {
  bg: 'var(--t-bg)',
  panel: 'var(--t-panel)',
  panelHover: 'var(--t-panel-hover)',
  border: 'var(--t-border)',
  borderLight: 'var(--t-border-light)',
  text: {
    primary: 'var(--t-text)',
    secondary: 'var(--t-text-secondary)',
    muted: 'var(--t-text-muted)',
  },
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
  },
};

interface AuditUser {
  id: string;
  email: string;
  name: string | null;
}

interface AuditLog {
  id: string;
  userId: string | null;
  projectId: string | null;
  action: string;
  resource: string;
  resourceId: string | null;
  oldValue: unknown;
  newValue: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  user: AuditUser | null;
}

interface AuditResponse {
  logs: AuditLog[];
  total: number;
  limit: number;
  offset: number;
  filters: {
    actions: string[];
    users: AuditUser[];
  };
}

const PAGE_SIZE = 50;

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function actionColor(action: string): string {
  if (action.endsWith('.created')) return THEME.colors.emerald;
  if (action.endsWith('.deleted')) return THEME.colors.red;
  if (action.endsWith('.updated')) return THEME.colors.amber;
  if (action.endsWith('.read') || action.endsWith('.viewed')) return THEME.colors.blue;
  return THEME.colors.purple;
}

function truncate(value: unknown, max = 80): string {
  if (value === null || value === undefined) return '';
  let s: string;
  if (typeof value === 'string') s = value;
  else {
    try {
      s = JSON.stringify(value);
    } catch {
      s = String(value);
    }
  }
  if (s.length <= max) return s;
  return s.slice(0, max) + '...';
}

export default function AuditLogPage() {
  const params = useParams();
  const projectId = params?.projectId as string;

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [actions, setActions] = useState<string[]>([]);
  const [users, setUsers] = useState<AuditUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [actionFilter, setActionFilter] = useState<string>('');
  const [userFilter, setUserFilter] = useState<string>('');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [search, setSearch] = useState<string>('');
  const [offset, setOffset] = useState<number>(0);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  const queryString = useMemo(() => {
    const sp = new URLSearchParams();
    sp.set('projectId', projectId);
    sp.set('limit', String(PAGE_SIZE));
    sp.set('offset', String(offset));
    if (actionFilter) sp.set('action', actionFilter);
    if (userFilter) sp.set('userId', userFilter);
    if (fromDate) sp.set('from', new Date(fromDate).toISOString());
    if (toDate) {
      // Use end of day for inclusive range
      const d = new Date(toDate);
      d.setHours(23, 59, 59, 999);
      sp.set('to', d.toISOString());
    }
    if (search) sp.set('search', search);
    return sp.toString();
  }, [projectId, offset, actionFilter, userFilter, fromDate, toDate, search]);

  const fetchLogs = async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/runloop/api/audit-logs?${queryString}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || 'Failed to fetch audit logs');
      }
      const data: AuditResponse = await res.json();
      setLogs(data.logs || []);
      setTotal(data.total || 0);
      setActions(data.filters?.actions || []);
      setUsers(data.filters?.users || []);
    } catch (err) {
      console.error('Failed to fetch audit logs:', err);
      setError(err instanceof Error ? err.message : 'Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryString]);

  const resetFilters = () => {
    setActionFilter('');
    setUserFilter('');
    setFromDate('');
    setToDate('');
    setSearch('');
    setOffset(0);
  };

  const hasActiveFilters =
    !!actionFilter || !!userFilter || !!fromDate || !!toDate || !!search;

  if (!projectId) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: THEME.bg, fontFamily: FONT }}
      >
        <div className="text-center">
          <ScrollText className="w-10 h-10 mx-auto mb-3" style={{ color: THEME.text.muted }} />
          <p style={{ color: THEME.text.secondary }}>Select a project to view audit log</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: THEME.bg, fontFamily: FONT }}>
      {/* Header */}
      <header
        className="sticky top-0 z-30 backdrop-blur-xl"
        style={{ background: `${THEME.bg}cc`, borderBottom: `1px solid ${THEME.border}` }}
      >
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1
                className="text-2xl font-semibold tracking-tight flex items-center gap-2"
                style={{ color: THEME.text.primary }}
              >
                <ScrollText className="w-6 h-6" style={{ color: THEME.accent }} />
                Audit Log
              </h1>
              <p className="text-sm mt-0.5" style={{ color: THEME.text.secondary }}>
                Track every change made in this project
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setOffset(0);
                  fetchLogs();
                }}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-all"
                style={{
                  background: THEME.panel,
                  border: `1px solid ${THEME.border}`,
                  color: THEME.text.secondary,
                }}
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3 mt-6">
            <div className="relative">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
                style={{ color: THEME.text.secondary }}
              />
              <input
                type="text"
                placeholder="Search action, resource, id..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setOffset(0);
                }}
                className="w-72 pl-10 pr-4 py-2 rounded-lg text-sm focus:outline-none transition-all"
                style={{
                  background: THEME.input,
                  border: `1px solid ${THEME.border}`,
                  color: THEME.text.primary,
                }}
              />
            </div>

            <select
              value={actionFilter}
              onChange={(e) => {
                setActionFilter(e.target.value);
                setOffset(0);
              }}
              className="px-3 py-2 rounded-lg text-sm focus:outline-none"
              style={{
                background: THEME.input,
                border: `1px solid ${THEME.border}`,
                color: THEME.text.primary,
              }}
            >
              <option value="">All actions</option>
              {actions.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>

            <select
              value={userFilter}
              onChange={(e) => {
                setUserFilter(e.target.value);
                setOffset(0);
              }}
              className="px-3 py-2 rounded-lg text-sm focus:outline-none"
              style={{
                background: THEME.input,
                border: `1px solid ${THEME.border}`,
                color: THEME.text.primary,
              }}
            >
              <option value="">All users</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.email}
                </option>
              ))}
            </select>

            <div
              className="flex items-center gap-2 px-2 py-1 rounded-lg"
              style={{ background: THEME.input, border: `1px solid ${THEME.border}` }}
            >
              <span className="text-xs" style={{ color: THEME.text.secondary }}>
                From
              </span>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => {
                  setFromDate(e.target.value);
                  setOffset(0);
                }}
                className="bg-transparent text-sm focus:outline-none"
                style={{ color: THEME.text.primary }}
              />
              <span className="text-xs" style={{ color: THEME.text.secondary }}>
                To
              </span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => {
                  setToDate(e.target.value);
                  setOffset(0);
                }}
                className="bg-transparent text-sm focus:outline-none"
                style={{ color: THEME.text.primary }}
              />
            </div>

            {hasActiveFilters && (
              <button
                onClick={resetFilters}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg transition-all"
                style={{ color: THEME.text.secondary }}
              >
                <X className="w-4 h-4" />
                Clear filters
              </button>
            )}

            <div className="ml-auto flex items-center gap-2 text-sm">
              <Filter className="w-4 h-4" style={{ color: THEME.text.muted }} />
              <span style={{ color: THEME.text.secondary }}>{total} entries</span>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-6 py-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin" style={{ color: THEME.accent }} />
          </div>
        ) : error ? (
          <div className="text-center py-20">
            <AlertCircle
              className="w-12 h-12 mx-auto mb-4"
              style={{ color: THEME.colors.red }}
            />
            <h3 className="text-xl font-semibold mb-2" style={{ color: THEME.text.primary }}>
              Failed to load audit log
            </h3>
            <p className="mb-4" style={{ color: THEME.text.secondary }}>
              {error}
            </p>
            <button
              onClick={fetchLogs}
              className="inline-flex items-center gap-2 px-4 py-2 text-white text-sm font-medium rounded-lg transition-all"
              style={{ background: THEME.accent }}
            >
              Try Again
            </button>
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-20">
            <div
              className="w-20 h-20 mx-auto mb-6 rounded-2xl flex items-center justify-center"
              style={{ background: THEME.panel, border: `1px solid ${THEME.border}` }}
            >
              <ScrollText className="w-10 h-10" style={{ color: THEME.text.muted }} />
            </div>
            <h3 className="text-xl font-semibold mb-2" style={{ color: THEME.text.primary }}>
              No audit log entries
            </h3>
            <p style={{ color: THEME.text.secondary }}>
              {hasActiveFilters
                ? 'Try adjusting your filters.'
                : 'Actions taken in this project will be logged here.'}
            </p>
          </div>
        ) : (
          <>
            <div
              className="rounded-xl overflow-hidden"
              style={{ background: THEME.panel, border: `1px solid ${THEME.border}` }}
            >
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: THEME.bg, borderBottom: `1px solid ${THEME.border}` }}>
                    <th
                      className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider w-8"
                      style={{ color: THEME.text.secondary }}
                    />
                    <th
                      className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider"
                      style={{ color: THEME.text.secondary }}
                    >
                      Timestamp
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider"
                      style={{ color: THEME.text.secondary }}
                    >
                      User
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider"
                      style={{ color: THEME.text.secondary }}
                    >
                      Action
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider"
                      style={{ color: THEME.text.secondary }}
                    >
                      Resource
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider"
                      style={{ color: THEME.text.secondary }}
                    >
                      Details
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider"
                      style={{ color: THEME.text.secondary }}
                    >
                      IP
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => {
                    const isOpen = !!expanded[log.id];
                    const details = log.newValue ?? log.oldValue ?? null;
                    const hasDetails =
                      details !== null && details !== undefined && details !== '';
                    return (
                      <React.Fragment key={log.id}>
                        <tr
                          className="transition-colors"
                          style={{ borderTop: `1px solid ${THEME.borderLight}` }}
                        >
                          <td className="px-4 py-3 align-top">
                            {hasDetails ? (
                              <button
                                onClick={() =>
                                  setExpanded((prev) => ({
                                    ...prev,
                                    [log.id]: !prev[log.id],
                                  }))
                                }
                                className="p-1 rounded transition-colors"
                                style={{ color: THEME.text.secondary }}
                                title={isOpen ? 'Collapse' : 'Expand'}
                              >
                                {isOpen ? (
                                  <ChevronDown className="w-4 h-4" />
                                ) : (
                                  <ChevronRight className="w-4 h-4" />
                                )}
                              </button>
                            ) : null}
                          </td>
                          <td
                            className="px-4 py-3 align-top whitespace-nowrap font-mono text-xs"
                            style={{ color: THEME.text.primary }}
                          >
                            {formatTimestamp(log.createdAt)}
                          </td>
                          <td className="px-4 py-3 align-top" style={{ color: THEME.text.primary }}>
                            {log.user ? (
                              <div>
                                <div style={{ color: THEME.text.primary }}>
                                  {log.user.email}
                                </div>
                                {log.user.name && (
                                  <div
                                    className="text-xs mt-0.5"
                                    style={{ color: THEME.text.muted }}
                                  >
                                    {log.user.name}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span style={{ color: THEME.text.muted }}>system</span>
                            )}
                          </td>
                          <td className="px-4 py-3 align-top whitespace-nowrap">
                            <span
                              className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                              style={{
                                background: `${actionColor(log.action)}15`,
                                color: actionColor(log.action),
                                border: `1px solid ${actionColor(log.action)}30`,
                              }}
                            >
                              {log.action}
                            </span>
                          </td>
                          <td className="px-4 py-3 align-top" style={{ color: THEME.text.primary }}>
                            <div>{log.resource}</div>
                            {log.resourceId && (
                              <div
                                className="text-xs mt-0.5 font-mono"
                                style={{ color: THEME.text.muted }}
                              >
                                {log.resourceId}
                              </div>
                            )}
                          </td>
                          <td
                            className="px-4 py-3 align-top font-mono text-xs"
                            style={{ color: THEME.text.secondary }}
                          >
                            {hasDetails ? truncate(details, 80) : '—'}
                          </td>
                          <td
                            className="px-4 py-3 align-top whitespace-nowrap font-mono text-xs"
                            style={{ color: THEME.text.secondary }}
                          >
                            {log.ipAddress || '—'}
                          </td>
                        </tr>
                        {isOpen && hasDetails && (
                          <tr style={{ background: THEME.bg }}>
                            <td colSpan={7} className="px-4 py-3">
                              <pre
                                className="text-xs font-mono p-3 rounded-lg overflow-auto"
                                style={{
                                  background: THEME.input,
                                  border: `1px solid ${THEME.border}`,
                                  color: THEME.text.primary,
                                  maxHeight: 360,
                                }}
                              >
                                {JSON.stringify(details, null, 2)}
                              </pre>
                              {log.userAgent && (
                                <div
                                  className="text-xs mt-2 font-mono"
                                  style={{ color: THEME.text.muted }}
                                >
                                  User-Agent: {log.userAgent}
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between mt-4">
              <div className="text-sm" style={{ color: THEME.text.secondary }}>
                Page {currentPage} of {totalPages}
              </div>
              <div className="flex items-center gap-2">
                <button
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                  className="inline-flex items-center gap-1 px-3 py-2 text-sm rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  style={{
                    background: THEME.panel,
                    border: `1px solid ${THEME.border}`,
                    color: THEME.text.primary,
                  }}
                >
                  <ChevronLeft className="w-4 h-4" />
                  Previous
                </button>
                <button
                  disabled={offset + PAGE_SIZE >= total}
                  onClick={() => setOffset(offset + PAGE_SIZE)}
                  className="inline-flex items-center gap-1 px-3 py-2 text-sm rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  style={{
                    background: THEME.panel,
                    border: `1px solid ${THEME.border}`,
                    color: THEME.text.primary,
                  }}
                >
                  Next
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
