'use client';

import { useState, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Node, Edge } from 'reactflow';
import { FlowCanvas } from '@/components/flow/FlowCanvas';

export default function NewFlowPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.projectId as string;
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  // Start with a Start + End node so the user has a starting skeleton
  const initialNodes = useMemo<Node[]>(() => [
    {
      id: 'start_seed',
      type: 'startNode',
      position: { x: 80, y: 200 },
      data: { label: 'Start', type: 'start', config: {} },
    },
    {
      id: 'end_seed',
      type: 'endNode',
      position: { x: 520, y: 200 },
      data: { label: 'End', type: 'end', config: {} },
    },
  ], []);

  const handleSave = async (nodes: Node[], edges: Edge[], name: string, description: string) => {
    setSaving(true);
    try {
      const flowType = nodes.length > 3 || edges.some((e) => {
        // Branching detection: multiple outgoing edges from same source
        const outCount = edges.filter((ed) => ed.source === e.source).length;
        return outCount > 1;
      }) ? 'DAG' : 'SIMPLE';

      const payload = {
        name,
        description,
        type: flowType,
        status: 'ACTIVE',
        projectId,
        config: {},
        flowConfig: {
          nodes: nodes.map((n) => ({
            id: n.id,
            type: (n.data?.type as string)?.toUpperCase() || 'HTTP',
            nodeKind: n.type, // e.g. "httpNode", "startNode"
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

      const res = await fetch('/runloop/api/flows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        router.push(`/p/${projectId}/flows`);
      } else {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || err.details || 'Failed to save flow');
      }
    } catch (err: any) {
      alert(err.message || 'Failed to save flow');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async (nodes: Node[], edges: Edge[]) => {
    setTesting(true);
    try {
      // Dry-run submits an ephemeral flow to a test endpoint (executes without persisting as scheduled)
      const res = await fetch('/runloop/api/flows/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          flowConfig: {
            nodes: nodes.map((n) => ({
              id: n.id,
              type: (n.data?.type as string)?.toUpperCase() || 'HTTP',
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
        }),
      });
      if (res.ok) {
        const { executionId } = await res.json();
        if (executionId) router.push(`/p/${projectId}/executions/${executionId}`);
      } else {
        alert('Test run not supported yet. Save the flow and trigger via a scheduler.');
      }
    } catch {
      alert('Test run failed');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div style={{ height: 'calc(100vh - 64px)' }}>
      <FlowCanvas
        initialNodes={initialNodes}
        initialEdges={[]}
        onSave={handleSave}
        onTest={handleTest}
        saving={saving}
        testing={testing}
        saveLabel="Create Flow"
      />
    </div>
  );
}
