'use client';
import { BASE_PATH } from '@/lib/base-path';

import { useState, useEffect } from 'react';
import { useProject } from '@/context/ProjectContext';
import {
  Users,
  Plus,
  Mail,
  Trash2,
  AlertCircle,
  Loader2,
  X,
  Shield,
  ShieldCheck,
  Eye,
  User as UserIcon,
} from 'lucide-react';
import {
  DataTable, Table, TableContainer, TableHead, TableRow, TableHeader, TableBody, TableCell, Button, Tag, Select, SelectItem,
} from '@carbon/react';
import { TrashCan } from '@carbon/icons-react';

const MB_HEADERS = [
  { key: 'user', header: 'User' },
  { key: 'role', header: 'Role' },
  { key: 'joined', header: 'Joined' },
  { key: 'actions', header: '' },
];

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
    blue: '#0f62fe',
    emerald: '#24a148',
    purple: '#8a3ffc',
    amber: '#eb6200',
    red: '#da1e28',
  },
};

type Role = 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';

interface Member {
  id: string;
  userId: string;
  email: string;
  name: string | null;
  avatar?: string | null;
  role: Role;
  joinedAt: string;
}

const ROLE_META: Record<
  Role,
  { label: string; color: string; icon: typeof Shield; description: string }
> = {
  OWNER: {
    label: 'Owner',
    color: '#8a3ffc',
    icon: ShieldCheck,
    description: 'Full control',
  },
  ADMIN: {
    label: 'Admin',
    color: '#0f62fe',
    icon: Shield,
    description: 'Manage project',
  },
  MEMBER: {
    label: 'Member',
    color: '#24a148',
    icon: UserIcon,
    description: 'Can edit',
  },
  VIEWER: {
    label: 'Viewer',
    color: '#8d8d8d',
    icon: Eye,
    description: 'Read-only',
  },
};

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function MembersPage() {
  const { selectedProject } = useProject();
  const [members, setMembers] = useState<Member[]>([]);
  const [callerRole, setCallerRole] = useState<Role | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showInviteModal, setShowInviteModal] = useState(false);

  useEffect(() => {
    if (selectedProject) {
      fetchMembers();
      fetchCurrentUser();
    }
  }, [selectedProject]);

  const fetchCurrentUser = async () => {
    try {
      const res = await fetch(`${BASE_PATH}/api/auth/me`);
      if (res.ok) {
        const data = await res.json();
        setCurrentUserId(data.user?.id || data.user?.userId || null);
      }
    } catch {
      // ignore; UI will just be slightly less strict about the "self" check
    }
  };

  const fetchMembers = async () => {
    if (!selectedProject) return;
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(
        `${BASE_PATH}/api/projects/${selectedProject.id}/members`
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to fetch members');
      }
      const data = await res.json();
      setMembers(data.members || []);
      setCallerRole(data.callerRole || null);
    } catch (err) {
      console.error('Failed to fetch members:', err);
      setError(err instanceof Error ? err.message : 'Failed to load members');
    } finally {
      setLoading(false);
    }
  };

  const handleInvite = async (email: string, role: 'ADMIN' | 'MEMBER' | 'VIEWER') => {
    if (!selectedProject) return { ok: false, error: 'No project selected' };
    try {
      const res = await fetch(
        `${BASE_PATH}/api/projects/${selectedProject.id}/members`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, role }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        return { ok: false, error: data.error || 'Failed to invite user' };
      }
      fetchMembers();
      return { ok: true };
    } catch (err) {
      console.error('Failed to invite member:', err);
      return { ok: false, error: 'Failed to invite user' };
    }
  };

  const handleChangeRole = async (member: Member, newRole: Role) => {
    if (!selectedProject) return;
    if (newRole === member.role) return;
    try {
      const res = await fetch(
        `${BASE_PATH}/api/projects/${selectedProject.id}/members/${member.userId}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: newRole }),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Failed to change role');
        return;
      }
      fetchMembers();
    } catch (err) {
      console.error('Failed to change role:', err);
      alert('Failed to change role');
    }
  };

  const handleRemove = async (member: Member) => {
    if (!selectedProject) return;
    if (
      !confirm(
        `Remove ${member.email} from this project? They'll lose access immediately.`
      )
    )
      return;
    try {
      const res = await fetch(
        `${BASE_PATH}/api/projects/${selectedProject.id}/members/${member.userId}`,
        { method: 'DELETE' }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Failed to remove member');
        return;
      }
      fetchMembers();
    } catch (err) {
      console.error('Failed to remove member:', err);
      alert('Failed to remove member');
    }
  };

  const canManage = callerRole === 'OWNER' || callerRole === 'ADMIN';
  const isOwner = callerRole === 'OWNER';

  if (!selectedProject) {
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
            <Users className="w-10 h-10" style={{ color: THEME.text.muted }} />
          </div>
          <h3
            className="text-xl font-semibold mb-2"
            style={{ color: THEME.text.primary }}
          >
            Select a Project
          </h3>
          <p style={{ color: THEME.text.secondary }}>
            Please select a project to manage members
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen"
      style={{ background: THEME.bg, fontFamily: FONT }}
    >
      {/* Header */}
      <header
        className=""
        style={{
          background: `${THEME.bg}cc`,
        }}
      >
        <div className="pb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1
                style={{ color: THEME.text.primary, fontSize: 28, lineHeight: '36px', fontWeight: 400 }}
              >
                Team members
              </h1>
              <p className="text-sm mt-0.5" style={{ color: THEME.text.secondary }}>
                Manage who has access to{' '}
                <span style={{ color: THEME.text.primary }}>
                  {selectedProject.name}
                </span>
              </p>
            </div>
            {canManage && (
              <button
                onClick={() => setShowInviteModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2 text-white text-sm font-medium rounded-lg transition-all"
                style={{ background: THEME.accent }}
              >
                <Plus className="w-4 h-4" />
                Invite Member
              </button>
            )}
          </div>

          {/* Stats */}
          <div className="flex items-center gap-6 text-sm mt-6">
            <div className="flex items-center gap-2">
              <Users
                className="w-4 h-4"
                style={{ color: THEME.colors.emerald }}
              />
              <span style={{ color: THEME.text.secondary }}>
                {members.length} {members.length === 1 ? 'Member' : 'Members'}
              </span>
            </div>
            {(['OWNER', 'ADMIN', 'MEMBER', 'VIEWER'] as Role[]).map((r) => {
              const count = members.filter((m) => m.role === r).length;
              if (count === 0) return null;
              const meta = ROLE_META[r];
              return (
                <div key={r} className="flex items-center gap-2">
                  <meta.icon className="w-4 h-4" style={{ color: meta.color }} />
                  <span style={{ color: THEME.text.secondary }}>
                    {count} {meta.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="">
        {!canManage && callerRole && (
          <div
            className="mb-6 px-4 py-3 rounded-lg flex items-start gap-3"
            style={{
              background: `${THEME.colors.amber}15`,
              border: `1px solid ${THEME.colors.amber}40`,
            }}
          >
            <AlertCircle
              className="w-5 h-5 flex-shrink-0 mt-0.5"
              style={{ color: THEME.colors.amber }}
            />
            <div>
              <p
                className="text-sm font-medium"
                style={{ color: THEME.text.primary }}
              >
                You need to be an OWNER or ADMIN to manage members
              </p>
              <p className="text-xs mt-0.5" style={{ color: THEME.text.secondary }}>
                Your current role is {ROLE_META[callerRole].label}. Contact a
                project owner to request access changes.
              </p>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2
              className="w-8 h-8 animate-spin"
              style={{ color: THEME.accent }}
            />
          </div>
        ) : error ? (
          <div
            className="px-4 py-4 rounded-lg flex items-start gap-3"
            style={{
              background: `${THEME.colors.red}15`,
              border: `1px solid ${THEME.colors.red}40`,
            }}
          >
            <AlertCircle
              className="w-5 h-5 flex-shrink-0 mt-0.5"
              style={{ color: THEME.colors.red }}
            />
            <div className="flex-1">
              <p
                className="text-sm font-medium"
                style={{ color: THEME.text.primary }}
              >
                Failed to load members
              </p>
              <p className="text-xs mt-0.5" style={{ color: THEME.text.secondary }}>
                {error}
              </p>
              <button
                onClick={fetchMembers}
                className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 text-white text-xs font-medium rounded-md transition-all"
                style={{ background: THEME.accent }}
              >
                Try Again
              </button>
            </div>
          </div>
        ) : members.length === 0 ? (
          <div className="text-center py-20">
            <div
              className="w-20 h-20 mx-auto mb-6 rounded-2xl flex items-center justify-center"
              style={{
                background: THEME.panel,
                border: `1px solid ${THEME.border}`,
              }}
            >
              <Users className="w-10 h-10" style={{ color: THEME.text.muted }} />
            </div>
            <h3
              className="text-xl font-semibold mb-2"
              style={{ color: THEME.text.primary }}
            >
              No members yet
            </h3>
            <p className="mb-6" style={{ color: THEME.text.secondary }}>
              Invite teammates to collaborate on this project
            </p>
            {canManage && (
              <button
                onClick={() => setShowInviteModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2 text-white text-sm font-medium rounded-lg transition-all"
                style={{ background: THEME.accent }}
              >
                <Plus className="w-4 h-4" />
                Invite Member
              </button>
            )}
          </div>
        ) : (
          <DataTable rows={members.map((m) => ({ id: m.id }))} headers={MB_HEADERS} isSortable>
            {({ rows: dtRows, headers, getHeaderProps, getRowProps, getTableProps, getTableContainerProps }) => {
              const mById = Object.fromEntries(members.map((m) => [m.id, m]));
              return (
                <TableContainer {...getTableContainerProps()}>
                  <Table {...getTableProps()} size="md" useZebraStyles={false}>
                    <TableHead>
                      <TableRow>
                        {headers.map((header) => {
                          const { key, ...rest } = getHeaderProps({ header });
                          return <TableHeader key={header.key} {...rest}>{header.header}</TableHeader>;
                        })}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {dtRows.map((row) => {
                        const member = mById[row.id];
                        const { key, ...rowProps } = getRowProps({ row });
                        if (!member) return null;
                        const isSelf = currentUserId === member.userId;
                        const meta = ROLE_META[member.role];
                        const RoleIcon = meta.icon;
                        const canEditRole = isOwner && !isSelf;
                        const canRemove = canManage && !isSelf && !(member.role === 'OWNER' && callerRole === 'ADMIN');
                        return (
                          <TableRow key={row.id} {...rowProps}>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <div style={{ width: 32, height: 32, display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 600, background: 'var(--cds-layer-accent-01)', color: 'var(--cds-text-primary)' }}>
                                  {(member.name || member.email).charAt(0).toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2" style={{ fontWeight: 600, color: 'var(--cds-text-primary)' }}>
                                    {member.name || member.email.split('@')[0]}
                                    {isSelf && <Tag type="blue" size="sm">You</Tag>}
                                  </div>
                                  <div className="rl-ellipsis flex items-center gap-1" style={{ fontSize: 12, color: 'var(--cds-text-secondary)' }}>
                                    <Mail className="w-3 h-3" /> {member.email}
                                  </div>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              {canEditRole ? (
                                <Select id={`role-${member.id}`} size="sm" labelText="" hideLabel defaultValue={member.role} onChange={(e) => handleChangeRole(member, e.target.value as Role)}>
                                  <SelectItem value="OWNER" text="Owner" />
                                  <SelectItem value="ADMIN" text="Admin" />
                                  <SelectItem value="MEMBER" text="Member" />
                                  <SelectItem value="VIEWER" text="Viewer" />
                                </Select>
                              ) : (
                                <span className="flex items-center gap-1.5" style={{ color: meta.color }}>
                                  <RoleIcon className="w-4 h-4" /> {meta.label}
                                </span>
                              )}
                            </TableCell>
                            <TableCell style={{ color: 'var(--cds-text-secondary)' }}>{formatDate(member.joinedAt)}</TableCell>
                            <TableCell>
                              {canRemove
                                ? <Button kind="danger--ghost" size="sm" hasIconOnly renderIcon={TrashCan} iconDescription="Remove member" onClick={() => handleRemove(member)} />
                                : <span style={{ color: 'var(--cds-text-placeholder)' }}>—</span>}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              );
            }}
          </DataTable>
        )}
      </main>

      {showInviteModal && (
        <InviteMemberModal
          onClose={() => setShowInviteModal(false)}
          onInvite={handleInvite}
        />
      )}
    </div>
  );
}

function InviteMemberModal({
  onClose,
  onInvite,
}: {
  onClose: () => void;
  onInvite: (
    email: string,
    role: 'ADMIN' | 'MEMBER' | 'VIEWER'
  ) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'ADMIN' | 'MEMBER' | 'VIEWER'>('MEMBER');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setFormError(null);
    if (!email.trim()) {
      setFormError('Email is required');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setFormError('Please enter a valid email');
      return;
    }
    setIsSubmitting(true);
    const result = await onInvite(email.trim(), role);
    setIsSubmitting(false);
    if (result.ok) {
      onClose();
    } else {
      setFormError(result.error || 'Failed to invite user');
    }
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
                Invite Member
              </h2>
              <p className="text-sm mt-1" style={{ color: THEME.text.secondary }}>
                Add a teammate to this project
              </p>
            </div>
            <button onClick={onClose} style={{ color: THEME.text.secondary }}>
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label
              className="block text-sm font-medium mb-2"
              style={{ color: THEME.text.primary }}
            >
              Email Address *
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="teammate@example.com"
              className="w-full px-3 py-2 rounded-lg focus:outline-none"
              style={inputStyle}
              autoFocus
            />
            <p className="text-xs mt-1" style={{ color: THEME.text.secondary }}>
              The user must already have a RunLoop account
            </p>
          </div>

          <div>
            <label
              className="block text-sm font-medium mb-2"
              style={{ color: THEME.text.primary }}
            >
              Role
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['ADMIN', 'MEMBER', 'VIEWER'] as const).map((r) => {
                const meta = ROLE_META[r];
                const Icon = meta.icon;
                const selected = role === r;
                return (
                  <button
                    key={r}
                    onClick={() => setRole(r)}
                    className="px-3 py-3 rounded-lg text-sm font-medium transition-all text-left"
                    style={{
                      background: selected ? `${meta.color}18` : THEME.input,
                      border: `1px solid ${selected ? meta.color : THEME.border}`,
                      color: selected ? meta.color : THEME.text.secondary,
                    }}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Icon className="w-4 h-4" />
                      <span className="font-semibold">{meta.label}</span>
                    </div>
                    <div
                      className="text-xs"
                      style={{
                        color: selected ? meta.color : THEME.text.muted,
                      }}
                    >
                      {meta.description}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {formError && (
            <div
              className="px-3 py-2 rounded-lg flex items-start gap-2"
              style={{
                background: `${THEME.colors.red}15`,
                border: `1px solid ${THEME.colors.red}40`,
              }}
            >
              <AlertCircle
                className="w-4 h-4 flex-shrink-0 mt-0.5"
                style={{ color: THEME.colors.red }}
              />
              <p className="text-sm" style={{ color: THEME.colors.red }}>
                {formError}
              </p>
            </div>
          )}
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
            disabled={!email || isSubmitting}
            className="px-4 py-2 font-medium rounded-lg transition-all flex items-center gap-2 text-white disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: THEME.accent }}
          >
            {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
            Send Invite
          </button>
        </div>
      </div>
    </div>
  );
}
