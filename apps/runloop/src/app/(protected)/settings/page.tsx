'use client';

// Legacy /settings → redirect to /p/<currentProjectId>/settings.
// Pages were moved under the project URL space; this stub keeps old
// links and bookmarks working.

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useProject } from '@/context/ProjectContext';

export default function SettingsRedirect() {
  const router = useRouter();
  const { selectedProject, projects } = useProject();
  useEffect(() => {
    const pid = selectedProject?.id || projects?.[0]?.id;
    if (pid) router.replace(`/p/${pid}/settings`);
    else router.replace('/projects');
  }, [router, selectedProject, projects]);
  return null;
}
