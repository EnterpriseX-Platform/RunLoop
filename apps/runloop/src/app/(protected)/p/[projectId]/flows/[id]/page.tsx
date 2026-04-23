'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2, AlertCircle, Trash2, History, RotateCcw, X, Play } from 'lucide-react';
import { Node, Edge } from 'reactflow';
import { FlowCanvas } from '@/components/flow/FlowCanvas';

const FONT = "'IBM Plex Sans Thai', 'IBM Plex Sans', sans-serif";
const THEME = {
  bg: 'var(--t-bg)',
  panel: 'var(--t-panel)',
  border: 'var(--t-border)',
  text: { primary: 'var(--t-text)', secondary: 'var(--t-text-secondary)', muted: 'var(--t-text-muted)' },
  accent: 'var(--t-accent)',
  colors: { red: '#EF4444', emerald: '#10B981' },
};

type BackendFlow = {
  id: string;
  name: string;
  description?: string;
  type: 'SIMPLE' | 'DAG';
  status: 'ACTIVE' | 'INACTIVE' | 'DRAFT';
  jobType?: string;
  flowConfig?: {
    nodes?: Array<any>;
    edges?: Array<any>;
  };
};

function jobTypeToNodeKind(type?: string): string {
  switch ((type || '').toUpperCase()) {
    case 'HTTP': return 'httpNode';
    case 'DATABASE': return 'databaseNode';
    case 'SHELL': return 'shellNode';
    case 'PYTHON': return 'pythonNode';
    case 'NODEJS': return 'nodejsNode';
    case 'DOCKER': return 'dockerNode';
    case 'SLACK': return 'slackNode';
    case 'EMAIL': return 'emailNode';
    case 'CONDITION': return 'conditionNode';
    case 'LOOP': return 'loopNode';
    case 'DELAY': return 'delayNode';
    case 'TRANSFORM': return 'transformNode';
    case 'START': return 'startNode';
    case 'END': return 'endNode';
    default: return 'httpNode';
  }
}

function backendNodesToReactFlow(flow: BackendFlow): { nodes: Node[]; edges: Edge[] } {
  const cfg = flow.flowConfig;
  if (!cfg || !cfg.nodes || cfg.nodes.length === 0) {
    // Flow record has no flowConfig — synthesize a single-node flow from jobType
    if (flow.jobType) {
      return {
        nodes: [
          { id: 'start_0', type: 'startNode', position: { x: 80, y: 200 }, data: { label: 'Start', type: 'start', config: {} } },
          { id: 'node_0', type: jobTypeToNodeKind(flow.jobType), position: { x: 340, y: 200 }, data: { label: flow.name, type: flow.jobType.toLowerCase(), config: {} } },
          { id: 'end_0', type: 'endNode', position: { x: 600, y: 200 }, data: { label: 'End', type: 'end', config: {} } },
        ],
        edges: [
          { id: 'e1', source: 'start_0', target: 'node_0', data: { condition: 'ON_SUCCESS' } },
          { id: 'e2', source: 'node_0', target: 'end_0', data: { condition: 'ON_SUCCESS' } },
        ],
      };
    }
    return { nodes: [], edges: [] };
  }

  const nodes: Node[] = (cfg.nodes || []).map((n: any, idx: number) => {
    const nodeKind = n.nodeKind || jobTypeToNodeKind(n.type);
    const nodeTypeData = (n.type || '').toLowerCase() === 'start' ? 'start'
      : (n.type || '').toLowerCase() === 'end' ? 'end'
      : (n.type || '').toLowerCase();
    return {
      id: n.id || `node_${idx}`,
      type: nodeKind,
      position: n.position || { x: 80 + idx * 260, y: 200 },
      data: {
        label: n.name || n.id || 'Node',
        type: nodeTypeData,
        config: n.config || {},
      },
    };
  });

  const edges: Edge[] = (cfg.edges || []).map((e: any, idx: number) => ({
    id: e.id || `edge_${idx}`,
    source: e.source,
    target: e.target,
    data: { condition: e.condition || 'ON_SUCCESS' },
    type: 'smoothstep',
  }));

  return { nodes, edges };
}

export default function FlowDetailPage() {
  const params = useParams();
  const router = useRouter();
  const flowId = params.id as string;
  const projectId = params.projectId as string;

  const [flow, setFlow] = useState<BackendFlow | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [running, setRunning] = useState(false);

  // Run Now: submit the flow's CURRENTLY SAVED config to /flows/test, get
  // an executionId back, and navigate to the execution detail so the user
  // can watch the live logs. For in-flight edits they should Save first —
  // intentionally no client-side config assembly because the flow state
  // lives inside FlowCanvas.
  const handleRunNow = async () => {
    if (!flow?.flowConfig) return;
    setRunning(true);
    try {
      const res = await fetch('/runloop/api/flows/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, flowConfig: flow.flowConfig }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
      if (d.executionId) {
        router.push(`/p/${projectId}/executions/${d.executionId}`);
      }
    } catch (err) {
      alert('Run failed: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setRunning(false);
    }
  };
  const [showVersions, setShowVersions] = useState(false);
  const [versions, setVersions] = useState<any[]>([]);

  const fetchVersions = async () => {
    try {
      const res = await fetch(`/runloop/api/flow-versions?flowId=${flowId}`);
      if (res.ok) {
        const data = await res.json();
        setVersions(data.versions || []);
      }
    } catch (err) {
      console.warn('Failed to fetch versions:', err);
    }
  };

  const handleRollback = async (versionId: string, versionNumber: number) => {
    if (!confirm(`Roll back to version ${versionNumber}? Current state will be preserved as a new version.`)) return;
    try {
      const res = await fetch(`/runloop/api/flow-versions/${versionId}/rollback`, { method: 'POST' });
      if (res.ok) {
        // Refresh flow + versions
        const fres = await fetch(`/runloop/api/flows/${flowId}`);
        if (fres.ok) {
          const fd = await fres.json();
          setFlow(fd.data);
        }
        fetchVersions();
        alert(`Rolled back to v${versionNumber}`);
      } else {
        const err = await res.json();
        alert(err.error || 'Rollback failed');
      }
    } catch {
      alert('Rollback failed');
    }
  };

  useEffect(() => {
    async function fetchFlow() {
      try {
        const res = await fetch(`/runloop/api/flows/${flowId}`);
        if (res.ok) {
          const data = await res.json();
          setFlow(data.data);
        } else {
          setError('Flow not found');
        }
      } catch {
        setError('Failed to load flow');
      } finally {
        setIsLoading(false);
      }
    }
    fetchFlow();
  }, [flowId]);

  const { initialNodes, initialEdges } = useMemo(() => {
    if (!flow) return { initialNodes: [], initialEdges: [] };
    const converted = backendNodesToReactFlow(flow);
    return { initialNodes: converted.nodes, initialEdges: converted.edges };
  }, [flow]);

  const handleSave = async (nodes: Node[], edges: Edge[], name: string, description: string) => {
    setSaving(true);
    try {
      const payload = {
        name,
        description,
        flowConfig: {
          nodes: nodes.map((n) => ({
            id: n.id,
            type: (n.data?.type as string)?.toUpperCase() || 'HTTP',
            nodeKind: n.type,
            name: n.data?.label || n.id,
            config: n.data?.config || {},
            position: n.position,
          })),
          edges: edges.map((e) => ({
            id: e.id,
            source: e.source,
            target: e.target,
            condition: (e.data?.condition as string) || 'ON_SUCCESS',
          })),
        },
      };

      const res = await fetch(`/runloop/api/flows/${flowId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || err.details || 'Save failed');
      }
      // refresh
      const data = await res.json();
      setFlow(data.data);

      // Snapshot a version after a successful save. Best-effort — we don't
      // fail the UI if the versions table is unreachable.
      try {
        await fetch('/runloop/api/flow-versions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            flowId,
            name,
            description,
            flowConfig: payload.flowConfig,
          }),
        });
      } catch (vErr) {
        console.warn('Flow version snapshot skipped:', vErr);
      }
    } catch (err: any) {
      alert(err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this flow? This action cannot be undone.')) return;
    setDeleting(true);
    try {
      const res = await fetch(`/runloop/api/flows/${flowId}`, { method: 'DELETE' });
      if (res.ok) {
        router.push(`/p/${projectId}/flows`);
      } else {
        alert('Delete failed');
      }
    } finally {
      setDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64" style={{ fontFamily: FONT }}>
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: THEME.accent }} />
      </div>
    );
  }

  if (error || !flow) {
    return (
      <div className="flex flex-col items-center justify-center py-20" style={{ fontFamily: FONT }}>
        <AlertCircle className="w-8 h-8 mb-3" style={{ color: THEME.colors.red }} />
        <h3 className="text-base font-semibold mb-1" style={{ color: THEME.text.primary }}>
          {error || 'Flow not found'}
        </h3>
        <Link href={`/p/${projectId}/flows`} className="text-sm mt-3" style={{ color: THEME.accent }}>
          Back to Flows
        </Link>
      </div>
    );
  }

  return (
    <div style={{ height: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column', fontFamily: FONT }}>
      {/* Sticky top strip with back + delete */}
      <div className="flex items-center justify-between px-4 py-2" style={{ borderBottom: `1px solid ${THEME.border}`, background: THEME.panel }}>
        <div className="flex items-center gap-3">
          <Link href={`/p/${projectId}/flows`} style={{ color: THEME.text.muted }}>
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <span className="text-xs font-medium" style={{ color: THEME.text.secondary }}>
            Flow {flow.status === 'ACTIVE' ? '·' : `(${flow.status})`} {flow.type}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRunNow}
            disabled={running}
            className="text-xs px-3 py-1.5 rounded flex items-center gap-1.5 disabled:opacity-50"
            style={{ background: `${THEME.colors.emerald}15`, color: THEME.colors.emerald, border: `1px solid ${THEME.colors.emerald}40` }}
            title="Run this flow once with its saved config"
          >
            {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            Run Now
          </button>
          <button
            onClick={() => { setShowVersions(true); fetchVersions(); }}
            className="text-xs px-3 py-1.5 rounded flex items-center gap-1.5"
            style={{ background: `${THEME.accent}15`, color: THEME.accent, border: `1px solid ${THEME.accent}40` }}
          >
            <History className="w-3.5 h-3.5" />
            Version History
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="text-xs px-3 py-1.5 rounded flex items-center gap-1.5 disabled:opacity-50"
            style={{ background: `${THEME.colors.red}15`, color: THEME.colors.red, border: `1px solid ${THEME.colors.red}40` }}
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete Flow
          </button>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0 }}>
        <FlowCanvas
          initialNodes={initialNodes}
          initialEdges={initialEdges}
          initialName={flow.name}
          initialDescription={flow.description || ''}
          onSave={handleSave}
          saving={saving}
          saveLabel="Save Changes"
          showTestButton={false}
        />
      </div>

      {/* Version history drawer */}
      {showVersions && (
        <div
          className="fixed inset-0 z-50 flex justify-end"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={() => setShowVersions(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="h-full w-[420px] overflow-y-auto"
            style={{ background: THEME.panel, borderLeft: `1px solid ${THEME.border}`, fontFamily: FONT }}
          >
            <div className="px-5 py-4 flex items-center justify-between sticky top-0" style={{ background: THEME.panel, borderBottom: `1px solid ${THEME.border}` }}>
              <h3 className="flex items-center gap-2 font-semibold" style={{ color: THEME.text.primary }}>
                <History className="w-4 h-4" />
                Version History
              </h3>
              <button onClick={() => setShowVersions(false)} style={{ color: THEME.text.secondary }}>
                <X className="w-4 h-4" />
              </button>
            </div>
            {versions.length === 0 ? (
              <div className="p-8 text-center text-sm" style={{ color: THEME.text.muted }}>
                No versions yet. Save the flow to create a snapshot.
              </div>
            ) : (
              <div className="p-4 space-y-3">
                {versions.map((v, i) => (
                  <div key={v.id} style={{ padding: 12, borderRadius: 8, background: 'var(--t-input)', border: `1px solid ${THEME.border}` }}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-semibold" style={{ color: THEME.text.primary }}>
                        v{v.version}
                        {i === 0 && <span className="ml-2 text-[10px] px-2 py-0.5 rounded" style={{ background: '#10B98120', color: '#10B981' }}>CURRENT</span>}
                      </span>
                      <span className="text-[11px]" style={{ color: THEME.text.muted }}>
                        {new Date(v.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <div className="text-xs mb-2" style={{ color: THEME.text.secondary }}>
                      {v.comment || `Nodes: ${v.flowConfig?.nodes?.length || 0} · Edges: ${v.flowConfig?.edges?.length || 0}`}
                    </div>
                    {i !== 0 && (
                      <button
                        onClick={() => handleRollback(v.id, v.version)}
                        className="text-[11px] px-2 py-1 rounded flex items-center gap-1"
                        style={{ background: `${THEME.accent}15`, color: THEME.accent, border: `1px solid ${THEME.accent}40` }}
                      >
                        <RotateCcw className="w-3 h-3" />
                        Roll back to v{v.version}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
