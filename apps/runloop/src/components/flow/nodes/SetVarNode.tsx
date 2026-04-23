'use client';
import { NodeProps } from 'reactflow';
import { BaseNode, BaseNodeData } from './BaseNode';
export function SetVarNode(props: NodeProps<BaseNodeData>) {
  return <BaseNode {...props} inputs={1} outputs={1} />;
}
