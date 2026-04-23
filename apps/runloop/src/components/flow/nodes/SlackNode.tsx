'use client';

import { NodeProps } from 'reactflow';
import { BaseNode, BaseNodeData } from './BaseNode';

export function SlackNode(props: NodeProps<BaseNodeData>) {
  const { channel, action = 'send_message' } = props.data.config || {};
  
  return (
    <BaseNode {...props} inputs={1} outputs={1}>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-[#a855f7] uppercase">{action}</span>
        </div>
        {channel && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#71717a]">Channel:</span>
            <span className="text-xs text-[#a1a1aa]">{channel}</span>
          </div>
        )}
      </div>
    </BaseNode>
  );
}
