'use client';

import { NodeProps } from 'reactflow';
import { BaseNode, BaseNodeData } from './BaseNode';

// SwitchNode — multi-branch router. Outputs one success edge per case plus
// a fallthrough "default" edge. Routing uses the regular ON_SUCCESS /
// ON_FAILURE edges: for SWITCH nodes the engine treats each edge's
// `condition` field as a case label and fires only the matching edge.
// (That logic lives in the engine; here we just render the node.)
export function SwitchNode(props: NodeProps<BaseNodeData>) {
  const cases = (props.data.config?.cases as unknown[]) || [];
  return (
    <BaseNode {...props} inputs={1} outputs={Math.max(2, cases.length + 1)} />
  );
}
