'use client';
import { BASE_PATH } from '@/lib/base-path';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
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
  ContentSwitcher,
  Switch,
  Button,
  Tag,
  Loading,
} from '@carbon/react';
import { Add, Flow as FlowIcon, WarningAlt } from '@carbon/icons-react';
import { useProject } from '@/context/ProjectContext';
import type { Flow, FlowStatus, FlowType } from '@/types';
import { HeroHeader, MetricChip } from '@/components/ControlChrome';

const FONT = "'IBM Plex Sans Thai', 'IBM Plex Sans', sans-serif";

const statusTag: Record<FlowStatus, { type: 'green' | 'gray' | 'warm-gray'; label: string }> = {
  ACTIVE: { type: 'green', label: 'Active' },
  INACTIVE: { type: 'gray', label: 'Inactive' },
  DRAFT: { type: 'warm-gray', label: 'Draft' },
};

const typeLabel: Record<FlowType, string> = { SIMPLE: 'Simple', DAG: 'DAG' };

const HEADERS = [
  { key: 'name', header: 'Flow' },
  { key: 'status', header: 'Status' },
  { key: 'type', header: 'Type' },
  { key: 'created', header: 'Created' },
];

export default function FlowsPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const router = useRouter();
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
      const qs = projectId ? `?projectId=${projectId}` : '';
      const res = await fetch(`${BASE_PATH}/api/flows${qs}`);
      if (!res.ok) throw new Error('Failed to fetch flows');
      const data = await res.json();
      setFlows(data.data || []);
    } catch (err) {
      console.error('Failed to fetch flows:', err);
      setError(err instanceof Error ? err.message : 'Failed to load flows');
    } finally {
      setIsLoading(false);
    }
  }, [selectedProject]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchFlows();
  }, [fetchFlows]);

  const filtered = useMemo(
    () =>
      flows.filter((f) => {
        const q = searchQuery.toLowerCase();
        const matchesSearch =
          f.name.toLowerCase().includes(q) || (f.description || '').toLowerCase().includes(q);
        const matchesFilter =
          filterStatus === 'All' || f.status.toLowerCase() === filterStatus.toLowerCase();
        return matchesSearch && matchesFilter;
      }),
    [flows, searchQuery, filterStatus]
  );

  // DataTable rows: cell values are rendered below by key.
  const rows = filtered.map((f) => ({
    id: f.id,
    name: f.name,
    description: f.description || `${typeLabel[f.type]} flow`,
    status: f.status,
    type: typeLabel[f.type],
    created: new Date(f.createdAt).toLocaleDateString(),
  }));

  const activeCount = flows.filter((f) => f.status === 'ACTIVE').length;
  const draftCount = flows.filter((f) => f.status === 'DRAFT').length;

  return (
    <div style={{ fontFamily: FONT }}>
      <HeroHeader
        title="Flows"
        subtitle="Build and manage workflow pipelines — drag nodes, wire edges, schedule runs."
        metrics={
          <>
            <MetricChip label="active" value={String(activeCount)} />
            <MetricChip label="draft" value={String(draftCount)} />
            <MetricChip label="total" value={String(activeCount + draftCount)} />
          </>
        }
        right={
          <Button
            renderIcon={Add}
            size="md"
            onClick={() => router.push(`/p/${projectId}/flows/new`)}
          >
            New Flow
          </Button>
        }
      />

      <div className="mb-4" style={{ maxWidth: 320 }}>
        <ContentSwitcher
          selectedIndex={['All', 'Active', 'Draft'].indexOf(filterStatus)}
          onChange={({ name }) => setFilterStatus((name as 'All' | 'Active' | 'Draft') ?? 'All')}
        >
          <Switch name="All" text="All" />
          <Switch name="Active" text="Active" />
          <Switch name="Draft" text="Draft" />
        </ContentSwitcher>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center" style={{ height: 240 }}>
          <Loading withOverlay={false} description="Loading flows" />
        </div>
      ) : error ? (
        <div className="text-center" style={{ padding: '64px 0' }}>
          <WarningAlt size={40} style={{ color: 'var(--cds-support-error, #da1e28)', marginBottom: 12 }} />
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Failed to load flows</h3>
          <p style={{ fontSize: 13, color: 'var(--cds-text-secondary)', marginBottom: 16 }}>{error}</p>
          <Button kind="tertiary" size="sm" onClick={fetchFlows}>
            Try again
          </Button>
        </div>
      ) : (
        <DataTable rows={rows} headers={HEADERS} isSortable>
          {({ rows: dtRows, headers, getHeaderProps, getRowProps, getTableProps, getTableContainerProps }) => (
            <TableContainer {...getTableContainerProps()}>
              <TableToolbar>
                <TableToolbarContent>
                  <TableToolbarSearch
                    persistent
                    placeholder="Search flows"
                    onChange={(e) =>
                      setSearchQuery(e && 'target' in e ? (e.target as HTMLInputElement).value : '')
                    }
                  />
                </TableToolbarContent>
              </TableToolbar>
              <Table {...getTableProps()} size="lg">
                <TableHead>
                  <TableRow>
                    {headers.map((header) => {
                      const { key, ...rest } = getHeaderProps({ header });
                      return (
                        <TableHeader key={header.key} {...rest}>
                          {header.header}
                        </TableHeader>
                      );
                    })}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {dtRows.map((row) => {
                    const { key, ...rowProps } = getRowProps({ row });
                    return (
                      <TableRow
                        key={row.id}
                        {...rowProps}
                        onClick={() => router.push(`/p/${projectId}/flows/${row.id}`)}
                        style={{ cursor: 'pointer' }}
                      >
                        {row.cells.map((cell) => {
                          if (cell.info.header === 'name') {
                            const r = rows.find((x) => x.id === row.id);
                            return (
                              <TableCell key={cell.id}>
                                <div style={{ fontWeight: 600 }}>{r?.name}</div>
                                <div style={{ fontSize: 12, color: 'var(--cds-text-secondary)' }}>
                                  {r?.description}
                                </div>
                              </TableCell>
                            );
                          }
                          if (cell.info.header === 'status') {
                            const st = statusTag[cell.value as FlowStatus] ?? statusTag.INACTIVE;
                            return (
                              <TableCell key={cell.id}>
                                <Tag type={st.type} size="sm">
                                  {st.label}
                                </Tag>
                              </TableCell>
                            );
                          }
                          return <TableCell key={cell.id}>{cell.value}</TableCell>;
                        })}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {dtRows.length === 0 && (
                <div className="text-center" style={{ padding: '48px 0' }}>
                  <FlowIcon size={28} style={{ color: 'var(--cds-text-placeholder)', marginBottom: 12 }} />
                  <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>No flows found</h3>
                  <p style={{ fontSize: 13, color: 'var(--cds-text-secondary)' }}>
                    Create a flow to define your workflow pipelines
                  </p>
                </div>
              )}
            </TableContainer>
          )}
        </DataTable>
      )}
    </div>
  );
}
