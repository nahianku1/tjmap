'use client';

import { useRouter } from 'next/navigation';
import { ChevronDown, LogOut, Mail, Phone, ShieldCheck, UserRound } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/lib/auth-context';
import { cn, initials } from '@/lib/utils';

export function UserMenu() {
  const router = useRouter();
  const { user, logout } = useAuth();

  if (!user) return null;

  const isAdmin = user.role === 'admin';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="group flex items-center gap-2 rounded-xl border border-white/60 bg-white/50 py-1 pl-1 pr-2 text-left shadow-sm backdrop-blur transition hover:bg-white/75 active:scale-[0.99] dark:border-white/10 dark:bg-white/[0.05] dark:hover:bg-white/[0.09]"
        >
          <span
            className={cn(
              'grid size-8 shrink-0 place-items-center rounded-lg text-[11px] font-bold',
              isAdmin
                ? 'bg-gradient-to-br from-amber-300 to-orange-400 text-amber-950'
                : 'bg-gradient-to-br from-sky-300 to-cyan-400 text-sky-950',
            )}
          >
            {initials(user.name)}
          </span>
          <span className="hidden min-w-0 leading-tight sm:block">
            <span className="block max-w-[120px] truncate text-[11.5px] font-semibold">{user.name}</span>
            <span className="block text-[8.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {isAdmin ? 'Network admin' : 'Viewer'}
            </span>
          </span>
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="flex items-center justify-between pb-2 pt-2">
          Signed in
          <Badge variant={isAdmin ? 'roleAdmin' : 'roleUser'}>
            {isAdmin ? <ShieldCheck className="size-2.5" /> : <UserRound className="size-2.5" />}
            {user.role}
          </Badge>
        </DropdownMenuLabel>

        <div className="mb-1 space-y-1.5 rounded-xl border border-white/60 bg-white/50 px-2.5 py-2 dark:border-white/10 dark:bg-white/[0.04]">
          <p className="truncate text-[12px] font-semibold">{user.name}</p>
          <p className="flex items-center gap-1.5 truncate text-[10.5px] text-muted-foreground">
            <Mail className="size-3 shrink-0" />
            {user.email}
          </p>
          <p className="flex items-center gap-1.5 truncate text-[10.5px] text-muted-foreground">
            <Phone className="size-3 shrink-0" />
            {user.mobile}
          </p>
        </div>

        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={async (event) => {
            event.preventDefault();
            await logout();
            router.replace('/login');
          }}
          className="text-destructive focus:bg-destructive/10 focus:text-destructive"
        >
          <LogOut className="size-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
