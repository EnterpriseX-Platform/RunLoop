import { NextRequest, NextResponse } from 'next/server';

// GET /api/schedulers/[id]/flows - Get flows linked to a scheduler
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const engineUrl = process.env.ENGINE_URL || 'http://localhost:8081';
    const res = await fetch(`${engineUrl}/rl/api/schedulers/${params.id}/flows`, {
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
    return NextResponse.json({ error: 'Failed to fetch scheduler flows' }, { status: 500 });
  }
}

// POST /api/schedulers/[id]/flows - Attach flows to a scheduler
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const engineUrl = process.env.ENGINE_URL || 'http://localhost:8081';
    const body = await request.json();
    const res = await fetch(`${engineUrl}/rl/api/schedulers/${params.id}/flows`, {
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
    return NextResponse.json({ error: 'Failed to attach flows' }, { status: 500 });
  }
}
