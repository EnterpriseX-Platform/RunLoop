'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useProject } from '@/context/ProjectContext';
import { Loader2 } from 'lucide-react';

/**
 * Dead Letter Queue has been folded into the Executions page as a
 * "Needs Review" filter, since both surfaces show the same underlying
 * data (failed/timed-out executions). This route exists for backwards
 * compatibility with bookmarks and redirects to the new location.
 */
export default function DeadLetterQueueRedirect() {
  const router = useRouter();
  const { selectedProject } = useProject();

  useEffect(() => {
    if (selectedProject?.id) {
      router.replace(`/p/${selectedProject.id}/executions?filter=needs_review`);
    } else {
      router.replace('/projects');
    }
  }, [selectedProject, router]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 'calc(100vh - 64px)', color: 'var(--t-text-muted)', gap: 8 }}>
      <Loader2 className="w-4 h-4 animate-spin" />
      <span style={{ fontSize: 13 }}>Redirecting to Executions → Needs Review…</span>
    </div>
  );
}
