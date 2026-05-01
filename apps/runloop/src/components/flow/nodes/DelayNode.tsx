'use client';

import { NodeProps } from 'reactflow';
import { BaseNode, BaseNodeData } from './BaseNode';

export function DelayNode(props: NodeProps<BaseNodeData>) {
  const { delay, unit = 'seconds' } = props.data.config || {};
  
  return (
    <BaseNode {...props} inputs={1} outputs={1}>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-[#9ca3af]">WAIT</span>
        </div>
        {delay && (
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold text-white">{delay}</span>
            <span className="text-xs text-[#71717a]">{unit}</span>
          </div>
        )}
      </div>
    </BaseNode>
  );
}
