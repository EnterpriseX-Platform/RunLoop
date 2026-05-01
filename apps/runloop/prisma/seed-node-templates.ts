// Seeds the global NodeTemplate catalog with the most-used n8n
// integrations, expressed as pre-configured HTTP nodes. They show up in
// every project's flow editor under "Templates" and snap into the canvas
// with auth + URL + headers ready to fill in.
//
// Run with:  npm run db:seed-templates  (or via the regular seed)

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface Template {
  name: string;
  description: string;
  nodeType: 'HTTP' | 'DATABASE' | 'WEBHOOK_OUT';
  icon?: string;
  color?: string;
  config: Record<string, unknown>;
}

// Each entry uses ${{secrets.X}} for credentials so the user only has to
// add the secret once per project.
const TEMPLATES: Template[] = [
  // ── Communication ─────────────────────────────────────────────────────
  {
    name: 'Slack — Post Message',
    description: 'Post a message to a Slack channel via incoming webhook',
    nodeType: 'WEBHOOK_OUT',
    icon: 'slack',
    color: '#4A154B',
    config: {
      url: '${{secrets.SLACK_WEBHOOK_URL}}',
      method: 'POST',
      body: { text: 'Hello from RunLoop!' },
    },
  },
  {
    name: 'Discord — Post Message',
    description: 'Send a message to a Discord channel via webhook',
    nodeType: 'WEBHOOK_OUT',
    icon: 'discord',
    color: '#5865F2',
    config: {
      url: '${{secrets.DISCORD_WEBHOOK_URL}}',
      method: 'POST',
      body: { content: 'Hello from RunLoop!' },
    },
  },
  {
    name: 'Telegram — Send Message',
    description: 'Bot message via Telegram Bot API',
    nodeType: 'HTTP',
    icon: 'telegram',
    color: '#229ED9',
    config: {
      url: 'https://api.telegram.org/bot${{secrets.TELEGRAM_BOT_TOKEN}}/sendMessage',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { chat_id: '${{input.chatId}}', text: '${{input.message}}' },
    },
  },
  {
    name: 'Microsoft Teams — Post Message',
    description: 'Send a card to a Teams channel via Incoming Webhook',
    nodeType: 'WEBHOOK_OUT',
    icon: 'msteams',
    color: '#5059C9',
    config: {
      url: '${{secrets.TEAMS_WEBHOOK_URL}}',
      method: 'POST',
      body: { text: '${{input.message}}' },
    },
  },

  // ── Productivity / docs ───────────────────────────────────────────────
  {
    name: 'Notion — Create Page',
    description: 'Create a new page in a Notion database',
    nodeType: 'HTTP',
    icon: 'notion',
    color: '#000000',
    config: {
      url: 'https://api.notion.com/v1/pages',
      method: 'POST',
      headers: {
        Authorization: 'Bearer ${{secrets.NOTION_TOKEN}}',
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: {
        parent: { database_id: '${{secrets.NOTION_DATABASE_ID}}' },
        properties: { Name: { title: [{ text: { content: '${{input.title}}' } }] } },
      },
    },
  },
  {
    name: 'Google Sheets — Append Row',
    description: 'Append a row via the v4 API (uses an OAuth bearer token)',
    nodeType: 'HTTP',
    icon: 'google-sheets',
    color: '#0F9D58',
    config: {
      url:
        'https://sheets.googleapis.com/v4/spreadsheets/${{secrets.GS_SPREADSHEET_ID}}/values/${{input.range}}:append?valueInputOption=USER_ENTERED',
      method: 'POST',
      headers: {
        Authorization: 'Bearer ${{secrets.GS_ACCESS_TOKEN}}',
        'Content-Type': 'application/json',
      },
      body: { values: '${{input.values}}' },
    },
  },
  {
    name: 'Airtable — Create Record',
    description: 'Insert a record into an Airtable table',
    nodeType: 'HTTP',
    icon: 'airtable',
    color: '#FCB400',
    config: {
      url:
        'https://api.airtable.com/v0/${{secrets.AIRTABLE_BASE_ID}}/${{input.table}}',
      method: 'POST',
      headers: {
        Authorization: 'Bearer ${{secrets.AIRTABLE_TOKEN}}',
        'Content-Type': 'application/json',
      },
      body: { fields: '${{input.fields}}' },
    },
  },

  // ── Dev / source control ──────────────────────────────────────────────
  {
    name: 'GitHub — Create Issue',
    description: 'Open an issue in a repo',
    nodeType: 'HTTP',
    icon: 'github',
    color: '#181717',
    config: {
      url: 'https://api.github.com/repos/${{input.owner}}/${{input.repo}}/issues',
      method: 'POST',
      headers: {
        Authorization: 'Bearer ${{secrets.GITHUB_TOKEN}}',
        Accept: 'application/vnd.github+json',
      },
      body: { title: '${{input.title}}', body: '${{input.body}}' },
    },
  },
  {
    name: 'GitLab — Create Issue',
    description: 'Open an issue via GitLab REST API v4',
    nodeType: 'HTTP',
    icon: 'gitlab',
    color: '#FC6D26',
    config: {
      url:
        'https://gitlab.com/api/v4/projects/${{input.projectId}}/issues?title=${{input.title}}',
      method: 'POST',
      headers: { 'PRIVATE-TOKEN': '${{secrets.GITLAB_TOKEN}}' },
    },
  },
  {
    name: 'Linear — Create Issue',
    description: 'Linear GraphQL API — issueCreate mutation',
    nodeType: 'HTTP',
    icon: 'linear',
    color: '#5E6AD2',
    config: {
      url: 'https://api.linear.app/graphql',
      method: 'POST',
      headers: {
        Authorization: '${{secrets.LINEAR_API_KEY}}',
        'Content-Type': 'application/json',
      },
      body: {
        query:
          'mutation IssueCreate($input: IssueCreateInput!) { issueCreate(input:$input) { success issue { id identifier url } } }',
        variables: {
          input: {
            teamId: '${{input.teamId}}',
            title: '${{input.title}}',
            description: '${{input.description}}',
          },
        },
      },
    },
  },
  {
    name: 'Jira — Create Issue',
    description: 'REST v3 — POST /rest/api/3/issue',
    nodeType: 'HTTP',
    icon: 'jira',
    color: '#0052CC',
    config: {
      url: 'https://${{secrets.JIRA_DOMAIN}}.atlassian.net/rest/api/3/issue',
      method: 'POST',
      headers: {
        Authorization: 'Basic ${{secrets.JIRA_AUTH_BASIC}}',
        'Content-Type': 'application/json',
      },
      body: {
        fields: {
          project: { key: '${{input.projectKey}}' },
          summary: '${{input.summary}}',
          issuetype: { name: 'Task' },
        },
      },
    },
  },

  // ── AI / LLM ───────────────────────────────────────────────────────────
  {
    name: 'OpenAI — Chat Completion',
    description: 'POST /v1/chat/completions',
    nodeType: 'HTTP',
    icon: 'openai',
    color: '#10A37F',
    config: {
      url: 'https://api.openai.com/v1/chat/completions',
      method: 'POST',
      headers: {
        Authorization: 'Bearer ${{secrets.OPENAI_API_KEY}}',
        'Content-Type': 'application/json',
      },
      body: {
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: '${{input.prompt}}' }],
      },
    },
  },
  {
    name: 'Anthropic Claude — Message',
    description: 'POST /v1/messages',
    nodeType: 'HTTP',
    icon: 'anthropic',
    color: '#D97757',
    config: {
      url: 'https://api.anthropic.com/v1/messages',
      method: 'POST',
      headers: {
        'x-api-key': '${{secrets.ANTHROPIC_API_KEY}}',
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: {
        model: 'claude-3-5-sonnet-latest',
        max_tokens: 1024,
        messages: [{ role: 'user', content: '${{input.prompt}}' }],
      },
    },
  },

  // ── Commerce / payments ───────────────────────────────────────────────
  {
    name: 'Stripe — Create Customer',
    description: 'POST /v1/customers',
    nodeType: 'HTTP',
    icon: 'stripe',
    color: '#635BFF',
    config: {
      url: 'https://api.stripe.com/v1/customers',
      method: 'POST',
      headers: {
        Authorization: 'Bearer ${{secrets.STRIPE_SECRET_KEY}}',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'email=${{input.email}}&name=${{input.name}}',
    },
  },
  {
    name: 'Shopify — List Orders',
    description: 'GET /admin/api/2024-01/orders.json',
    nodeType: 'HTTP',
    icon: 'shopify',
    color: '#7AB55C',
    config: {
      url:
        'https://${{secrets.SHOPIFY_STORE}}.myshopify.com/admin/api/2024-01/orders.json?status=any',
      method: 'GET',
      headers: { 'X-Shopify-Access-Token': '${{secrets.SHOPIFY_TOKEN}}' },
    },
  },

  // ── Email / SMS ───────────────────────────────────────────────────────
  {
    name: 'SendGrid — Send Email',
    description: 'POST /v3/mail/send',
    nodeType: 'HTTP',
    icon: 'sendgrid',
    color: '#1A82E2',
    config: {
      url: 'https://api.sendgrid.com/v3/mail/send',
      method: 'POST',
      headers: {
        Authorization: 'Bearer ${{secrets.SENDGRID_API_KEY}}',
        'Content-Type': 'application/json',
      },
      body: {
        personalizations: [{ to: [{ email: '${{input.to}}' }] }],
        from: { email: '${{input.from}}' },
        subject: '${{input.subject}}',
        content: [{ type: 'text/plain', value: '${{input.body}}' }],
      },
    },
  },
  {
    name: 'Mailgun — Send Email',
    description: 'POST /v3/{domain}/messages',
    nodeType: 'HTTP',
    icon: 'mailgun',
    color: '#F06B66',
    config: {
      url:
        'https://api.mailgun.net/v3/${{secrets.MAILGUN_DOMAIN}}/messages',
      method: 'POST',
      headers: {
        Authorization: 'Basic ${{secrets.MAILGUN_AUTH_BASIC}}',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body:
        'from=${{input.from}}&to=${{input.to}}&subject=${{input.subject}}&text=${{input.body}}',
    },
  },
  {
    name: 'Twilio — Send SMS',
    description: 'POST Messages.json',
    nodeType: 'HTTP',
    icon: 'twilio',
    color: '#F22F46',
    config: {
      url:
        'https://api.twilio.com/2010-04-01/Accounts/${{secrets.TWILIO_ACCOUNT_SID}}/Messages.json',
      method: 'POST',
      headers: {
        Authorization: 'Basic ${{secrets.TWILIO_AUTH_BASIC}}',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'From=${{input.from}}&To=${{input.to}}&Body=${{input.body}}',
    },
  },

  // ── Storage / data ─────────────────────────────────────────────────────
  {
    name: 'AWS S3 — PutObject (signed)',
    description:
      'Upload via a pre-signed URL. Generate the URL via AWS SDK and pass as input.url.',
    nodeType: 'HTTP',
    icon: 'aws',
    color: '#FF9900',
    config: {
      url: '${{input.url}}',
      method: 'PUT',
      body: '${{input.content}}',
    },
  },
  {
    name: 'PostgreSQL — Query',
    description: 'Run a SQL statement against a Postgres connection',
    nodeType: 'DATABASE',
    icon: 'postgres',
    color: '#336791',
    config: {
      type: 'postgres',
      host: '${{secrets.PG_HOST}}',
      port: 5432,
      database: '${{secrets.PG_DATABASE}}',
      username: '${{secrets.PG_USER}}',
      password: '${{secrets.PG_PASSWORD}}',
      query: '${{input.query}}',
    },
  },
  {
    name: 'MySQL — Query',
    description: 'Run a SQL statement against a MySQL connection',
    nodeType: 'DATABASE',
    icon: 'mysql',
    color: '#4479A1',
    config: {
      type: 'mysql',
      host: '${{secrets.MYSQL_HOST}}',
      port: 3306,
      database: '${{secrets.MYSQL_DATABASE}}',
      username: '${{secrets.MYSQL_USER}}',
      password: '${{secrets.MYSQL_PASSWORD}}',
      query: '${{input.query}}',
    },
  },

  // ── Calendar / scheduling ─────────────────────────────────────────────
  {
    name: 'Calendly — Get Event',
    description: 'Retrieve a scheduled event by URI',
    nodeType: 'HTTP',
    icon: 'calendly',
    color: '#006BFF',
    config: {
      url: '${{input.eventUri}}',
      method: 'GET',
      headers: { Authorization: 'Bearer ${{secrets.CALENDLY_TOKEN}}' },
    },
  },

  // ── Marketing / CRM ───────────────────────────────────────────────────
  {
    name: 'HubSpot — Create Contact',
    description: 'POST /crm/v3/objects/contacts',
    nodeType: 'HTTP',
    icon: 'hubspot',
    color: '#FF7A59',
    config: {
      url: 'https://api.hubapi.com/crm/v3/objects/contacts',
      method: 'POST',
      headers: {
        Authorization: 'Bearer ${{secrets.HUBSPOT_TOKEN}}',
        'Content-Type': 'application/json',
      },
      body: {
        properties: {
          email: '${{input.email}}',
          firstname: '${{input.firstName}}',
          lastname: '${{input.lastName}}',
        },
      },
    },
  },
  {
    name: 'Mailchimp — Add Subscriber',
    description: 'POST /3.0/lists/{list_id}/members',
    nodeType: 'HTTP',
    icon: 'mailchimp',
    color: '#FFE01B',
    config: {
      url:
        'https://${{secrets.MAILCHIMP_DC}}.api.mailchimp.com/3.0/lists/${{input.listId}}/members',
      method: 'POST',
      headers: {
        Authorization: 'Bearer ${{secrets.MAILCHIMP_API_KEY}}',
        'Content-Type': 'application/json',
      },
      body: { email_address: '${{input.email}}', status: 'subscribed' },
    },
  },
];

async function main() {
  console.log(`🌱 Seeding ${TEMPLATES.length} global node templates…`);
  let created = 0;
  let skipped = 0;
  for (const t of TEMPLATES) {
    // Idempotent: skip if a global template with the same name exists.
    const existing = await prisma.nodeTemplate.findFirst({
      where: { projectId: null, name: t.name },
    });
    if (existing) {
      skipped++;
      continue;
    }
    await prisma.nodeTemplate.create({
      data: {
        projectId: null, // global — visible to every project
        name: t.name,
        description: t.description,
        nodeType: t.nodeType,
        // Prisma's typed client wants InputJsonValue here; our literal
        // config map is JSON-safe but TS narrows the unknown values.
        config: t.config as unknown as object,
        icon: t.icon,
        color: t.color,
      },
    });
    created++;
  }
  console.log(`✅ Created ${created}, skipped ${skipped} existing.`);
}

main()
  .catch((e) => {
    console.error('❌ template seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
