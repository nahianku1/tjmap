'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Eye, EyeOff, Loader2, Lock, Mail, ShieldAlert, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { AuthShell } from '@/components/auth/auth-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const { login, status } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'authenticated') router.replace('/');
  }, [status, router]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const user = await login({ email, password });
      toast.success(`Welcome back, ${user.name.split(' ')[0]}`, {
        description: user.role === 'admin' ? 'Admin session · full network control' : 'Viewer session · read-only access',
      });
      router.replace('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to sign in right now');
    } finally {
      setLoading(false);
    }
  }

  function fillDemo(role: 'admin' | 'user') {
    setEmail(role === 'admin' ? 'admin@isptj.app' : 'user@isptj.app');
    setPassword(role === 'admin' ? 'Admin@12345' : 'User@12345');
    setError(null);
  }

  return (
    <AuthShell>
      <div className="anim-rise">
        <div className="inline-flex items-center gap-2 rounded-full border border-teal-500/20 bg-teal-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-teal-700 dark:text-teal-300">
          Operator sign in
        </div>
        <h2 className="mt-4 font-display text-[30px] font-semibold leading-tight tracking-tight">
          Back to the NOC
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Sign in to inspect terminal joints, fibre spans and live cuts across your divisions.
        </p>

        <form onSubmit={handleSubmit} className="mt-7 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Work email</Label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/70" />
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                placeholder="you@division-isp.net"
                className="pl-10"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground/70">
                Secured by Argon2id
              </span>
            </div>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/70" />
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                placeholder="••••••••••"
                className="pl-10 pr-11"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground transition hover:bg-accent hover:text-foreground"
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>

          {error ? (
            <div className="flex items-start gap-2 rounded-xl border border-destructive/25 bg-destructive/10 px-3 py-2.5 text-[12px] text-destructive">
              <ShieldAlert className="mt-0.5 size-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}

          <Button type="submit" size="lg" className="group w-full" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Verifying credentials…
              </>
            ) : (
              <>
                Enter the network
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </>
            )}
          </Button>
        </form>

        <div className="mt-5 rounded-2xl border border-dashed border-border/80 bg-white/40 p-3 dark:bg-white/[0.03]">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Seeded demo accounts
            </p>
            <span className="text-[9px] text-muted-foreground/70">click to fill</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => fillDemo('admin')}
              className="group flex items-center gap-2 rounded-xl border border-white/60 bg-white/70 px-3 py-2 text-left transition hover:border-teal-400/40 hover:bg-white/90 active:scale-[0.99] dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
            >
              <span className="grid size-7 place-items-center rounded-lg bg-amber-400/15 text-amber-600 dark:text-amber-300">
                <ShieldAlert className="size-3.5" />
              </span>
              <span>
                <span className="block text-[11px] font-semibold">Admin</span>
                <span className="block text-[9px] text-muted-foreground">Full control</span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => fillDemo('user')}
              className="group flex items-center gap-2 rounded-xl border border-white/60 bg-white/70 px-3 py-2 text-left transition hover:border-sky-400/40 hover:bg-white/90 active:scale-[0.99] dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
            >
              <span className="grid size-7 place-items-center rounded-lg bg-sky-400/15 text-sky-600 dark:text-sky-300">
                <UserRound className="size-3.5" />
              </span>
              <span>
                <span className="block text-[11px] font-semibold">Viewer</span>
                <span className="block text-[9px] text-muted-foreground">Read only</span>
              </span>
            </button>
          </div>
        </div>

        <p className="mt-6 text-center text-[12px] text-muted-foreground">
          Need network access?{' '}
          <Link
            href="/signup"
            className="font-semibold text-foreground underline decoration-primary/40 decoration-2 underline-offset-4 transition hover:decoration-primary"
          >
            Request an account
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
