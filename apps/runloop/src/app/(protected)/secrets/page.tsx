'use client';

// Legacy /secrets → redirect to /p/<currentProjectId>/secrets.

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useProject } from '@/context/ProjectContext';

export default function SecretsRedirect() {
  const router = useRouter();
  const { selectedProject, projects } = useProject();
  useEffect(() => {
    const pid = selectedProject?.id || projects?.[0]?.id;
    if (pid) router.replace(`/p/${pid}/secrets`);
    else router.replace('/projects');
  }, [router, selectedProject, projects]);
  return null;
}
