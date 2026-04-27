// POST /api/ai/chat — server-side proxy to api.anthropic.com.
//
// The browser never sees the Claude API key. The user stores it in
// Settings → Integrations as a project secret named CLAUDE_API_KEY; this
// route reads it via Prisma, calls Anthropic, and returns just the text.
//
// Body:
//   { projectId, messages: [{ role, content }], system?, model?, maxTokens? }
//
// Response (200):
//   { text, model, stopReason, usage: { inputTokens, outputTokens } }
//
// Response (4xx/5xx): { error: string }

import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { decrypt } from '@/lib/encryption';
import { authenticateRequest } from '@/lib/auth';

const DEFAULT_MODEL = 'claude-sonnet-4-7';
const MAX_TOKENS_CAP = 4096;

interface ChatRequest {
  projectId: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  system?: string;
  model?: string;
  maxTokens?: number;
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

  // Verify the user is a member of the project before reaching for its secrets.
  const membership = await prisma.projectMember.findFirst({
    where: { projectId: body.projectId, userId: auth.userId },
  });
  if (!membership) {
    return Response.json({ error: 'project access denied' }, { status: 403 });
  }

  // Look up the API key + (optional) preferred model from project secrets.
  const secrets = await prisma.secret.findMany({
    where: {
      projectId: body.projectId,
      name: { in: ['CLAUDE_API_KEY', 'CLAUDE_DEFAULT_MODEL'] },
    },
  });
  const keySecret = secrets.find((s) => s.name === 'CLAUDE_API_KEY');
  if (!keySecret) {
    return Response.json(
      { error: 'CLAUDE_API_KEY is not configured for this project. Set it in Settings → Integrations.' },
      { status: 412 },
    );
  }

  let apiKey: string;
  try {
    apiKey = decrypt({
      encrypted: keySecret.value,
      iv: keySecret.iv,
      tag: keySecret.authTag,
    });
  } catch (e) {
    return Response.json({ error: 'failed to decrypt API key' }, { status: 500 });
  }

  const modelSecret = secrets.find((s) => s.name === 'CLAUDE_DEFAULT_MODEL');
  let preferredModel = DEFAULT_MODEL;
  if (modelSecret) {
    try {
      preferredModel = decrypt({
        encrypted: modelSecret.value,
        iv: modelSecret.iv,
        tag: modelSecret.authTag,
      });
    } catch {
      // Fall through to default — model isn't sensitive, this is just convenience.
    }
  }

  const model = body.model || preferredModel;
  const maxTokens = Math.min(body.maxTokens ?? 1024, MAX_TOKENS_CAP);

  // Call Anthropic.
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
      { error: `Anthropic API ${upstream.status}: ${detail.slice(0, 500)}` },
      { status: 502 },
    );
  }

  const data = await upstream.json();
  // Pull the first text block out of the response — for the simple chat
  // use case we don't surface the multi-block content array.
  const text = Array.isArray(data.content)
    ? data.content
        .filter((b: any) => b.type === 'text')
        .map((b: any) => b.text)
        .join('')
    : '';

  return Response.json({
    text,
    model: data.model,
    stopReason: data.stop_reason,
    usage: {
      inputTokens: data.usage?.input_tokens,
      outputTokens: data.usage?.output_tokens,
    },
  });
}
