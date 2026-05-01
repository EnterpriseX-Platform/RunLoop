import { NextRequest, NextResponse } from 'next/server';

// GET /api/executions/[id] - Get execution details with logs
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const engineUrl = process.env.ENGINE_URL || 'http://localhost:8092';
    
    const res = await fetch(`${engineUrl}/rl/api/executions/${params.id}`, {
      headers: {
        'Authorization': request.headers.get('authorization') || '',
        'Content-Type': 'application/json',
      },
    });

    const data = await res.json();
    
    // Map scheduler to runloop in response
    if (data.data && data.data.scheduler) {
      data.data.runloop = data.data.scheduler;
    }
    
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('Proxy error:', error);
    return NextResponse.json({ error: 'Failed to fetch execution' }, { status: 500 });
  }
}
