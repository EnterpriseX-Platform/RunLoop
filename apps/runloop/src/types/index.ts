export interface User {
  id: string;
  email: string;
  name?: string;
  avatar?: string;
  role: 'USER' | 'ADMIN' | 'SUPERADMIN';
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  createdAt: string;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  status: 'ACTIVE' | 'ARCHIVED' | 'DELETED';
  color: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  _count?: {
    runloops: number;
    members: number;
  };
}

export type JobType = 'HTTP' | 'DATABASE' | 'SHELL' | 'PYTHON' | 'NODEJS' | 'DOCKER';
export type TriggerType = 'SCHEDULE' | 'MANUAL' | 'WEBHOOK' | 'API';

// Task - A workflow definition (what to run)
export interface Task {
  id: string;
  name: string;
  description?: string;
  jobType: JobType;
  config: Record<string, unknown>;
  status: 'ACTIVE' | 'INACTIVE' | 'DRAFT';
  projectId: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}
export type RunLoopStatus = 'ACTIVE' | 'INACTIVE' | 'PAUSED' | 'ERROR';
export type ExecutionStatus = 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'CANCELLED' | 'TIMEOUT';

// RunLoop (formerly Scheduler) - A scheduled job configuration
export interface RunLoop {
  id: string;
  name: string;
  description?: string;
  type: JobType;
  config: Record<string, unknown>;
  triggerType: TriggerType;
  schedule?: string;
  timezone: string;
  status: RunLoopStatus;
  timeout: number;
  retryCount: number;
  retryDelay: number;
  successCount: number;
  failureCount: number;
  lastRunAt?: string;
  nextRunAt?: string;
  lastError?: string;
  projectId: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  project?: Project;
  creator?: User;
  executions?: Execution[];
  // Flow support
  isFlow?: boolean;
  flowConfig?: FlowConfig;
}

// Flow configuration for DAG-based runloops
export interface FlowConfig {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export interface FlowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: {
    name: string;
    type: JobType;
    config: Record<string, unknown>;
  };
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  condition?: string; // Condition for conditional execution
}

export interface Execution {
  id: string;
  runloopId: string;  // renamed from schedulerId
  schedulerId?: string; // Go engine field name
  projectId: string;
  triggerType: TriggerType;
  triggeredBy?: string;
  status: ExecutionStatus;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  logs?: string;
  errorMessage?: string;
  retryAttempt: number;
  workerId?: string;
  ipAddress?: string;
  createdAt: string;
  runloop?: RunLoop;  // renamed from scheduler
  schedulerName?: string; // denormalized name from Go engine JOIN
  triggerUser?: User;
}

export interface ExecutionMetrics {
  total: number;
  success: number;
  failed: number;
  pending: number;
  running: number;
  avgDuration: number;
}

export interface DashboardStats {
  totalProjects: number;
  totalRunloops: number;     // renamed from totalSchedulers
  totalExecutions: number;
  successRate: number;
  recentExecutions: Execution[];
  upcomingRunloops: RunLoop[];  // renamed from upcomingSchedulers
}

// Flow types
export type FlowType = 'SIMPLE' | 'DAG';
export type FlowStatus = 'ACTIVE' | 'INACTIVE' | 'DRAFT';

export interface Flow {
  id: string;
  name: string;
  description?: string;
  type: FlowType;
  jobType?: JobType;
  config?: Record<string, unknown>;
  flowConfig?: { nodes: any[]; edges: any[] };
  status: FlowStatus;
  projectId: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// Scheduler dependency types (Control-M chaining)
export type DependencyCondition = 'ON_SUCCESS' | 'ON_FAILURE' | 'ON_COMPLETE';

export interface SchedulerDependency {
  id: string;
  schedulerId: string;
  dependsOnSchedulerId: string;
  condition: DependencyCondition;
  createdAt: string;
  schedulerName?: string;
  dependsOnName?: string;
}

// Backwards compatibility aliases (deprecated)
/** @deprecated Use RunLoop instead */
export type Scheduler = RunLoop;
/** @deprecated Use RunLoopStatus instead */
export type SchedulerStatus = RunLoopStatus;
