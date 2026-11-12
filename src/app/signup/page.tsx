'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  Phone,
  ShieldAlert,
  ShieldCheck,
  UserRound,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { AuthShell } from '@/components/auth/auth-shell';
import { PasswordMeter } from '@/components/auth/password-meter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api';
import { assessPassword } from '@/lib/password';
import { cn } from '@/lib/utils';
import type { Role } from '@/lib/types';

const MOBILE_PATTERN = /^\+?[0-9][0-9\s\-()]{6,19}$/;

export default function SignupPage() {
  const router = useRouter();
  const { signup, status } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [role, setRole] = useState<Role>('user');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'authenticated') router.replace('/');
  }, [status, router]);

  const strength = useMemo(() => assessPassword(password), [password]);
  const matches = confirm.length > 0 && password === confirm;
  const mismatch = confirm.length > 0 && password !== confirm;

  const valid =
    name.trim().length >= 2 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) &&
    MOBILE_PATTERN.test(mobile.trim()) &&
    strength.checks.length &&
    matches;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!valid) {
      setError('Please complete every field. Passwords must match and be at least 8 characters.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const user = await signup({
        name: name.trim(),
        email: email.trim(),
        mobile: mobile.trim(),
        password,
        role,
      });
      toast.success(`Account ready, ${user.name.split(' ')[0]}`, {
        description: role === 'admin' ? 'Admin access enabled for this workspace' : 'Read-only access enabled',
      });
      router.replace('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to create your account right now');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell>
      <div className="anim-rise">
        <div className="inline-flex items-center gap-2 rounded-full border border-violet-500/20 bg-violet-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-violet-700 dark:text-violet-300">
          Provision access
        </div>
        <h2 className="mt-4 font-display text-[30px] font-semibold leading-tight tracking-tight">
          Create your operator account
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Join the divisional network workspace. Choose a viewer seat or an admin seat with edit rights.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Full name</Label>
              <div className="relative">
                <UserRound className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/70" />
                <Input
                  id="name"
                  required
                  autoComplete="name"
                  placeholder="Nafis Rahman"
                  className="pl-10"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="mobile">Mobile</Label>
              <div className="relative">
                <Phone className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/70" />
                <Input
                  id="mobile"
                  required
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="+880 17 0000 0000"
                  className="pl-10"
                  value={mobile}
                  onChange={(event) => setMobile(event.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Work email</Label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/70" />
              <Input
                id="email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@division-isp.net"
                className="pl-10"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Workspace role</Label>
            <div className="grid grid-cols-2 gap-2">
              <RoleCard
                active={role === 'user'}
                icon={Eye}
                title="Viewer"
                body="Read-only map"
                onClick={() => setRole('user')}
              />
              <RoleCard
                active={role === 'admin'}
                icon={ShieldCheck}
                title="Admin"
                body="Edit & maintain"
                onClick={() => setRole('admin')}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/70" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="new-password"
                  placeholder="Minimum 8 characters"
                  className="pl-10 pr-10"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground transition hover:bg-accent hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm">Confirm password</Label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/70" />
                <Input
                  id="confirm"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="new-password"
                  placeholder="Re-type password"
                  className={cn(
                    'pl-10 pr-10',
                    matches && 'border-emerald-400/60 focus-visible:border-emerald-400/60 focus-visible:ring-emerald-400/15',
                    mismatch && 'border-rose-400/60 focus-visible:border-rose-400/60 focus-visible:ring-rose-400/15',
                  )}
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                />
                {confirm.length > 0 ? (
                  <span
                    className={cn(
                      'absolute right-2 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-full',
                      matches ? 'bg-emerald-500/15 text-emerald-500' : 'bg-rose-500/15 text-rose-500',
                    )}
                  >
                    {matches ? <Check className="size-3.5" strokeWidth={3} /> : <X className="size-3.5" strokeWidth={3} />}
                  </span>
                ) : null}
              </div>
              <p
                className={cn(
                  'text-[11px] transition-colors',
                  matches ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground/70',
                  mismatch && 'text-rose-500',
                )}
              >
                {matches ? 'Passwords match' : mismatch ? 'Passwords do not match' : 'Re-enter to confirm'}
              </p>
            </div>
          </div>

          <PasswordMeter password={password} />

          {error ? (
            <div className="flex items-start gap-2 rounded-xl border border-destructive/25 bg-destructive/10 px-3 py-2.5 text-[12px] text-destructive">
              <ShieldAlert className="mt-0.5 size-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}

          <Button type="submit" size="lg" className="group w-full" disabled={loading || !valid}>
            {loading ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Creating account…
              </>
            ) : (
              <>
                Create account
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </>
            )}
          </Button>

          <p className="text-center text-[10px] leading-relaxed text-muted-foreground/70">
            Passwords are hashed with Argon2id. Sessions use short-lived access tokens with silent
            refresh.
          </p>
        </form>

        <p className="mt-5 text-center text-[12px] text-muted-foreground">
          Already onboarded?{' '}
          <Link
            href="/login"
            className="font-semibold text-foreground underline decoration-primary/40 decoration-2 underline-offset-4 transition hover:decoration-primary"
          >
            Sign in
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}

function RoleCard({
  active,
  icon: Icon,
  title,
  body,
  onClick,
}: {
  active: boolean;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'group flex items-center gap-2.5 rounded-xl border p-2.5 text-left transition-all duration-200',
        active
          ? 'border-primary/50 bg-primary/10 shadow-[0_0_0_3px_color-mix(in_oklab,var(--ring)_12%,transparent)]'
          : 'border-white/60 bg-white/50 hover:border-primary/30 hover:bg-white/75 dark:border-white/10 dark:bg-white/[0.04] dark:hover:bg-white/[0.07]',
      )}
    >
      <span
        className={cn(
          'grid size-8 shrink-0 place-items-center rounded-lg transition-colors',
          active
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-muted-foreground group-hover:text-foreground',
        )}
      >
        <Icon className="size-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-[12px] font-semibold leading-tight">{title}</span>
        <span className="block text-[10px] text-muted-foreground">{body}</span>
      </span>
    </button>
  );
}
