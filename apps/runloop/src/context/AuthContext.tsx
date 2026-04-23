'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { User } from '@/types';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const SKIP_AUTH = process.env.NEXT_PUBLIC_SKIP_AUTH === 'true';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  const checkAuth = useCallback(async () => {
    // Dev auth-skip: seed a fake user at boot so the app is immediately
    // usable. Subsequent login/logout go through the real API — once a
    // user has explicitly logged out we respect that intent rather than
    // silently re-seeding. An `rl-logged-out` session flag tracks this.
    if (SKIP_AUTH && typeof window !== 'undefined' && !sessionStorage.getItem('rl-logged-out')) {
      setUser({
        id: 'dev-user',
        email: 'dev@runloop.io',
        name: 'Developer',
        role: 'ADMIN',
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
      });
      setIsLoading(false);
      return;
    }

    try {
      const res = await fetch('/runloop/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const login = async (email: string, password: string) => {
    const res = await fetch('/runloop/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Login failed');
    }

    const data = await res.json();
    // Clear the "logged out" flag so dev auth-skip can resume on refresh
    // once real credentials worked at least once.
    if (typeof window !== 'undefined') sessionStorage.removeItem('rl-logged-out');
    setUser(data.user);
    router.push('/dashboard');
  };

  const logout = async () => {
    await fetch('/runloop/api/auth/logout', { method: 'POST' });
    // Mark that the user explicitly left. Prevents dev auth-skip from
    // silently re-seeding the fake user when the /login route re-mounts.
    if (typeof window !== 'undefined') sessionStorage.setItem('rl-logged-out', '1');
    setUser(null);
    router.push('/login');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        // Authenticated only when we actually have a user object. SKIP_AUTH
        // just seeds one at boot (in checkAuth); it no longer overrides
        // logout or a failed session check.
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
