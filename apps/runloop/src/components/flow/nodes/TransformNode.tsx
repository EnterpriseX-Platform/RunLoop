'use client';

import { NodeProps } from 'reactflow';
import { BaseNode, BaseNodeData } from './BaseNode';

export function TransformNode(props: NodeProps<BaseNodeData>) {
  const { operation, mapping, code } = props.data.config || {};
  
  return (
    <BaseNode {...props} inputs={1} outputs={1}>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-[#14b8a6]">TRANSFORM</span>
        </div>
        {operation && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#71717a]">Op:</span>
            <span className="text-xs text-[#a1a1aa] capitalize">{operation}</span>
          </div>
        )}
        {code && (
          <div className="text-xs text-[#52525b] font-mono truncate max-w-[200px]">
            {code.slice(0, 40)}...
          </div>
        )}
      </div>
    </BaseNode>
  );
}
