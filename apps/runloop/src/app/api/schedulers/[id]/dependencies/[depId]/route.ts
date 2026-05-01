import { NextRequest, NextResponse } from 'next/server';

// DELETE /api/schedulers/[id]/dependencies/[depId]
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; depId: string } }
) {
  try {
    const engineUrl = process.env.ENGINE_URL || 'http://localhost:8092';
    const res = await fetch(`${engineUrl}/rl/api/schedulers/${params.id}/dependencies/${params.depId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': request.headers.get('authorization') || '',
      },
      cache: 'no-store',
    });
    return NextResponse.json(null, { status: res.status });
  } catch (error) {
    console.error('Proxy error:', error);
    return NextResponse.json({ error: 'Failed to remove dependency' }, { status: 500 });
  }
}
