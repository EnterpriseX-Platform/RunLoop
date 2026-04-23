'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, FolderKanban, Users, Clock, Loader2, AlertCircle, ChevronRight, Search, X } from 'lucide-react';
import { useProject } from '@/context/ProjectContext';
import type { Project } from '@/types';
import {
  ControlBreadcrumb, PageHeader, SharpButton, MONO, TableHeaderRow,
} from '@/components/ControlChrome';

const FONT = "'IBM Plex Sans Thai', 'IBM Plex Sans', sans-serif";
const THEME = {
  bg: 'var(--t-bg)',
  panel: 'var(--t-panel)',
  panelHover: 'var(--t-panel-hover)',
  border: 'var(--t-border)',
  borderLight: 'var(--t-border-light)',
  text: { primary: 'var(--t-text)', secondary: 'var(--t-text-secondary)', muted: 'var(--t-text-muted)' },
  accent: 'var(--t-accent)',
  accentLight: 'var(--t-accent-light)',
  input: 'var(--t-input)',
  colors: { blue: '#3B82F6', emerald: '#10B981', purple: '#8B5CF6', amber: '#F59E0B', red: '#EF4444', cyan: '#06B6D4' }
};

const COLORS = [
  { name: 'Cyan', value: '#06b6d4' },
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Purple', value: '#8b5cf6' },
  { name: 'Pink', value: '#ec4899' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Green', value: '#22c55e' },
  { name: 'Red', value: '#ef4444' },
  { name: 'Yellow', value: '#eab308' },
];

export default function ProjectsPage() {
  const { projects, isLoading, refreshProjects, selectProject } = useProject();
  const [isCreating, setIsCreating] = useState(false);
  const [newProject, setNewProject] = useState({ name: '', description: '', color: COLORS[0].value });
  const [searchQuery, setSearchQuery] = useState('');
  const router = useRouter();

  useEffect(() => {
    refreshProjects();
  }, [refreshProjects]);

  const [createError, setCreateError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    setIsSubmitting(true);

    try {
      const url = '/runloop/api/projects';
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newProject),
      });

      if (res.ok) {
        const data = await res.json();
        setIsCreating(false);
        setNewProject({ name: '', description: '', color: COLORS[0].value });
        refreshProjects();
        selectProject(data.project);
        router.push(`/p/${data.project.id}/dashboard`);
      } else {
        let errorText = `Server returned ${res.status}`;
        try {
          const errorData = await res.json();
          errorText = errorData.error || errorData.message || errorText;
        } catch {
          errorText = await res.text() || errorText;
        }
        setCreateError(errorText);
      }
    } catch (error: any) {
      setCreateError(error?.message || 'Could not connect to server.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filtered = projects.filter((p) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (p.description || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (isLoading) {
    return (
      <div style={{ fontFamily: FONT }} className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3">
          <Loader2 className="w-5 h-5 animate-spin" style={{ color: THEME.accent }} />
          <span style={{ fontSize: 13, color: THEME.text.muted }}>Loading projects...</span>
        </div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: FONT }}>
      <ControlBreadcrumb
        path="PROJECTS"
        node="NODE.TENANT"
        right={
          <span style={{ color: THEME.text.muted }}>
            {filtered.length} / {projects.length} TOTAL
          </span>
        }
      />

      <PageHeader
        title="Projects"
        subtitle="Manage your RunLoop projects"
        right={
          <SharpButton onClick={() => setIsCreating(true)}>
            <Plus className="w-3.5 h-3.5" /> $ NEW PROJECT →
          </SharpButton>
        }
      />

      {/* Search */}
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: THEME.text.muted }} />
        <input
          type="text"
          placeholder="search projects…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            background: THEME.panel, border: `1px solid ${THEME.border}`,
            color: THEME.text.primary, borderRadius: 2, height: 36,
            fontFamily: MONO, fontSize: 12,
          }}
          className="w-full pl-9 pr-4 outline-none"
        />
      </div>

      {/* Create Project Modal */}
      {isCreating && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div style={{ background: THEME.panel, border: `1px solid ${THEME.border}`, borderRadius: 2 }} className="w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 style={{ fontSize: 16, fontWeight: 600, color: THEME.text.primary }}>Create New Project</h2>
              <button onClick={() => setIsCreating(false)}><X className="w-4 h-4" style={{ color: THEME.text.muted }} /></button>
            </div>
            {createError && (
              <div className="mb-4 flex items-center gap-2 p-3 rounded-lg" style={{ background: `${THEME.colors.red}12`, border: `1px solid ${THEME.colors.red}30` }}>
                <AlertCircle className="w-4 h-4 flex-shrink-0" style={{ color: THEME.colors.red }} />
                <span style={{ fontSize: 12, color: THEME.colors.red }}>{createError}</span>
              </div>
            )}
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label style={{ fontSize: 12, fontWeight: 500, color: THEME.text.secondary }} className="block mb-1.5">Project Name</label>
                <input
                  type="text"
                  value={newProject.name}
                  onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
                  style={{ background: THEME.input, border: `1px solid ${THEME.border}`, color: THEME.text.primary, borderRadius: 2, height: 36, fontSize: 13 }}
                  className="w-full px-3 outline-none"
                  placeholder="Enter project name"
                  required
                />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 500, color: THEME.text.secondary }} className="block mb-1.5">Description</label>
                <textarea
                  value={newProject.description}
                  onChange={(e) => setNewProject({ ...newProject, description: e.target.value })}
                  style={{ background: THEME.input, border: `1px solid ${THEME.border}`, color: THEME.text.primary, borderRadius: 8, fontSize: 13, padding: '8px 12px' }}
                  className="w-full outline-none"
                  placeholder="Enter project description"
                  rows={3}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 500, color: THEME.text.secondary }} className="block mb-1.5">Color</label>
                <div className="flex flex-wrap gap-2">
                  {COLORS.map((color) => (
                    <button
                      key={color.value}
                      type="button"
                      onClick={() => setNewProject({ ...newProject, color: color.value })}
                      className="w-7 h-7 rounded-lg transition-transform"
                      style={{
                        backgroundColor: color.value,
                        transform: newProject.color === color.value ? 'scale(1.15)' : 'scale(1)',
                        boxShadow: newProject.color === color.value ? `0 0 0 2px ${THEME.accent}` : 'none',
                      }}
                      title={color.name}
                    />
                  ))}
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  disabled={isSubmitting}
                  style={{ flex: 1, border: `1px solid ${THEME.border}`, color: THEME.text.secondary, borderRadius: 8, padding: '8px 0', fontSize: 13, fontWeight: 500, background: 'transparent' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  style={{ flex: 1, background: THEME.accent, color: '#fff', borderRadius: 8, padding: '8px 0', fontSize: 13, fontWeight: 500, opacity: isSubmitting ? 0.6 : 1 }}
                  className="flex items-center justify-center gap-2"
                >
                  {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  {isSubmitting ? 'Creating...' : 'Create Project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* List */}
      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <div style={{ width: 56, height: 56, background: THEME.panel, border: `1px solid ${THEME.border}`, borderRadius: 2 }} className="mx-auto mb-4 flex items-center justify-center">
            <FolderKanban className="w-7 h-7" style={{ color: THEME.text.muted }} />
          </div>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: THEME.text.primary, marginBottom: 4 }}>No projects yet</h3>
          <p style={{ fontSize: 13, color: THEME.text.muted, marginBottom: 12 }}>Create your first project to get started</p>
          <button onClick={() => setIsCreating(true)} style={{ background: THEME.accent, color: '#fff', borderRadius: 8, padding: '6px 16px', fontSize: 13, fontWeight: 500 }} className="inline-flex items-center gap-2">
            <Plus className="w-4 h-4" /> Create Project
          </button>
        </div>
      ) : (
        <div style={{ background: THEME.panel, border: `1px solid ${THEME.border}`, borderRadius: 2, overflow: 'hidden' }}>
          <TableHeaderRow
            cols={[
              { label: '#',           width: 40 },
              { label: 'PROJECT' },
              { label: 'RUNLOOPS',    width: 100, align: 'right' },
              { label: 'MEMBERS',     width: 100, align: 'right' },
              { label: '',            width: 24 },
            ]}
          />
          {filtered.map((project, i) => (
            <Link
              key={project.id}
              href={`/p/${project.id}/dashboard`}
              onClick={() => {
                localStorage.setItem('selectedProjectId', project.id);
                document.cookie = `lastProjectId=${project.id};path=/;max-age=31536000;SameSite=Lax`;
              }}
              className="flex items-center gap-3 px-4 py-2.5 transition hover:bg-[var(--t-panel-hover)] group"
              style={{ borderTop: i === 0 ? 'none' : `1px solid ${THEME.borderLight}` }}
            >
              <span
                style={{
                  width: 40, fontFamily: MONO, fontSize: 10.5,
                  color: THEME.text.muted, letterSpacing: '0.06em',
                }}
              >
                {String(i + 1).padStart(2, '0')}
              </span>
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div
                  style={{
                    width: 26, height: 26,
                    background: `color-mix(in srgb, ${project.color} 18%, transparent)`,
                    border: `1px solid color-mix(in srgb, ${project.color} 40%, transparent)`,
                    borderRadius: 2,
                  }}
                  className="flex items-center justify-center flex-shrink-0"
                >
                  <FolderKanban className="w-3.5 h-3.5" style={{ color: project.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p style={{ fontSize: 13, fontWeight: 500, color: THEME.text.primary }} className="truncate">
                    {project.name}
                  </p>
                  <p
                    style={{ fontFamily: MONO, fontSize: 10.5, color: THEME.text.muted, marginTop: 1 }}
                    className="truncate"
                  >
                    {project.description || '—'}
                  </p>
                </div>
              </div>
              <span
                className="text-right flex items-center justify-end gap-1.5"
                style={{
                  width: 100, fontFamily: MONO, fontSize: 11,
                  color: THEME.text.muted, letterSpacing: '0.04em',
                }}
              >
                <Clock className="w-3 h-3" /> {project._count?.runloops || 0}
              </span>
              <span
                className="text-right flex items-center justify-end gap-1.5"
                style={{
                  width: 100, fontFamily: MONO, fontSize: 11,
                  color: THEME.text.muted, letterSpacing: '0.04em',
                }}
              >
                <Users className="w-3 h-3" /> {project._count?.members || 0}
              </span>
              <ChevronRight
                className="w-3.5 h-3.5 flex-shrink-0 opacity-40 group-hover:opacity-100 transition"
                style={{ color: THEME.text.muted, width: 24 }}
              />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
