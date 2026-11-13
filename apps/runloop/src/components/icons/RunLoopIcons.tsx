import React from 'react';
import {
  Dashboard, Flow, Time, Activity, Queued, Network_3, Document, Settings, Folder,
  PlayFilledAlt, StopFilledAlt, Branch, Repeat, Hourglass, DataRefinery, DirectionFork, DirectionMerge,
  Http, DataBase, Terminal, LogoPython, Code, ContainerSoftware, AiGenerate,
  Chat, Email, Webhook, Catalog, Function, FlowConnection, Pending, Download, Notification,
} from '@carbon/icons-react';

// RunLoop icons. The logo mark (RLLoop) is our own; every other icon is
// IBM's Carbon icon set (@carbon/icons-react, Apache-2.0) so the product
// uses the same icon family as its Carbon design system. Each export keeps
// the lucide-style props (className / style / strokeWidth) so call sites
// don't change. Colour comes from currentColor.

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

function carbon(name: string, C: React.ComponentType<any>) {
  const Icon = ({ className, style, title }: RLIconProps) => (
    <C size={16} className={className} style={style} aria-label={title} aria-hidden={title ? undefined : true} />
  );
  Icon.displayName = `RL${name}`;
  return Icon;
}

/* ---------- Navigation ---------- */
export const RLDashboard = carbon('Dashboard', Dashboard);
export const RLFlows = carbon('Flows', Flow);
export const RLScheduler = carbon('Scheduler', Time);
export const RLExecutions = carbon('Executions', Activity);
export const RLQueue = carbon('Queue', Queued);
export const RLChannel = carbon('Channel', Network_3);
export const RLDocs = carbon('Docs', Document);
export const RLSettings = carbon('Settings', Settings);
export const RLProject = carbon('Project', Folder);

/* ---------- Flow control ---------- */
export const RLStart = carbon('Start', PlayFilledAlt);
export const RLEnd = carbon('End', StopFilledAlt);
export const RLCondition = carbon('Condition', Branch);
export const RLLoopNode = carbon('LoopNode', Repeat);
export const RLDelay = carbon('Delay', Hourglass);
export const RLTransform = carbon('Transform', DataRefinery);
export const RLSwitch = carbon('Switch', DirectionFork);
export const RLMerge = carbon('Merge', DirectionMerge);

/* ---------- Executors ---------- */
export const RLHttp = carbon('Http', Http);
export const RLDatabase = carbon('Database', DataBase);
export const RLShell = carbon('Shell', Terminal);
export const RLCode = carbon('Code', LogoPython);
export const RLNode = carbon('Node', Code);
export const RLContainer = carbon('Container', ContainerSoftware);
export const RLAi = carbon('Ai', AiGenerate);

/* ---------- Notifications ---------- */
export const RLChat = carbon('Chat', Chat);
export const RLEmail = carbon('Email', Email);
export const RLWebhook = carbon('Webhook', Webhook);

/* ---------- Utilities ---------- */
export const RLLog = carbon('Log', Catalog);
export const RLVariable = carbon('Variable', Function);
export const RLSubflow = carbon('Subflow', FlowConnection);
export const RLWait = carbon('Wait', Pending);
export const RLEnqueue = carbon('Enqueue', Download);
export const RLNotify = carbon('Notify', Notification);

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
