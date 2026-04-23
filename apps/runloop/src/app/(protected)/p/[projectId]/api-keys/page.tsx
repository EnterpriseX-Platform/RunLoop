'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useProject } from '@/context/ProjectContext';
import {
  Plus,
  Key,
  Search,
  Copy,
  Trash2,
  AlertCircle,
  Loader2,
  X,
  Check,
  ShieldAlert,
} from 'lucide-react';

const FONT = "'IBM Plex Sans Thai', 'IBM Plex Sans', sans-serif";
const THEME = {
  bg: 'var(--t-bg)',
  panel: 'var(--t-panel)',
  panelHover: 'var(--t-panel-hover)',
  border: 'var(--t-border)',
  borderLight: 'var(--t-border-light)',
  text: {
    primary: 'var(--t-text)',
    secondary: 'var(--t-text-secondary)',
    muted: 'var(--t-text-muted)',
  },
  accent: 'var(--t-accent)',
  accentLight: 'var(--t-accent-light)',
  input: 'var(--t-input)',
  colors: {
    blue: '#3B82F6',
    emerald: '#10B981',
    purple: '#8B5CF6',
    amber: '#F59E0B',
    red: '#EF4444',
  },
};

interface ApiKey {
  id: string;
  name: string;
  prefix?: string | null;
  lastUsedAt?: string | null;
  expiresAt?: string | null;
  createdAt: string;
  revokedAt?: string | null;
  status: 'ACTIVE' | 'REVOKED' | 'EXPIRED';
}

type ExpirationOption = 'never' | '30d' | '90d' | '1y';

function formatRelativeTime(dateString?: string | null): string {
  if (!dateString) return 'Never';
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

function formatDate(dateString?: string | null): string {
  if (!dateString) return '—';
  const date = new Date(dateString);
  return date.toLocaleDateString();
}

function expirationToDate(option: ExpirationOption): string | null {
  if (option === 'never') return null;
  const now = new Date();
  const days = option === '30d' ? 30 : option === '90d' ? 90 : 365;
  now.setDate(now.getDate() + days);
  return now.toISOString();
}

export default function ApiKeysPage() {
  const params = useParams();
  const projectIdFromUrl = params?.projectId as string | undefined;
  const { selectedProject } = useProject();
  const projectId = projectIdFromUrl || selectedProject?.id;

  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createdToken, setCreatedToken] = useState<{
    token: string;
    name: string;
  } | null>(null);
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);

  useEffect(() => {
    if (projectId) {
      fetchApiKeys();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const fetchApiKeys = async () => {
    if (!projectId) return;
    try {
      setLoading(true);
      setError(null);

      const res = await fetch(`/runloop/api/api-keys?projectId=${projectId}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to fetch API keys');
      }

      const data = await res.json();
      setApiKeys(data.apiKeys || []);
    } catch (err) {
      console.error('Failed to fetch API keys:', err);
      setError(err instanceof Error ? err.message : 'Failed to load API keys');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (name: string, expiration: ExpirationOption) => {
    if (!projectId) return;
    const res = await fetch('/runloop/api/api-keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId,
        name,
        expiresAt: expirationToDate(expiration),
      }),
    });
    if (res.ok) {
      const data = await res.json();
      setShowCreateModal(false);
      setCreatedToken({ token: data.token, name });
      fetchApiKeys();
    } else {
      const errData = await res.json().catch(() => ({}));
      alert(errData.error || 'Failed to create API key');
    }
  };

  const handleRevoke = async (id: string) => {
    try {
      const res = await fetch(`/runloop/api/api-keys/${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setConfirmRevokeId(null);
        fetchApiKeys();
      } else {
        const errData = await res.json().catch(() => ({}));
        alert(errData.error || 'Failed to revoke API key');
      }
    } catch (err) {
      console.error('Failed to revoke API key:', err);
      alert('Failed to revoke API key');
    }
  };

  const filteredKeys = apiKeys.filter((k) =>
    k.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!projectId) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: THEME.bg, fontFamily: FONT }}
      >
        <div className="text-center">
          <div
            className="w-20 h-20 mx-auto mb-6 rounded-2xl flex items-center justify-center"
            style={{ background: THEME.panel, border: `1px solid ${THEME.border}` }}
          >
            <Key className="w-10 h-10" style={{ color: THEME.text.muted }} />
          </div>
          <h3 className="text-xl font-semibold mb-2" style={{ color: THEME.text.primary }}>
            Select a Project
          </h3>
          <p style={{ color: THEME.text.secondary }}>
            Please select a project to view API keys
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: THEME.bg, fontFamily: FONT }}>
      {/* Header */}
      <header
        className="sticky top-0 z-40 backdrop-blur-xl"
        style={{ background: `${THEME.bg}cc`, borderBottom: `1px solid ${THEME.border}` }}
      >
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1
                className="text-2xl font-semibold tracking-tight"
                style={{ color: THEME.text.primary }}
              >
                API Keys
              </h1>
              <p className="text-sm mt-0.5" style={{ color: THEME.text.secondary }}>
                Manage API tokens for external access to this project
              </p>
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 text-white text-sm font-medium rounded-lg transition-all"
              style={{ background: THEME.accent }}
            >
              <Plus className="w-4 h-4" />
              Create API Key
            </button>
          </div>

          {/* Filters */}
          <div className="flex items-center justify-between mt-6">
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
                  style={{ color: THEME.text.secondary }}
                />
                <input
                  type="text"
                  placeholder="Search keys..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-72 pl-10 pr-4 py-2 rounded-lg text-sm focus:outline-none transition-all"
                  style={{
                    background: THEME.input,
                    border: `1px solid ${THEME.border}`,
                    color: THEME.text.primary,
                  }}
                />
              </div>
            </div>

            <div className="flex items-center gap-2 text-sm" style={{ color: THEME.text.secondary }}>
              <Key className="w-4 h-4" style={{ color: THEME.colors.emerald }} />
              <span>{apiKeys.length} Active</span>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin" style={{ color: THEME.accent }} />
          </div>
        ) : error ? (
          <div className="text-center py-20">
            <AlertCircle
              className="w-12 h-12 mx-auto mb-4"
              style={{ color: THEME.colors.red }}
            />
            <h3
              className="text-xl font-semibold mb-2"
              style={{ color: THEME.text.primary }}
            >
              Failed to load API keys
            </h3>
            <p className="mb-4" style={{ color: THEME.text.secondary }}>
              {error}
            </p>
            <button
              onClick={fetchApiKeys}
              className="inline-flex items-center gap-2 px-4 py-2 text-white text-sm font-medium rounded-lg"
              style={{ background: THEME.accent }}
            >
              Try Again
            </button>
          </div>
        ) : filteredKeys.length === 0 ? (
          <div className="text-center py-20">
            <div
              className="w-20 h-20 mx-auto mb-6 rounded-2xl flex items-center justify-center"
              style={{ background: THEME.panel, border: `1px solid ${THEME.border}` }}
            >
              <Key className="w-10 h-10" style={{ color: THEME.text.muted }} />
            </div>
            <h3 className="text-xl font-semibold mb-2" style={{ color: THEME.text.primary }}>
              No API keys yet
            </h3>
            <p className="mb-6" style={{ color: THEME.text.secondary }}>
              Create an API key to integrate external tools with this project
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 text-white text-sm font-medium rounded-lg"
              style={{ background: THEME.accent }}
            >
              <Plus className="w-4 h-4" />
              Create API Key
            </button>
          </div>
        ) : (
          <div
            className="rounded-xl overflow-hidden"
            style={{ background: THEME.panel, border: `1px solid ${THEME.border}` }}
          >
            <table className="w-full">
              <thead style={{ background: THEME.bg }}>
                <tr>
                  <th
                    className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider"
                    style={{ color: THEME.text.secondary }}
                  >
                    Name
                  </th>
                  <th
                    className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider"
                    style={{ color: THEME.text.secondary }}
                  >
                    Prefix
                  </th>
                  <th
                    className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider"
                    style={{ color: THEME.text.secondary }}
                  >
                    Last Used
                  </th>
                  <th
                    className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider"
                    style={{ color: THEME.text.secondary }}
                  >
                    Created
                  </th>
                  <th
                    className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider"
                    style={{ color: THEME.text.secondary }}
                  >
                    Expires
                  </th>
                  <th
                    className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider"
                    style={{ color: THEME.text.secondary }}
                  >
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredKeys.map((key) => (
                  <tr
                    key={key.id}
                    style={{ borderTop: `1px solid ${THEME.borderLight}` }}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center"
                          style={{
                            background: THEME.bg,
                            border: `1px solid ${THEME.border}`,
                          }}
                        >
                          <Key
                            className="w-4 h-4"
                            style={{ color: THEME.colors.emerald }}
                          />
                        </div>
                        <span
                          className="text-sm font-medium"
                          style={{ color: THEME.text.primary }}
                        >
                          {key.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <code
                        className="text-xs font-mono px-2 py-1 rounded"
                        style={{
                          background: THEME.bg,
                          color: THEME.text.secondary,
                          border: `1px solid ${THEME.border}`,
                        }}
                      >
                        {key.prefix ? `${key.prefix}…` : '—'}
                      </code>
                    </td>
                    <td
                      className="px-6 py-4 text-sm"
                      style={{ color: THEME.text.secondary }}
                    >
                      {formatRelativeTime(key.lastUsedAt)}
                    </td>
                    <td
                      className="px-6 py-4 text-sm"
                      style={{ color: THEME.text.secondary }}
                    >
                      {formatDate(key.createdAt)}
                    </td>
                    <td
                      className="px-6 py-4 text-sm"
                      style={{ color: THEME.text.secondary }}
                    >
                      {key.expiresAt ? formatDate(key.expiresAt) : 'Never'}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setConfirmRevokeId(key.id)}
                          className="p-2 rounded-lg transition-all"
                          style={{
                            background: THEME.bg,
                            color: THEME.colors.red,
                          }}
                          title="Revoke key"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {/* Create Modal */}
      {showCreateModal && (
        <CreateApiKeyModal
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreate}
        />
      )}

      {/* Token Reveal Modal */}
      {createdToken && (
        <TokenRevealModal
          name={createdToken.name}
          token={createdToken.token}
          onClose={() => setCreatedToken(null)}
        />
      )}

      {/* Revoke Confirm */}
      {confirmRevokeId && (
        <ConfirmRevokeModal
          onCancel={() => setConfirmRevokeId(null)}
          onConfirm={() => handleRevoke(confirmRevokeId)}
        />
      )}
    </div>
  );
}

function CreateApiKeyModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (name: string, expiration: ExpirationOption) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [expiration, setExpiration] = useState<ExpirationOption>('never');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onCreate(name.trim(), expiration);
    } finally {
      setIsSubmitting(false);
    }
  };

  const expirationOptions: { value: ExpirationOption; label: string }[] = [
    { value: 'never', label: 'Never' },
    { value: '30d', label: '30 days' },
    { value: '90d', label: '90 days' },
    { value: '1y', label: '1 year' },
  ];

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
        className="w-full max-w-lg rounded-xl"
        style={{
          background: THEME.panel,
          border: `1px solid ${THEME.border}`,
          fontFamily: FONT,
        }}
      >
        <div className="p-6" style={{ borderBottom: `1px solid ${THEME.border}` }}>
          <div className="flex items-center justify-between">
            <div>
              <h2
                className="text-xl font-semibold"
                style={{ color: THEME.text.primary }}
              >
                Create API Key
              </h2>
              <p className="text-sm mt-1" style={{ color: THEME.text.secondary }}>
                Generate a token for external integrations
              </p>
            </div>
            <button onClick={onClose} style={{ color: THEME.text.secondary }}>
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-5">
          <div>
            <label
              className="block text-sm font-medium mb-2"
              style={{ color: THEME.text.primary }}
            >
              Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., CI/CD Pipeline"
              className="w-full px-3 py-2 rounded-lg focus:outline-none"
              style={inputStyle}
              autoFocus
            />
            <p className="text-xs mt-1" style={{ color: THEME.text.secondary }}>
              A descriptive label to help you identify this key later
            </p>
          </div>

          <div>
            <label
              className="block text-sm font-medium mb-2"
              style={{ color: THEME.text.primary }}
            >
              Expiration
            </label>
            <div className="grid grid-cols-4 gap-2">
              {expirationOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setExpiration(opt.value)}
                  className="px-3 py-2 rounded-lg text-sm font-medium transition-all"
                  style={{
                    background:
                      expiration === opt.value
                        ? `${THEME.accent}18`
                        : THEME.input,
                    border: `1px solid ${
                      expiration === opt.value ? THEME.accent : THEME.border
                    }`,
                    color:
                      expiration === opt.value
                        ? THEME.accent
                        : THEME.text.secondary,
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div
          className="p-6 flex justify-end gap-3"
          style={{ borderTop: `1px solid ${THEME.border}` }}
        >
          <button
            onClick={onClose}
            className="px-4 py-2 transition-colors"
            style={{ color: THEME.text.secondary }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!name.trim() || isSubmitting}
            className="px-4 py-2 font-medium rounded-lg transition-all flex items-center gap-2 text-white disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: THEME.accent }}
          >
            {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
            Create Key
          </button>
        </div>
      </div>
    </div>
  );
}

function TokenRevealModal({
  name,
  token,
  onClose,
}: {
  name: string;
  token: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div
      className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50"
      style={{ background: 'rgba(0,0,0,0.6)' }}
    >
      <div
        className="w-full max-w-xl rounded-xl"
        style={{
          background: THEME.panel,
          border: `1px solid ${THEME.border}`,
          fontFamily: FONT,
        }}
      >
        <div className="p-6" style={{ borderBottom: `1px solid ${THEME.border}` }}>
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{
                background: `${THEME.colors.emerald}18`,
                border: `1px solid ${THEME.colors.emerald}40`,
              }}
            >
              <Check
                className="w-5 h-5"
                style={{ color: THEME.colors.emerald }}
              />
            </div>
            <div>
              <h2
                className="text-xl font-semibold"
                style={{ color: THEME.text.primary }}
              >
                API Key Created
              </h2>
              <p className="text-sm mt-0.5" style={{ color: THEME.text.secondary }}>
                {name}
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <div
            className="flex items-start gap-3 p-4 rounded-lg"
            style={{
              background: `${THEME.colors.amber}10`,
              border: `1px solid ${THEME.colors.amber}40`,
            }}
          >
            <ShieldAlert
              className="w-5 h-5 flex-shrink-0 mt-0.5"
              style={{ color: THEME.colors.amber }}
            />
            <div>
              <p
                className="text-sm font-semibold"
                style={{ color: THEME.colors.amber }}
              >
                Save this now — you will not see it again.
              </p>
              <p className="text-xs mt-1" style={{ color: THEME.text.secondary }}>
                This token grants access to your project. Store it somewhere secure.
              </p>
            </div>
          </div>

          <div>
            <label
              className="block text-sm font-medium mb-2"
              style={{ color: THEME.text.primary }}
            >
              Your new API key
            </label>
            <div className="flex items-center gap-2">
              <code
                className="flex-1 px-3 py-2.5 rounded-lg text-sm font-mono break-all"
                style={{
                  background: THEME.bg,
                  border: `1px solid ${THEME.border}`,
                  color: THEME.text.primary,
                }}
              >
                {token}
              </code>
              <button
                onClick={handleCopy}
                className="px-3 py-2.5 rounded-lg transition-all flex items-center gap-2 text-white"
                style={{ background: THEME.accent }}
                title="Copy to clipboard"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span className="text-sm">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span className="text-sm">Copy</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        <div
          className="p-6 flex justify-end"
          style={{ borderTop: `1px solid ${THEME.border}` }}
        >
          <button
            onClick={onClose}
            className="px-4 py-2 font-medium rounded-lg transition-all text-white"
            style={{ background: THEME.accent }}
          >
            I saved it
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmRevokeModal({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleConfirm = async () => {
    setIsSubmitting(true);
    try {
      await onConfirm();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50"
      style={{ background: 'rgba(0,0,0,0.6)' }}
    >
      <div
        className="w-full max-w-md rounded-xl"
        style={{
          background: THEME.panel,
          border: `1px solid ${THEME.border}`,
          fontFamily: FONT,
        }}
      >
        <div className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{
                background: `${THEME.colors.red}18`,
                border: `1px solid ${THEME.colors.red}40`,
              }}
            >
              <AlertCircle
                className="w-5 h-5"
                style={{ color: THEME.colors.red }}
              />
            </div>
            <h2
              className="text-xl font-semibold"
              style={{ color: THEME.text.primary }}
            >
              Revoke API Key?
            </h2>
          </div>
          <p
            className="text-sm mb-6"
            style={{ color: THEME.text.secondary }}
          >
            This action cannot be undone. Any application or integration using this
            key will immediately lose access.
          </p>
          <div className="flex justify-end gap-3">
            <button
              onClick={onCancel}
              className="px-4 py-2 transition-colors"
              style={{ color: THEME.text.secondary }}
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={isSubmitting}
              className="px-4 py-2 font-medium rounded-lg transition-all flex items-center gap-2 text-white disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: THEME.colors.red }}
            >
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              Revoke
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
