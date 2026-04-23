'use client';

import { NodeProps, Handle, Position } from 'reactflow';

interface PluginNodeData {
  label: string;
  type: string;                           // engine dispatch key (plugin name)
  config?: Record<string, any>;
  pluginColor?: string;
  pluginIcon?: string;
  status?: 'idle' | 'running' | 'success' | 'error';
}

// PluginNode renders a node whose type isn't baked into the engine. The
// visuals come from the manifest (color), kept deliberately simple — a
// colored square with the plugin's display name and a "PLUGIN" badge so
// operators know this came from an external handler.
export function PluginNode({ data, selected }: NodeProps<PluginNodeData>) {
  const color = data.pluginColor || '#6B7280';
  const size = 72;
  return (
    <div style={{ width: size }} className="relative">
      <div
        style={{
          width: size,
          height: size,
          borderRadius: 10,
          background: '#FFFFFF',
          border: `1.5px solid ${selected ? '#FF6D5A' : '#D1D5DB'}`,
          boxShadow: selected ? '0 0 0 3px rgba(255,109,90,0.15)' : '0 1px 2px rgba(0,0,0,0.04)',
        }}
        className="flex items-center justify-center"
      >
        <div
          style={{ width: 40, height: 40, borderRadius: 8, background: color, color: '#FFF' }}
          className="flex items-center justify-center text-[10px] font-bold tracking-wider"
        >
          PL
        </div>
        <Handle type="target" position={Position.Left} style={handle(color, 'in')} />
        <Handle type="source" position={Position.Right} style={handle(color, 'out')} />
      </div>
      <div
        className="absolute left-1/2 -translate-x-1/2 text-center"
        style={{ top: size + 6, width: 140, fontSize: 12, fontWeight: 600, color: '#111827', lineHeight: 1.25, pointerEvents: 'none' }}
      >
        <div className="truncate">{data.label}</div>
        <div style={{ fontSize: 9, fontWeight: 700, color, letterSpacing: '0.08em', marginTop: 2 }}>
          PLUGIN
        </div>
      </div>
    </div>
  );
}

function handle(color: string, kind: 'in' | 'out'): React.CSSProperties {
  return {
    width: 10, height: 10,
    [kind === 'in' ? 'left' : 'right']: -5,
    background: '#FFFFFF',
    border: `1.5px solid ${color}`,
  } as React.CSSProperties;
}
