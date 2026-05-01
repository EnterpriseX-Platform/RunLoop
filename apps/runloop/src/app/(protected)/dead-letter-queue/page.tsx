'use client';

// Legacy /dead-letter-queue → /p/<currentProjectId>/dlq.

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useProject } from '@/context/ProjectContext';

export default function DLQRedirect() {
  const router = useRouter();
  const { selectedProject, projects } = useProject();
  useEffect(() => {
    const pid = selectedProject?.id || projects?.[0]?.id;
    if (pid) router.replace(`/p/${pid}/dlq`);
    else router.replace('/projects');
  }, [router, selectedProject, projects]);
  return null;
}
