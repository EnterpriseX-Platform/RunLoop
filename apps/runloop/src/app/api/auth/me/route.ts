import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, SKIP_AUTH, DEV_USER } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    // In dev mode, return dev user
    if (SKIP_AUTH) {
      return NextResponse.json({
        user: {
          id: DEV_USER.userId,
          email: DEV_USER.email,
          name: 'Developer',
          role: DEV_USER.role,
          status: 'ACTIVE',
          createdAt: new Date().toISOString(),
        },
      });
    }

    const user = await getCurrentUser(request);

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json({
      user: {
        id: user.userId,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
