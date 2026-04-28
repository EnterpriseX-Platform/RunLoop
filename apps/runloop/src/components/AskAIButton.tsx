'use client';

// AskAIButton — small inline button that opens the AIAssistant panel
// pre-filled with a specific prompt. The page context (execution, flow,
// scheduler, queue) is auto-injected by usePageContext on the panel
// side, so the model sees the actual data without anything extra here.

import { Sparkles } from 'lucide-react';

interface Props {
  prompt: string;
  label?: string;
  size?: 'sm' | 'md';
  className?: string;
}

export function AskAIButton({ prompt, label, size = 'sm', className = '' }: Props) {
  const onClick = () => {
    window.dispatchEvent(new CustomEvent('ai-ask', { detail: { prompt } }));
  };
  const padding = size === 'sm' ? '4px 9px' : '6px 12px';
  const fontSize = size === 'sm' ? 11 : 12;
  return (
    <button
      type="button"
      onClick={onClick}
      title={prompt}
      className={`inline-flex items-center gap-1.5 hover:opacity-90 transition ${className}`}
      style={{
        background: 'color-mix(in srgb, var(--t-accent) 12%, transparent)',
        color: 'var(--t-accent)',
        border: '1px solid color-mix(in srgb, var(--t-accent) 30%, transparent)',
        borderRadius: 999,
        padding,
        fontSize,
        fontWeight: 500,
        letterSpacing: '0.01em',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      <Sparkles className={size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
      {label || 'Ask AI'}
    </button>
  );
}
