import React from 'react';
import { HttpNodeProperties } from './HttpNodeProperties';
import { DatabaseNodeProperties } from './DatabaseNodeProperties';
import { SlackNodeProperties } from './SlackNodeProperties';
import { EmailNodeProperties } from './EmailNodeProperties';
import { ConditionNodeProperties } from './ConditionNodeProperties';
import { DelayNodeProperties } from './DelayNodeProperties';
import { LoopNodeProperties } from './LoopNodeProperties';
import { ShellNodeProperties } from './ShellNodeProperties';
import { PythonNodeProperties } from './PythonNodeProperties';
import { NodejsNodeProperties } from './NodejsNodeProperties';
import { DockerNodeProperties } from './DockerNodeProperties';
import { S3NodeProperties } from './S3NodeProperties';
import { RedisNodeProperties } from './RedisNodeProperties';
import { MergeNodeProperties } from './MergeNodeProperties';
import { SwitchNodeProperties } from './SwitchNodeProperties';
import { LogNodeProperties } from './LogNodeProperties';
import { SetVarNodeProperties } from './SetVarNodeProperties';
import { SubFlowNodeProperties } from './SubFlowNodeProperties';
import { WebhookNodeProperties } from './WebhookNodeProperties';
import { WaitWebhookNodeProperties } from './WaitWebhookNodeProperties';
import { EnqueueNodeProperties } from './EnqueueNodeProperties';

export {
  HttpNodeProperties, DatabaseNodeProperties, SlackNodeProperties, EmailNodeProperties,
  ConditionNodeProperties, DelayNodeProperties, LoopNodeProperties, ShellNodeProperties,
  PythonNodeProperties, NodejsNodeProperties, DockerNodeProperties, S3NodeProperties, RedisNodeProperties,
  MergeNodeProperties, SwitchNodeProperties,
  LogNodeProperties, SetVarNodeProperties, SubFlowNodeProperties,
  WebhookNodeProperties, WaitWebhookNodeProperties, EnqueueNodeProperties,
};

export const propertiesComponents: Record<string, React.ComponentType<any>> = {
  http: HttpNodeProperties,
  database: DatabaseNodeProperties,
  slack: SlackNodeProperties,
  email: EmailNodeProperties,
  condition: ConditionNodeProperties,
  delay: DelayNodeProperties,
  loop: LoopNodeProperties,
  shell: ShellNodeProperties,
  python: PythonNodeProperties,
  nodejs: NodejsNodeProperties,
  docker: DockerNodeProperties,
  s3: S3NodeProperties,
  redis: RedisNodeProperties,
  merge: MergeNodeProperties,
  switch: SwitchNodeProperties,
  log: LogNodeProperties,
  set_variable: SetVarNodeProperties,
  subflow: SubFlowNodeProperties,
  webhook_out: WebhookNodeProperties,
  wait_webhook: WaitWebhookNodeProperties,
  enqueue: EnqueueNodeProperties,
};
