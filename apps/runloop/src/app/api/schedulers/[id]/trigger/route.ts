import { NextRequest, NextResponse } from 'next/server';

// POST /api/schedulers/[id]/trigger - Trigger a runloop manually
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const engineUrl = process.env.ENGINE_URL || 'http://localhost:8092';
    
    let body = {};
    try {
      body = await request.json();
    } catch {
      // No body is fine for trigger
    }
    
    const res = await fetch(`${engineUrl}/rl/api/schedulers/${params.id}/trigger`, {
      method: 'POST',
      headers: {
        'Authorization': request.headers.get('authorization') || '',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('Proxy error:', error);
    return NextResponse.json({ error: 'Failed to trigger runloop' }, { status: 500 });
  }
}
