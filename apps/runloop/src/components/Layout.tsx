'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { useProject } from '@/context/ProjectContext';
import {
  LayoutDashboard,
  Zap,
  Workflow,
  Clock,
  Settings,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Search,
  Bell,
  User,
  LogOut,
  Menu,
  Plus,
  Sun,
  Moon,
  FileText,
  Shield,
  Layers,
  HelpCircle,
  Activity,
  Inbox,
  FolderKanban,
  Users,
  Key,
  X,
  Check,
  ScrollText,
  LucideIcon,
} from 'lucide-react';

const FONT = "'IBM Plex Sans Thai', 'IBM Plex Sans', sans-serif";
const MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

/* ==================== Nav Config ==================== */

interface NavItemType {
  name: string;
  href: string;
  icon: LucideIcon;
  countKey: string | null;
  projectScoped?: boolean;
}

// Paths are relative — will be prefixed with /p/{projectId}
const mainNavigation: NavItemType[] = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, countKey: null },
  { name: 'Flows', href: '/flows', icon: Workflow, countKey: 'flows' },
  { name: 'Schedulers', href: '/schedulers', icon: Clock, countKey: 'schedulers' },
  { name: 'Executions', href: '/executions', icon: Activity, countKey: null },
  { name: 'Queues', href: '/queues', icon: Inbox, countKey: null },
];

// System section collapsed into a single "Settings" entry. Sub-areas
// (Secrets / API Keys / Audit Log / DLQ / Members) are reachable via
// the SettingsTabs bar on each settings-related page.
const systemNavigation: NavItemType[] = [
  { name: 'Settings', href: '/settings', icon: Settings, countKey: null },
];

/* ==================== Breadcrumb ==================== */

const breadcrumbMap: Record<string, string> = {
  'dashboard': 'Dashboard',
  'projects': 'Projects',
  'flows': 'Flows',
  'schedulers': 'Schedulers',
  'executions': 'Executions',
  'queues': 'Queues',
  'members': 'Members',
  'secrets': 'Secrets',
  'settings': 'Settings',
  'audit-log': 'Audit Log',
  'api-keys': 'API Keys',
  'new': 'New',
};

function Breadcrumb() {
  const pathname = usePathname() || '';
  // usePathname() returns path WITHOUT basePath (/runloop)
  // So pathname is like: /p/{projectId}/dashboard
  const projectMatch = pathname.match(/^\/(p\/[^/]+)/);
  const projectPrefix = projectMatch ? `/${projectMatch[1]}` : '';

  // Strip /p/{projectId}/ prefix to get clean segments
  const cleaned = pathname.replace(/^\/p\/[^/]+\/?/, '').replace(/^\//, '');
  const segments = cleaned.split('/').filter(Boolean);

  if (segments.length === 0) {
    segments.push('dashboard');
  }

  return (
    <nav
      style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.04em' }}
      className="flex items-center gap-1.5 min-w-0"
    >
      <Link
        href={`${projectPrefix}/dashboard`}
        style={{ color: 'var(--t-text-muted)' }}
        className="hover:!text-[var(--t-accent)] transition-colors whitespace-nowrap uppercase"
      >
        ~
      </Link>
      {segments.map((segment, index) => {
        const isLast = index === segments.length - 1;
        const href = `${projectPrefix}/` + segments.slice(0, index + 1).join('/');
        const label = breadcrumbMap[segment] || segment.charAt(0).toUpperCase() + segment.slice(1);

        return (
          <div key={segment + index} className="flex items-center gap-1.5 min-w-0">
            <span style={{ color: 'var(--t-border)' }}>/</span>
            {isLast ? (
              <span
                style={{ color: 'var(--t-text)', letterSpacing: '0.08em' }}
                className="truncate max-w-[200px] uppercase"
                title={label}
              >
                {label}
              </span>
            ) : (
              <Link
                href={href}
                style={{ color: 'var(--t-text-muted)' }}
                className="hover:!text-[var(--t-accent)] transition-colors truncate max-w-[180px] uppercase"
                title={label}
              >
                {label}
              </Link>
            )}
          </div>
        );
      })}
    </nav>
  );
}

/* ==================== NavItem ==================== */

function NavItem({ item, pathname, collapsed, isActive, count }: {
  item: NavItemType;
  pathname: string;
  collapsed: boolean;
  isActive: boolean;
  count?: number;
}) {
  return (
    <Link
      href={item.href}
      style={{
        fontFamily: FONT,
        color: isActive ? 'var(--t-text)' : 'var(--t-text-secondary)',
        background: isActive ? 'color-mix(in srgb, var(--t-accent) 10%, transparent)' : 'transparent',
        border: `1px solid ${isActive ? 'color-mix(in srgb, var(--t-accent) 30%, transparent)' : 'transparent'}`,
        borderRadius: 2,
        position: 'relative',
      }}
      className={[
        'group flex items-center gap-3 px-3 py-2 text-[13px] transition-all duration-150',
        isActive ? 'font-semibold' : 'hover:text-[var(--t-text)] hover:bg-[var(--t-panel-hover)]',
        collapsed ? 'justify-center px-2' : '',
      ].filter(Boolean).join(' ')}
      title={collapsed ? item.name : undefined}
    >
      {/* Left accent bar when active — like a selected DAG node */}
      {isActive && (
        <span
          aria-hidden
          style={{
            position: 'absolute',
            left: 0, top: 4, bottom: 4,
            width: 2,
            background: 'var(--t-accent)',
          }}
        />
      )}
      <item.icon
        className="w-4 h-4 flex-shrink-0"
        style={{ color: isActive ? 'var(--t-accent)' : 'var(--t-text-muted)' }}
      />
      {!collapsed && (
        <>
          <span className="flex-1 truncate">
            {item.name}
          </span>
          {count !== undefined && count > 0 && (
            <span
              style={{
                fontFamily: MONO,
                fontSize: 10,
                padding: '1px 5px',
                letterSpacing: '0.04em',
                background: isActive
                  ? 'color-mix(in srgb, var(--t-accent) 18%, transparent)'
                  : 'var(--t-panel)',
                color: isActive ? 'var(--t-accent)' : 'var(--t-text-muted)',
                border: `1px solid ${isActive ? 'color-mix(in srgb, var(--t-accent) 30%, transparent)' : 'var(--t-border)'}`,
              }}
            >
              {String(count).padStart(2, '0')}
            </span>
          )}
        </>
      )}
    </Link>
  );
}

/* ==================== Project Selector (inline with logo) ==================== */

function ProjectSelector({ collapsed }: { collapsed: boolean }) {
  const { projects, selectedProject, selectProject, fetchProjects, refreshProjects } = useProject();
  const [isOpen, setIsOpen] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  useEffect(() => {
    const savedId = localStorage.getItem('selectedProjectId');
    if (savedId && projects.length > 0 && !selectedProject) {
      const found = projects.find(p => p.id === savedId);
      if (found) selectProject(found);
    }
  }, [projects, selectedProject, selectProject]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setShowCreateForm(false);
        setNewProjectName('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (showCreateForm && inputRef.current) inputRef.current.focus();
  }, [showCreateForm]);

  const handleCreateProject = async () => {
    if (!newProjectName.trim() || isCreating) return;
    setIsCreating(true);
    try {
      const res = await fetch('/runloop/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newProjectName.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        await refreshProjects();
        if (data.project) selectProject(data.project);
        setNewProjectName('');
        setShowCreateForm(false);
        setIsOpen(false);
      }
    } catch (error) {
      console.error('Failed to create project:', error);
    } finally {
      setIsCreating(false);
    }
  };

  const psRouter = useRouter();
  const psPathname = usePathname() || '';

  const handleSelect = (project: typeof selectedProject) => {
    selectProject(project);
    setIsOpen(false);
    if (project) {
      // Navigate to same section under new project
      // Extract the current section from URL (e.g., /flows, /dashboard)
      const sectionMatch = psPathname.match(/\/(dashboard|flows|schedulers|executions)(\/.*)?$/);
      const section = sectionMatch ? sectionMatch[1] : 'dashboard';
      psRouter.push(`/p/${project.id}/${section}`);
    }
  };

  /* Dropdown menu (shared between collapsed & expanded) */
  const dropdownMenu = (positionClass: string) => (
    <div
      style={{ backgroundColor: 'var(--t-panel)', borderColor: 'var(--t-border)', borderRadius: 2 }}
      className={`${positionClass} border shadow-xl py-1 z-50`}
    >
      <div className="max-h-48 overflow-auto py-0.5">
        <button
          onClick={() => handleSelect(null)}
          className="w-full px-3 py-1.5 text-left text-[12px] hover:bg-[var(--t-panel-hover)] flex items-center gap-2 transition-colors"
          style={{ color: !selectedProject ? '#60A5FA' : 'var(--t-text-secondary)' }}
        >
          <Layers className="w-3 h-3" style={{ color: 'var(--t-text-muted)' }} />
          <span className="flex-1">All Projects</span>
          {!selectedProject && <Check className="w-3 h-3 text-[#60A5FA]" />}
        </button>
        {projects.map((project) => (
          <button
            key={project.id}
            onClick={() => handleSelect(project)}
            className="w-full px-3 py-1.5 text-left text-[12px] hover:bg-[var(--t-panel-hover)] flex items-center gap-2 transition-colors"
            style={{ color: selectedProject?.id === project.id ? '#60A5FA' : 'var(--t-text-secondary)' }}
          >
            <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: project.color || '#3B82F6' }} />
            <span className="flex-1 truncate">{project.name}</span>
            {selectedProject?.id === project.id && <Check className="w-3 h-3 text-[#60A5FA]" />}
          </button>
        ))}
      </div>
      <div className="border-t" style={{ borderColor: 'var(--t-border)' }}>
        {!showCreateForm ? (
          <button
            onClick={() => setShowCreateForm(true)}
            className="w-full px-3 py-1.5 text-left text-[12px] text-[#60A5FA] hover:bg-[var(--t-panel-hover)] flex items-center gap-2 transition-colors"
          >
            <Plus className="w-3 h-3" />
            New Project
          </button>
        ) : (
          <div className="px-2.5 py-2 space-y-1.5">
            <input
              ref={inputRef}
              type="text"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateProject();
                if (e.key === 'Escape') { setShowCreateForm(false); setNewProjectName(''); }
              }}
              placeholder="Project name..."
              style={{ backgroundColor: 'var(--t-input)', borderColor: 'var(--t-border)', color: 'var(--t-text)' }}
              className="w-full h-7 px-2 text-[11px] border rounded focus:outline-none focus:border-[#3B82F6] focus:ring-1 focus:ring-[#3B82F6]/30"
            />
            <div className="flex gap-1">
              <button
                onClick={handleCreateProject}
                disabled={!newProjectName.trim() || isCreating}
                className="flex-1 h-6 text-[10px] font-medium bg-[#3B82F6] text-white rounded hover:bg-[#2563EB] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isCreating ? '...' : 'Create'}
              </button>
              <button
                onClick={() => { setShowCreateForm(false); setNewProjectName(''); }}
                style={{ color: 'var(--t-text-muted)' }}
                className="h-6 w-6 flex items-center justify-center rounded hover:bg-[var(--t-panel-hover)] transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  if (collapsed) {
    return (
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:bg-[var(--t-panel-hover)]"
          title={selectedProject?.name || 'Select Project'}
        >
          <FolderKanban className="w-4 h-4" style={{ color: selectedProject ? '#60A5FA' : 'var(--t-text-muted)' }} />
        </button>
        {isOpen && dropdownMenu('absolute left-full top-0 ml-2 w-48')}
      </div>
    );
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 px-1 py-0.5 transition-all hover:bg-[var(--t-panel-hover)] max-w-full"
        style={{ borderRadius: 2 }}
        title={selectedProject?.name || 'Select Project'}
      >
        <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--t-text-muted)', opacity: 0.7, letterSpacing: '0.1em' }}>
          project:
        </span>
        <span
          className="truncate max-w-[90px]"
          style={{ fontFamily: MONO, fontSize: 10.5, color: 'var(--t-text-secondary)', letterSpacing: '0.02em' }}
        >
          {selectedProject?.name || 'all'}
        </span>
        <ChevronDown className="w-3 h-3 flex-shrink-0" style={{ color: 'var(--t-text-muted)' }} />
      </button>
      {isOpen && dropdownMenu('absolute left-0 top-full mt-1 w-48')}
    </div>
  );
}

/* ==================== Schematic primitives ==================== */

// Tiny "run loop" mark — two nodes joined by a curved edge. Sharp-cornered
// bounding box reads as schematic rather than SaaS. Matches the login page.
function SidebarMark() {
  return (
    <div
      className="flex items-center justify-center flex-shrink-0"
      style={{
        width: 28,
        height: 28,
        border: '1px solid color-mix(in srgb, var(--t-accent) 40%, transparent)',
        background: 'color-mix(in srgb, var(--t-accent) 10%, transparent)',
        borderRadius: 2,
      }}
      aria-hidden
    >
      <svg width={16} height={16} viewBox="0 0 18 18">
        <path
          d="M4 9 Q 4 4 9 4 Q 14 4 14 9 Q 14 14 9 14"
          fill="none"
          stroke="var(--t-accent)"
          strokeWidth={1.6}
          strokeLinecap="round"
        />
        <circle cx={4} cy={9} r={1.8} fill="var(--t-accent)" />
        <circle cx={14} cy={9} r={1.8} fill="var(--t-accent)" opacity={0.55} />
      </svg>
    </div>
  );
}

// Live UTC ticker — the kind of detail a DevOps dashboard would show. It's
// deliberately small and mono so it reads as telemetry, not copy.
function UtcClock() {
  const [t, setT] = useState<string>('');
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      const hh = String(d.getUTCHours()).padStart(2, '0');
      const mm = String(d.getUTCMinutes()).padStart(2, '0');
      const ss = String(d.getUTCSeconds()).padStart(2, '0');
      setT(`${hh}:${mm}:${ss}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <span
      style={{
        fontFamily: MONO,
        fontSize: 10.5,
        color: 'var(--t-text-secondary)',
        letterSpacing: '0.04em',
      }}
    >
      {t}
      <span style={{ color: 'var(--t-text-muted)', marginLeft: 4, opacity: 0.6 }}>UTC</span>
    </span>
  );
}

// Engine dot — a soft pulsing green dot + "ENGINE" label. Sits in the header
// to echo the login page's ONLINE footer.
function EngineDot() {
  return (
    <span
      className="flex items-center gap-1.5"
      style={{ fontFamily: MONO, fontSize: 10, color: 'var(--t-text-muted)', letterSpacing: '0.12em' }}
    >
      <span
        aria-hidden
        style={{
          width: 6, height: 6, borderRadius: 999,
          background: '#10B981',
          boxShadow: '0 0 0 3px color-mix(in srgb, #10B981 18%, transparent)',
          animation: 'rl-engine-pulse 2.4s ease-in-out infinite',
        }}
      />
      ENGINE
    </span>
  );
}

/* ==================== Layout ==================== */

export function Layout({ children }: { children?: React.ReactNode }) {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { selectedProject } = useProject();
  const pathname = usePathname() || '';
  const router = useRouter();

  // Build project-scoped path prefix
  const projectPrefix = selectedProject ? `/p/${selectedProject.id}` : '';

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({});

  const userMenuRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);

  // Fetch sidebar counts (filtered by selected project)
  useEffect(() => {
    async function fetchCounts() {
      try {
        const pid = selectedProject?.id;
        const qs = pid ? `?projectId=${pid}` : '';
        const [projRes, schedRes, flowRes] = await Promise.allSettled([
          fetch('/runloop/api/projects'),
          fetch(`/runloop/api/schedulers${qs}`),
          fetch(`/runloop/api/flows${qs}`),
        ]);
        const newCounts: Record<string, number> = {};
        if (projRes.status === 'fulfilled' && projRes.value.ok) {
          const d = await projRes.value.json();
          newCounts.projects = d.projects?.length || 0;
        }
        if (schedRes.status === 'fulfilled' && schedRes.value.ok) {
          const d = await schedRes.value.json();
          newCounts.schedulers = d.data?.length || 0;
        }
        if (flowRes.status === 'fulfilled' && flowRes.value.ok) {
          const d = await flowRes.value.json();
          newCounts.flows = d.data?.length || 0;
        }
        setCounts(newCounts);
      } catch {}
    }
    fetchCounts();
  }, [pathname, selectedProject?.id]);

  // Close menus when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
      if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    await logout();
  };

  return (
    <div className="min-h-screen flex" style={{ fontFamily: FONT, backgroundColor: 'var(--t-bg)' }}>
      {/* ===== Sidebar (fixed, Orch.io style) ===== */}
      <aside
        style={{ fontFamily: FONT, backgroundColor: 'var(--t-sidebar)', borderColor: 'var(--t-border-light)' }}
        className={`fixed top-0 left-0 z-40 h-full border-r flex flex-col transition-all duration-200 ${
          sidebarCollapsed ? 'w-16' : 'w-52'
        }`}
      >
        {/* Logo + Project Selector */}
        <div className={`h-14 flex items-center ${sidebarCollapsed ? 'justify-center px-2' : 'px-3'}`}>
          <SidebarMark />
          {!sidebarCollapsed && (
            <div className="flex flex-col ml-2.5 min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span
                  style={{ color: 'var(--t-text)', fontFamily: MONO, letterSpacing: '-0.01em' }}
                  className="text-[13px] font-medium leading-none"
                >
                  runloop
                </span>
                <span
                  style={{ fontFamily: MONO, fontSize: 8.5, letterSpacing: '0.1em', color: 'var(--t-accent)', borderColor: 'color-mix(in srgb, var(--t-accent) 35%, transparent)', borderRadius: 0 }}
                  className="px-1 py-[1px] border font-medium leading-none uppercase"
                >
                  beta
                </span>
              </div>
              <ProjectSelector collapsed={false} />
            </div>
          )}
          {sidebarCollapsed && <ProjectSelector collapsed={true} />}
        </div>

        {/* Divider */}
        <div className="mx-3 border-t" style={{ borderColor: 'var(--t-border-light)' }} />

        {/* Navigation */}
        <nav className="flex-1 py-3 px-2 overflow-y-auto">
          {/* Main Section */}
          <div className="space-y-0.5">
            {!sidebarCollapsed && (
              <p className="px-3 py-2 text-[10px] uppercase flex items-center gap-2" style={{ color: 'var(--t-text-muted)', fontFamily: MONO, letterSpacing: '0.16em' }}>
                <span style={{ opacity: 0.5 }}>{'//'}</span>
                Main Menu
              </p>
            )}
            {mainNavigation.map((item) => {
              const scopedHref = `${projectPrefix}${item.href}`;
              const scopedItem = { ...item, href: scopedHref };
              const isActive = pathname.includes(item.href) && pathname.includes('/p/');
              const count = item.countKey ? counts[item.countKey] : undefined;
              return (
                <NavItem
                  key={item.name}
                  item={scopedItem}
                  pathname={pathname}
                  collapsed={sidebarCollapsed}
                  isActive={isActive}
                  count={count}
                />
              );
            })}
          </div>

          {/* System Section */}
          <div className="mt-6 space-y-0.5">
            {!sidebarCollapsed && (
              <p className="px-3 py-2 text-[10px] uppercase flex items-center gap-2" style={{ color: 'var(--t-text-muted)', fontFamily: MONO, letterSpacing: '0.16em' }}>
                <span style={{ opacity: 0.5 }}>{'//'}</span>
                System
              </p>
            )}
            {systemNavigation.map((item) => {
              // Project-scoped system pages live under /p/{projectId}/...
              const scopedHref = item.projectScoped ? `${projectPrefix}${item.href}` : item.href;
              const scopedItem = item.projectScoped ? { ...item, href: scopedHref } : item;
              const isActive = pathname.endsWith(item.href) || pathname.includes(`${item.href}/`);
              return (
                <NavItem
                  key={item.name}
                  item={scopedItem}
                  pathname={pathname}
                  collapsed={sidebarCollapsed}
                  isActive={isActive}
                />
              );
            })}
          </div>
        </nav>
      </aside>

      {/* Spacer for fixed sidebar */}
      <div className={`flex-shrink-0 transition-all duration-200 ${sidebarCollapsed ? 'w-16' : 'w-52'}`} />

      {/* ===== Main Content ===== */}
      <main className="flex-1 flex flex-col overflow-hidden" style={{ backgroundColor: 'var(--t-bg)' }}>
        {/* ===== Header (Orch.io style) ===== */}
        <header
          style={{ fontFamily: FONT, backgroundColor: 'var(--t-header)', borderColor: 'var(--t-border-light)' }}
          className="h-14 border-b flex items-center px-4 sticky top-0 z-20 transition-colors"
        >
          {/* Left: Toggle + Breadcrumb */}
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              style={{ color: 'var(--t-text-muted)', borderRadius: 2 }}
              className="h-8 w-8 flex items-center justify-center hover:text-[var(--t-accent)] transition-colors"
              title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              <Menu className="w-4 h-4" />
            </button>
            <Breadcrumb />
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-2 ml-auto">
            {/* Engine status + clock — telemetry strip */}
            <div
              className="hidden md:flex items-center gap-3 pr-3 mr-1"
              style={{ borderRight: '1px solid var(--t-border-light)', height: 24 }}
            >
              <EngineDot />
              <UtcClock />
            </div>

            {/* Search */}
            <div className="hidden sm:block w-44 md:w-56">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: 'var(--t-text-muted)' }} />
                <input
                  type="text"
                  placeholder="search…"
                  style={{
                    backgroundColor: 'var(--t-input)',
                    borderColor: 'var(--t-border)',
                    color: 'var(--t-text)',
                    fontFamily: MONO,
                    fontSize: 11.5,
                    letterSpacing: '0.02em',
                    borderRadius: 2,
                  }}
                  className="w-full h-8 pl-8 pr-2 border placeholder:text-[var(--t-text-muted)] focus:outline-none focus:border-[var(--t-accent)] transition-all"
                />
                <span
                  className="absolute right-2 top-1/2 -translate-y-1/2 hidden md:inline-block"
                  style={{
                    fontFamily: MONO, fontSize: 9, letterSpacing: '0.1em',
                    color: 'var(--t-text-muted)', opacity: 0.6,
                    border: '1px solid var(--t-border)', padding: '1px 4px',
                  }}
                  aria-hidden
                >
                  ⌘K
                </span>
              </div>
            </div>

            {/* New Button — run-action style */}
            <button
              onClick={() => router.push(`${projectPrefix}/flows/new`)}
              style={{
                backgroundColor: 'var(--t-panel)',
                borderColor: 'var(--t-border)',
                color: 'var(--t-text-secondary)',
                fontFamily: MONO,
                fontSize: 11,
                letterSpacing: '0.1em',
                borderRadius: 2,
              }}
              className="h-8 px-3 border hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] font-medium flex items-center gap-2 transition-all uppercase"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">new</span>
            </button>

            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              style={{ color: 'var(--t-text-muted)', borderRadius: 2 }}
              className="h-8 w-8 flex items-center justify-center hover:text-[var(--t-accent)] transition-colors"
              title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            {/* Notifications */}
            <div className="relative" ref={notificationsRef}>
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                style={{ color: 'var(--t-text-muted)', borderRadius: 2 }}
                className="relative h-8 w-8 flex items-center justify-center hover:text-[var(--t-accent)] transition-colors"
              >
                <Bell className="w-4 h-4" />
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full ring-2 ring-[var(--t-header)]"></span>
              </button>

              {/* Notifications Dropdown */}
              {showNotifications && (
                <div style={{ backgroundColor: 'var(--t-panel)', borderColor: 'var(--t-border)', borderRadius: 2 }} className="absolute right-0 top-full mt-2 w-72 border shadow-xl py-2">
                  <div className="px-3 py-2 border-b flex items-center justify-between" style={{ borderColor: 'var(--t-border)' }}>
                    <span className="font-medium text-[13px]" style={{ color: 'var(--t-text)' }}>Notifications</span>
                    <button className="text-[11px] text-[#60A5FA] hover:text-[#3B82F6]">Mark all read</button>
                  </div>
                  <div className="max-h-60 overflow-auto">
                    <div className="px-3 py-2.5 hover:bg-[var(--t-panel-hover)] cursor-pointer border-b last:border-0" style={{ borderColor: 'var(--t-border)' }}>
                      <div className="flex gap-2">
                        <div className="w-1.5 h-1.5 bg-[#60A5FA] rounded-full mt-1.5 flex-shrink-0"></div>
                        <div>
                          <p className="text-[12px]" style={{ color: 'var(--t-text)' }}>Scheduler run completed</p>
                          <p className="text-[11px] mt-1" style={{ color: 'var(--t-text-muted)' }}>2 minutes ago</p>
                        </div>
                      </div>
                    </div>
                    <div className="px-3 py-2.5 hover:bg-[var(--t-panel-hover)] cursor-pointer border-b last:border-0" style={{ borderColor: 'var(--t-border)' }}>
                      <div className="flex gap-2">
                        <div className="w-1.5 h-1.5 bg-[#10B981] rounded-full mt-1.5 flex-shrink-0"></div>
                        <div>
                          <p className="text-[12px]" style={{ color: 'var(--t-text)' }}>Flow executed successfully</p>
                          <p className="text-[11px] mt-1" style={{ color: 'var(--t-text-muted)' }}>15 minutes ago</p>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="px-3 py-2 border-t" style={{ borderColor: 'var(--t-border)' }}>
                    <button className="text-[12px] text-[#60A5FA] hover:text-[#3B82F6]">View all notifications</button>
                  </div>
                </div>
              )}
            </div>

            {/* User Menu */}
            <div className="relative" ref={userMenuRef}>
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                style={{ color: 'var(--t-text-muted)', borderRadius: 2 }}
                className="flex items-center gap-2 h-8 px-2 hover:text-[var(--t-accent)] transition-colors"
              >
                <div style={{ backgroundColor: 'var(--t-panel)', borderColor: 'var(--t-border)' }} className="w-7 h-7 rounded-full border flex items-center justify-center text-[#60A5FA] text-xs font-medium">
                  {user?.name?.charAt(0) || user?.email?.charAt(0) || 'A'}
                </div>
                <ChevronDown className={`w-4 h-4 transition-transform ${showUserMenu ? 'rotate-180' : ''}`} />
              </button>

              {/* User Dropdown */}
              {showUserMenu && (
                <div style={{ backgroundColor: 'var(--t-panel)', borderColor: 'var(--t-border)', borderRadius: 2 }} className="absolute right-0 top-full mt-2 w-52 border shadow-xl py-2">
                  <div className="px-3 py-2.5 border-b" style={{ borderColor: 'var(--t-border)' }}>
                    <p className="font-medium text-[13px]" style={{ color: 'var(--t-text)' }}>{user?.name || user?.email || 'Admin User'}</p>
                    <p className="text-[11px] mt-0.5" style={{ color: 'var(--t-text-muted)' }}>{user?.email || 'admin@runloop.io'}</p>
                  </div>
                  <div className="py-1">
                    <button style={{ color: 'var(--t-text-secondary)' }} className="w-full px-3 py-2 text-left text-[13px] hover:text-[var(--t-text)] hover:bg-[var(--t-panel-hover)] flex items-center gap-2 transition-colors">
                      <User className="w-4 h-4" />
                      Profile
                    </button>
                    <button
                      onClick={() => router.push('/settings')}
                      style={{ color: 'var(--t-text-secondary)' }}
                      className="w-full px-3 py-2 text-left text-[13px] hover:text-[var(--t-text)] hover:bg-[var(--t-panel-hover)] flex items-center gap-2 transition-colors"
                    >
                      <Settings className="w-4 h-4" />
                      Settings
                    </button>
                    <button style={{ color: 'var(--t-text-secondary)' }} className="w-full px-3 py-2 text-left text-[13px] hover:text-[var(--t-text)] hover:bg-[var(--t-panel-hover)] flex items-center gap-2 transition-colors">
                      <HelpCircle className="w-4 h-4" />
                      Help & Support
                    </button>
                  </div>
                  <div className="border-t py-1 mt-1" style={{ borderColor: 'var(--t-border)' }}>
                    <button
                      onClick={handleLogout}
                      className="w-full px-3 py-2 text-left text-[13px] text-red-400 hover:text-red-300 hover:bg-red-500/10 flex items-center gap-2 transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      Sign out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-auto p-4">
          {children}
        </div>
      </main>

      {/* Global keyframes for the chrome telemetry bits. */}
      <style jsx global>{`
        @keyframes rl-engine-pulse {
          0%, 100% { box-shadow: 0 0 0 3px color-mix(in srgb, #10B981 18%, transparent); }
          50%      { box-shadow: 0 0 0 5px color-mix(in srgb, #10B981 8%, transparent); }
        }
      `}</style>
    </div>
  );
}
