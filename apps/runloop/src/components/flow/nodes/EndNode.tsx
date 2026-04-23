'use client';

import { NodeProps } from 'reactflow';
import { BaseNode, BaseNodeData, NodeStatusBadge } from './BaseNode';

export function EndNode(props: NodeProps<BaseNodeData>) {
  return (
    <BaseNode {...props} inputs={1} outputs={0}>
      <div className="text-xs text-[#71717a]">
        Workflow completed
      </div>
    </BaseNode>
  );
}
