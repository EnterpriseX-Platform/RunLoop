'use client';

// Legacy /docs/api → /p/<currentProjectId>/docs.

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useProject } from '@/context/ProjectContext';

export default function DocsRedirect() {
  const router = useRouter();
  const { selectedProject, projects } = useProject();
  useEffect(() => {
    const pid = selectedProject?.id || projects?.[0]?.id;
    if (pid) router.replace(`/p/${pid}/docs`);
    else router.replace('/projects');
  }, [router, selectedProject, projects]);
  return null;
}
