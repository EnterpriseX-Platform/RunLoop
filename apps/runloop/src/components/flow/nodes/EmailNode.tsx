'use client';

import { NodeProps } from 'reactflow';
import { BaseNode, BaseNodeData } from './BaseNode';

export function EmailNode(props: NodeProps<BaseNodeData>) {
  const { to, subject, action = 'send_email' } = props.data.config || {};
  
  return (
    <BaseNode {...props} inputs={1} outputs={1}>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-[#f97316] uppercase">{action}</span>
        </div>
        {to && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#71717a]">To:</span>
            <span className="text-xs text-[#a1a1aa] truncate max-w-[150px]">{to}</span>
          </div>
        )}
        {subject && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#71717a]">Subject:</span>
            <span className="text-xs text-[#a1a1aa] truncate max-w-[120px]">{subject}</span>
          </div>
        )}
      </div>
    </BaseNode>
  );
}
