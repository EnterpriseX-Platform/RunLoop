'use client';

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { Project } from '@/types';

interface ProjectContextType {
  projects: Project[];
  selectedProject: Project | null;
  isLoading: boolean;
  fetchProjects: () => Promise<void>;
  selectProject: (project: Project | null) => void;
  refreshProjects: () => Promise<void>;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);

  const fetchProjects = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/runloop/api/projects');
      if (res.ok) {
        const data = await res.json();
        const projectsList = data.projects || [];
        setProjects(projectsList);

        // Auto-restore from localStorage on first load
        if (!initialized) {
          const savedId = localStorage.getItem('selectedProjectId');
          if (savedId) {
            const found = projectsList.find((p: Project) => p.id === savedId);
            if (found) {
              setSelectedProject(found);
              document.cookie = `lastProjectId=${found.id};path=/;max-age=31536000;SameSite=Lax`;
            } else if (projectsList.length > 0) {
              setSelectedProject(projectsList[0]);
              localStorage.setItem('selectedProjectId', projectsList[0].id);
              document.cookie = `lastProjectId=${projectsList[0].id};path=/;max-age=31536000;SameSite=Lax`;
            }
          } else if (projectsList.length > 0) {
            setSelectedProject(projectsList[0]);
            localStorage.setItem('selectedProjectId', projectsList[0].id);
            document.cookie = `lastProjectId=${projectsList[0].id};path=/;max-age=31536000;SameSite=Lax`;
          }
          setInitialized(true);
        }
      }
    } catch (error) {
      console.error('Failed to fetch projects:', error);
    } finally {
      setIsLoading(false);
    }
  }, [initialized]);

  // Fetch projects on mount
  useEffect(() => {
    fetchProjects();
  }, []);

  const selectProject = useCallback((project: Project | null) => {
    setSelectedProject(project);
    if (project) {
      localStorage.setItem('selectedProjectId', project.id);
      // Set cookie for middleware redirects
      document.cookie = `lastProjectId=${project.id};path=/;max-age=31536000;SameSite=Lax`;
    } else {
      localStorage.removeItem('selectedProjectId');
      document.cookie = 'lastProjectId=;path=/;max-age=0';
    }
  }, []);

  const refreshProjects = fetchProjects;

  return (
    <ProjectContext.Provider
      value={{
        projects,
        selectedProject,
        isLoading,
        fetchProjects,
        selectProject,
        refreshProjects,
      }}
    >
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  const context = useContext(ProjectContext);
  if (context === undefined) {
    throw new Error('useProject must be used within a ProjectProvider');
  }
  return context;
}
