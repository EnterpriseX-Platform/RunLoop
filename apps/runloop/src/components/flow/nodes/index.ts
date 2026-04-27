import { StartNode } from './StartNode';
import { EndNode } from './EndNode';
import { HttpNode } from './HttpNode';
import { DatabaseNode } from './DatabaseNode';
import { ShellNode } from './ShellNode';
import { PythonNode } from './PythonNode';
import { NodejsNode } from './NodejsNode';
import { DockerNode } from './DockerNode';
import { SlackNode } from './SlackNode';
import { EmailNode } from './EmailNode';
import { ConditionNode } from './ConditionNode';
import { DelayNode } from './DelayNode';
import { LoopNode } from './LoopNode';
import { TransformNode } from './TransformNode';
import { MergeNode } from './MergeNode';
import { SwitchNode } from './SwitchNode';
import { LogNode } from './LogNode';
import { SetVarNode } from './SetVarNode';
import { SubFlowNode } from './SubFlowNode';
import { WebhookNode } from './WebhookNode';
import { WaitWebhookNode } from './WaitWebhookNode';
import { EnqueueNode } from './EnqueueNode';
import { PluginNode } from './PluginNode';

export {
  StartNode, EndNode, HttpNode, DatabaseNode, ShellNode, PythonNode,
  NodejsNode, DockerNode, SlackNode, EmailNode, ConditionNode, DelayNode,
  LoopNode, TransformNode, MergeNode, SwitchNode,
  LogNode, SetVarNode, SubFlowNode, WebhookNode, WaitWebhookNode, EnqueueNode, PluginNode,
};

export const nodeTypes = {
  startNode: StartNode,
  endNode: EndNode,
  httpNode: HttpNode,
  databaseNode: DatabaseNode,
  shellNode: ShellNode,
  pythonNode: PythonNode,
  nodejsNode: NodejsNode,
  dockerNode: DockerNode,
  slackNode: SlackNode,
  emailNode: EmailNode,
  conditionNode: ConditionNode,
  delayNode: DelayNode,
  loopNode: LoopNode,
  transformNode: TransformNode,
  mergeNode: MergeNode,
  switchNode: SwitchNode,
  logNode: LogNode,
  setVarNode: SetVarNode,
  subflowNode: SubFlowNode,
  webhookNode: WebhookNode,
  waitWebhookNode: WaitWebhookNode,
  enqueueNode: EnqueueNode,
  pluginNode: PluginNode,
};
