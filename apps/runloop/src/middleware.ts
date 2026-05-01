import { NextResponse, type NextRequest } from 'next/server';

// Inject Authorization: Bearer <token> from the httpOnly `token` cookie
// before Next.js server-side rewrites forward /api/* to the Go engine.
// Same-origin cookies are NOT forwarded by Next.js's proxy to a
// different upstream host, so we promote the cookie to a header here —
// transparent to the browser, authoritative to the engine.
export function middleware(request: NextRequest) {
  const token = request.cookies.get('token')?.value;
  if (!token) return NextResponse.next();

  const headers = new Headers(request.headers);
  if (!headers.has('authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ['/api/:path*'],
};
