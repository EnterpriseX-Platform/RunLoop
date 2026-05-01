// Task Types - New Architecture

export type TaskType = 'HTTP' | 'DATABASE' | 'SHELL' | 'PYTHON' | 'NODEJS' | 'DOCKER' | 'FLOW' | 'SLACK' | 'EMAIL';

export type TaskStatus = 'ACTIVE' | 'INACTIVE' | 'DRAFT';

export interface Task {
  id: string;
  name: string;
  description?: string;
  type: TaskType;
  status: TaskStatus;
  
  // Flow configuration (for FLOW type)
  flowConfig?: FlowConfig;
  
  // Single task config (for non-FLOW type)
  config?: TaskConfig;
  
  // Environment variables
  env?: Record<string, string>;
  
  // Connections (DB, API, etc)
  connection?: ConnectionConfig;
  
  projectId: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface FlowConfig {
  nodes: FlowNode[];
  edges: FlowEdge[];
  viewport?: {
    x: number;
    y: number;
    zoom: number;
  };
}

export interface FlowNode {
  id: string;
  type: TaskType;
  position: { x: number; y: number };
  data: {
    name: string;
    config: TaskConfig;
    // For parameter passing between nodes
    inputs?: string[];
    outputs?: string[];
  };
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  // Conditional execution
  condition?: string;
}

export type TaskConfig = 
  | HTTPConfig
  | DatabaseConfig
  | ShellConfig
  | PythonConfig
  | NodeJSConfig;

export interface HTTPConfig {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  body?: string;
  timeout?: number;
}

export interface DatabaseConfig {
  driver: 'postgres' | 'mysql' | 'mongodb';
  connectionString: string;
  query: string;
  // For parameterized queries
  parameters?: Record<string, unknown>;
}

export interface ShellConfig {
  command: string;
  workingDir?: string;
  shell?: 'bash' | 'sh' | 'zsh';
  // Script file path or inline script
  scriptPath?: string;
  scriptContent?: string;
}

export interface PythonConfig {
  script: string;
  pythonVersion?: '3.8' | '3.9' | '3.10' | '3.11' | '3.12';
  requirements?: string[];
  // Virtual environment
  venv?: string;
}

export interface NodeJSConfig {
  script: string;
  nodeVersion?: '16' | '18' | '20';
  npmPackages?: string[];
}

export interface ConnectionConfig {
  id: string;
  name: string;
  type: 'database' | 'api' | 'ssh' | 's3';
  // Encrypted credentials reference
  credentialRef: string;
}

// Scheduler Types - Separate from Task
export type ScheduleType = 'CRON' | 'INTERVAL' | 'ONCE' | 'WEBHOOK' | 'MANUAL';

export interface Scheduler {
  id: string;
  name: string;
  description?: string;
  
  // Reference to task
  taskId: string;
  task?: Task;
  
  // Schedule configuration
  scheduleType: ScheduleType;
  cronExpression?: string;
  intervalSeconds?: number;
  runAt?: string; // For ONCE type
  timezone: string;
  
  // Parameters to pass to task
  parameters?: SchedulerParameter[];
  
  // Execution settings
  timeout: number;
  retryCount: number;
  retryDelay: number;
  
  // Status
  status: 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
  lastRunAt?: string;
  nextRunAt?: string;
  
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface SchedulerParameter {
  key: string;
  value: string;
  type: 'STRING' | 'NUMBER' | 'BOOLEAN' | 'DATE' | 'DYNAMIC';
  // For DYNAMIC type - e.g., {{date:+1d}}, {{date:-7d}}, {{date:YYYY-MM-DD}}
  dynamicExpression?: string;
  description?: string;
}

// Dynamic Date Formats supported:
// {{date}} - Current date/time ISO
// {{date:YYYY-MM-DD}} - Format with moment.js style
// {{date:+1d}} - Tomorrow
// {{date:-7d}} - 7 days ago
// {{date:+1M}} - Next month
// {{date:+1y}} - Next year
// {{date:YYYY-MM-DD:-7d}} - 7 days ago with format

// Execution Types
export interface TaskExecution {
  id: string;
  taskId: string;
  schedulerId?: string;
  
  status: 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'CANCELLED' | 'TIMEOUT';
  
  // Input/Output
  inputParameters?: Record<string, unknown>;
  output?: Record<string, unknown>;
  
  // Logs
  logs?: string;
  errorMessage?: string;
  
  // Timing
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  
  // Node results (for flow tasks)
  nodeResults?: Record<string, FlowNodeResult>;
  
  // Agent info
  agentId?: string;
  workerId?: string;
}

export interface FlowNodeResult {
  nodeId: string;
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED';
  output?: Record<string, unknown>;
  error?: string;
  durationMs: number;
  startedAt: string;
  completedAt?: string;
}

// Agent Types
export interface Agent {
  id: string;
  name: string;
  description?: string;
  
  // Connection
  host: string;
  port: number;
  protocol: 'http' | 'https' | 'ssh';
  
  // Authentication
  authType: 'token' | 'key' | 'password';
  credentialRef: string;
  
  // Status
  status: 'ONLINE' | 'OFFLINE' | 'BUSY' | 'ERROR';
  lastSeenAt?: string;
  
  // Capabilities
  capabilities: string[]; // ['shell', 'python', 'docker', ...]
  
  // Labels for task routing
  labels?: Record<string, string>;
  
  createdAt: string;
  updatedAt: string;
}
