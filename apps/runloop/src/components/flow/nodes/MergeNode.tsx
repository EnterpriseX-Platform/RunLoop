'use client';

import { NodeProps } from 'reactflow';
import { BaseNode, BaseNodeData } from './BaseNode';

// MergeNode renders the fan-in node. It accepts multiple inputs (the
// BaseNode default is 1; we override to 3 visual input ports — the engine
// doesn't care about the number, it looks at graph.Predecessors, but users
// intuitively read "3 ports = merges up to 3 branches").
export function MergeNode(props: NodeProps<BaseNodeData>) {
  const { strategy = 'collect' } = props.data.config || {};
  return (
    <BaseNode {...props} inputs={3} outputs={1} />
  );
}
