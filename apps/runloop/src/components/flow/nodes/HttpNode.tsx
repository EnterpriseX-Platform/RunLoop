'use client';

import { NodeProps } from 'reactflow';
import { BaseNode, BaseNodeData, NodeConfigPreview } from './BaseNode';

export function HttpNode(props: NodeProps<BaseNodeData>) {
  const { url, method = 'GET' } = props.data.config || {};
  
  return (
    <BaseNode {...props} inputs={1} outputs={1}>
      <div className="space-y-2">
        {url && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-[#0ea5e9]">{method}</span>
            <span className="text-xs text-[#a1a1aa] truncate max-w-[180px]">{url}</span>
          </div>
        )}
        <NodeConfigPreview config={props.data.config || {}} />
      </div>
    </BaseNode>
  );
}
