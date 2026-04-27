'use client';

import React from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import {
  Play, Square, Globe, Database, Terminal, Code2, Hash,
  Slack, Mail, GitBranch, Clock, RotateCcw, Variable, Container,
  GitMerge, Split, FileText, PenLine, Workflow, Webhook, Hourglass, Inbox,
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
  enqueue: Inbox,
};

const colorMap: Record<string, { hex: string; label: string }> = {
  start:        { hex: '#10B981', label: 'Start' },
  end:          { hex: '#EF4444', label: 'End' },
  http:         { hex: '#3B82F6', label: 'HTTP' },
  database:     { hex: '#06B6D4', label: 'Database' },
  shell:        { hex: '#F59E0B', label: 'Shell' },
  python:       { hex: '#EAB308', label: 'Python' },
  nodejs:       { hex: '#22C55E', label: 'Node.js' },
  docker:       { hex: '#0EA5E9', label: 'Docker' },
  slack:        { hex: '#A855F7', label: 'Slack' },
  email:        { hex: '#F97316', label: 'Email' },
  condition:    { hex: '#EC4899', label: 'Condition' },
  delay:        { hex: '#64748B', label: 'Delay' },
  loop:         { hex: '#6366F1', label: 'Loop' },
  transform:    { hex: '#14B8A6', label: 'Transform' },
  merge:        { hex: '#0891B2', label: 'Merge' },
  switch:       { hex: '#D946EF', label: 'Switch' },
  log:          { hex: '#78716C', label: 'Log' },
  set_variable: { hex: '#0D9488', label: 'Set Variable' },
  subflow:      { hex: '#7C3AED', label: 'Sub-flow' },
  webhook_out:  { hex: '#F43F5E', label: 'Webhook' },
  wait_webhook: { hex: '#FB923C', label: 'Wait Webhook' },
  enqueue:      { hex: '#0EA5E9', label: 'Enqueue' },
};

const MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

interface BaseNodeProps extends NodeProps<BaseNodeData> {
  children?: React.ReactNode;
  inputs?: number;
  outputs?: number;
}

/**
 * Control-room-styled node: sharp-cornered card that uses the app's
 * theme tokens so dark + light themes both feel native. The left edge
 * gets a colored accent bar (mirrors the login page's focused-input
 * bar), the icon fill is tinted by the node's category color, and the
 * label sits below in mono to match the schematic vocabulary. Handles
 * are tiny squares, not pale circles — visually closer to pin-out
 * diagrams than to a generic node-editor.
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

  const SIZE = 76;

  return (
    <div className="relative" style={{ width: SIZE }}>
      <div
        className="relative transition-all duration-150"
        style={{
          width: SIZE,
          height: SIZE,
          borderRadius: 2,
          background: 'var(--t-panel)',
          border: selected
            ? `1px solid ${accent}`
            : '1px solid var(--t-border)',
          boxShadow: selected
            ? `0 0 0 3px color-mix(in srgb, ${accent} 18%, transparent)`
            : 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Left accent bar — same motif as login's focused inputs and
            sidebar's active nav item. Subtle unless selected. */}
        <span
          aria-hidden
          style={{
            position: 'absolute',
            left: 0, top: 4, bottom: 4,
            width: 2,
            background: accent,
            opacity: selected ? 1 : 0.55,
            transition: 'opacity 0.15s',
          }}
        />

        <div
          className="flex items-center justify-center"
          style={{
            width: 40,
            height: 40,
            borderRadius: 2,
            background: `color-mix(in srgb, ${accent} 16%, transparent)`,
            border: `1px solid color-mix(in srgb, ${accent} 40%, transparent)`,
          }}
        >
          <Icon style={{ color: accent, width: 20, height: 20 }} strokeWidth={1.75} />
        </div>

        {statusColor && (
          <span
            className="absolute"
            style={{
              top: -4,
              right: -4,
              width: 10,
              height: 10,
              borderRadius: 2,
              background: statusColor,
              boxShadow: `0 0 0 3px color-mix(in srgb, ${statusColor} 20%, transparent)`,
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

      {/* Label below the card, in mono — reads like a pin-out callout. */}
      <div
        className="absolute left-1/2 -translate-x-1/2 text-center"
        style={{
          top: SIZE + 6,
          width: 148,
          fontFamily: MONO,
          fontSize: 11,
          fontWeight: 500,
          letterSpacing: '0.02em',
          color: 'var(--t-text)',
          lineHeight: 1.3,
          pointerEvents: 'none',
        }}
      >
        <div className="truncate">{data.label}</div>
        {data.description && (
          <div
            className="truncate"
            style={{
              fontFamily: MONO,
              fontSize: 9.5,
              fontWeight: 400,
              color: 'var(--t-text-muted)',
              marginTop: 2,
              letterSpacing: '0.04em',
            }}
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
    width: 8,
    height: 8,
    borderRadius: 1,
    [kind === 'input' ? 'left' : 'right']: -4,
    background: 'var(--t-bg)',
    border: '1px solid var(--t-text-muted)',
    transition: 'all 0.15s ease',
  } as React.CSSProperties;
}

export function NodeStatusBadge({ status, retries }: { status: string; retries?: number }) {
  const config: Record<string, { color: string; label: string }> = {
    idle:    { color: 'var(--t-text-muted)', label: 'IDLE' },
    running: { color: '#3B82F6', label: 'RUNNING' },
    success: { color: '#10B981', label: 'SUCCESS' },
    error:   { color: '#EF4444', label: 'ERROR' },
  };
  const { color, label } = config[status] || config.idle;
  return (
    <div
      className="flex items-center gap-2"
      style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.1em' }}
    >
      <span style={{ color }}>{label}</span>
      {retries && retries > 0 && (
        <span style={{ color: '#F59E0B' }}>({retries} retries)</span>
      )}
    </div>
  );
}

export function NodeConfigPreview({ config }: { config: Record<string, any> }) {
  if (!config || Object.keys(config).length === 0) return null;
  const entries = Object.entries(config).slice(0, 2);
  return (
    <div className="space-y-0.5" style={{ fontFamily: MONO }}>
      {entries.map(([key, value]) => (
        <div key={key} className="flex items-center gap-1.5 text-[10px]">
          <span style={{ color: 'var(--t-text-muted)' }}>{key}:</span>
          <span
            className="truncate max-w-[100px]"
            style={{ color: 'var(--t-text-secondary)' }}
          >
            {typeof value === 'string' ? value : JSON.stringify(value).slice(0, 24)}
          </span>
        </div>
      ))}
    </div>
  );
}
