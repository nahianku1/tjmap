'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import {
  ArrowUpRight,
  Cable,
  ChevronRight,
  Layers,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Scissors,
  Search,
  Trash2,
  Waypoints,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { DirectoryHeader } from '@/components/directory/directory-header';
import { DistrictDialog } from '@/components/directory/district-dialog';
import { ConfirmDialog } from '@/components/map/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { BrandMark } from '@/components/brand';
import { api, ApiError, fetcher } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type { District } from '@/lib/types';
import { cn, pluralise } from '@/lib/utils';

const ACCENTS = [
  'from-teal-400/35 via-cyan-400/15 to-transparent',
  'from-violet-400/35 via-fuchsia-400/15 to-transparent',
  'from-sky-400/35 via-indigo-400/15 to-transparent',
  'from-amber-400/35 via-orange-400/15 to-transparent',
  'from-emerald-400/35 via-lime-400/15 to-transparent',
  'from-rose-400/35 via-pink-400/15 to-transparent',
];

export default function HomePage() {
  const router = useRouter();
  const { status, isAdmin } = useAuth();

  const { data, error, isLoading, mutate } = useSWR<District[]>(
    status === 'authenticated' ? '/districts' : null,
    fetcher,
    { revalidateOnFocus: false, shouldRetryOnError: false },
  );

  const [search, setSearch] = useState('');
  const [dialog, setDialog] = useState<{ district: District | null } | null>(null);
  const [toDelete, setToDelete] = useState<District | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (status === 'anonymous') router.replace('/login');
  }, [status, router]);

  const districts = useMemo(() => data ?? [], [data]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return districts;
    return districts.filter(
      (district) =>
        district.name.toLowerCase().includes(query) ||
        district.code.toLowerCase().includes(query) ||
        (district.description ?? '').toLowerCase().includes(query),
    );
  }, [districts, search]);

  const totals = useMemo(
    () =>
      districts.reduce(
        (acc, district) => ({
          areas: acc.areas + district.areaCount,
          joints: acc.joints + district.tjCount,
          spans: acc.spans + district.linkCount,
          cuts: acc.cuts + district.cutCount,
        }),
        { areas: 0, joints: 0, spans: 0, cuts: 0 },
      ),
    [districts],
  );

  async function confirmDelete() {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await api.deleteDistrict(toDelete.id);
      toast.success(`${toDelete.name} deleted`, {
        description: 'Its areas were removed. Terminal joints stay on the national map.',
      });
      setToDelete(null);
      await mutate();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not delete this district');
    } finally {
      setDeleting(false);
    }
  }

  if (status === 'loading') {
    return (
      <div className="app-canvas grain grid h-[100dvh] place-items-center">
        <div className="flex flex-col items-center gap-4">
          <BrandMark className="size-12" />
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            Restoring session
          </p>
        </div>
      </div>
    );
  }

  if (status === 'anonymous') {
    return <div className="app-canvas h-[100dvh]" />;
  }

  return (
    <div className="app-canvas grain min-h-[100dvh] w-full p-2 sm:p-4">
      <div className="flex min-h-[calc(100dvh-1rem)] w-full flex-col gap-5 rounded-[22px] app-shell p-4 sm:rounded-[30px] sm:p-6 lg:p-8">
        <DirectoryHeader />

        <main className="flex-1 space-y-6">
          <section className="anim-rise relative overflow-hidden rounded-3xl border border-white/60 bg-gradient-to-br from-white/55 via-white/30 to-transparent p-5 sm:p-6 dark:border-white/[0.07] dark:from-white/[0.06] dark:via-white/[0.02]">
            <div className="pointer-events-none absolute -right-24 -top-24 size-64 rounded-full bg-teal-400/15 blur-3xl dark:bg-teal-400/10" />
            <div className="pointer-events-none absolute -bottom-28 left-1/3 size-56 rounded-full bg-violet-500/10 blur-3xl" />

            <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-2xl">
                <p className="inline-flex items-center gap-1.5 rounded-full border border-white/60 bg-white/60 px-2.5 py-1 text-[9.5px] font-semibold uppercase tracking-[0.16em] text-muted-foreground dark:border-white/10 dark:bg-white/[0.04]">
                  <Layers className="size-3 text-primary" />
                  Network directory
                </p>
                <h1 className="text-gradient mt-3 font-display text-[26px] font-semibold leading-tight tracking-tight sm:text-[34px]">
                  Districts &amp; service areas
                </h1>
                <p className="mt-2 max-w-xl text-[12.5px] leading-relaxed text-muted-foreground sm:text-sm">
                  Open a district to see its areas, then jump into the live FTTH map for that area with
                  every joint, link and fibre cut in place.
                </p>
              </div>

              <div className="flex w-full flex-col gap-2 sm:max-w-sm lg:w-auto">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/70" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search districts…"
                    className="h-10 rounded-xl pl-9 pr-9 text-[12.5px]"
                    aria-label="Search districts"
                  />
                  {search ? (
                    <button
                      type="button"
                      onClick={() => setSearch('')}
                      className="absolute right-1.5 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground"
                      aria-label="Clear search"
                    >
                      <X className="size-3" />
                    </button>
                  ) : null}
                </div>
                {isAdmin ? (
                  <Button onClick={() => setDialog({ district: null })} className="h-10">
                    <Plus className="size-4" />
                    New district
                  </Button>
                ) : (
                  <div className="flex items-center gap-2 rounded-xl border border-white/60 bg-white/45 px-3 py-2 text-[10.5px] text-muted-foreground dark:border-white/10 dark:bg-white/[0.03]">
                    <Waypoints className="size-3.5 text-emerald-500" />
                    Viewer seat · districts and areas are admin-managed
                  </div>
                )}
              </div>
            </div>

            <div className="relative mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Summary label="Districts" value={districts.length} icon={Layers} tone="text-primary" />
              <Summary label="Areas" value={totals.areas} icon={Waypoints} tone="text-sky-500" />
              <Summary label="Joints" value={totals.joints} icon={Cable} tone="text-teal-500" />
              <Summary
                label="Cuts"
                value={totals.cuts}
                icon={Scissors}
                tone={totals.cuts > 0 ? 'text-rose-500' : 'text-muted-foreground'}
              />
            </div>
          </section>

          {error ? (
            <div className="flex items-center gap-3 rounded-2xl border border-destructive/25 bg-destructive/10 px-4 py-3">
              <p className="min-w-0 flex-1 text-[12px] text-destructive">
                {error instanceof Error ? error.message : 'Could not load districts.'}
              </p>
              <Button size="sm" variant="ghost" onClick={() => mutate()} className="text-destructive">
                <RefreshCw className="size-3.5" />
                Retry
              </Button>
            </div>
          ) : null}

          <section className="space-y-3">
            <div className="flex items-end justify-between gap-3">
              <div>
                <h2 className="font-display text-[13px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Districts
                </h2>
                <p className="mt-1 text-[11.5px] text-muted-foreground">
                  {filtered.length} of {districts.length} shown · click a district to open its areas
                </p>
              </div>
              <span className="hidden font-mono text-[10px] text-muted-foreground sm:inline">
                {districts.length} districts · {totals.areas} areas
              </span>
            </div>

            {isLoading ? (
              <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                {[0, 1, 2, 3, 4, 5, 6, 7].map((index) => (
                  <Skeleton key={index} className="h-[168px] w-full rounded-3xl" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-border px-6 py-14 text-center">
                <Layers className="mx-auto size-6 text-muted-foreground/60" />
                <p className="mt-2 font-display text-[14px] font-semibold">
                  {districts.length === 0 ? 'No districts yet' : 'Nothing matches that search'}
                </p>
                <p className="mt-1 text-[11.5px] text-muted-foreground">
                  {districts.length === 0
                    ? isAdmin
                      ? 'Create your first district, then add the areas inside it.'
                      : 'Ask an admin to set up the district directory.'
                    : 'Try a different district name or code.'}
                </p>
                {districts.length === 0 && isAdmin ? (
                  <Button onClick={() => setDialog({ district: null })} className="mt-4">
                    <Plus className="size-4" />
                    New district
                  </Button>
                ) : null}
              </div>
            ) : (
              <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                {filtered.map((district, index) => (
                  <article
                    key={district.id}
                    className="group anim-rise relative overflow-hidden rounded-3xl border border-white/60 bg-white/55 p-4 shadow-[0_18px_50px_-38px_rgba(15,23,42,0.6)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_28px_60px_-34px_rgba(20,184,166,0.5)] dark:border-white/[0.08] dark:bg-white/[0.035]"
                    style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
                  >
                    <div
                      className={cn(
                        'pointer-events-none absolute inset-x-0 -top-20 h-36 bg-gradient-to-br opacity-80 blur-2xl transition-opacity duration-500 group-hover:opacity-100',
                        ACCENTS[index % ACCENTS.length],
                      )}
                    />

                    <Link href={`/districts/${district.id}`} className="relative block">
                      <div className="flex items-start gap-2.5 pr-8">
                        <span className="grid size-10 shrink-0 place-items-center rounded-2xl border border-white/60 bg-white/70 font-mono text-[10px] font-bold tracking-wider text-primary dark:border-white/10 dark:bg-white/[0.06]">
                          {district.code}
                        </span>
                        <div className="min-w-0">
                          <h3 className="truncate font-display text-[15px] font-semibold leading-tight">
                            {district.name}
                          </h3>
                          <p className="mt-1 line-clamp-1 text-[10.5px] text-muted-foreground">
                            {district.description ??
                              `${district.areaCount} ${pluralise(district.areaCount, 'service area')} mapped`}
                          </p>
                        </div>
                      </div>

                      <div className="mt-3.5 grid grid-cols-3 gap-2">
                        <Mini label="Areas" value={district.areaCount} />
                        <Mini label="Joints" value={district.tjCount} />
                        <Mini
                          label="Cuts"
                          value={district.cutCount}
                          tone={district.cutCount > 0 ? 'text-rose-500' : undefined}
                        />
                      </div>

                      <div className="mt-3 flex items-center justify-between text-[10px] text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5">
                          <Cable className="size-3" />
                          {district.linkCount} links
                        </span>
                        <span className="inline-flex items-center gap-1 font-semibold text-primary transition-all duration-300 group-hover:gap-1.5">
                          Open areas
                          <ChevronRight className="size-3.5" />
                        </span>
                      </div>
                    </Link>

                    {isAdmin ? (
                      <div className="absolute right-2 top-2 z-10 opacity-100 transition-opacity lg:opacity-0 lg:group-hover:opacity-100 lg:focus-within:opacity-100">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Manage ${district.name}`}
                              className="bg-white/50 dark:bg-white/[0.06]"
                            >
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuItem onClick={() => setDialog({ district })}>
                              <Pencil className="size-3.5" />
                              Edit district
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => setToDelete(district)}
                            >
                              <Trash2 className="size-3.5" />
                              Delete district
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="anim-rise flex flex-col gap-3 rounded-3xl border border-white/60 bg-gradient-to-r from-teal-400/[0.08] via-cyan-400/[0.05] to-violet-500/[0.08] p-4 sm:flex-row sm:items-center dark:border-white/[0.07]">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-2xl bg-gradient-to-br from-teal-400 to-cyan-600 text-slate-950 shadow-[0_12px_30px_-16px_rgba(20,184,166,0.9)]">
                <Waypoints className="size-5" />
              </span>
              <div>
                <p className="font-display text-[13px] font-semibold">Need the whole country?</p>
                <p className="text-[11px] text-muted-foreground">
                  The national map still shows every district, area and backbone link at once.
                </p>
              </div>
            </div>
            <Button asChild variant="subtle" size="sm" className="h-9 sm:ml-auto">
              <Link href="/map">
                Open national map
                <ArrowUpRight className="size-3.5" />
              </Link>
            </Button>
          </section>
        </main>
      </div>

      <DistrictDialog
        open={Boolean(dialog)}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
        district={dialog?.district ?? null}
        onSaved={async () => {
          await mutate();
        }}
      />

      <ConfirmDialog
        open={Boolean(toDelete)}
        onOpenChange={(open) => {
          if (!open) setToDelete(null);
        }}
        title={`Delete ${toDelete?.name ?? 'district'}?`}
        description="Every area inside this district is removed. Terminal joints stay on the national map but become unassigned."
        confirmLabel="Delete district"
        loading={deleting}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

function Summary({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  tone: string;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-2xl border border-white/55 bg-white/50 px-3 py-2 dark:border-white/[0.07] dark:bg-white/[0.03]">
      <span className={cn('grid size-8 place-items-center rounded-xl bg-white/60 dark:bg-white/[0.06]', tone)}>
        <Icon className="size-3.5" />
      </span>
      <div className="min-w-0">
        <p className="font-display text-[17px] font-semibold leading-none">{value}</p>
        <p className="mt-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {label}
        </p>
      </div>
    </div>
  );
}

function Mini({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-xl border border-white/55 bg-white/45 px-2 py-1.5 dark:border-white/[0.06] dark:bg-white/[0.02]">
      <p className={cn('font-display text-[14px] font-semibold leading-none', tone)}>{value}</p>
      <p className="mt-1 text-[8.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </p>
    </div>
  );
}
