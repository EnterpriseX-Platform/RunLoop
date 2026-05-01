'use client';

import { NodeProps } from 'reactflow';
import { BaseNode, BaseNodeData, NodeStatusBadge } from './BaseNode';

export function StartNode(props: NodeProps<BaseNodeData>) {
  return (
    <BaseNode {...props} inputs={0} outputs={1}>
      <div className="text-xs text-[#71717a]">
        Triggers the workflow
      </div>
    </BaseNode>
  );
}
