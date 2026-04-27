'use client';

import Link from 'next/link';
import { usePathname, useParams } from 'next/navigation';
import { useProject } from '@/context/ProjectContext';
import {
  Settings as SettingsIcon,
  Shield,
  Key,
  ScrollText,
  Users,
  Blocks,
  LucideIcon,
} from 'lucide-react';

interface SettingsTab {
  key: string;
  label: string;
  icon: LucideIcon;
  buildHref: (projectId?: string) => string;
  match: (pathname: string) => boolean;
}

// DLQ was merged into Executions page (?filter=needs_review) because they
// share the same underlying data set. Audit Log stays here because it records
// user actions, not execution outcomes — a different concept.
const TABS: SettingsTab[] = [
  {
    key: 'general',
    label: 'General',
    icon: SettingsIcon,
    buildHref: () => '/settings',
    match: (p) => p === '/settings',
  },
  {
    key: 'members',
    label: 'Members',
    icon: Users,
    buildHref: (pid) => pid ? `/p/${pid}/members` : '/settings',
    match: (p) => p.includes('/members'),
  },
  {
    key: 'secrets',
    label: 'Secrets',
    icon: Shield,
    buildHref: () => '/secrets',
    match: (p) => p.startsWith('/secrets'),
  },
  {
    key: 'api-keys',
    label: 'API Keys',
    icon: Key,
    buildHref: (pid) => pid ? `/p/${pid}/api-keys` : '/settings',
    match: (p) => p.includes('/api-keys'),
  },
  {
    key: 'audit-log',
    label: 'Audit Log',
    icon: ScrollText,
    buildHref: (pid) => pid ? `/p/${pid}/audit-log` : '/settings',
    match: (p) => p.includes('/audit-log'),
  },
  {
    key: 'plugins',
    label: 'Plugins',
    icon: Blocks,
    buildHref: () => '/settings/plugins',
    match: (p) => p.startsWith('/settings/plugins'),
  },
];

/**
 * SettingsTabs — horizontal tab strip shared by all Settings-related pages.
 * Lets the user switch between General, Secrets, API Keys, Audit Log, DLQ, etc.
 * without cluttering the main sidebar.
 */
export function SettingsTabs() {
  const pathname = usePathname() || '';
  const params = useParams();
  const { selectedProject } = useProject();
  // Use URL param when on a project-scoped route; otherwise fall back to the
  // currently-selected project from context so project-scoped tabs still work.
  const projectId = (params?.projectId as string) || selectedProject?.id || undefined;

  return (
    <div
      className="sticky top-0 z-10 flex items-center gap-0 overflow-x-auto"
      style={{
        background: 'var(--t-bg)',
        borderBottom: '1px solid var(--t-border)',
        padding: '0 16px',
        fontFamily: "'IBM Plex Sans Thai', 'IBM Plex Sans', sans-serif",
      }}
    >
      <span
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--t-text)',
          marginRight: 20,
          letterSpacing: '-0.01em',
        }}
        className="whitespace-nowrap"
      >
        Settings
      </span>
      {TABS.map((tab) => {
        const active = tab.match(pathname);
        // Next.js basePath ('/runloop') is auto-prepended by Link — do NOT include it here
        const href = tab.buildHref(projectId);
        const Icon = tab.icon;
        return (
          <Link
            key={tab.key}
            href={href}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '12px 16px',
              fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: '0.08em',
              borderRadius: 0,
              whiteSpace: 'nowrap',
              background: 'transparent',
              color: active ? 'var(--t-text)' : 'var(--t-text-muted)',
              borderBottom: `2px solid ${active ? 'var(--t-accent)' : 'transparent'}`,
              marginBottom: -1,
              textTransform: 'uppercase',
              transition: 'color 0.12s, border-color 0.12s',
            }}
            className="hover:!text-[var(--t-text)]"
          >
            <Icon className="w-3.5 h-3.5" style={{ opacity: active ? 1 : 0.7 }} />
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
