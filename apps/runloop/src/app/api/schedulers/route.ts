import { NextRequest, NextResponse } from 'next/server';

// Proxy to Go Engine
export async function GET(request: NextRequest) {
  try {
    const engineUrl = process.env.ENGINE_URL || 'http://localhost:8081';
    const url = new URL(request.url);
    
    const res = await fetch(`${engineUrl}/rl/api/schedulers${url.search}`, {
      headers: {
        'Authorization': request.headers.get('authorization') || '',
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('Proxy error:', error);
    return NextResponse.json({ error: 'Failed to fetch schedulers' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const engineUrl = process.env.ENGINE_URL || 'http://localhost:8081';
    const body = await request.json();
    
    const res = await fetch(`${engineUrl}/rl/api/schedulers`, {
      method: 'POST',
      headers: {
        'Authorization': request.headers.get('authorization') || '',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('Proxy error:', error);
    return NextResponse.json({ error: 'Failed to create scheduler' }, { status: 500 });
  }
}
