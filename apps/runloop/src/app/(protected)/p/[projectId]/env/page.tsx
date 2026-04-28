'use client';

// Project Env Vars page — plaintext per-project config, distinct from
// the encrypted Secrets table. Reachable from Settings tab strip.

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Plus, Trash2, Loader2, Edit2, Save, X } from 'lucide-react';
import { SharpButton } from '@/components/ControlChrome';

const MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

interface EnvVar {
  id: string;
  name: string;
  value: string;
  description?: string | null;
  updatedAt: string;
}

export default function EnvVarsPage() {
  const params = useParams();
  const projectId = params?.projectId as string;

  const [rows, setRows] = useState<EnvVar[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Inline editor state — null = closed, '' = creating new, id = editing
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formValue, setFormValue] = useState('');
  const [formDesc, setFormDesc] = useState('');

  const refresh = async () => {
    try {
      const r = await fetch(`/runloop/api/env-vars?projectId=${encodeURIComponent(projectId)}`);
      if (!r.ok) throw new Error(String(r.status));
      const d = await r.json();
      setRows(d.data || []);
    } catch (e) {
      // silent — table may not exist yet on older deploys
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [projectId]);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  };

  const startNew = () => {
    setEditingId('');
    setFormName('');
    setFormValue('');
    setFormDesc('');
  };

  const startEdit = (r: EnvVar) => {
    setEditingId(r.id);
    setFormName(r.name);
    setFormValue(r.value);
    setFormDesc(r.description || '');
  };

  const save = async () => {
    if (!formName.trim()) return flash('name required');
    setBusy(true);
    try {
      const res = await fetch('/runloop/api/env-vars', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          name: formName.trim(),
          value: formValue,
          description: formDesc.trim() || null,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
      flash('Saved');
      setEditingId(null);
      refresh();
    } catch (e: any) {
      flash(e.message || 'save failed');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (row: EnvVar) => {
    if (!confirm(`Delete env var "${row.name}"?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/runloop/api/env-vars/${row.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      flash('Deleted');
      refresh();
    } catch (e: any) {
      flash(e.message || 'delete failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-6 max-w-[820px]">
      {toast && (
        <div
          className="fixed bottom-6 right-6 z-50 px-4 py-2"
          style={{
            background: 'var(--t-accent)', color: '#fff',
            fontFamily: MONO, fontSize: 12, borderRadius: 4, letterSpacing: '0.04em',
          }}
        >
          {toast}
        </div>
      )}

      <div className="flex items-end justify-between mb-6 gap-4">
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600, color: 'var(--t-text)', letterSpacing: '-0.02em' }}>
            Environment Variables
          </h1>
          <p style={{ fontSize: 13, color: 'var(--t-text-muted)', marginTop: 6, lineHeight: 1.6 }}>
            Plaintext per-project config — API base URLs, region codes, feature flags. Reference inside flows as{' '}
            <code style={{ color: 'var(--t-accent)' }}>{'${{env.NAME}}'}</code>.
            For passwords / API keys use <a href="/runloop/secrets" style={{ color: 'var(--t-accent)' }}>Secrets</a> instead (encrypted).
          </p>
        </div>
        <SharpButton onClick={startNew} disabled={editingId !== null}>
          <Plus className="w-3.5 h-3.5" /> New variable
        </SharpButton>
      </div>

      {/* Inline editor for new / edit */}
      {editingId !== null && (
        <div
          className="mb-4 p-4"
          style={{ background: 'var(--t-panel)', border: '1px solid var(--t-border)', borderRadius: 4 }}
        >
          <div className="flex items-center justify-between mb-3">
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t-text)' }}>
              {editingId === '' ? 'New variable' : 'Edit variable'}
            </span>
            <button
              onClick={() => setEditingId(null)}
              style={{ color: 'var(--t-text-muted)', cursor: 'pointer' }}
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 gap-3">
            <div>
              <label style={{ fontSize: 11, color: 'var(--t-text-muted)', display: 'block', marginBottom: 4 }}>
                Name
              </label>
              <input
                value={formName}
                onChange={(e) => setFormName(e.target.value.toUpperCase())}
                placeholder="API_BASE_URL"
                disabled={editingId !== ''}
                style={{
                  width: '100%', background: 'var(--t-input)', border: '1px solid var(--t-border)',
                  color: 'var(--t-text)', borderRadius: 2, padding: '8px 10px',
                  fontFamily: MONO, fontSize: 12.5,
                  opacity: editingId !== '' ? 0.6 : 1,
                }}
              />
              <p style={{ fontSize: 10.5, color: 'var(--t-text-muted)', marginTop: 4 }}>
                UPPER_SNAKE_CASE recommended. {'a-zA-Z0-9_'} only, max 64 chars. Name is immutable after create.
              </p>
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--t-text-muted)', display: 'block', marginBottom: 4 }}>
                Value
              </label>
              <textarea
                value={formValue}
                onChange={(e) => setFormValue(e.target.value)}
                rows={2}
                placeholder="https://api.example.com/v1"
                style={{
                  width: '100%', background: 'var(--t-input)', border: '1px solid var(--t-border)',
                  color: 'var(--t-text)', borderRadius: 2, padding: '8px 10px',
                  fontFamily: MONO, fontSize: 12.5,
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--t-text-muted)', display: 'block', marginBottom: 4 }}>
                Description (optional)
              </label>
              <input
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                placeholder="What this is used for"
                style={{
                  width: '100%', background: 'var(--t-input)', border: '1px solid var(--t-border)',
                  color: 'var(--t-text)', borderRadius: 2, padding: '8px 10px',
                  fontSize: 12.5,
                }}
              />
            </div>
            <div className="flex items-center gap-2">
              <SharpButton onClick={save} disabled={busy}>
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Save
              </SharpButton>
              <SharpButton variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                Cancel
              </SharpButton>
            </div>
          </div>
        </div>
      )}

      {/* List */}
      <div style={{ background: 'var(--t-panel)', border: '1px solid var(--t-border)', borderRadius: 4 }}>
        {loading ? (
          <div className="p-8 text-center" style={{ color: 'var(--t-text-muted)' }}>
            <Loader2 className="w-5 h-5 mx-auto animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center" style={{ color: 'var(--t-text-muted)', fontSize: 13 }}>
            No environment variables yet — click <strong>New variable</strong> to add one.
          </div>
        ) : (
          rows.map((r, i) => (
            <div
              key={r.id}
              className="flex items-start justify-between gap-3 px-4 py-3"
              style={{ borderTop: i === 0 ? 'none' : '1px solid var(--t-border-light)' }}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <code style={{ fontFamily: MONO, fontSize: 13, fontWeight: 600, color: 'var(--t-accent)' }}>
                    {r.name}
                  </code>
                  <span style={{ fontSize: 10.5, color: 'var(--t-text-muted)', fontFamily: MONO }}>
                    {'${{env.' + r.name + '}}'}
                  </span>
                </div>
                <div
                  className="mt-1"
                  style={{
                    fontFamily: MONO, fontSize: 12, color: 'var(--t-text)',
                    wordBreak: 'break-all',
                  }}
                >
                  {r.value || <span style={{ color: 'var(--t-text-muted)' }}>(empty)</span>}
                </div>
                {r.description && (
                  <p style={{ fontSize: 11.5, color: 'var(--t-text-muted)', marginTop: 4 }}>
                    {r.description}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => startEdit(r)}
                  className="p-1.5 hover:opacity-70"
                  title="Edit"
                  style={{ color: 'var(--t-text-muted)' }}
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => remove(r)}
                  className="p-1.5 hover:opacity-70"
                  title="Delete"
                  style={{ color: 'var(--t-error, #ef4444)' }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
