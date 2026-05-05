import { NextRequest, NextResponse } from 'next/server';

// GET /api/tasks/[id] - Get a single task
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const engineUrl = process.env.ENGINE_URL || 'http://localhost:8080';

    const res = await fetch(`${engineUrl}/rl/api/tasks/${params.id}`, {
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
    return NextResponse.json({ error: 'Failed to fetch task' }, { status: 500 });
  }
}

// PUT /api/tasks/[id] - Update a task
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const engineUrl = process.env.ENGINE_URL || 'http://localhost:8080';
    const body = await request.json();

    const res = await fetch(`${engineUrl}/rl/api/tasks/${params.id}`, {
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
    return NextResponse.json({ error: 'Failed to update task' }, { status: 500 });
  }
}

// DELETE /api/tasks/[id] - Delete a task
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const engineUrl = process.env.ENGINE_URL || 'http://localhost:8080';

    const res = await fetch(`${engineUrl}/rl/api/tasks/${params.id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': request.headers.get('authorization') || '',
      },
      cache: 'no-store',
    });

    return NextResponse.json(null, { status: res.status });
  } catch (error) {
    console.error('Proxy error:', error);
    return NextResponse.json({ error: 'Failed to delete task' }, { status: 500 });
  }
}
