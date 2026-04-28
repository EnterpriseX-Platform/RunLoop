'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useProject } from '@/context/ProjectContext';

export default function IntegrationsRedirect() {
  const router = useRouter();
  const { selectedProject, projects } = useProject();
  useEffect(() => {
    const pid = selectedProject?.id || projects?.[0]?.id;
    if (pid) router.replace(`/p/${pid}/integrations`);
    else router.replace('/projects');
  }, [router, selectedProject, projects]);
  return null;
}
