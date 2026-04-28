'use client';

// Combobox — searchable dropdown that replaces native <select> for
// long-list cases (flow picker, queue picker, scheduler picker).
//
// Why not a third-party component:
//   * The app already pulls a heavy bundle; one more dropdown lib is
//     hard to justify.
//   * Native <select> looks dated (especially on macOS Safari) and
//     lacks search, which is the actual UX gap the user flagged.
//   * Keyboard-only nav + accessible labels are easy enough by hand.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronsUpDown, Search, X } from 'lucide-react';

const MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

export interface ComboboxOption {
  value: string;
  label: string;
  // Optional secondary text shown in muted color (e.g. ID, type).
  hint?: string;
  // Disabled options are visible but unselectable.
  disabled?: boolean;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  options: ComboboxOption[];
  placeholder?: string;
  // When true, lets the user type a value not in the list (free-form).
  // Off by default — most pickers want to constrain to known options.
  allowFreeText?: boolean;
  disabled?: boolean;
  className?: string;
  // Lookup label for an arbitrary value (in case `value` is set to
  // something not currently in `options`, e.g. a flowId whose flow was
  // deleted). Defaults to the value itself.
  resolveLabel?: (value: string) => string | undefined;
}

export function Combobox({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  allowFreeText = false,
  disabled = false,
  className = '',
  resolveLabel,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  // Auto-focus input when opening.
  useEffect(() => {
    if (open) {
      setQuery('');
      setHighlight(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const filtered = useMemo(() => {
    if (!query) return options;
    const q = query.toLowerCase();
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        o.value.toLowerCase().includes(q) ||
        (o.hint || '').toLowerCase().includes(q),
    );
  }, [options, query]);

  // Selected display text. If the current value isn't in options, fall
  // back to the resolver / value itself so a deleted flow still shows
  // something (vs reverting to the placeholder which would feel like
  // data loss).
  const selectedLabel = useMemo(() => {
    const hit = options.find((o) => o.value === value);
    if (hit) return hit.label;
    if (!value) return '';
    return resolveLabel?.(value) || value;
  }, [options, value, resolveLabel]);

  const select = (v: string) => {
    onChange(v);
    setOpen(false);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const opt = filtered[highlight];
      if (opt && !opt.disabled) select(opt.value);
      else if (allowFreeText && query) select(query);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 hover:opacity-95 transition"
        style={{
          background: 'var(--t-input)',
          border: '1px solid var(--t-border)',
          color: value ? 'var(--t-text)' : 'var(--t-text-muted)',
          borderRadius: 4,
          padding: '8px 10px',
          fontFamily: MONO,
          fontSize: 12.5,
          textAlign: 'left',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.6 : 1,
        }}
      >
        <span className="truncate flex-1">{selectedLabel || placeholder}</span>
        {value && !disabled && (
          <span
            onClick={(e) => { e.stopPropagation(); onChange(''); }}
            className="hover:opacity-70"
            style={{ color: 'var(--t-text-muted)' }}
            title="Clear"
          >
            <X className="w-3.5 h-3.5" />
          </span>
        )}
        <ChevronsUpDown className="w-3.5 h-3.5" style={{ color: 'var(--t-text-muted)' }} />
      </button>

      {open && (
        <div
          className="absolute left-0 right-0 mt-1 z-50 shadow-xl"
          style={{
            background: 'var(--t-panel)',
            border: '1px solid var(--t-border)',
            borderRadius: 4,
            maxHeight: 280,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            className="flex items-center gap-2 px-2 py-1.5"
            style={{ borderBottom: '1px solid var(--t-border-light)' }}
          >
            <Search className="w-3.5 h-3.5" style={{ color: 'var(--t-text-muted)' }} />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKey}
              placeholder="Search…"
              className="flex-1 bg-transparent outline-none"
              style={{
                fontSize: 12.5,
                color: 'var(--t-text)',
                fontFamily: MONO,
              }}
            />
          </div>

          <div className="overflow-y-auto" style={{ maxHeight: 220 }}>
            {filtered.length === 0 ? (
              <div className="px-3 py-3 text-center" style={{ fontSize: 11.5, color: 'var(--t-text-muted)' }}>
                {allowFreeText && query
                  ? <span>No match — Enter to use &ldquo;{query}&rdquo;</span>
                  : 'No matches'}
              </div>
            ) : (
              filtered.map((opt, i) => {
                const isSelected = opt.value === value;
                const isHighlighted = i === highlight;
                return (
                  <div
                    key={opt.value}
                    onClick={() => !opt.disabled && select(opt.value)}
                    onMouseEnter={() => setHighlight(i)}
                    className="flex items-center justify-between gap-2 px-3 py-2 cursor-pointer transition"
                    style={{
                      background: isHighlighted ? 'var(--t-input)' : 'transparent',
                      opacity: opt.disabled ? 0.5 : 1,
                      cursor: opt.disabled ? 'not-allowed' : 'pointer',
                    }}
                  >
                    <div className="min-w-0 flex-1">
                      <div style={{ fontSize: 12.5, color: 'var(--t-text)' }} className="truncate">
                        {opt.label}
                      </div>
                      {opt.hint && (
                        <div
                          style={{ fontSize: 10.5, color: 'var(--t-text-muted)', fontFamily: MONO }}
                          className="truncate"
                        >
                          {opt.hint}
                        </div>
                      )}
                    </div>
                    {isSelected && (
                      <Check className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--t-accent)' }} />
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
