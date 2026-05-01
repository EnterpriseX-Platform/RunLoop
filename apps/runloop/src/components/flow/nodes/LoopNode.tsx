'use client';

import { NodeProps } from 'reactflow';
import { BaseNode, BaseNodeData } from './BaseNode';

export function LoopNode(props: NodeProps<BaseNodeData>) {
  const { iterations, array, mode = 'count' } = props.data.config || {};
  
  return (
    <BaseNode {...props} inputs={1} outputs={1}>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-[#6366f1]">LOOP</span>
        </div>
        {mode === 'count' && iterations && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#71717a]">Iterations:</span>
            <span className="text-sm font-medium text-white">{iterations}</span>
          </div>
        )}
        {mode === 'array' && array && (
          <div className="text-xs text-[#52525b] font-mono truncate max-w-[200px]">
            {array}
          </div>
        )}
      </div>
    </BaseNode>
  );
}
