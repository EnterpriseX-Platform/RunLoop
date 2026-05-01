// POST /api/ai/chat — server-side proxy to the project's configured LLM.
// Supports Claude (Anthropic), Kimi (Moonshot AI), and ChatGPT (OpenAI).
//
// Keys live as encrypted project secrets:
//   CLAUDE_API_KEY · KIMI_API_KEY · OPENAI_API_KEY
// Default model per provider:
//   CLAUDE_DEFAULT_MODEL · KIMI_DEFAULT_MODEL · OPENAI_DEFAULT_MODEL
//
// Body:
//   { projectId, messages, system?, model?, maxTokens?, provider? }
//   provider ∈ 'claude' | 'kimi' | 'openai'
//
// Provider selection precedence:
//   1. body.provider if set
//   2. CLAUDE_DEFAULT_PROVIDER secret (kept the legacy name; values can be
//      'claude' | 'kimi' | 'openai')
//   3. First configured key, in order: claude > openai > kimi
//
// Response (200):
//   { text, model, provider, stopReason, usage }

import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { decrypt } from '@/lib/encryption';
import { authenticateRequest } from '@/lib/auth';

type Provider = 'claude' | 'kimi' | 'openai';

const DEFAULT_MODEL: Record<Provider, string> = {
  claude: 'claude-sonnet-4-7',
  kimi: 'kimi-latest',
  openai: 'gpt-4o-mini',
};
const MAX_TOKENS_CAP = 4096;

interface ChatRequest {
  projectId: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  system?: string;
  model?: string;
  maxTokens?: number;
  provider?: Provider;
}

async function readSecret(projectId: string, name: string): Promise<string | null> {
  const s = await prisma.secret.findFirst({ where: { projectId, name } });
  if (!s) return null;
  try {
    return decrypt({ encrypted: s.value, iv: s.iv, tag: s.authTag });
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (!auth.success) {
    return Response.json({ error: auth.error }, { status: 401 });
  }

  let body: ChatRequest;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  if (!body.projectId) {
    return Response.json({ error: 'projectId is required' }, { status: 400 });
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return Response.json({ error: 'messages array is required' }, { status: 400 });
  }

  const membership = await prisma.projectMember.findFirst({
    where: { projectId: body.projectId, userId: auth.userId },
  });
  if (!membership) {
    return Response.json({ error: 'project access denied' }, { status: 403 });
  }

  // Read every key + model + provider hint in one parallel batch.
  const [claudeKey, kimiKey, openaiKey, claudeModel, kimiModel, openaiModel, providerPref] =
    await Promise.all([
      readSecret(body.projectId, 'CLAUDE_API_KEY'),
      readSecret(body.projectId, 'KIMI_API_KEY'),
      readSecret(body.projectId, 'OPENAI_API_KEY'),
      readSecret(body.projectId, 'CLAUDE_DEFAULT_MODEL'),
      readSecret(body.projectId, 'KIMI_DEFAULT_MODEL'),
      readSecret(body.projectId, 'OPENAI_DEFAULT_MODEL'),
      readSecret(body.projectId, 'CLAUDE_DEFAULT_PROVIDER'),
    ]);

  const keys: Record<Provider, string | null> = {
    claude: claudeKey,
    kimi: kimiKey,
    openai: openaiKey,
  };
  const modelPrefs: Record<Provider, string | null> = {
    claude: claudeModel,
    kimi: kimiModel,
    openai: openaiModel,
  };

  let provider: Provider | null = null;
  if (body.provider && keys[body.provider] !== undefined) {
    provider = body.provider;
  } else if (
    providerPref === 'claude' ||
    providerPref === 'kimi' ||
    providerPref === 'openai'
  ) {
    provider = providerPref;
  } else if (claudeKey) provider = 'claude';
  else if (openaiKey) provider = 'openai';
  else if (kimiKey) provider = 'kimi';

  if (!provider) {
    return Response.json(
      {
        error:
          'No AI provider configured. Set an API key for Claude, Kimi, or OpenAI in Settings → Integrations.',
      },
      { status: 412 },
    );
  }
  if (!keys[provider]) {
    return Response.json(
      { error: `${provider} requested but its API key is not set` },
      { status: 412 },
    );
  }

  const apiKey = keys[provider]!;
  const model = body.model || modelPrefs[provider] || DEFAULT_MODEL[provider];
  const maxTokens = Math.min(body.maxTokens ?? 1024, MAX_TOKENS_CAP);

  if (provider === 'claude') return callClaude(apiKey, model, body, maxTokens);
  if (provider === 'kimi') return callOpenAICompatible(apiKey, model, body, maxTokens, 'kimi', 'https://api.moonshot.cn/v1/chat/completions');
  return callOpenAICompatible(apiKey, model, body, maxTokens, 'openai', 'https://api.openai.com/v1/chat/completions');
}

async function callClaude(apiKey: string, model: string, body: ChatRequest, maxTokens: number) {
  const upstream = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: body.messages,
      ...(body.system ? { system: body.system } : {}),
    }),
  });
  if (!upstream.ok) {
    const detail = await upstream.text();
    return Response.json(
      { error: `Anthropic API ${upstream.status}: ${detail.slice(0, 500)}`, provider: 'claude' },
      { status: 502 },
    );
  }
  const data = await upstream.json();
  const text = Array.isArray(data.content)
    ? data.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')
    : '';
  return Response.json({
    text,
    model: data.model,
    provider: 'claude',
    stopReason: data.stop_reason,
    usage: {
      inputTokens: data.usage?.input_tokens,
      outputTokens: data.usage?.output_tokens,
    },
  });
}

// callOpenAICompatible handles OpenAI and any OpenAI-shaped API (Moonshot
// AI / Kimi being the most common). System prompt becomes the first
// message with role=system; the rest of the chat is passed verbatim.
async function callOpenAICompatible(
  apiKey: string,
  model: string,
  body: ChatRequest,
  maxTokens: number,
  providerName: 'openai' | 'kimi',
  endpoint: string,
) {
  const messages: Array<{ role: string; content: string }> = [];
  if (body.system) messages.push({ role: 'system', content: body.system });
  messages.push(...body.messages);

  const upstream = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages,
    }),
  });
  if (!upstream.ok) {
    const detail = await upstream.text();
    return Response.json(
      {
        error: `${providerName === 'openai' ? 'OpenAI' : 'Moonshot'} API ${upstream.status}: ${detail.slice(0, 500)}`,
        provider: providerName,
      },
      { status: 502 },
    );
  }
  const data = await upstream.json();
  const text = data.choices?.[0]?.message?.content ?? '';
  return Response.json({
    text,
    model: data.model,
    provider: providerName,
    stopReason: data.choices?.[0]?.finish_reason,
    usage: {
      inputTokens: data.usage?.prompt_tokens,
      outputTokens: data.usage?.completion_tokens,
    },
  });
}
