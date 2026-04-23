'use client';

import React from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import {
  Play, Square, Globe, Database, Terminal, Code2, Hash,
  Slack, Mail, GitBranch, Clock, RotateCcw, Variable, Container,
  GitMerge, Split, FileText, PenLine, Workflow, Webhook, Hourglass,
} from 'lucide-react';

export interface BaseNodeData {
  label: string;
  type: string;
  description?: string;
  config?: Record<string, any>;
  status?: 'idle' | 'running' | 'success' | 'error';
}

const iconMap: Record<string, React.ElementType> = {
  start: Play,
  end: Square,
  http: Globe,
  database: Database,
  shell: Terminal,
  python: Code2,
  nodejs: Hash,
  docker: Container,
  slack: Slack,
  email: Mail,
  condition: GitBranch,
  delay: Clock,
  loop: RotateCcw,
  transform: Variable,
  merge: GitMerge,
  switch: Split,
  log: FileText,
  set_variable: PenLine,
  subflow: Workflow,
  webhook_out: Webhook,
  wait_webhook: Hourglass,
};

const colorMap: Record<string, { hex: string; label: string }> = {
  start:     { hex: '#10B981', label: 'Start' },
  end:       { hex: '#EF4444', label: 'End' },
  http:      { hex: '#3B82F6', label: 'HTTP' },
  database:  { hex: '#06B6D4', label: 'Database' },
  shell:     { hex: '#F59E0B', label: 'Shell' },
  python:    { hex: '#EAB308', label: 'Python' },
  nodejs:    { hex: '#22C55E', label: 'Node.js' },
  docker:    { hex: '#0EA5E9', label: 'Docker' },
  slack:     { hex: '#A855F7', label: 'Slack' },
  email:     { hex: '#F97316', label: 'Email' },
  condition: { hex: '#EC4899', label: 'Condition' },
  delay:     { hex: '#64748B', label: 'Delay' },
  loop:      { hex: '#6366F1', label: 'Loop' },
  transform: { hex: '#14B8A6', label: 'Transform' },
  merge:        { hex: '#0891B2', label: 'Merge' },
  switch:       { hex: '#D946EF', label: 'Switch' },
  log:          { hex: '#78716C', label: 'Log' },
  set_variable: { hex: '#0D9488', label: 'Set Variable' },
  subflow:      { hex: '#7C3AED', label: 'Sub-flow' },
  webhook_out:  { hex: '#F43F5E', label: 'Webhook' },
  wait_webhook: { hex: '#FB923C', label: 'Wait Webhook' },
};

interface BaseNodeProps extends NodeProps<BaseNodeData> {
  children?: React.ReactNode;
  inputs?: number;
  outputs?: number;
}

/**
 * n8n-inspired node: compact square card with large centered icon,
 * node label rendered BELOW the card. Flat surface, subtle border,
 * blue outline on selection, status dot top-right.
 */
export function BaseNode({ data, selected, inputs = 1, outputs = 1 }: BaseNodeProps) {
  const type = data.type.toLowerCase();
  const c = colorMap[type] || colorMap.http;
  const Icon = iconMap[type] || Globe;
  const accent = c.hex;

  const isRunning = data.status === 'running';
  const isSuccess = data.status === 'success';
  const isError = data.status === 'error';
  const statusColor = isRunning ? '#3B82F6' : isSuccess ? '#10B981' : isError ? '#EF4444' : null;

  const SIZE = 72;

  return (
    <div className="relative" style={{ width: SIZE }}>
      <div
        className="relative transition-all duration-150"
        style={{
          width: SIZE,
          height: SIZE,
          borderRadius: 10,
          background: '#FFFFFF',
          border: `1.5px solid ${selected ? '#FF6D5A' : '#D1D5DB'}`,
          boxShadow: selected
            ? '0 0 0 3px rgba(255,109,90,0.15)'
            : '0 1px 2px rgba(0,0,0,0.04)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          className="flex items-center justify-center"
          style={{
            width: 40,
            height: 40,
            borderRadius: 8,
            background: accent,
          }}
        >
          <Icon style={{ color: '#FFFFFF', width: 22, height: 22 }} strokeWidth={2} />
        </div>

        {statusColor && (
          <span
            className="absolute"
            style={{
              top: -4,
              right: -4,
              width: 12,
              height: 12,
              borderRadius: '50%',
              background: statusColor,
              border: '2px solid #FFFFFF',
              animation: isRunning ? 'pulse 1.5s ease-in-out infinite' : undefined,
            }}
          />
        )}

        {inputs > 0 && (
          <>
            {inputs === 1 ? (
              <Handle type="target" position={Position.Left} style={handleStyle('input')} />
            ) : (
              Array.from({ length: inputs }).map((_, i) => (
                <Handle
                  key={`input-${i}`}
                  type="target"
                  position={Position.Left}
                  id={`input-${i}`}
                  style={{ ...handleStyle('input'), top: `${((i + 1) / (inputs + 1)) * 100}%` }}
                />
              ))
            )}
          </>
        )}
        {outputs > 0 && (
          <>
            {outputs === 1 ? (
              <Handle type="source" position={Position.Right} style={handleStyle('output')} />
            ) : (
              Array.from({ length: outputs }).map((_, i) => (
                <Handle
                  key={`output-${i}`}
                  type="source"
                  position={Position.Right}
                  id={`output-${i}`}
                  style={{ ...handleStyle('output'), top: `${((i + 1) / (outputs + 1)) * 100}%` }}
                />
              ))
            )}
          </>
        )}
      </div>

      <div
        className="absolute left-1/2 -translate-x-1/2 text-center"
        style={{
          top: SIZE + 6,
          width: 140,
          fontSize: 12,
          fontWeight: 600,
          color: '#111827',
          lineHeight: 1.25,
          pointerEvents: 'none',
        }}
      >
        <div className="truncate">{data.label}</div>
        {data.description && (
          <div
            className="truncate"
            style={{ fontSize: 10, fontWeight: 400, color: '#6B7280', marginTop: 2 }}
          >
            {data.description}
          </div>
        )}
      </div>
    </div>
  );
}

function handleStyle(kind: 'input' | 'output'): React.CSSProperties {
  return {
    width: 10,
    height: 10,
    [kind === 'input' ? 'left' : 'right']: -5,
    background: '#FFFFFF',
    border: '1.5px solid #9CA3AF',
    transition: 'all 0.15s ease',
  } as React.CSSProperties;
}

export function NodeStatusBadge({ status, retries }: { status: string; retries?: number }) {
  const config: Record<string, { color: string; label: string }> = {
    idle: { color: 'text-gray-400', label: 'Idle' },
    running: { color: 'text-blue-500', label: 'Running' },
    success: { color: 'text-emerald-500', label: 'Success' },
    error: { color: 'text-red-500', label: 'Error' },
  };
  const { color, label } = config[status] || config.idle;
  return (
    <div className="flex items-center gap-2">
      <span className={`text-xs font-medium ${color}`}>{label}</span>
      {retries && retries > 0 && <span className="text-xs text-amber-500">({retries} retries)</span>}
    </div>
  );
}

export function NodeConfigPreview({ config }: { config: Record<string, any> }) {
  if (!config || Object.keys(config).length === 0) return null;
  const entries = Object.entries(config).slice(0, 2);
  return (
    <div className="space-y-0.5">
      {entries.map(([key, value]) => (
        <div key={key} className="flex items-center gap-1.5 text-[10px]">
          <span className="text-gray-400 capitalize">{key}:</span>
          <span className="text-gray-600 truncate max-w-[100px]">
            {typeof value === 'string' ? value : JSON.stringify(value).slice(0, 24)}
          </span>
        </div>
      ))}
    </div>
  );
}
