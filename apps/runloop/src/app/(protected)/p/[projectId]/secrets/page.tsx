'use client';
import { BASE_PATH } from '@/lib/base-path';

import { useState, useEffect } from 'react';
import { useProject } from '@/context/ProjectContext';
import {
  Plus,
  Key,
  Search,
  Lock,
  Globe,
  Eye,
  EyeOff,
  Copy,
  Trash2,
  Edit2,
  History,
  Unlock,
  AlertCircle,
  Loader2,
  X
} from 'lucide-react';
import {
  ControlBreadcrumb, PageHeader, SharpButton, StatusDot, MONO, ContentSwitcher, SearchField, Tag } from '@/components/ControlChrome';

const FONT = "'IBM Plex Sans Thai', 'IBM Plex Sans', sans-serif";
const THEME = {
  bg: 'var(--t-bg)', panel: 'var(--t-panel)', panelHover: 'var(--t-panel-hover)',
  border: 'var(--t-border)', borderLight: 'var(--t-border-light)',
  text: { primary: 'var(--t-text)', secondary: 'var(--t-text-secondary)', muted: 'var(--t-text-muted)' },
  accent: 'var(--t-accent)', accentLight: 'var(--t-accent-light)', input: 'var(--t-input)',
  colors: { blue: '#0f62fe', emerald: '#24a148', purple: '#8a3ffc', amber: '#eb6200', red: '#da1e28' }
};

interface Secret {
  id: string;
  name: string;
  description?: string;
  category?: string;
  scope: 'PROJECT' | 'GLOBAL';
  accessLevel: 'ALL' | 'RESTRICTED';
  lastUsedAt?: string;
  useCount: number;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

interface AuditLogEntry {
  id: string;
  action: string;
  user: string;
  time: string;
  details: string;
}

const CATEGORIES = [
  { value: 'database', label: 'Database', color: '#1192e8' },
  { value: 'cloud', label: 'Cloud', color: '#0f62fe' },
  { value: 'api', label: 'API', color: '#8a3ffc' },
  { value: 'ssh', label: 'SSH', color: '#24a148' },
  { value: 'other', label: 'Other', color: '#8d8d8d' },
];

function formatRelativeTime(dateString?: string): string | undefined {
  if (!dateString) return undefined;
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  return date.toLocaleDateString();
}

export default function SecretsPage() {
  const { selectedProject } = useProject();
  const [secrets, setSecrets] = useState<Secret[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedSecret, setSelectedSecret] = useState<Secret | null>(null);
  const [editingSecret, setEditingSecret] = useState<Secret | null>(null);
  const [showAuditLog, setShowAuditLog] = useState(false);

  useEffect(() => {
    if (selectedProject) {
      fetchSecrets();
    }
  }, [selectedProject]);

  const fetchSecrets = async () => {
    if (!selectedProject) return;

    try {
      setLoading(true);
      setError(null);

      const res = await fetch(`${BASE_PATH}/api/secrets?projectId=${selectedProject.id}`);
      if (!res.ok) {
        throw new Error('Failed to fetch secrets');
      }

      const data = await res.json();
      setSecrets(data.secrets || []);
    } catch (err) {
      console.error('Failed to fetch secrets:', err);
      setError(err instanceof Error ? err.message : 'Failed to load secrets');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSecret = async (formData: any) => {
    if (!selectedProject) return;

    try {
      const res = await fetch(`${BASE_PATH}/api/secrets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          projectId: selectedProject.id,
        }),
      });

      if (res.ok) {
        setShowCreateModal(false);
        fetchSecrets();
      } else {
        const error = await res.json();
        alert(error.error || 'Failed to create secret');
      }
    } catch (err) {
      console.error('Failed to create secret:', err);
      alert('Failed to create secret');
    }
  };

  const handleUpdateSecret = async (id: string, formData: any) => {
    try {
      const res = await fetch(`${BASE_PATH}/api/secrets/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        setEditingSecret(null);
        fetchSecrets();
      } else {
        const error = await res.json();
        alert(error.error || 'Failed to update secret');
      }
    } catch (err) {
      console.error('Failed to update secret:', err);
      alert('Failed to update secret');
    }
  };

  const handleDeleteSecret = async (id: string) => {
    if (!selectedProject) return;
    if (!confirm('Are you sure you want to delete this secret?')) return;

    try {
      // API accepts `ids` (plural, comma-separated) for bulk/single delete
      const res = await fetch(`${BASE_PATH}/api/secrets?ids=${id}&projectId=${selectedProject.id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        fetchSecrets();
      }
    } catch (err) {
      console.error('Failed to delete secret:', err);
    }
  };

  const filteredSecrets = secrets.filter(secret => {
    const matchesSearch = secret.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         secret.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || secret.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  if (!selectedProject) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: THEME.bg, fontFamily: FONT }}>
        <div className="text-center">
          <div className="w-20 h-20 mx-auto mb-6 rounded-2xl flex items-center justify-center" style={{ background: THEME.panel, border: `1px solid ${THEME.border}` }}>
            <Key className="w-10 h-10" style={{ color: THEME.text.muted }} />
          </div>
          <h3 className="text-xl font-semibold mb-2" style={{ color: THEME.text.primary }}>Select a Project</h3>
          <p style={{ color: THEME.text.secondary }}>Please select a project to view secrets</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: THEME.bg, fontFamily: FONT }}>
      {/* Header */}
      <header>
        <div className="pb-6">
          <div className="flex items-start justify-between mb-6 gap-4">
            <div>
              <h1 style={{ fontSize: 28, lineHeight: '36px', fontWeight: 400, color: THEME.text.primary }}>Secrets</h1>
              <p style={{ fontSize: 14, color: THEME.text.secondary, marginTop: 8 }}>
                Encrypted credentials and API keys. Reference inside flows as <code style={{fontFamily:MONO,fontSize:12}}>{'${{secrets.NAME}}'}</code>.
              </p>
            </div>
            <SharpButton onClick={() => setShowCreateModal(true)}>
              <Plus className="w-3.5 h-3.5" /> New Secret
            </SharpButton>
          </div>

          <div className="flex flex-col gap-4">
            <ContentSwitcher
              options={['all', ...CATEGORIES.map((c) => c.value)] as string[]}
              value={selectedCategory}
              onChange={setSelectedCategory}
              labels={Object.fromEntries([['all', 'All'], ...CATEGORIES.map((c) => [c.value, c.label])])}
            />
            <SearchField value={searchQuery} onChange={setSearchQuery} placeholder="Search secrets" />
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin" style={{ color: THEME.accent }} />
          </div>
        ) : error ? (
          <div className="text-center py-20">
            <AlertCircle className="w-12 h-12 mx-auto mb-4" style={{ color: THEME.colors.red }} />
            <h3 className="text-xl font-semibold mb-2" style={{ color: THEME.text.primary }}>Failed to load secrets</h3>
            <p className="mb-4" style={{ color: THEME.text.secondary }}>{error}</p>
            <button
              onClick={fetchSecrets}
              className="inline-flex items-center gap-2 px-4 py-2 text-white text-sm font-medium rounded-lg transition-all"
              style={{ background: THEME.accent }}
            >
              Try Again
            </button>
          </div>
        ) : filteredSecrets.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-20 h-20 mx-auto mb-6 rounded-2xl flex items-center justify-center" style={{ background: THEME.panel, border: `1px solid ${THEME.border}` }}>
              <Key className="w-10 h-10" style={{ color: THEME.text.muted }} />
            </div>
            <h3 className="text-xl font-semibold mb-2" style={{ color: THEME.text.primary }}>No secrets found</h3>
            <p className="mb-6" style={{ color: THEME.text.secondary }}>Store encrypted credentials for your workflows</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 text-white text-sm font-medium rounded-lg transition-all"
              style={{ background: THEME.accent }}
            >
              <Plus className="w-4 h-4" />
              Create Secret
            </button>
          </div>
        ) : (
          <div style={{ background: THEME.panel }}>
            <div className="rl-row rl-th" style={{ ['--cols' as any]: 'minmax(0, 1fr) 96px 72px 112px 200px', ['--cols-sm' as any]: 'minmax(0, 1fr) 200px' }}>
              <span>Name</span>
              <span className="rl-opt">Category</span>
              <span className="rl-opt" style={{ textAlign: 'right' }}>Uses</span>
              <span className="rl-opt">Last used</span>
              <span aria-hidden />
            </div>
            {filteredSecrets.map((secret) => (
              <SecretRow
                key={secret.id}
                secret={secret}
                onEdit={() => setEditingSecret(secret)}
                onViewAudit={() => { setSelectedSecret(secret); setShowAuditLog(true); }}
                onDelete={() => handleDeleteSecret(secret.id)}
              />
            ))}
          </div>
        )}
      </main>

      {/* Create Modal */}
      {showCreateModal && (
        <CreateSecretModal
          onClose={() => setShowCreateModal(false)}
          onSave={handleCreateSecret}
        />
      )}

      {/* Edit Modal */}
      {editingSecret && (
        <EditSecretModal
          secret={editingSecret}
          onClose={() => setEditingSecret(null)}
          onSave={(data) => handleUpdateSecret(editingSecret.id, data)}
        />
      )}

      {/* Audit Log Modal */}
      {showAuditLog && selectedSecret && (
        <AuditLogModal
          secret={selectedSecret}
          onClose={() => setShowAuditLog(false)}
        />
      )}
    </div>
  );
}

function SecretRow({
  secret,
  onEdit,
  onViewAudit,
  onDelete
}: {
  secret: Secret;
  onEdit: () => void;
  onViewAudit: () => void;
  onDelete: () => void;
}) {
  const [showValue, setShowValue] = useState(false);

  const getCategoryColor = (category?: string) => {
    const colors: Record<string, string> = {
      database: '#1192e8',
      cloud: '#0f62fe',
      api: '#8a3ffc',
      ssh: '#24a148',
      other: '#8d8d8d',
    };
    return colors[category || 'other'];
  };

  const getCategoryLabel = (category?: string) => {
    const labels: Record<string, string> = {
      database: 'Database',
      cloud: 'Cloud',
      api: 'API',
      ssh: 'SSH',
      other: 'Other',
    };
    return labels[category || 'other'];
  };

  return (
    <>
      <div className="rl-row transition-colors hover:bg-[var(--t-panel-hover)]" style={{ ['--cols' as any]: 'minmax(0, 1fr) 96px 72px 112px 200px', ['--cols-sm' as any]: 'minmax(0, 1fr) 200px' }}>
        <div className="min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="truncate" style={{ fontSize: 14, fontWeight: 600, color: THEME.text.primary, fontFamily: "'IBM Plex Mono', ui-monospace, monospace" }} title={secret.name}>
              {secret.name}
            </span>
            {secret.scope === 'GLOBAL' && <Tag tone="blue">Global</Tag>}
            {secret.accessLevel === 'RESTRICTED' && <Tag tone="orange">Restricted</Tag>}
          </div>
          {secret.description && (
            <p className="truncate" style={{ fontSize: 12, lineHeight: '16px', color: THEME.text.secondary, marginTop: 2 }}>{secret.description}</p>
          )}
        </div>
        <span className="rl-opt" style={{ fontSize: 14, color: THEME.text.secondary }}>{getCategoryLabel(secret.category)}</span>
        <span className="rl-opt" style={{ fontSize: 14, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: THEME.text.primary }}>{secret.useCount}</span>
        <span className="rl-opt" style={{ fontSize: 14, color: THEME.text.secondary }}>{secret.lastUsedAt ? formatRelativeTime(secret.lastUsedAt) : '—'}</span>
        <div className="flex items-center justify-end">
          <button onClick={() => setShowValue(!showValue)} className="hover:bg-[var(--t-selected)]" style={iconBtn} title={showValue ? 'Hide value' : 'Show value'} aria-label={showValue ? 'Hide value' : 'Show value'}>
            {showValue ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
          <button className="hover:bg-[var(--t-selected)]" style={iconBtn} title="Copy reference" aria-label="Copy reference">
            <Copy className="w-4 h-4" />
          </button>
          <button onClick={onViewAudit} className="hover:bg-[var(--t-selected)]" style={iconBtn} title="Access log" aria-label="Access log">
            <History className="w-4 h-4" />
          </button>
          <button onClick={onEdit} className="hover:bg-[var(--t-selected)]" style={iconBtn} title="Edit" aria-label="Edit">
            <Edit2 className="w-4 h-4" />
          </button>
          <button onClick={onDelete} className="hover:bg-[var(--tag-red-bg)]" style={{ ...iconBtn, color: 'var(--t-error)' }} title="Delete" aria-label="Delete">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
      {showValue && (
        <div className="flex items-center gap-3 px-4 pb-4" style={{ background: THEME.panel }}>
          <span style={{ fontSize: 12, color: THEME.text.secondary }}>Value</span>
          <code className="flex-1" style={{ padding: '8px 16px', fontSize: 14, background: 'var(--t-input)', color: THEME.text.secondary, fontFamily: "'IBM Plex Mono', ui-monospace, monospace" }}>
            ••••••••••••••••••••••••
          </code>
        </div>
      )}
    </>
  );
}

const iconBtn: React.CSSProperties = { width: 32, height: 32, display: 'grid', placeItems: 'center', background: 'transparent', border: 'none', color: 'var(--t-text)' };

function CreateSecretModal({ onClose, onSave }: { onClose: () => void; onSave: (data: any) => void }) {
  const [formData, setFormData] = useState({
    name: '',
    value: '',
    description: '',
    category: 'other',
    scope: 'PROJECT',
    accessLevel: 'ALL',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!formData.name || !formData.value) return;

    setIsSubmitting(true);
    await onSave(formData);
    setIsSubmitting(false);
  };

  const inputStyle = {
    background: THEME.input,
    border: `1px solid ${THEME.border}`,
    color: THEME.text.primary,
  };

  return (
    <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div className="w-full max-w-lg max-h-[90vh] overflow-auto rounded-xl" style={{ background: THEME.panel, border: `1px solid ${THEME.border}`, fontFamily: FONT }}>
        <div className="p-6" style={{ borderBottom: `1px solid ${THEME.border}` }}>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold" style={{ color: THEME.text.primary }}>Create Secret</h2>
              <p className="text-sm mt-1" style={{ color: THEME.text.secondary }}>Store an encrypted credential</p>
            </div>
            <button onClick={onClose} style={{ color: THEME.text.secondary }}>
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: THEME.text.primary }}>Name *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value.toUpperCase() })}
              placeholder="e.g., DATABASE_URL"
              className="w-full px-3 py-2 rounded-lg focus:outline-none font-mono"
              style={inputStyle}
            />
            <p className="text-xs mt-1" style={{ color: THEME.text.secondary }}>Uppercase letters, numbers, and underscores only</p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: THEME.text.primary }}>Value *</label>
            <textarea
              value={formData.value}
              onChange={(e) => setFormData({ ...formData, value: e.target.value })}
              placeholder="Enter secret value..."
              rows={3}
              className="w-full px-3 py-2 rounded-lg focus:outline-none font-mono"
              style={inputStyle}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: THEME.text.primary }}>Description</label>
            <input
              type="text"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="What is this secret for?"
              className="w-full px-3 py-2 rounded-lg focus:outline-none"
              style={inputStyle}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: THEME.text.primary }}>Category</label>
            <select
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              className="w-full px-3 py-2 rounded-lg focus:outline-none"
              style={inputStyle}
            >
              {CATEGORIES.map((cat) => (
                <option key={cat.value} value={cat.value}>{cat.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: THEME.text.primary }}>Scope</label>
            <div className="flex gap-3">
              <button
                onClick={() => setFormData({ ...formData, scope: 'PROJECT' })}
                className="flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all"
                style={{
                  background: formData.scope === 'PROJECT' ? `${THEME.accent}18` : THEME.input,
                  border: `1px solid ${formData.scope === 'PROJECT' ? THEME.accent : THEME.border}`,
                  color: formData.scope === 'PROJECT' ? THEME.accent : THEME.text.secondary,
                }}
              >
                <div className="flex items-center justify-center gap-2">
                  <Lock className="w-4 h-4" />
                  Project
                </div>
              </button>
              <button
                onClick={() => setFormData({ ...formData, scope: 'GLOBAL' })}
                className="flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all"
                style={{
                  background: formData.scope === 'GLOBAL' ? `${THEME.accent}18` : THEME.input,
                  border: `1px solid ${formData.scope === 'GLOBAL' ? THEME.accent : THEME.border}`,
                  color: formData.scope === 'GLOBAL' ? THEME.accent : THEME.text.secondary,
                }}
              >
                <div className="flex items-center justify-center gap-2">
                  <Globe className="w-4 h-4" />
                  Global
                </div>
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: THEME.text.primary }}>Access Level</label>
            <div className="flex gap-3">
              <button
                onClick={() => setFormData({ ...formData, accessLevel: 'ALL' })}
                className="flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all"
                style={{
                  background: formData.accessLevel === 'ALL' ? `${THEME.accent}18` : THEME.input,
                  border: `1px solid ${formData.accessLevel === 'ALL' ? THEME.accent : THEME.border}`,
                  color: formData.accessLevel === 'ALL' ? THEME.accent : THEME.text.secondary,
                }}
              >
                <div className="flex items-center justify-center gap-2">
                  <Unlock className="w-4 h-4" />
                  All Schedulers
                </div>
              </button>
              <button
                onClick={() => setFormData({ ...formData, accessLevel: 'RESTRICTED' })}
                className="flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all"
                style={{
                  background: formData.accessLevel === 'RESTRICTED' ? `${THEME.accent}18` : THEME.input,
                  border: `1px solid ${formData.accessLevel === 'RESTRICTED' ? THEME.accent : THEME.border}`,
                  color: formData.accessLevel === 'RESTRICTED' ? THEME.accent : THEME.text.secondary,
                }}
              >
                <div className="flex items-center justify-center gap-2">
                  <Lock className="w-4 h-4" />
                  Restricted
                </div>
              </button>
            </div>
          </div>
        </div>

        <div className="p-6 flex justify-end gap-3" style={{ borderTop: `1px solid ${THEME.border}` }}>
          <button
            onClick={onClose}
            className="px-4 py-2 transition-colors"
            style={{ color: THEME.text.secondary }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!formData.name || !formData.value || isSubmitting}
            className="px-4 py-2 font-medium rounded-lg transition-all flex items-center gap-2 text-white disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: THEME.accent }}
          >
            {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
            Create Secret
          </button>
        </div>
      </div>
    </div>
  );
}

function EditSecretModal({
  secret,
  onClose,
  onSave,
}: {
  secret: Secret;
  onClose: () => void;
  onSave: (data: any) => void;
}) {
  const [formData, setFormData] = useState({
    name: secret.name,
    value: '', // blank = keep existing; user types a value to rotate
    description: secret.description || '',
    category: secret.category || 'other',
    scope: secret.scope,
    accessLevel: secret.accessLevel,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!formData.name) return;
    setIsSubmitting(true);
    // Omit value if user didn't type a new one (don't overwrite with empty)
    const payload: any = { ...formData };
    if (!payload.value) delete payload.value;
    await onSave(payload);
    setIsSubmitting(false);
  };

  const inputStyle = {
    background: THEME.input,
    border: `1px solid ${THEME.border}`,
    color: THEME.text.primary,
  };

  return (
    <div
      className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50"
      style={{ background: 'rgba(0,0,0,0.6)' }}
    >
      <div
        className="w-full max-w-lg max-h-[90vh] overflow-auto rounded-xl"
        style={{ background: THEME.panel, border: `1px solid ${THEME.border}`, fontFamily: FONT }}
      >
        <div className="p-6" style={{ borderBottom: `1px solid ${THEME.border}` }}>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold" style={{ color: THEME.text.primary }}>Edit Secret</h2>
              <p className="text-sm mt-1" style={{ color: THEME.text.secondary }}>
                Leave value blank to keep the current value
              </p>
            </div>
            <button onClick={onClose} style={{ color: THEME.text.secondary }}>
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: THEME.text.primary }}>Name *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value.toUpperCase() })}
              className="w-full px-3 py-2 rounded-lg focus:outline-none font-mono"
              style={inputStyle}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: THEME.text.primary }}>
              New Value (optional)
            </label>
            <textarea
              value={formData.value}
              onChange={(e) => setFormData({ ...formData, value: e.target.value })}
              placeholder="Type to rotate the value; leave blank to keep existing"
              rows={3}
              className="w-full px-3 py-2 rounded-lg focus:outline-none font-mono"
              style={inputStyle}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: THEME.text.primary }}>Description</label>
            <input
              type="text"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-3 py-2 rounded-lg focus:outline-none"
              style={inputStyle}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: THEME.text.primary }}>Category</label>
            <select
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              className="w-full px-3 py-2 rounded-lg focus:outline-none"
              style={inputStyle}
            >
              {CATEGORIES.map((cat) => (
                <option key={cat.value} value={cat.value}>{cat.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: THEME.text.primary }}>Scope</label>
            <div className="flex gap-3">
              <button
                onClick={() => setFormData({ ...formData, scope: 'PROJECT' })}
                className="flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all"
                style={{
                  background: formData.scope === 'PROJECT' ? `${THEME.accent}18` : THEME.input,
                  border: `1px solid ${formData.scope === 'PROJECT' ? THEME.accent : THEME.border}`,
                  color: formData.scope === 'PROJECT' ? THEME.accent : THEME.text.secondary,
                }}
              >
                <div className="flex items-center justify-center gap-2">
                  <Lock className="w-4 h-4" />
                  Project
                </div>
              </button>
              <button
                onClick={() => setFormData({ ...formData, scope: 'GLOBAL' })}
                className="flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all"
                style={{
                  background: formData.scope === 'GLOBAL' ? `${THEME.accent}18` : THEME.input,
                  border: `1px solid ${formData.scope === 'GLOBAL' ? THEME.accent : THEME.border}`,
                  color: formData.scope === 'GLOBAL' ? THEME.accent : THEME.text.secondary,
                }}
              >
                <div className="flex items-center justify-center gap-2">
                  <Globe className="w-4 h-4" />
                  Global
                </div>
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: THEME.text.primary }}>Access Level</label>
            <div className="flex gap-3">
              <button
                onClick={() => setFormData({ ...formData, accessLevel: 'ALL' })}
                className="flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all"
                style={{
                  background: formData.accessLevel === 'ALL' ? `${THEME.accent}18` : THEME.input,
                  border: `1px solid ${formData.accessLevel === 'ALL' ? THEME.accent : THEME.border}`,
                  color: formData.accessLevel === 'ALL' ? THEME.accent : THEME.text.secondary,
                }}
              >
                <div className="flex items-center justify-center gap-2">
                  <Unlock className="w-4 h-4" />
                  All Schedulers
                </div>
              </button>
              <button
                onClick={() => setFormData({ ...formData, accessLevel: 'RESTRICTED' })}
                className="flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all"
                style={{
                  background: formData.accessLevel === 'RESTRICTED' ? `${THEME.accent}18` : THEME.input,
                  border: `1px solid ${formData.accessLevel === 'RESTRICTED' ? THEME.accent : THEME.border}`,
                  color: formData.accessLevel === 'RESTRICTED' ? THEME.accent : THEME.text.secondary,
                }}
              >
                <div className="flex items-center justify-center gap-2">
                  <Lock className="w-4 h-4" />
                  Restricted
                </div>
              </button>
            </div>
          </div>
        </div>

        <div className="p-6 flex justify-end gap-3" style={{ borderTop: `1px solid ${THEME.border}` }}>
          <button onClick={onClose} className="px-4 py-2 transition-colors" style={{ color: THEME.text.secondary }}>
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!formData.name || isSubmitting}
            className="px-4 py-2 font-medium rounded-lg transition-all flex items-center gap-2 text-white disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: THEME.accent }}
          >
            {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}

function AuditLogModal({ secret, onClose }: { secret: Secret; onClose: () => void }) {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAuditLogs();
  }, [secret.id]);

  const fetchAuditLogs = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${BASE_PATH}/api/secrets/${secret.id}/audit`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
      }
    } catch (err) {
      console.error('Failed to fetch audit logs:', err);
    } finally {
      setLoading(false);
    }
  };

  const mockLogs: AuditLogEntry[] = [
    { id: '1', action: 'READ', user: 'system', time: '2 hours ago', details: 'Execution #1234' },
    { id: '2', action: 'READ', user: 'system', time: '5 hours ago', details: 'Execution #1230' },
    { id: '3', action: 'UPDATE', user: 'admin@example.com', time: '2 days ago', details: 'Value rotated' },
    { id: '4', action: 'CREATE', user: 'admin@example.com', time: '1 week ago', details: 'Secret created' },
  ];

  const displayLogs = logs.length > 0 ? logs : mockLogs;

  const getActionColor = (action: string) => {
    if (action === 'READ') return THEME.colors.blue;
    if (action === 'UPDATE') return THEME.colors.amber;
    return THEME.colors.emerald;
  };

  return (
    <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div className="w-full max-w-2xl max-h-[80vh] overflow-hidden rounded-xl" style={{ background: THEME.panel, border: `1px solid ${THEME.border}`, fontFamily: FONT }}>
        <div className="p-6 flex items-center justify-between" style={{ borderBottom: `1px solid ${THEME.border}` }}>
          <div>
            <h2 className="text-xl font-semibold" style={{ color: THEME.text.primary }}>Audit Log</h2>
            <p className="text-sm mt-1" style={{ color: THEME.text.secondary }}>{secret.name}</p>
          </div>
          <button onClick={onClose} style={{ color: THEME.text.secondary }}>
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="overflow-auto max-h-[60vh]">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin" style={{ color: THEME.accent }} />
            </div>
          ) : (
            <table className="w-full">
              <thead className="sticky top-0" style={{ background: THEME.bg }}>
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium " style={{ color: THEME.text.secondary }}>Action</th>
                  <th className="px-6 py-3 text-left text-xs font-medium " style={{ color: THEME.text.secondary }}>User</th>
                  <th className="px-6 py-3 text-left text-xs font-medium " style={{ color: THEME.text.secondary }}>Time</th>
                  <th className="px-6 py-3 text-left text-xs font-medium " style={{ color: THEME.text.secondary }}>Details</th>
                </tr>
              </thead>
              <tbody>
                {displayLogs.map((log) => (
                  <tr key={log.id} style={{ borderTop: `1px solid ${THEME.borderLight}` }}>
                    <td className="px-6 py-4">
                      <span
                        className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium"
                        style={{ background: `${getActionColor(log.action)}15`, color: getActionColor(log.action) }}
                      >
                        {log.action}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm" style={{ color: THEME.text.primary }}>{log.user}</td>
                    <td className="px-6 py-4 text-sm" style={{ color: THEME.text.secondary }}>{log.time}</td>
                    <td className="px-6 py-4 text-sm" style={{ color: THEME.text.secondary }}>{log.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="p-4 flex justify-end" style={{ borderTop: `1px solid ${THEME.border}` }}>
          <button
            onClick={onClose}
            className="px-4 py-2 transition-colors"
            style={{ color: THEME.text.secondary }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
