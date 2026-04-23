import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Note: with basePath: '/runloop', pathname here is WITHOUT the basePath prefix
  const { pathname } = request.nextUrl;

  // Redirect root → /p/{lastProjectId}/dashboard
  if (pathname === '/' || pathname === '') {
    const lastProjectId = request.cookies.get('lastProjectId')?.value;
    if (lastProjectId) {
      return NextResponse.redirect(new URL(`/runloop/p/${lastProjectId}/dashboard`, request.url));
    }
    return NextResponse.redirect(new URL('/runloop/projects', request.url));
  }

  // Redirect old flat routes → project-scoped routes
  const flatRoutes = ['/dashboard', '/flows', '/schedulers', '/executions'];
  if (flatRoutes.includes(pathname)) {
    const lastProjectId = request.cookies.get('lastProjectId')?.value;
    const section = pathname.slice(1); // remove leading /
    if (lastProjectId) {
      return NextResponse.redirect(new URL(`/runloop/p/${lastProjectId}/${section}`, request.url));
    }
    return NextResponse.redirect(new URL('/runloop/projects', request.url));
  }

  return NextResponse.next();
}

export const config = {
  // basePath is stripped — match without /runloop prefix
  matcher: ['/', '/dashboard', '/flows', '/schedulers', '/executions'],
};
