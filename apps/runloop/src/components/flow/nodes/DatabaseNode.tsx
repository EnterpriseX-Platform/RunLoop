'use client';

import { NodeProps } from 'reactflow';
import { BaseNode, BaseNodeData, NodeConfigPreview } from './BaseNode';

export function DatabaseNode(props: NodeProps<BaseNodeData>) {
  const { query, action = 'query' } = props.data.config || {};
  
  return (
    <BaseNode {...props} inputs={1} outputs={1}>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-[#06b6d4] uppercase">{action}</span>
        </div>
        {query && (
          <div className="text-xs text-[#52525b] font-mono truncate max-w-[200px]">
            {query.slice(0, 50)}...
          </div>
        )}
        <NodeConfigPreview config={props.data.config || {}} />
      </div>
    </BaseNode>
  );
}
