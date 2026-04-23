'use client';

import { NodeProps } from 'reactflow';
import { BaseNode, BaseNodeData } from './BaseNode';

export function ShellNode(props: NodeProps<BaseNodeData>) {
  const { command, script } = props.data.config || {};
  
  return (
    <BaseNode {...props} inputs={1} outputs={1}>
      <div className="space-y-2">
        {command && (
          <div className="text-xs text-[#52525b] font-mono truncate max-w-[200px]">
            {command}
          </div>
        )}
        {script && (
          <div className="text-xs text-[#52525b] font-mono truncate max-w-[200px]">
            {script.slice(0, 40)}...
          </div>
        )}
      </div>
    </BaseNode>
  );
}
