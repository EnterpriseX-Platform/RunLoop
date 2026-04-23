import { NextRequest, NextResponse } from 'next/server';

// Proxy to Go Engine
export async function GET(request: NextRequest) {
  try {
    const engineUrl = process.env.ENGINE_URL || 'http://localhost:8081';
    const url = new URL(request.url);
    const targetUrl = `${engineUrl}/rl/api/executions${url.search}`;

    console.log('[executions proxy] GET', targetUrl);

    const res = await fetch(targetUrl, {
      headers: {
        'Authorization': request.headers.get('authorization') || '',
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });

    const text = await res.text();
    console.log('[executions proxy] response status:', res.status, 'body length:', text.length, 'body preview:', text.substring(0, 200));
    const data = JSON.parse(text);
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('[executions proxy] error:', error);
    return NextResponse.json({ error: 'Failed to fetch executions' }, { status: 500 });
  }
}
