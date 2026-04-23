'use client';

import { NodeProps } from 'reactflow';
import { BaseNode, BaseNodeData } from './BaseNode';

export function ConditionNode(props: NodeProps<BaseNodeData>) {
  const { condition, operator = 'equals' } = props.data.config || {};
  
  return (
    <BaseNode {...props} inputs={1} outputs={2}>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-[#ec4899]">IF</span>
        </div>
        {condition && (
          <div className="text-xs text-[#52525b] font-mono truncate max-w-[200px]">
            {condition}
          </div>
        )}
        <div className="flex items-center gap-4 text-xs text-[#71717a]">
          <span>✓ True</span>
          <span>✗ False</span>
        </div>
      </div>
    </BaseNode>
  );
}
