'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { useProject } from '@/context/ProjectContext';
import { ControlBackdrop } from './ControlBackdrop';
import {
  LayoutDashboard,
  Workflow,
  Clock,
  Settings,
  ChevronDown,
  Search,
  Bell,
  User,
  LogOut,
  Menu,
  Plus,
  Sun,
  Moon,
  HelpCircle,
  Activity,
  Inbox,
  BellRing,
  BookOpen,
  FolderKanban,
  Layers,
  X,
  Check,
  LucideIcon,
} from 'lucide-react';

// Layout — the chrome that wraps every internal page. The identity goal
// is continuity with /login: the user never feels like they've left the
// "control room." Two big moves:
//
//  1. A quiet <ControlBackdrop/> sits behind the main scroll area, so
//     every page has the same DAG/grid atmosphere without any per-page
//     effort. Opacity is low enough that dense tables still read fine.
//
//  2. The sidebar and header are restyled as instrumentation rather
//     than dashboard chrome — section labels are `// MAIN_MENU` style,
//     nav entries use mono uppercase, counts are tabular-nums, and
//     the sidebar footer shows a live status stack (engine / UTC
//     clock / cron tick) mirroring the login page's footer.
//
// Functional surface (project selector, notifications, user menu,
// count fetching) is preserved exactly — only the shell is new.

const SANS = "'IBM Plex Sans Thai', 'IBM Plex Sans', sans-serif";
const MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

/* ==================== Nav Config ==================== */

interface NavItemType {
  name: string;
  href: string;
  icon: LucideIcon;
  countKey: string | null;
  projectScoped?: boolean;
}

const mainNavigation: NavItemType[] = [
  { name: 'Dashboard',  href: '/dashboard',  icon: LayoutDashboard, countKey: null },
  { name: 'Flows',      href: '/flows',      icon: Workflow,        countKey: 'flows' },
  { name: 'Schedulers', href: '/schedulers', icon: Clock,           countKey: 'schedulers' },
  { name: 'Executions', href: '/executions', icon: Activity,        countKey: null },
  { name: 'Queues',     href: '/queues',     icon: Inbox,           countKey: null },
  { name: 'Channels',   href: '/channels',   icon: BellRing,        countKey: null },
];

// projectScoped:true → href is rewritten to /p/<currentProjectId>/<href>
// at render time. Same pattern as the main nav so every link follows the
// /p/<id>/* convention; non-scoped paths (eg /projects) don't need it.
const systemNavigation: NavItemType[] = [
  { name: 'API Docs', href: '/docs',     icon: BookOpen, countKey: null, projectScoped: true },
  { name: 'Settings', href: '/settings', icon: Settings, countKey: null, projectScoped: true },
];

/* ==================== Breadcrumb ==================== */

const breadcrumbMap: Record<string, string> = {
  'dashboard': 'Dashboard',
  'projects': 'Projects',
  'flows': 'Flows',
  'schedulers': 'Schedulers',
  'executions': 'Executions',
  'queues': 'Queues',
  'channels': 'Channels',
  'members': 'Members',
  'secrets': 'Secrets',
  'settings': 'Settings',
  'audit-log': 'Audit Log',
  'api-keys': 'API Keys',
  'integrations': 'Integrations',
  'plugins': 'Plugins',
  'env': 'Environment',
  'docs': 'API Docs',
  'dlq': 'DLQ',
  'new': 'New',
};

function Breadcrumb() {
  const pathname = usePathname() || '';
  const projectMatch = pathname.match(/^\/(p\/[^/]+)/);
  const projectPrefix = projectMatch ? `/${projectMatch[1]}` : '';
  const cleaned = pathname.replace(/^\/p\/[^/]+\/?/, '').replace(/^\//, '');
  const segments = cleaned.split('/').filter(Boolean);
  if (segments.length === 0) segments.push('dashboard');

  return (
    <nav
      style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.06em' }}
      className="flex items-center gap-1.5 min-w-0"
    >
      {/* Shell prompt — reinforces the "inside a running process" feel. */}
      <span style={{ color: 'var(--t-accent)', opacity: 0.7 }}>{'>'}</span>
      <Link
        href={`${projectPrefix}/dashboard`}
        style={{ color: 'var(--t-text-muted)' }}
        className="hover:!text-[var(--t-accent)] transition-colors whitespace-nowrap"
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
                style={{ color: 'var(--t-text)', letterSpacing: '0.1em' }}
                className="truncate max-w-[220px] uppercase"
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

function NavItem({ item, collapsed, isActive, count }: {
  item: NavItemType;
  collapsed: boolean;
  isActive: boolean;
  count?: number;
}) {
  return (
    <Link
      href={item.href}
      style={{
        fontFamily: MONO,
        fontSize: 11.5,
        letterSpacing: '0.14em',
        color: isActive ? 'var(--t-text)' : 'var(--t-text-secondary)',
        background: isActive ? 'color-mix(in srgb, var(--t-accent) 12%, transparent)' : 'transparent',
        borderRadius: 2,
        position: 'relative',
        textTransform: 'uppercase',
      }}
      className={[
        'group flex items-center gap-3 py-2 transition-all duration-150',
        collapsed ? 'justify-center px-2 mx-1' : 'px-3 mx-1',
        !isActive && 'hover:text-[var(--t-text)] hover:bg-[var(--t-panel-hover)]',
      ].filter(Boolean).join(' ')}
      title={collapsed ? item.name : undefined}
    >
      {/* Left accent bar — like a selected DAG node. Same motif the
          login form uses on focused inputs. */}
      <span
        aria-hidden
        style={{
          position: 'absolute',
          left: 0, top: 4, bottom: 4,
          width: 2,
          background: 'var(--t-accent)',
          transform: isActive ? 'scaleY(1)' : 'scaleY(0)',
          transformOrigin: 'center',
          transition: 'transform 0.18s ease',
        }}
      />
      <item.icon
        className="w-3.5 h-3.5 flex-shrink-0"
        style={{ color: isActive ? 'var(--t-accent)' : 'var(--t-text-muted)' }}
      />
      {!collapsed && (
        <>
          <span className="flex-1 truncate" style={{ fontWeight: isActive ? 600 : 500 }}>
            {item.name}
          </span>
          {count !== undefined && count > 0 && (
            <span
              style={{
                fontFamily: MONO,
                fontSize: 9.5,
                fontVariantNumeric: 'tabular-nums',
                padding: '1px 5px',
                letterSpacing: '0.06em',
                background: isActive
                  ? 'color-mix(in srgb, var(--t-accent) 20%, transparent)'
                  : 'var(--t-panel)',
                color: isActive ? 'var(--t-accent)' : 'var(--t-text-muted)',
                border: `1px solid ${isActive ? 'color-mix(in srgb, var(--t-accent) 32%, transparent)' : 'var(--t-border)'}`,
                minWidth: 22,
                textAlign: 'center',
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

/* ==================== Project Selector ==================== */

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
      const found = projects.find((p) => p.id === savedId);
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
      const sectionMatch = psPathname.match(/\/(dashboard|flows|schedulers|executions|queues|channels)(\/.*)?$/);
      const section = sectionMatch ? sectionMatch[1] : 'dashboard';
      psRouter.push(`/p/${project.id}/${section}`);
    }
  };

  const dropdownMenu = (positionClass: string) => (
    <div
      style={{ backgroundColor: 'var(--t-panel)', borderColor: 'var(--t-border)', borderRadius: 2 }}
      className={`${positionClass} border shadow-xl py-1 z-50`}
    >
      <div className="max-h-48 overflow-auto py-0.5">
        <button
          onClick={() => handleSelect(null)}
          className="w-full px-3 py-1.5 text-left flex items-center gap-2 transition-colors hover:bg-[var(--t-panel-hover)]"
          style={{
            fontFamily: MONO,
            fontSize: 11,
            letterSpacing: '0.04em',
            color: !selectedProject ? 'var(--t-accent)' : 'var(--t-text-secondary)',
          }}
        >
          <Layers className="w-3 h-3" style={{ color: 'var(--t-text-muted)' }} />
          <span className="flex-1">all projects</span>
          {!selectedProject && <Check className="w-3 h-3" style={{ color: 'var(--t-accent)' }} />}
        </button>
        {projects.map((project) => (
          <button
            key={project.id}
            onClick={() => handleSelect(project)}
            className="w-full px-3 py-1.5 text-left flex items-center gap-2 transition-colors hover:bg-[var(--t-panel-hover)]"
            style={{
              fontFamily: MONO,
              fontSize: 11,
              letterSpacing: '0.02em',
              color: selectedProject?.id === project.id ? 'var(--t-accent)' : 'var(--t-text-secondary)',
            }}
          >
            <div
              className="w-2 h-2 flex-shrink-0"
              style={{ backgroundColor: project.color || 'var(--t-accent)' }}
            />
            <span className="flex-1 truncate">{project.name}</span>
            {selectedProject?.id === project.id && <Check className="w-3 h-3" style={{ color: 'var(--t-accent)' }} />}
          </button>
        ))}
      </div>
      <div className="border-t" style={{ borderColor: 'var(--t-border)' }}>
        {!showCreateForm ? (
          <button
            onClick={() => setShowCreateForm(true)}
            className="w-full px-3 py-1.5 text-left flex items-center gap-2 transition-colors hover:bg-[var(--t-panel-hover)]"
            style={{
              fontFamily: MONO,
              fontSize: 11,
              letterSpacing: '0.06em',
              color: 'var(--t-accent)',
            }}
          >
            <Plus className="w-3 h-3" />
            new project
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
              placeholder="project name…"
              style={{
                backgroundColor: 'var(--t-input)',
                borderColor: 'var(--t-border)',
                color: 'var(--t-text)',
                fontFamily: MONO,
                borderRadius: 2,
              }}
              className="w-full h-7 px-2 text-[11px] border focus:outline-none focus:border-[var(--t-accent)]"
            />
            <div className="flex gap-1">
              <button
                onClick={handleCreateProject}
                disabled={!newProjectName.trim() || isCreating}
                style={{ fontFamily: MONO, letterSpacing: '0.08em', borderRadius: 2 }}
                className="flex-1 h-6 text-[10px] font-medium bg-[var(--t-accent)] text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed uppercase transition-opacity"
              >
                {isCreating ? '...' : 'create'}
              </button>
              <button
                onClick={() => { setShowCreateForm(false); setNewProjectName(''); }}
                style={{ color: 'var(--t-text-muted)', borderRadius: 2 }}
                className="h-6 w-6 flex items-center justify-center hover:bg-[var(--t-panel-hover)]"
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
          style={{ borderRadius: 2 }}
          className="w-8 h-8 flex items-center justify-center transition-all hover:bg-[var(--t-panel-hover)]"
          title={selectedProject?.name || 'Select Project'}
        >
          <FolderKanban className="w-4 h-4" style={{ color: selectedProject ? 'var(--t-accent)' : 'var(--t-text-muted)' }} />
        </button>
        {isOpen && dropdownMenu('absolute left-full top-0 ml-2 w-48')}
      </div>
    );
  }

  return (
    <div className="relative w-full" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          borderRadius: 2,
          border: '1px solid var(--t-border)',
          background: 'var(--t-panel)',
        }}
        className="w-full flex items-center gap-2 px-2 py-1.5 transition-all hover:border-[var(--t-accent)]"
        title={selectedProject?.name || 'Select Project'}
      >
        <span
          className="flex-shrink-0"
          style={{
            width: 8, height: 8,
            background: selectedProject?.color || 'var(--t-text-muted)',
          }}
        />
        <span
          className="truncate flex-1 text-left"
          style={{
            fontSize: 12.5,
            fontWeight: 600,
            color: 'var(--t-text)',
            letterSpacing: '-0.005em',
          }}
        >
          {selectedProject?.name || 'All projects'}
        </span>
        <ChevronDown className="w-3 h-3 flex-shrink-0" style={{ color: 'var(--t-text-muted)' }} />
      </button>
      {isOpen && dropdownMenu('absolute left-0 top-full mt-1 w-full')}
    </div>
  );
}

/* ==================== Schematic primitives ==================== */

// The run-loop mark — two nodes joined by a curved edge. Same mark used
// on /login so the brand reads consistently.
function SidebarMark() {
  // Spiral / galaxy-arm mark — two curved arms sweep from the core
  // outward, the whole figure rotates slowly. One color, one motion,
  // but the spiral itself has visual rhythm.
  return (
    <div
      className="flex items-center justify-center flex-shrink-0 relative"
      style={{
        width: 34,
        height: 34,
        filter: 'drop-shadow(0 0 6px color-mix(in srgb, var(--t-accent) 40%, transparent))',
      }}
      aria-hidden
    >
      {/* Static thin ring — the "track" */}
      <svg
        width={34}
        height={34}
        viewBox="0 0 34 34"
        style={{ position: 'absolute', inset: 0 }}
      >
        <circle
          cx={17} cy={17} r={13}
          fill="none"
          stroke="var(--t-accent)"
          strokeOpacity={0.14}
          strokeWidth={1.25}
        />
      </svg>

      {/* Rotating arc with fading tail */}
      <svg
        width={34}
        height={34}
        viewBox="0 0 34 34"
        style={{
          position: 'absolute', inset: 0,
          animation: 'rl-mark-spiral 1.8s cubic-bezier(0.7, 0, 0.3, 1) infinite',
        }}
      >
        <defs>
          <linearGradient id="rl-arc-grad" x1="1" y1="0.7" x2="0.5" y2="0">
            <stop offset="0%"   stopColor="var(--t-accent)" stopOpacity="0" />
            <stop offset="40%"  stopColor="var(--t-accent)" stopOpacity="0.55" />
            <stop offset="100%" stopColor="var(--t-accent)" stopOpacity="1" />
          </linearGradient>
        </defs>
        {/* Arc — tail fades BEHIND the bright head.
            Path drawn from right (tail) → top (head) so gradient aligns. */}
        <path
          d="M 28.26 10.5 A 13 13 0 0 0 17 4"
          fill="none"
          stroke="url(#rl-arc-grad)"
          strokeWidth={2.4}
          strokeLinecap="round"
        />
        {/* Leading bright head dot */}
        <circle cx={17} cy={4} r={1.9} fill="var(--t-accent)" />
      </svg>

      {/* Static core — tiny bright disc with soft halo */}
      <span
        style={{
          position: 'relative',
          width: 5,
          height: 5,
          borderRadius: '50%',
          background: 'var(--t-accent)',
          boxShadow: '0 0 6px color-mix(in srgb, var(--t-accent) 85%, transparent)',
        }}
      />
      <style jsx global>{`
        @keyframes rl-mark-spiral {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}


// Live UTC clock — the kind of detail a DevOps panel would show.
function UtcClock() {
  const [t, setT] = useState<string>('--:--:--');
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
        fontVariantNumeric: 'tabular-nums',
        color: 'var(--t-text-secondary)',
        letterSpacing: '0.04em',
      }}
    >
      {t}
      <span style={{ color: 'var(--t-text-muted)', marginLeft: 4, opacity: 0.55 }}>UTC</span>
    </span>
  );
}

// Engine dot — soft pulsing green dot + "ENGINE" label. Echoes the
// login footer's ONLINE indicator.
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

// Tiny cron ticker — the same idea as login's `CRON */2 * * * * t=0005`,
// but compressed for a control strip. The tick counter flashes when it
// advances, so the header feels "live" without being loud.
function CronTicker() {
  const [tick, setTick] = useState(0);
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    const id = setInterval(() => {
      setTick((t) => t + 1);
      setFlash(true);
      const stop = setTimeout(() => setFlash(false), 180);
      return () => clearTimeout(stop);
    }, 2000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="hidden lg:flex items-center gap-2" style={{ fontFamily: MONO, fontSize: 9.5 }}>
      <span style={{ color: 'var(--t-text-muted)', letterSpacing: '0.12em' }}>CRON</span>
      <span style={{ color: 'var(--t-text-muted)', opacity: 0.5 }}>*/2&nbsp;*&nbsp;*&nbsp;*&nbsp;*</span>
      <span
        style={{
          display: 'inline-block',
          minWidth: 50,
          padding: '1px 5px',
          textAlign: 'center',
          fontVariantNumeric: 'tabular-nums',
          border: '1px solid var(--t-border)',
          color: flash ? 'var(--t-accent)' : 'var(--t-text-secondary)',
          background: flash ? 'color-mix(in srgb, var(--t-accent) 10%, transparent)' : 'transparent',
          transition: 'color 0.2s, background 0.2s',
          letterSpacing: '0.05em',
        }}
      >
        t={String(tick).padStart(4, '0')}
      </span>
    </div>
  );
}

// Sidebar footer — telemetry stack at the bottom of the left column.
// Three lines: engine pulse, UTC clock, and a subtle //fiber+gocron
// subtitle. Mirrors the login footer, but oriented vertically.
function SidebarFooter({ collapsed }: { collapsed: boolean }) {
  const [t, setT] = useState<string>('--:--:--');
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
  if (collapsed) {
    return (
      <div className="px-2 py-3 flex flex-col items-center gap-2" style={{ borderTop: '1px solid var(--t-border-light)' }}>
        <span
          aria-hidden
          style={{
            width: 6, height: 6, borderRadius: 999,
            background: '#10B981',
            boxShadow: '0 0 0 3px color-mix(in srgb, #10B981 18%, transparent)',
            animation: 'rl-engine-pulse 2.4s ease-in-out infinite',
          }}
        />
      </div>
    );
  }
  return (
    <div
      className="px-3 py-3 space-y-1.5"
      style={{
        borderTop: '1px solid var(--t-border-light)',
        fontFamily: MONO,
        fontSize: 9.5,
        letterSpacing: '0.08em',
      }}
    >
      <div className="flex items-center justify-between">
        <span style={{ color: 'var(--t-text-muted)' }}>STATUS</span>
      </div>
      <div className="flex items-center gap-1.5" style={{ color: 'var(--t-text-secondary)' }}>
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
        <span style={{ marginLeft: 'auto', color: '#10B981' }}>ONLINE</span>
      </div>
      <div
        className="flex items-center gap-1.5"
        style={{ color: 'var(--t-text-secondary)', fontVariantNumeric: 'tabular-nums' }}
      >
        <span style={{ width: 6, height: 6, borderRadius: 999, background: 'color-mix(in srgb, var(--t-accent) 80%, transparent)' }} />
        CLOCK
        <span style={{ marginLeft: 'auto' }}>{t}</span>
      </div>
      <div style={{ color: 'var(--t-text-muted)', opacity: 0.55, paddingTop: 4 }}>
        fiber · gocron
      </div>
    </div>
  );
}

/* ==================== Layout ==================== */

export function Layout({ children }: { children?: React.ReactNode }) {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { selectedProject } = useProject();
  const pathname = usePathname() || '';
  const router = useRouter();

  const projectPrefix = selectedProject ? `/p/${selectedProject.id}` : '';

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({});

  const userMenuRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);

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

  const handleLogout = async () => { await logout(); };

  return (
    <div className="min-h-screen flex" style={{ fontFamily: SANS, backgroundColor: 'var(--t-bg)' }}>
      {/* ===== Sidebar ===== */}
      <aside
        style={{ fontFamily: SANS, backgroundColor: 'var(--t-sidebar)', borderColor: 'var(--t-border-light)' }}
        className={`fixed top-0 left-0 z-40 h-full border-r flex flex-col transition-all duration-200 ${
          sidebarCollapsed ? 'w-16' : 'w-56'
        }`}
      >
        {/* Brand */}
        <div className={`flex items-center ${sidebarCollapsed ? 'justify-center px-2 py-3' : 'px-3 py-4'}`}>
          <SidebarMark />
          {!sidebarCollapsed && (
            <div className="flex items-center gap-2 ml-2.5 min-w-0 flex-1">
              <span
                style={{ color: 'var(--t-text)', letterSpacing: '-0.01em' }}
                className="text-[15px] font-semibold leading-none"
              >
                RunLoop
              </span>
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: 8.5,
                  letterSpacing: '0.1em',
                  color: 'var(--t-accent)',
                  borderColor: 'color-mix(in srgb, var(--t-accent) 35%, transparent)',
                }}
                className="px-1 py-[1px] border font-medium leading-none uppercase"
              >
                beta
              </span>
            </div>
          )}
        </div>

        {/* Project selector — now a prominent row under the brand */}
        {!sidebarCollapsed && (
          <div className="px-3 pb-2">
            <p
              className="pb-1"
              style={{
                fontFamily: MONO, fontSize: 9,
                letterSpacing: '0.18em', textTransform: 'uppercase',
                color: 'var(--t-text-muted)',
              }}
            >
              project
            </p>
            <ProjectSelector collapsed={false} />
          </div>
        )}
        {sidebarCollapsed && (
          <div className="px-2 pb-2 flex justify-center">
            <ProjectSelector collapsed={true} />
          </div>
        )}

        <div className="mx-3 border-t" style={{ borderColor: 'var(--t-border-light)' }} />

        {/* Navigation */}
        <nav className="flex-1 pt-2 pb-3 overflow-y-auto">
          <div className="space-y-0.5">
            {!sidebarCollapsed && (
              <p
                className="px-4 pt-1 pb-1.5"
                style={{
                  color: 'var(--t-text-muted)',
                  fontFamily: MONO,
                  fontSize: 9.5,
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                }}
              >
                main menu
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
                  collapsed={sidebarCollapsed}
                  isActive={isActive}
                  count={count}
                />
              );
            })}
          </div>

          <div className="mt-3 space-y-0.5">
            {!sidebarCollapsed && (
              <p
                className="px-4 pt-1 pb-1.5"
                style={{
                  color: 'var(--t-text-muted)',
                  fontFamily: MONO,
                  fontSize: 9.5,
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                }}
              >
                system
              </p>
            )}
            {systemNavigation.map((item) => {
              const scopedHref = item.projectScoped ? `${projectPrefix}${item.href}` : item.href;
              const scopedItem = item.projectScoped ? { ...item, href: scopedHref } : item;
              const isActive = pathname.endsWith(item.href) || pathname.includes(`${item.href}/`);
              return (
                <NavItem
                  key={item.name}
                  item={scopedItem}
                  collapsed={sidebarCollapsed}
                  isActive={isActive}
                />
              );
            })}
          </div>
        </nav>

        <SidebarFooter collapsed={sidebarCollapsed} />
      </aside>

      {/* Sidebar spacer */}
      <div className={`flex-shrink-0 transition-all duration-200 ${sidebarCollapsed ? 'w-16' : 'w-56'}`} />

      {/* ===== Main ===== */}
      <main className="flex-1 flex flex-col overflow-hidden relative" style={{ backgroundColor: 'var(--t-bg)' }}>
        {/* Atmospheric backdrop — positioned within the main scroll
            container so it scrolls with the grid, but content sits
            above it via z-index. */}
        <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 0 }}>
          <ControlBackdrop />
        </div>

        {/* ===== Header (control strip) ===== */}
        <header
          style={{
            fontFamily: SANS,
            backgroundColor: 'color-mix(in srgb, var(--t-header) 85%, transparent)',
            borderColor: 'var(--t-border-light)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
          }}
          className="h-14 border-b flex items-center px-4 sticky top-0 z-30 transition-colors"
        >
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

          <div className="flex items-center gap-2 ml-auto">
            {/* Telemetry strip — sits right where eyes land after the breadcrumb */}
            <div
              className="hidden md:flex items-center gap-3 pr-3 mr-1"
              style={{ borderRight: '1px solid var(--t-border-light)', height: 24 }}
            >
              <EngineDot />
              <UtcClock />
              <CronTicker />
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

            {/* New flow shortcut */}
            <button
              onClick={() => router.push(`${projectPrefix}/flows/new`)}
              style={{
                background: 'var(--t-accent)',
                color: '#fff',
                fontSize: 12,
                fontWeight: 500,
                letterSpacing: '0.02em',
                borderRadius: 2,
                padding: '0 12px',
              }}
              className="h-8 flex items-center gap-1.5 hover:opacity-90 transition-opacity"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">New Flow</span>
            </button>

            <button
              onClick={toggleTheme}
              style={{ color: 'var(--t-text-muted)', borderRadius: 2 }}
              className="h-8 w-8 flex items-center justify-center hover:text-[var(--t-accent)] transition-colors"
              title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            <div className="relative" ref={notificationsRef}>
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                style={{ color: 'var(--t-text-muted)', borderRadius: 2 }}
                className="relative h-8 w-8 flex items-center justify-center hover:text-[var(--t-accent)] transition-colors"
              >
                <Bell className="w-4 h-4" />
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full ring-2 ring-[var(--t-header)]" />
              </button>

              {showNotifications && (
                <div
                  style={{ backgroundColor: 'var(--t-panel)', borderColor: 'var(--t-border)', borderRadius: 2 }}
                  className="absolute right-0 top-full mt-2 w-72 border shadow-xl py-2"
                >
                  <div
                    className="px-3 py-2 border-b flex items-center justify-between"
                    style={{ borderColor: 'var(--t-border)' }}
                  >
                    <span
                      style={{
                        fontFamily: MONO,
                        fontSize: 10,
                        letterSpacing: '0.16em',
                        color: 'var(--t-text-muted)',
                      }}
                    >
                      {'//'} NOTIFICATIONS
                    </span>
                    <button
                      style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.04em' }}
                      className="text-[var(--t-accent)] hover:opacity-80"
                    >
                      mark all read
                    </button>
                  </div>
                  <div className="max-h-60 overflow-auto">
                    <div
                      className="px-3 py-2.5 hover:bg-[var(--t-panel-hover)] cursor-pointer border-b last:border-0"
                      style={{ borderColor: 'var(--t-border)' }}
                    >
                      <div className="flex gap-2">
                        <div className="w-1.5 h-1.5 bg-[var(--t-accent)] rounded-full mt-1.5 flex-shrink-0" />
                        <div>
                          <p className="text-[12px]" style={{ color: 'var(--t-text)' }}>Scheduler run completed</p>
                          <p
                            className="mt-1"
                            style={{
                              fontFamily: MONO,
                              fontSize: 10,
                              color: 'var(--t-text-muted)',
                              letterSpacing: '0.04em',
                            }}
                          >
                            2m ago
                          </p>
                        </div>
                      </div>
                    </div>
                    <div
                      className="px-3 py-2.5 hover:bg-[var(--t-panel-hover)] cursor-pointer border-b last:border-0"
                      style={{ borderColor: 'var(--t-border)' }}
                    >
                      <div className="flex gap-2">
                        <div className="w-1.5 h-1.5 bg-[#10B981] rounded-full mt-1.5 flex-shrink-0" />
                        <div>
                          <p className="text-[12px]" style={{ color: 'var(--t-text)' }}>Flow executed successfully</p>
                          <p
                            className="mt-1"
                            style={{
                              fontFamily: MONO,
                              fontSize: 10,
                              color: 'var(--t-text-muted)',
                              letterSpacing: '0.04em',
                            }}
                          >
                            15m ago
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="relative" ref={userMenuRef}>
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                style={{ color: 'var(--t-text-muted)', borderRadius: 2 }}
                className="flex items-center gap-2 h-8 px-2 hover:text-[var(--t-accent)] transition-colors"
              >
                <div
                  style={{
                    backgroundColor: 'var(--t-panel)',
                    borderColor: 'var(--t-border)',
                    fontFamily: MONO,
                    borderRadius: 2,
                  }}
                  className="w-7 h-7 border flex items-center justify-center text-[var(--t-accent)] text-xs font-medium uppercase"
                >
                  {user?.name?.charAt(0) || user?.email?.charAt(0) || 'A'}
                </div>
                <ChevronDown className={`w-4 h-4 transition-transform ${showUserMenu ? 'rotate-180' : ''}`} />
              </button>

              {showUserMenu && (
                <div
                  style={{ backgroundColor: 'var(--t-panel)', borderColor: 'var(--t-border)', borderRadius: 2 }}
                  className="absolute right-0 top-full mt-2 w-56 border shadow-xl py-2"
                >
                  <div className="px-3 py-2.5 border-b" style={{ borderColor: 'var(--t-border)' }}>
                    <p
                      className="font-medium"
                      style={{ fontFamily: MONO, fontSize: 12, color: 'var(--t-text)', letterSpacing: '0.02em' }}
                    >
                      {user?.name || user?.email || 'admin'}
                    </p>
                    <p
                      className="mt-0.5"
                      style={{
                        fontFamily: MONO,
                        fontSize: 10,
                        color: 'var(--t-text-muted)',
                        letterSpacing: '0.02em',
                      }}
                    >
                      {user?.email || '—'}
                    </p>
                  </div>
                  <div className="py-1">
                    <button
                      style={{
                        color: 'var(--t-text-secondary)',
                        fontFamily: MONO,
                        fontSize: 11,
                        letterSpacing: '0.1em',
                      }}
                      className="w-full px-3 py-2 text-left hover:text-[var(--t-text)] hover:bg-[var(--t-panel-hover)] flex items-center gap-2 uppercase"
                    >
                      <User className="w-3.5 h-3.5" />
                      profile
                    </button>
                    <button
                      onClick={() => router.push('/settings')}
                      style={{
                        color: 'var(--t-text-secondary)',
                        fontFamily: MONO,
                        fontSize: 11,
                        letterSpacing: '0.1em',
                      }}
                      className="w-full px-3 py-2 text-left hover:text-[var(--t-text)] hover:bg-[var(--t-panel-hover)] flex items-center gap-2 uppercase"
                    >
                      <Settings className="w-3.5 h-3.5" />
                      settings
                    </button>
                    <button
                      style={{
                        color: 'var(--t-text-secondary)',
                        fontFamily: MONO,
                        fontSize: 11,
                        letterSpacing: '0.1em',
                      }}
                      className="w-full px-3 py-2 text-left hover:text-[var(--t-text)] hover:bg-[var(--t-panel-hover)] flex items-center gap-2 uppercase"
                    >
                      <HelpCircle className="w-3.5 h-3.5" />
                      help &amp; support
                    </button>
                  </div>
                  <div className="border-t py-1 mt-1" style={{ borderColor: 'var(--t-border)' }}>
                    <button
                      onClick={handleLogout}
                      style={{
                        fontFamily: MONO,
                        fontSize: 11,
                        letterSpacing: '0.1em',
                      }}
                      className="w-full px-3 py-2 text-left text-red-400 hover:text-red-300 hover:bg-red-500/10 flex items-center gap-2 uppercase"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      sign out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page content — sits above the backdrop via z-index */}
        <div className="flex-1 overflow-auto p-4 relative" style={{ zIndex: 1 }}>
          {children}
        </div>
      </main>

      {/* Global keyframes */}
      <style jsx global>{`
        @keyframes rl-engine-pulse {
          0%, 100% { box-shadow: 0 0 0 3px color-mix(in srgb, #10B981 18%, transparent); }
          50%      { box-shadow: 0 0 0 5px color-mix(in srgb, #10B981 8%, transparent); }
        }
      `}</style>
    </div>
  );
}
