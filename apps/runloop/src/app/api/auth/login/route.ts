import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyPassword, generateToken, createSession } from '@/lib/auth';
import { loginLimiter, clientKey } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  // Brute-force barrier — one bucket per IP. Default 10/min; tune via
  // LOGIN_RATE_LIMIT / LOGIN_RATE_WINDOW_MS.
  const rlKey = clientKey(request, 'login:');
  if (!loginLimiter.consume(rlKey)) {
    return NextResponse.json(
      { error: 'too many login attempts; slow down' },
      { status: 429, headers: { 'Retry-After': '60' } }
    );
  }
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      // Constant-ish-time response: hash the supplied password against a
      // dummy hash so attackers can't distinguish "user not found" from
      // "wrong password" via timing.
      await verifyPassword(
        password,
        '$2b$10$abcdefghijklmnopqrstuv.NHL2y8QyEGBELQK1uJ6pK4wQR2t/Daa'
      );
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    // Verify password
    const isValid = await verifyPassword(password, user.password);

    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    // Successful login — clear the rate-limit bucket so a legitimate
    // user doesn't get throttled after a few typos.
    loginLimiter.reset(rlKey);

    // Check if user is active
    if (user.status !== 'ACTIVE') {
      return NextResponse.json(
        { error: 'Account is not active' },
        { status: 403 }
      );
    }

    // Generate token
    const token = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    // Create session
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    await createSession(user.id, token, expiresAt);

    // Return user info (without password)
    const { password: _, ...userWithoutPassword } = user;

    const response = NextResponse.json({
      user: userWithoutPassword,
      token,
    });

    // Set cookie
    response.cookies.set({
      name: 'token',
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    return response;
  } catch (error) {
    // Log details server-side; never leak the underlying message to client.
    console.error('Login error:', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
