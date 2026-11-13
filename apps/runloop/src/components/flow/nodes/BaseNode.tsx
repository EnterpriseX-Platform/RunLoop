'use client';

import React from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { RL_NODE_ICONS } from '../../icons/RunLoopIcons';
import {
  Play, Square, Globe, Database, Terminal, Code2, Hash,
  Slack, Mail, GitBranch, Clock, RotateCcw, Variable, Container,
  GitMerge, Split, FileText, PenLine, Workflow, Webhook, Hourglass, Inbox, BellRing, Sparkles,
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
  notify: BellRing,
  ai: Sparkles,
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
  notify:       { hex: '#F59E0B', label: 'Notify' },
  ai:           { hex: '#8B5CF6', label: 'AI' },
};

const MONO = "'IBM Plex Sans Thai', 'IBM Plex Sans', system-ui, sans-serif";

interface BaseNodeProps extends NodeProps<BaseNodeData> {
  children?: React.ReactNode;
  /** Names shown beside each output pin (branches). */
  outputLabels?: string[];
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
// React Flow node type ('setVarNode') -> palette key ('set_variable').
const NODE_TYPE_KEY: Record<string, string> = {
  setvar: 'set_variable', webhook: 'webhook_out', waitwebhook: 'wait_webhook',
};
export function resolveKind(dataType: string | undefined, nodeType: string | undefined): string {
  if (dataType) return dataType.toLowerCase();
  const raw = (nodeType || '').replace(/Node$/, '').toLowerCase();
  return NODE_TYPE_KEY[raw] || raw;
}

export function BaseNode({ data, type: nodeType, selected, inputs = 1, outputs = 1, outputLabels }: BaseNodeProps) {
  const type = resolveKind(data.type, nodeType);
  const c = colorMap[type] || colorMap.http;
  const Icon = (RL_NODE_ICONS[type] || iconMap[type] || Globe) as React.ElementType;
  const accent = c.hex;

  const isRunning = data.status === 'running';
  const isSuccess = data.status === 'success';
  const isError = data.status === 'error';
  const isStart = type === 'start';
  const isEnd = type === 'end';
  const summary = data.description || summarize(type, data.config);

  // Card: icon tile, small type label, name, one-line summary. Ports sit
  // on the left/right edges as round pins; the selected card gets a 2px
  // ink outline, a failing one a red outline.
  const ring = isError
    ? 'inset 0 0 0 2px var(--t-error)'
    : selected
      ? 'inset 0 0 0 2px var(--t-text)'
      : 'none';

  const tileStyle: React.CSSProperties = isStart
    ? { background: 'var(--t-text)', color: 'var(--t-bg)' }
    : isEnd
      ? { background: 'transparent', color: 'var(--t-text-secondary)', boxShadow: 'inset 0 0 0 1.5px var(--t-border-strong)' }
      : { background: `color-mix(in srgb, ${accent} 16%, transparent)`, color: accent };

  return (
    <div
      className="relative group"
      style={{
        width: CARD_W,
        minHeight: 70,
        display: 'grid',
        gridTemplateColumns: '36px minmax(0, 1fr)',
        alignItems: 'center',
        gap: 10,
        padding: '10px 12px 10px 10px',
        background: isEnd ? 'var(--t-input)' : 'var(--flow-node-bg)',
        boxShadow: ring,
        transition: 'box-shadow 0.12s',
      }}
    >
      <div
        className="flex items-center justify-center"
        style={{ width: 36, height: 36, ...tileStyle }}
      >
        <Icon style={{ width: 20, height: 20 }} strokeWidth={1.7} />
      </div>

      <div className="min-w-0" style={{ display: 'grid', gap: 1 }}>
        <small style={{ fontSize: 11.5, lineHeight: '15px', fontWeight: 600, color: 'var(--t-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
          {c.label}
        </small>
        <b className="truncate" style={{ fontSize: 14.5, lineHeight: '19px', fontWeight: 600, color: 'var(--t-text)' }}>
          {data.label}
        </b>
        {summary && (
          <span className="truncate" style={{ fontSize: 12.5, lineHeight: '16px', color: 'var(--t-text-secondary)' }}>
            {summary}
          </span>
        )}
      </div>

      {(isSuccess || isRunning) && (
        <span
          aria-label={isSuccess ? 'Ran' : 'Running'}
          className="absolute flex items-center justify-center"
          style={{
            top: -8, left: -8, width: 18, height: 18, borderRadius: '50%',
            background: isSuccess ? 'var(--t-success)' : 'var(--t-accent)',
            color: '#fff', boxShadow: '0 0 0 2px var(--flow-canvas-bg)',
            fontSize: 11, lineHeight: 1,
            animation: isRunning ? 'pulse 1.5s ease-in-out infinite' : undefined,
          }}
        >
          {isSuccess ? '✓' : ''}
        </span>
      )}

      {inputs > 0 && (
        inputs === 1 ? (
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
        )
      )}
      {outputs > 0 && (
        outputs === 1 ? (
          <Handle type="source" position={Position.Right} style={handleStyle('output')} />
        ) : (
          Array.from({ length: outputs }).map((_, i) => {
            const top = `${((i + 1) / (outputs + 1)) * 100}%`;
            const label = outputLabels?.[i];
            return (
              <React.Fragment key={`output-${i}`}>
                <Handle
                  type="source"
                  position={Position.Right}
                  id={`output-${i}`}
                  style={{ ...handleStyle('output'), top }}
                />
                {label && (
                  <span
                    className="absolute pointer-events-none whitespace-nowrap"
                    style={{ left: 'calc(100% + 10px)', top, marginTop: -18, fontSize: 12.5, lineHeight: '16px', fontWeight: 600, color: 'var(--t-text-secondary)' }}
                  >
                    {label}
                  </span>
                )}
              </React.Fragment>
            );
          })
        )
      )}
    </div>
  );
}

const CARD_W = 184;

// One line that says what the step does, from its own settings.
function summarize(type: string, config?: Record<string, any>): string {
  if (!config) return '';
  const pick = (...keys: string[]) => keys.map((k) => config[k]).find((v) => typeof v === 'string' && v.trim());
  switch (type) {
    case 'http':
    case 'webhook_out': {
      const url = pick('url');
      return url ? `${(config.method || 'GET').toUpperCase()} ${url}` : '';
    }
    case 'database': return pick('query', 'operation') || '';
    case 'shell': return pick('command', 'script') || '';
    case 'python':
    case 'nodejs': return pick('code', 'script') ? `${String(pick('code', 'script')).split('\n')[0]}` : '';
    case 'slack': return [pick('channel'), pick('text', 'message')].filter(Boolean).join(' · ');
    case 'email': return pick('to', 'subject') || '';
    case 'delay': return config.duration ? `Wait ${config.duration}` : pick('until') || '';
    case 'condition': return pick('expression', 'condition') || '';
    case 'ai': return pick('model', 'prompt') || '';
    default: return pick('name', 'message', 'text') || '';
  }
}

function handleStyle(kind: 'input' | 'output'): React.CSSProperties {
  return {
    width: 12,
    height: 12,
    borderRadius: '50%',
    [kind === 'input' ? 'left' : 'right']: -6,
    background: 'var(--flow-node-bg)',
    border: '2px solid var(--t-text-secondary)',
    transition: 'border-color 0.12s',
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
      style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 0 }}
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
