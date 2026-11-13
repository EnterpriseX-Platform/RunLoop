'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { ArrowRight } from 'lucide-react';

// Login — Carbon sign-in: product name in the shell bar, one form on a
// layer panel, fields with labels above, one primary button.

const SANS = "'IBM Plex Sans Thai', 'IBM Plex Sans', sans-serif";

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const { login, isAuthenticated, isLoading: authLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // ?preview=1 — view the login UI even when dev auth-skip is on.
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('preview')) return;
    if (isAuthenticated && !authLoading) {
      router.push('/projects');
    }
  }, [isAuthenticated, authLoading, router]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--t-bg)' }}>
      </div>
    );
  }
  const previewMode = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('preview');
  if (isAuthenticated && !previewMode) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col" style={{ background: 'var(--t-bg)', fontFamily: SANS, color: 'var(--t-text)' }}>
      <header className="h-12 flex items-center px-4" style={{ background: 'var(--t-shell)', color: '#fff', fontSize: 14 }}>
        Run<span style={{ fontWeight: 600 }}>Loop</span>
      </header>

      <main className="flex-1 flex items-start justify-center px-4" style={{ paddingTop: '12vh' }}>
        <form onSubmit={handleSubmit} style={{ width: '100%', maxWidth: 400, background: 'var(--t-panel)', paddingTop: 32 }}>
          <div style={{ padding: '0 32px' }}>
            <h1 style={{ fontSize: 28, lineHeight: '36px', fontWeight: 400, marginBottom: 32 }}>Log in to RunLoop</h1>

            <div className="flex flex-col" style={{ gap: 24 }}>
              <Field label="Email" value={email} onChange={setEmail} type="email" placeholder="you@example.com" autoComplete="email" autoFocus />
              <Field label="Password" value={password} onChange={setPassword} type="password" autoComplete="current-password" />

              {error && (
                <div
                  role="alert"
                  style={{
                    padding: '12px 16px',
                    fontSize: 14,
                    background: 'var(--tag-red-bg)',
                    color: 'var(--tag-red-text)',
                    boxShadow: 'inset 3px 0 0 var(--t-error)',
                  }}
                >
                  {error}
                </div>
              )}

              {process.env.NEXT_PUBLIC_SHOW_DEV_HINT === 'true' && (
                <p style={{ fontSize: 12, lineHeight: '16px', color: 'var(--t-text-secondary)' }}>
                  Local setup: the password is printed once by <code>npm run db:seed</code>.
                </p>
              )}
            </div>
          </div>
          <div style={{ marginTop: 32 }}>
            <button
              type="submit"
              disabled={isLoading || !email || !password}
              className="w-full flex items-center justify-between hover:bg-[var(--t-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ height: 64, padding: '0 16px 16px 16px', alignItems: 'flex-start', paddingTop: 14, background: 'var(--t-accent)', color: '#fff', fontSize: 14, border: 'none' }}
            >
              {isLoading ? 'Logging in…' : 'Continue'}
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}

function Field({
  label, value, onChange, type = 'text', placeholder, autoFocus, autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  autoFocus?: boolean;
  autoComplete?: string;
}) {
  const id = `f-${label.toLowerCase()}`;
  return (
    <div className="flex flex-col" style={{ gap: 8 }}>
      <label htmlFor={id} style={{ fontSize: 12, lineHeight: '16px', color: 'var(--t-text-secondary)' }}>{label}</label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete={autoComplete}
        className="outline-none focus:shadow-[inset_0_0_0_2px_var(--t-accent)] placeholder:text-[var(--t-text-muted)]"
        style={{
          height: 40,
          padding: '0 16px',
          fontSize: 14,
          background: 'var(--t-input)',
          color: 'var(--t-text)',
          border: 'none',
          borderBottom: '1px solid var(--t-border-strong)',
        }}
      />
    </div>
  );
}
