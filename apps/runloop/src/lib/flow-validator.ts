/**
 * Validates a DAG flow:
 * - Must have at least one "startNode" (source)
 * - Must have at least one "endNode" (sink)
 * - No cycles
 * - Every non-start node must be reachable from a start node
 */

export interface FlowValidationError {
  code: string;
  message: string;
  nodeId?: string;
}

export interface FlowNode {
  id: string;
  type: string;
  data?: { type?: string };
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
}

export function validateFlow(nodes: FlowNode[], edges: FlowEdge[]): FlowValidationError[] {
  const errors: FlowValidationError[] = [];

  if (nodes.length === 0) {
    errors.push({ code: 'EMPTY', message: 'Flow must have at least one node' });
    return errors;
  }

  const starts = nodes.filter((n) => n.type === 'startNode');
  const ends = nodes.filter((n) => n.type === 'endNode');

  if (starts.length === 0) {
    errors.push({ code: 'NO_START', message: 'Flow must have a Start node' });
  }
  if (ends.length === 0) {
    errors.push({ code: 'NO_END', message: 'Flow must have an End node' });
  }

  // Cycle detection (DFS)
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    if (!adjacency.has(edge.source)) adjacency.set(edge.source, []);
    adjacency.get(edge.source)!.push(edge.target);
  }

  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  nodes.forEach((n) => color.set(n.id, WHITE));

  function dfs(nodeId: string): boolean {
    color.set(nodeId, GRAY);
    for (const next of adjacency.get(nodeId) ?? []) {
      if (color.get(next) === GRAY) return true; // back edge → cycle
      if (color.get(next) === WHITE && dfs(next)) return true;
    }
    color.set(nodeId, BLACK);
    return false;
  }

  for (const n of nodes) {
    if (color.get(n.id) === WHITE && dfs(n.id)) {
      errors.push({ code: 'CYCLE', message: 'Flow has a cycle — remove the circular dependency' });
      break;
    }
  }

  // Reachability from any start
  if (starts.length > 0 && errors.every((e) => e.code !== 'CYCLE')) {
    const reachable = new Set<string>();
    const queue: string[] = starts.map((s) => s.id);
    while (queue.length) {
      const cur = queue.shift()!;
      if (reachable.has(cur)) continue;
      reachable.add(cur);
      for (const next of adjacency.get(cur) ?? []) queue.push(next);
    }
    for (const n of nodes) {
      if (!reachable.has(n.id)) {
        errors.push({
          code: 'UNREACHABLE',
          message: `Node "${n.id}" is not reachable from Start`,
          nodeId: n.id,
        });
      }
    }
  }

  return errors;
}

/**
 * Auto-layout nodes using a simple left-to-right topological layering
 * (lightweight alternative to dagre for small flows).
 */
export function autoLayout(
  nodes: Array<{ id: string; position?: { x: number; y: number } }>,
  edges: Array<{ source: string; target: string }>,
): Array<{ id: string; position: { x: number; y: number } }> {
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();
  nodes.forEach((n) => {
    inDegree.set(n.id, 0);
    adjacency.set(n.id, []);
  });
  for (const edge of edges) {
    adjacency.get(edge.source)?.push(edge.target);
    inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
  }

  // BFS by layers
  const layers: string[][] = [];
  let queue = nodes.filter((n) => inDegree.get(n.id) === 0).map((n) => n.id);
  const visited = new Set<string>();
  while (queue.length) {
    layers.push(queue);
    const next: string[] = [];
    for (const id of queue) {
      visited.add(id);
      for (const child of adjacency.get(id) ?? []) {
        inDegree.set(child, (inDegree.get(child) ?? 0) - 1);
        if (inDegree.get(child) === 0 && !visited.has(child)) {
          next.push(child);
        }
      }
    }
    queue = next;
  }

  // Orphan nodes (part of cycle or unreachable): append to last layer
  const orphans = nodes.filter((n) => !visited.has(n.id)).map((n) => n.id);
  if (orphans.length) layers.push(orphans);

  const X_STEP = 260;
  const Y_STEP = 140;
  const positions: Array<{ id: string; position: { x: number; y: number } }> = [];
  layers.forEach((layer, layerIndex) => {
    layer.forEach((id, idx) => {
      positions.push({
        id,
        position: {
          x: 80 + layerIndex * X_STEP,
          y: 80 + idx * Y_STEP - (layer.length - 1) * Y_STEP / 2,
        },
      });
    });
  });

  return positions;
}
