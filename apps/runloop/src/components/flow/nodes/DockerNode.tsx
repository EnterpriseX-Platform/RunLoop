'use client';

import { NodeProps } from 'reactflow';
import { BaseNode, BaseNodeData } from './BaseNode';

export function DockerNode(props: NodeProps<BaseNodeData>) {
  const { image, command } = props.data.config || {};

  return (
    <BaseNode {...props} inputs={1} outputs={1}>
      <div className="space-y-2">
        {image && (
          <div className="text-xs text-[#a1a1aa] font-mono truncate max-w-[200px]">
            {image}
          </div>
        )}
        {command && (
          <div className="text-xs text-[#52525b] font-mono truncate max-w-[200px]">
            {String(command).slice(0, 40)}
            {String(command).length > 40 ? '…' : ''}
          </div>
        )}
      </div>
    </BaseNode>
  );
}
