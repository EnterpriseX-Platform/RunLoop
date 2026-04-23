'use client';

import { NodeProps } from 'reactflow';
import { BaseNode, BaseNodeData } from './BaseNode';

export function NodejsNode(props: NodeProps<BaseNodeData>) {
  const { code, file, entryPoint } = props.data.config || {};
  
  return (
    <BaseNode {...props} inputs={1} outputs={1}>
      <div className="space-y-2">
        {entryPoint ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#71717a]">Entry:</span>
            <span className="text-xs text-[#a1a1aa] truncate max-w-[150px]">{entryPoint}</span>
          </div>
        ) : file ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#71717a]">File:</span>
            <span className="text-xs text-[#a1a1aa] truncate max-w-[150px]">{file}</span>
          </div>
        ) : code ? (
          <div className="text-xs text-[#52525b] font-mono truncate max-w-[200px]">
            {code.slice(0, 40)}...
          </div>
        ) : null}
      </div>
    </BaseNode>
  );
}
