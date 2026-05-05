import { NextRequest, NextResponse } from 'next/server';

// Proxy to Go Engine
export async function GET(request: NextRequest) {
  try {
    const engineUrl = process.env.ENGINE_URL || 'http://localhost:8092';
    const url = new URL(request.url);
    const targetUrl = `${engineUrl}/rl/api/executions${url.search}`;

    const res = await fetch(targetUrl, {
      headers: {
        'Authorization': request.headers.get('authorization') || '',
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });

    const text = await res.text();
    const data = JSON.parse(text);
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('[executions proxy] error:', error);
    return NextResponse.json({ error: 'Failed to fetch executions' }, { status: 500 });
  }
}
