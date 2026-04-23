'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useProject } from '@/context/ProjectContext';

export default function ProjectScopedLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const router = useRouter();
  const { projects, selectedProject, selectProject, fetchProjects } = useProject();
  const projectId = params.projectId as string;

  useEffect(() => {
    if (projects.length === 0) {
      fetchProjects();
    }
  }, [projects.length, fetchProjects]);

  // Sync URL projectId with context
  useEffect(() => {
    if (!projectId || projects.length === 0) return;

    // If the selected project doesn't match the URL, update it
    if (selectedProject?.id !== projectId) {
      const found = projects.find((p) => p.id === projectId);
      if (found) {
        selectProject(found);
      } else {
        // Invalid projectId — redirect to first project or projects page
        if (projects.length > 0) {
          router.replace(`/p/${projects[0].id}/dashboard`);
        }
      }
    }
  }, [projectId, projects, selectedProject, selectProject, router]);

  return <>{children}</>;
}
