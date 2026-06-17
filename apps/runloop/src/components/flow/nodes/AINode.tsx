'use client';

import { NodeProps } from 'reactflow';
import { BaseNode, BaseNodeData } from './BaseNode';

const PROVIDER_LABEL: Record<string, string> = {
  claude: 'Claude',
  openai: 'OpenAI',
  kimi: 'Kimi',
};

export function AINode(props: NodeProps<BaseNodeData>) {
  const { provider, model } = props.data.config || {};
  const label = provider ? PROVIDER_LABEL[provider] || provider : 'auto';

  return (
    <BaseNode {...props} inputs={1} outputs={1}>
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-[#8B5CF6]">{label}</span>
        {model && (
          <span className="text-xs text-[#a1a1aa] truncate max-w-[160px]">{model}</span>
        )}
      </div>
    </BaseNode>
  );
}
