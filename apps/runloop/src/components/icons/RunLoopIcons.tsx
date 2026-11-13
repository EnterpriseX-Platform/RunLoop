import React from 'react';

// RunLoop icon set — drawn for this product, in the same language as the
// logo: 24px grid, 2px strokes, square caps, mitred joins, no curves except
// where the object is round (clock, globe, database). Every icon takes the
// same props as lucide-react icons (className / style / strokeWidth) so it
// can replace one in place. Colour comes from currentColor.

export type RLIconProps = {
  className?: string;
  style?: React.CSSProperties;
  strokeWidth?: number;
  title?: string;
};

function make(name: string, body: React.ReactNode) {
  const Icon = ({ className, style, strokeWidth = 2, title }: RLIconProps) => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={24}
      height={24}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="square"
      strokeLinejoin="miter"
      className={className}
      style={style}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {body}
    </svg>
  );
  Icon.displayName = `RL${name}`;
  return Icon;
}

const solid = { fill: 'currentColor', stroke: 'none' } as const;

/* ---------- Brand ---------- */
export const RLLoop = make('Loop', <>
  <path d="M5 11V5h14v14h-8" />
  <path d="M11 15.5 7 19l4 3.5z" {...solid} />
  <rect x="3" y="12" width="4" height="4" {...solid} />
</>);

/* ---------- Navigation ---------- */
export const RLDashboard = make('Dashboard', <>
  <path d="M4 4h7v9H4zM13 4h7v5h-7zM13 11h7v9h-7zM4 15h7v5H4z" />
</>);
export const RLFlows = make('Flows', <>
  <path d="M3 4h6v6H3zM15 14h6v6h-6z" />
  <path d="M9 7h3v10h3" />
</>);
export const RLScheduler = make('Scheduler', <>
  <circle cx="12" cy="12" r="8" />
  <path d="M12 7v5h4" />
</>);
export const RLExecutions = make('Executions', <>
  <path d="M3 12h4l3-6 4 12 3-6h4" />
</>);
export const RLQueue = make('Queue', <>
  <path d="M4 5h16M4 10h16M4 15h10" />
  <path d="M17 13v7M14 17l3 3 3-3" />
</>);
export const RLChannel = make('Channel', <>
  <rect x="10" y="10" width="4" height="4" {...solid} />
  <path d="M7 7v10M17 7v10M3 4v16M21 4v16" />
</>);
export const RLDocs = make('Docs', <>
  <path d="M5 3h10l4 4v14H5z" />
  <path d="M15 3v4h4M9 12h6M9 16h6" />
</>);
export const RLSettings = make('Settings', <>
  <path d="M4 7h9M19 7h1M4 17h3M13 17h7" />
  <path d="M13 5h4v4h-4zM7 15h4v4H7z" />
</>);
export const RLProject = make('Project', <>
  <path d="M3 6h7l2 2h9v11H3z" />
</>);

/* ---------- Flow control ---------- */
export const RLStart = make('Start', <path d="M7 5v14l11-7z" {...solid} />);
export const RLEnd = make('End', <rect x="6" y="6" width="12" height="12" {...solid} />);
export const RLCondition = make('Condition', <>
  <path d="M12 3 21 12 12 21 3 12z" />
  <path d="M12 9v4" /><rect x="11" y="15" width="2" height="2" {...solid} />
</>);
export const RLLoopNode = make('LoopNode', <>
  <path d="M7 12V7h10v10h-6" />
  <path d="M11 14 8 17l3 3z" {...solid} />
</>);
export const RLDelay = make('Delay', <>
  <path d="M6 3h12M6 21h12M7 3v4l5 5-5 5v4M17 3v4l-5 5 5 5v4" />
</>);
export const RLTransform = make('Transform', <>
  <path d="M4 8h14M14 4l4 4-4 4M20 16H6M10 12l-4 4 4 4" />
</>);
export const RLSwitch = make('Switch', <>
  <path d="M3 12h6M9 12l6-7h6M9 12h12M9 12l6 7h6" />
</>);
export const RLMerge = make('Merge', <>
  <path d="M3 5h6l6 7h6M3 19h6l6-7M3 12h12" />
</>);

/* ---------- Executors ---------- */
export const RLHttp = make('Http', <>
  <circle cx="12" cy="12" r="9" />
  <path d="M3 12h18M12 3c-3 3-3 15 0 18M12 3c3 3 3 15 0 18" />
</>);
export const RLDatabase = make('Database', <>
  <ellipse cx="12" cy="6" rx="7" ry="3" />
  <path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3" />
</>);
export const RLShell = make('Shell', <>
  <path d="M3 4h18v16H3z" />
  <path d="M7 9l3 3-3 3M12 15h5" />
</>);
export const RLCode = make('Code', <>
  <path d="M8 6l-5 6 5 6M16 6l5 6-5 6M14 4l-4 16" />
</>);
export const RLNode = make('Node', <>
  <path d="M12 2 21 7v10l-9 5-9-5V7z" />
  <path d="M10 10h4v4h-4z" fill="currentColor" stroke="none" />
</>);
export const RLContainer = make('Container', <>
  <path d="M3 8h18v12H3zM3 8l3-4h12l3 4" />
  <path d="M8 11v6M12 11v6M16 11v6" />
</>);
export const RLAi = make('Ai', <>
  <path d="M10 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" />
  <path d="M18 2v4M16 4h4M18 16v4M16 18h4" strokeWidth={1.5} />
</>);

/* ---------- Notifications ---------- */
export const RLChat = make('Chat', <>
  <path d="M3 4h18v13H10l-5 4v-4H3z" />
  <path d="M7 9h10M7 13h6" />
</>);
export const RLEmail = make('Email', <>
  <path d="M3 5h18v14H3z" />
  <path d="M3 5l9 8 9-8" />
</>);
export const RLWebhook = make('Webhook', <>
  <path d="M14 4h6v6M20 4l-9 9" />
  <path d="M18 14v6H4V6h6" />
</>);

/* ---------- Utilities ---------- */
export const RLLog = make('Log', <>
  <path d="M5 3h14v18H5z" />
  <path d="M9 8h6M9 12h6M9 16h3" />
</>);
export const RLVariable = make('Variable', <>
  <path d="M6 4H4v16h2M18 4h2v16h-2" />
  <path d="M9 9l6 6M15 9l-6 6" />
</>);
export const RLSubflow = make('Subflow', <>
  <path d="M3 3h18v18H3z" />
  <path d="M8 8h3v3H8zM13 13h3v3h-3zM11 9.5h3.5V13" />
</>);
export const RLWait = make('Wait', <>
  <path d="M4 4h16v16H4z" />
  <path d="M12 8v5h4" />
</>);
export const RLEnqueue = make('Enqueue', <>
  <path d="M4 13v7h16v-7M4 13h5l1 2h4l1-2h5" />
  <path d="M12 3v8M9 8l3 3 3-3" />
</>);
export const RLNotify = make('Notify', <>
  <path d="M6 17V10a6 6 0 0 1 12 0v7M4 17h16M10 20h4" />
</>);

/* ---------- Lookups ---------- */
export const RL_NODE_ICONS: Record<string, React.ComponentType<RLIconProps>> = {
  start: RLStart, end: RLEnd, condition: RLCondition, loop: RLLoopNode, delay: RLDelay,
  transform: RLTransform, switch: RLSwitch, merge: RLMerge,
  http: RLHttp, database: RLDatabase, shell: RLShell, python: RLCode, nodejs: RLNode, docker: RLContainer,
  ai: RLAi, slack: RLChat, email: RLEmail, webhook_out: RLWebhook,
  log: RLLog, set_variable: RLVariable, subflow: RLSubflow, wait_webhook: RLWait, enqueue: RLEnqueue, notify: RLNotify,
};

export const RL_ALL_ICONS: Array<[string, React.ComponentType<RLIconProps>]> = [
  ['Loop', RLLoop],
  ['Dashboard', RLDashboard], ['Flows', RLFlows], ['Scheduler', RLScheduler], ['Executions', RLExecutions],
  ['Queue', RLQueue], ['Channel', RLChannel], ['Docs', RLDocs], ['Settings', RLSettings], ['Project', RLProject],
  ['Start', RLStart], ['End', RLEnd], ['Condition', RLCondition], ['Loop node', RLLoopNode], ['Delay', RLDelay],
  ['Transform', RLTransform], ['Switch', RLSwitch], ['Merge', RLMerge],
  ['HTTP', RLHttp], ['Database', RLDatabase], ['Shell', RLShell], ['Python', RLCode], ['Node.js', RLNode],
  ['Docker', RLContainer], ['AI', RLAi],
  ['Slack', RLChat], ['Email', RLEmail], ['Webhook', RLWebhook],
  ['Log', RLLog], ['Set variable', RLVariable], ['Sub-flow', RLSubflow], ['Wait webhook', RLWait],
  ['Enqueue', RLEnqueue], ['Notify', RLNotify],
];
