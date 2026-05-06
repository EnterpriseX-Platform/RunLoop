/**
 * seed-demo.ts — populates a fresh DB with realistic, production-looking data
 * for screenshots in docs/screenshots/.
 *
 * Storyline: a fictional SaaS company ("Acme") runs internal automations on
 * RunLoop. Schedulers, flows, executions, secrets, queues, and DLQ entries
 * are named like what an on-call team actually sees.
 *
 * All IDs (project, user, schedulers, flows, secrets, …) are real Prisma cuids,
 * not hand-coded strings — so URLs look authentic in screenshots.
 *
 * Run with: npm run db:seed:demo
 *
 * Re-runnable: deletes prior "Production" project (by name+admin) before
 * re-creating, so successive runs converge on a clean state.
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { encrypt } from '../src/lib/encryption';

const prisma = new PrismaClient();

// -- helpers ---------------------------------------------------------------

function hoursAgo(n: number): Date {
  return new Date(Date.now() - n * 3600 * 1000);
}
function randInt(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min + 1));
}
function pick<T>(arr: T[]): T {
  return arr[randInt(0, arr.length - 1)];
}

/**
 * Compute the next firing time for a cron expression (in Asia/Bangkok).
 * Hand-rolled for the 6 cron patterns we use; not a general parser.
 */
function nextRunFor(cron: string | null): Date | null {
  if (!cron) return null;
  const now = new Date();
  const bkkOffsetMs = 7 * 3600 * 1000; // ICT = UTC+7
  const bkkNow = new Date(now.getTime() + bkkOffsetMs);

  const pad = (n: number) => String(n).padStart(2, '0');
  const ymd = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())}`;

  // helper: build a Date in Bangkok wall-clock then convert to UTC
  const bkk = (yyyy: number, mm: number, dd: number, hh: number, mi: number) =>
    new Date(Date.UTC(yyyy, mm, dd, hh, mi) - bkkOffsetMs);

  const Y = bkkNow.getUTCFullYear();
  const M = bkkNow.getUTCMonth();
  const D = bkkNow.getUTCDate();
  const H = bkkNow.getUTCHours();
  const Mi = bkkNow.getUTCMinutes();
  const dow = bkkNow.getUTCDay(); // 0=Sun

  if (cron === '0 * * * *') {
    // hourly at top of hour, Bangkok time
    return bkk(Y, M, D, H + 1, 0);
  }
  if (cron === '0 2 * * *') {
    // daily at 02:00 ICT
    if (H < 2) return bkk(Y, M, D, 2, 0);
    return bkk(Y, M, D + 1, 2, 0);
  }
  if (cron === '0 9 * * 1-5') {
    // weekdays at 09:00 ICT
    let cand = bkk(Y, M, D, 9, 0);
    if (H >= 9) cand = bkk(Y, M, D + 1, 9, 0);
    while (true) {
      const wday = new Date(cand.getTime() + bkkOffsetMs).getUTCDay();
      if (wday >= 1 && wday <= 5) return cand;
      cand = new Date(cand.getTime() + 24 * 3600 * 1000);
    }
  }
  if (cron === '0 6 * * 1') {
    // Mondays at 06:00 ICT
    const targetDow = 1;
    let daysAhead = (targetDow - dow + 7) % 7;
    if (daysAhead === 0 && H >= 6) daysAhead = 7;
    return bkk(Y, M, D + daysAhead, 6, 0);
  }
  return null;
}

// -- main ------------------------------------------------------------------

async function main() {
  console.log('🌱 Seeding production-look demo data...');

  // 1. Admin user --------------------------------------------------------
  const adminEmail = process.env.SEED_ADMIN_EMAIL || 'you@acme.local';
  const plaintextPassword = process.env.SEED_ADMIN_PASSWORD || crypto.randomBytes(13).toString('base64url');
  const adminPassword = await bcrypt.hash(plaintextPassword, 10);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { name: 'Alex Chen' },
    create: {
      email: adminEmail,
      name: 'Alex Chen',
      password: adminPassword,
      role: 'ADMIN',
      status: 'ACTIVE',
    },
  });
  console.log(`✅ Admin: ${admin.email}  (id=${admin.id})`);

  // 2. Wipe prior "Production" project for this admin --------------------
  await prisma.project.deleteMany({
    where: { name: 'Production', createdBy: admin.id },
  });

  const project = await prisma.project.create({
    data: {
      name: 'Production',
      description: 'Internal automations · scheduled jobs · webhook handlers',
      color: 'cyan',
      createdBy: admin.id,
      members: {
        create: { userId: admin.id, role: 'OWNER' },
      },
    },
  });
  console.log(`✅ Project: ${project.name}  (id=${project.id})`);

  // 3. Flows -------------------------------------------------------------
  function linearFlow(steps: Array<{ id: string; type: string; label: string; config?: any }>) {
    const nodes = [
      { id: 'start', type: 'startNode', position: { x: 0, y: 0 }, data: { label: 'Start' } },
      ...steps.map((s, i) => ({
        id: s.id, type: s.type,
        position: { x: 240 * (i + 1), y: 0 },
        data: { label: s.label, config: s.config ?? {} },
      })),
      { id: 'end', type: 'endNode', position: { x: 240 * (steps.length + 1), y: 0 }, data: { label: 'End' } },
    ];
    const ids = ['start', ...steps.map(s => s.id), 'end'];
    const edges = ids.slice(0, -1).map((from, i) => ({
      id: `e-${from}-${ids[i + 1]}`, source: from, target: ids[i + 1],
    }));
    return { nodes, edges };
  }

  const flowSpecs = [
    {
      name: 'backup-pipeline',
      description: 'Postgres dump → gzip → S3 upload → Slack notify',
      nodes: linearFlow([
        { id: 'pg-dump', type: 'databaseNode', label: 'Dump Postgres', config: { operation: 'query', query: 'COPY ...' } },
        { id: 'gzip', type: 'shellNode', label: 'gzip backup', config: { command: 'gzip -9 backup.sql' } },
        { id: 's3-upload', type: 'httpNode', label: 'Upload to S3', config: { method: 'PUT', url: 'https://s3.../backups/' } },
        { id: 'slack-ok', type: 'slackNode', label: 'Slack #ops', config: { channel: '#ops', text: 'Backup OK' } },
      ]),
    },
    {
      name: 'kpi-email',
      description: 'Query analytics DB → format report → email leadership',
      nodes: linearFlow([
        { id: 'q-mrr', type: 'databaseNode', label: 'Query MRR + ARR' },
        { id: 'transform', type: 'transformNode', label: 'Format HTML report' },
        { id: 'email', type: 'emailNode', label: 'Email leadership', config: { to: 'leadership@acme.com' } },
      ]),
    },
    {
      name: 'api-monitor',
      description: 'Probe 5 critical endpoints; PagerDuty + Slack on failure',
      nodes: linearFlow([
        { id: 'probe', type: 'loopNode', label: 'Loop endpoints', config: { mode: 'parallel' } },
        { id: 'http', type: 'httpNode', label: 'HTTP GET /health' },
        { id: 'switch', type: 'switchNode', label: 'Any 5xx?' },
        { id: 'page', type: 'slackNode', label: 'Page on-call', config: { channel: '#alerts' } },
      ]),
    },
    {
      name: 'invoice-pipeline',
      description: 'Weekly invoicing — query unpaid → Stripe charge → email receipt',
      nodes: linearFlow([
        { id: 'q-unpaid', type: 'databaseNode', label: 'Query unpaid customers' },
        { id: 'loop', type: 'loopNode', label: 'For each customer' },
        { id: 'charge', type: 'httpNode', label: 'Stripe POST /charges' },
        { id: 'receipt', type: 'emailNode', label: 'Send receipt' },
      ]),
    },
    {
      name: 'payment-router',
      description: 'Stripe webhook → switch on event_type → notify per branch',
      nodes: linearFlow([
        { id: 'wait', type: 'waitWebhookNode', label: 'Wait for Stripe POST' },
        { id: 'switch', type: 'switchNode', label: 'event_type', config: { branches: ['payment_succeeded', 'payment_failed', 'dispute.created'] } },
        { id: 'notify', type: 'notifyNode', label: 'Publish billing-events' },
      ]),
    },
    {
      name: 'email-retry',
      description: 'Manual replay for emails that hit SendGrid 5xx',
      nodes: linearFlow([
        { id: 'q-failed', type: 'databaseNode', label: 'Query failed_emails' },
        { id: 'loop', type: 'loopNode', label: 'For each' },
        { id: 'send', type: 'httpNode', label: 'POST SendGrid' },
      ]),
    },
  ];

  const flows: Record<string, { id: string; flowConfig: any }> = {};
  for (const fs of flowSpecs) {
    const f = await prisma.flow.create({
      data: {
        name: fs.name,
        description: fs.description,
        type: 'DAG',
        status: 'ACTIVE',
        projectId: project.id,
        createdBy: admin.id,
        flowConfig: fs.nodes as any,
      },
    });
    await prisma.flowVersion.create({
      data: {
        flowId: f.id, version: 1, name: fs.name,
        flowConfig: fs.nodes as any, createdBy: admin.id,
        comment: 'Initial version',
      },
    });
    flows[fs.name] = { id: f.id, flowConfig: fs.nodes };
  }
  console.log(`✅ Flows: ${flowSpecs.length}`);

  // 4. Schedulers --------------------------------------------------------
  const schedulerSpecs = [
    { key: 'backup',      name: 'nightly-db-backup',         desc: 'Postgres dump to S3 every night at 02:00 ICT',                cron: '0 2 * * *',     trigger: 'SCHEDULE' as const, type: 'DATABASE' as const, flow: 'backup-pipeline',   ok: 28,  fail: 2, lastErr: 'S3 PutObject timeout (15s) — retried successfully on next run', execs: 7,    durMs: () => randInt(8000, 15000),  failRate: 0.05 },
    { key: 'kpi',         name: 'daily-kpi-report',          desc: 'MRR/ARR/churn report → leadership@acme.com weekdays 09:00',    cron: '0 9 * * 1-5',   trigger: 'SCHEDULE' as const, type: 'DATABASE' as const, flow: 'kpi-email',         ok: 22,  fail: 0,                                                                                              execs: 5,    durMs: () => randInt(1500, 3500),    failRate: 0    },
    { key: 'monitor',     name: 'hourly-health-check',       desc: 'Probe /health on api-1..5 — alert #ops on any 5xx',            cron: '0 * * * *',     trigger: 'SCHEDULE' as const, type: 'HTTP' as const,     flow: 'api-monitor',       ok: 164, fail: 4, lastErr: 'api-3.acme.com returned 502 (recovered after 2 min)',                              execs: 100,  durMs: () => randInt(180, 1200),     failRate: 0.03 },
    { key: 'invoice',     name: 'weekly-invoice-batch',      desc: 'Charge unpaid customers → email receipts (Mondays 06:00)',     cron: '0 6 * * 1',     trigger: 'SCHEDULE' as const, type: 'HTTP' as const,     flow: 'invoice-pipeline',  ok: 4,   fail: 0,                                                                                              execs: 1,    durMs: () => randInt(35000, 65000),  failRate: 0    },
    { key: 'stripe',      name: 'stripe-webhook-receiver',   desc: 'Stripe events → branch on event_type → publish billing-events', cron: null,           trigger: 'WEBHOOK' as const,  type: 'HTTP' as const,     flow: 'payment-router',    ok: 312, fail: 3, lastErr: 'Stripe signature verification failed (replay attack rejected)',                     execs: 30,   durMs: () => randInt(80, 450),       failRate: 0.02 },
    { key: 'email-retry', name: 'retry-failed-emails',       desc: 'On-demand replay for emails that bounced or 5xx-ed',           cron: null,           trigger: 'MANUAL' as const,   type: 'HTTP' as const,     flow: 'email-retry',       ok: 3,   fail: 0,                                                                                              execs: 1,    durMs: () => randInt(800, 2200),     failRate: 0    },
  ];

  const schedulers: Record<string, { id: string; spec: typeof schedulerSpecs[0] }> = {};
  for (const spec of schedulerSpecs) {
    const flow = flows[spec.flow];
    const s = await prisma.scheduler.create({
      data: {
        name: spec.name,
        description: spec.desc,
        type: spec.type,
        triggerType: spec.trigger,
        schedule: spec.cron,
        timezone: 'Asia/Bangkok',
        status: spec.name === 'retry-failed-emails' ? 'INACTIVE' : 'ACTIVE',
        isFlow: true,
        config: {},
        flowConfig: flow.flowConfig as any,
        successCount: spec.ok,
        failureCount: spec.fail,
        lastError: spec.lastErr ?? null,
        lastRunAt: hoursAgo(spec.trigger === 'MANUAL' ? 14 * 24 : randInt(1, 6)),
        nextRunAt: nextRunFor(spec.cron),
        projectId: project.id,
        createdBy: admin.id,
        schedulerFlows: { create: { flowId: flow.id, executionOrder: 0 } },
      },
    });
    schedulers[spec.key] = { id: s.id, spec };
  }
  console.log(`✅ Schedulers: ${Object.keys(schedulers).length}`);

  // 5. Executions --------------------------------------------------------
  let executionTotal = 0;
  for (const key of Object.keys(schedulers)) {
    const { id: schId, spec } = schedulers[key];
    for (let i = 0; i < spec.execs; i++) {
      const failed = Math.random() < spec.failRate;
      const startedAt = hoursAgo(randInt(1, 7 * 24));
      const duration = spec.durMs();
      const completedAt = new Date(startedAt.getTime() + duration);
      await prisma.execution.create({
        data: {
          schedulerId: schId,
          projectId: project.id,
          flowId: flows[spec.flow].id,
          triggerType: spec.trigger,
          triggeredBy: spec.trigger === 'MANUAL' ? admin.id : null,
          status: failed ? 'FAILED' : 'SUCCESS',
          startedAt, completedAt, durationMs: duration,
          input: { source: spec.trigger.toLowerCase() },
          output: failed ? {} : { rowsProcessed: randInt(10, 5000), httpStatus: 200 },
          errorMessage: failed ? spec.lastErr ?? 'execution failed' : null,
        },
      });
      executionTotal++;
    }
  }
  // Spread 6 most-recent successful execs across the last hour for a fresh feed
  const recentTargets = await prisma.execution.findMany({
    where: { projectId: project.id, status: 'SUCCESS' },
    orderBy: { startedAt: 'desc' }, take: 6,
  });
  for (let i = 0; i < recentTargets.length; i++) {
    const minsAgo = (i + 1) * 8 + randInt(-2, 2);
    const startedAt = new Date(Date.now() - minsAgo * 60 * 1000);
    const completedAt = new Date(startedAt.getTime() + randInt(1500, 8000));
    await prisma.execution.update({
      where: { id: recentTargets[i].id },
      data: { startedAt, completedAt },
    });
  }
  // 1 RUNNING + 1 PENDING for "live" feel
  await prisma.execution.create({
    data: {
      schedulerId: schedulers.monitor.id, projectId: project.id, flowId: flows['api-monitor'].id,
      triggerType: 'SCHEDULE', status: 'RUNNING',
      startedAt: hoursAgo(0.02), input: { source: 'schedule' },
    },
  });
  await prisma.execution.create({
    data: {
      schedulerId: schedulers.stripe.id, projectId: project.id, flowId: flows['payment-router'].id,
      triggerType: 'WEBHOOK', status: 'PENDING',
      startedAt: new Date(),
    },
  });
  executionTotal += 2;
  console.log(`✅ Executions: ${executionTotal}`);

  // 6. Secrets (encrypted) -----------------------------------------------
  const secretSpecs = [
    { name: 'STRIPE_API_KEY',         category: 'api',     desc: 'Live Stripe secret key — billing pipeline' },
    { name: 'SENDGRID_API_KEY',       category: 'api',     desc: 'SendGrid SMTP relay credential' },
    { name: 'SLACK_WEBHOOK_URL',      category: 'api',     desc: '#ops + #alerts incoming webhook' },
    { name: 'AWS_ACCESS_KEY_ID',      category: 'cloud',   desc: 'IAM user for backups bucket (read/write)' },
    { name: 'AWS_SECRET_ACCESS_KEY',  category: 'cloud',   desc: 'Pair with AWS_ACCESS_KEY_ID' },
    { name: 'GITHUB_TOKEN',           category: 'api',     desc: 'Read-only PAT for repo health checks' },
    { name: 'DATADOG_API_KEY',        category: 'api',     desc: 'Custom-metric ingest from flows' },
    { name: 'OPENAI_API_KEY',         category: 'api',     desc: 'AI assistant (in-app provider routing)' },
  ];
  for (const s of secretSpecs) {
    const fakeValue = `${s.name.toLowerCase().replace(/_/g, '-')}-${crypto.randomBytes(20).toString('hex')}`;
    const enc = encrypt(fakeValue);
    await prisma.secret.create({
      data: {
        projectId: project.id,
        name: s.name, value: enc.encrypted, iv: enc.iv, authTag: enc.tag,
        scope: 'PROJECT', category: s.category, description: s.desc, tags: [s.category],
        createdBy: admin.id,
        useCount: randInt(50, 5000), lastUsedAt: hoursAgo(randInt(1, 48)),
      },
    });
  }
  console.log(`✅ Secrets: ${secretSpecs.length}`);

  // 7. Env vars ----------------------------------------------------------
  for (const e of [
    { name: 'API_BASE_URL',     value: 'https://api.acme.com',                 desc: 'Backend API root' },
    { name: 'NODE_ENV',         value: 'production',                            desc: 'Runtime environment' },
    { name: 'AWS_REGION',       value: 'ap-southeast-1',                        desc: 'Default AWS region' },
    { name: 'SENTRY_DSN',       value: 'https://abc1234@sentry.io/9876543',     desc: 'Error reporting endpoint' },
    { name: 'FEATURE_FLAGS_URL',value: 'https://flags.acme.com/v1/runloop',     desc: 'LaunchDarkly-compat flags' },
  ]) {
    await prisma.envVar.create({
      data: { projectId: project.id, name: e.name, value: e.value, description: e.desc, createdBy: admin.id },
    });
  }
  console.log('✅ Env vars: 5');

  // 8. Job queues + items -----------------------------------------------
  const queueSpecs = [
    { name: 'email-queue',   flowName: 'email-retry',     concurrency: 5,  maxAttempts: 5 },
    { name: 'webhook-queue', flowName: 'payment-router',  concurrency: 10, maxAttempts: 3 },
    { name: 'billing-queue', flowName: 'invoice-pipeline',concurrency: 2,  maxAttempts: 5 },
  ];
  for (const q of queueSpecs) {
    await prisma.jobQueue.create({
      data: {
        name: q.name, projectId: project.id, flowId: flows[q.flowName].id,
        backend: 'postgres',
        concurrency: q.concurrency, maxAttempts: q.maxAttempts, enabled: true,
      },
    });
    // Mostly completed; 0 PENDING (so engine doesn't fire), a couple FAILED + 1 DLQ.
    const distribution = ['COMPLETED','COMPLETED','COMPLETED','COMPLETED','COMPLETED',
                         'COMPLETED','COMPLETED','COMPLETED','COMPLETED','COMPLETED',
                         'COMPLETED','COMPLETED','COMPLETED','COMPLETED','COMPLETED',
                         'COMPLETED','COMPLETED','FAILED','FAILED','DLQ'];
    for (const status of distribution) {
      const createdAt = hoursAgo(randInt(0, 48));
      await prisma.jobQueueItem.create({
        data: {
          queueName: q.name, projectId: project.id,
          payload: q.name === 'email-queue'
            ? { to: `customer${randInt(1000, 9999)}@example.com`, template: pick(['welcome', 'receipt', 'reminder']) }
            : q.name === 'webhook-queue'
            ? { event_type: pick(['payment_succeeded', 'invoice.paid', 'customer.created']), event_id: `evt_${crypto.randomBytes(8).toString('hex')}` }
            : { customer_id: `cus_${crypto.randomBytes(6).toString('hex')}`, amount_cents: randInt(990, 99900) },
          status,
          attempts: status === 'FAILED' || status === 'DLQ' ? q.maxAttempts : 1,
          lastError: status === 'FAILED' || status === 'DLQ' ? pick(['Stripe 429 rate limit', 'SendGrid 502', 'connection refused']) : null,
          createdAt,
          completedAt: status === 'COMPLETED' ? new Date(createdAt.getTime() + randInt(100, 5000)) : null,
        },
      });
    }
  }
  console.log(`✅ Queues: ${queueSpecs.length} (× 20 items each)`);

  // 9. DLQ entries -------------------------------------------------------
  const dlqSpecs = [
    { reason: 'NODE_FAILURE', err: 'S3 PutObject timeout after 15s',                                        node: 's3-upload', nodeType: 'httpNode',    schedKey: 'backup'      },
    { reason: 'NODE_FAILURE', err: 'Stripe API rate limit (429) — customer cus_a1b2c3',                     node: 'charge',    nodeType: 'httpNode',    schedKey: 'invoice'     },
    { reason: 'NODE_FAILURE', err: 'Slack webhook 502 Bad Gateway',                                         node: 'slack-ok',  nodeType: 'slackNode',   schedKey: 'backup'      },
    { reason: 'TIMEOUT',      err: 'Database deadlock — kpi MRR query rolled back after 30s',               node: 'q-mrr',     nodeType: 'databaseNode',schedKey: 'kpi'         },
    { reason: 'NODE_FAILURE', err: 'SendGrid 502 — recipient mailbox over quota',                           node: 'send',      nodeType: 'httpNode',    schedKey: 'email-retry' },
    { reason: 'PARSE_ERROR',  err: 'JSON parse error — Stripe webhook payload missing event_type',          node: 'switch',    nodeType: 'switchNode',  schedKey: 'stripe'      },
    { reason: 'NODE_FAILURE', err: 'Connection refused — api-3.acme.com health probe',                     node: 'http',      nodeType: 'httpNode',    schedKey: 'monitor'     },
  ];
  for (const d of dlqSpecs) {
    await prisma.deadLetterQueueEntry.create({
      data: {
        id: `dlq_${crypto.randomBytes(8).toString('hex')}`,
        executionId: `exec_${crypto.randomBytes(8).toString('hex')}`,
        schedulerId: schedulers[d.schedKey].id,
        projectId: project.id,
        reason: d.reason, errorMessage: d.err, errorDetails: '',
        nodeId: d.node, nodeType: d.nodeType,
        status: 'PENDING', retryCount: 3,
        createdAt: hoursAgo(randInt(2, 96)),
      },
    });
  }
  console.log(`✅ DLQ entries: ${dlqSpecs.length}`);

  // 10. ApiKey -----------------------------------------------------------
  const rawToken = `rl_${crypto.randomBytes(24).toString('hex')}`;
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  await prisma.apiKey.create({
    data: {
      name: 'production-deploy-key', key: tokenHash, prefix: rawToken.slice(0, 12),
      userId: admin.id, projectId: project.id,
      permissions: ['schedulers:read', 'executions:read', 'executions:write'],
      lastUsedAt: hoursAgo(2), status: 'ACTIVE',
    },
  });
  console.log('✅ ApiKey: production-deploy-key');

  // -- node templates --
  try { await import('./seed-node-templates'); } catch (err) {
    console.warn('⚠️  Could not seed node templates:', err instanceof Error ? err.message : err);
  }

  console.log('\n🎉 Demo seed complete.');
  console.log(`\n  Login:    ${adminEmail}`);
  console.log(`  Password: ${plaintextPassword}`);
  console.log(`  Project:  http://localhost:3000/runloop/p/${project.id}/dashboard`);
  // Emit the project ID for tooling to consume
  if (process.env.SEED_OUTPUT_FILE) {
    const fs = await import('fs');
    fs.writeFileSync(process.env.SEED_OUTPUT_FILE, JSON.stringify({
      projectId: project.id, adminId: admin.id,
      adminEmail, adminPassword: plaintextPassword,
      flows: Object.fromEntries(Object.entries(flows).map(([n, f]) => [n, f.id])),
      schedulers: Object.fromEntries(Object.entries(schedulers).map(([k, s]) => [k, s.id])),
    }, null, 2));
  }
}

main()
  .catch(e => { console.error('❌ Seed failed:', e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
