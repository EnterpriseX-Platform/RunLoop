import { NextRequest, NextResponse } from 'next/server';

// GET /api/flows/[id] - Get a single flow
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const engineUrl = process.env.ENGINE_URL || 'http://localhost:8080';

    const res = await fetch(`${engineUrl}/rl/api/flows/${params.id}`, {
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
    return NextResponse.json({ error: 'Failed to fetch flow' }, { status: 500 });
  }
}

// PUT /api/flows/[id] - Update a flow
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const engineUrl = process.env.ENGINE_URL || 'http://localhost:8080';
    const body = await request.json();

    const res = await fetch(`${engineUrl}/rl/api/flows/${params.id}`, {
      method: 'PUT',
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
    return NextResponse.json({ error: 'Failed to update flow' }, { status: 500 });
  }
}

// DELETE /api/flows/[id] - Delete a flow
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const engineUrl = process.env.ENGINE_URL || 'http://localhost:8080';

    const res = await fetch(`${engineUrl}/rl/api/flows/${params.id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': request.headers.get('authorization') || '',
      },
      cache: 'no-store',
    });

    return NextResponse.json(null, { status: res.status });
  } catch (error) {
    console.error('Proxy error:', error);
    return NextResponse.json({ error: 'Failed to delete flow' }, { status: 500 });
  }
}
