'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import {
  ArrowLeft,
  ArrowUpRight,
  Cable,
  ChevronRight,
  Layers,
  Loader2,
  MapPin,
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
import { AreaDialog } from '@/components/directory/area-dialog';
import { DistrictDialog } from '@/components/directory/district-dialog';
import { ConfirmDialog } from '@/components/map/confirm-dialog';
import { BrandMark } from '@/components/brand';
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
import { api, ApiError, fetcher } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type { Area, District } from '@/lib/types';
import { cn } from '@/lib/utils';

export default function DistrictPage() {
  const params = useParams<{ id: string }>();
  const districtId = params?.id;
  const router = useRouter();
  const { status, isAdmin } = useAuth();

  const { data, error, isLoading, mutate } = useSWR<District>(
    status === 'authenticated' && districtId ? `/districts/${districtId}` : null,
    fetcher,
    { revalidateOnFocus: false, shouldRetryOnError: false },
  );

  const [search, setSearch] = useState('');
  const [areaDialog, setAreaDialog] = useState<{ area: Area | null } | null>(null);
  const [districtDialogOpen, setDistrictDialogOpen] = useState(false);
  const [areaToDelete, setAreaToDelete] = useState<Area | null>(null);
  const [deleteDistrict, setDeleteDistrict] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (status === 'anonymous') router.replace('/login');
  }, [status, router]);

  const areas = useMemo(() => data?.areas ?? [], [data]);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return areas;
    return areas.filter(
      (area) =>
        area.name.toLowerCase().includes(query) ||
        (area.code ?? '').toLowerCase().includes(query) ||
        (area.description ?? '').toLowerCase().includes(query),
    );
  }, [areas, search]);

  async function confirmDeleteArea() {
    if (!areaToDelete) return;
    setDeleting(true);
    try {
      await api.deleteArea(areaToDelete.id);
      toast.success(`${areaToDelete.name} deleted`, {
        description: 'Joints in this area stay on the network but become unassigned.',
      });
      setAreaToDelete(null);
      await mutate();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not delete this area');
    } finally {
      setDeleting(false);
    }
  }

  async function confirmDeleteDistrict() {
    if (!data) return;
    setDeleting(true);
    try {
      await api.deleteDistrict(data.id);
      toast.success(`${data.name} deleted`);
      router.replace('/');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not delete this district');
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
            Loading district
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
        <DirectoryHeader mapHref="/map" />

        <nav className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Link href="/" className="inline-flex items-center gap-1 transition hover:text-foreground">
            <ArrowLeft className="size-3.5" />
            Districts
          </Link>
          <ChevronRight className="size-3 opacity-50" />
          <span className="truncate font-medium text-foreground">{data?.name ?? 'District'}</span>
        </nav>

        {error ? (
          <div className="flex items-center gap-3 rounded-2xl border border-destructive/25 bg-destructive/10 px-4 py-3">
            <p className="min-w-0 flex-1 text-[12px] text-destructive">
              {error instanceof Error ? error.message : 'Could not load this district.'}
            </p>
            <Button size="sm" variant="ghost" onClick={() => mutate()} className="text-destructive">
              <RefreshCw className="size-3.5" />
              Retry
            </Button>
          </div>
        ) : null}

        <main className="flex-1 space-y-6">
          {isLoading && !data ? (
            <Skeleton className="h-[176px] w-full rounded-3xl" />
          ) : data ? (
            <section className="anim-rise relative overflow-hidden rounded-3xl border border-white/60 bg-gradient-to-br from-white/55 via-white/30 to-transparent p-5 sm:p-6 dark:border-white/[0.07] dark:from-white/[0.06] dark:via-white/[0.02]">
              <div className="pointer-events-none absolute -right-20 -top-24 size-60 rounded-full bg-violet-500/12 blur-3xl" />
              <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-lg border border-white/60 bg-white/70 px-2 py-0.5 font-mono text-[10px] font-bold tracking-wider text-primary dark:border-white/10 dark:bg-white/[0.06]">
                      {data.code}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-white/60 bg-white/50 px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground dark:border-white/10 dark:bg-white/[0.04]">
                      <MapPin className="size-2.5 text-primary" />
                      Bangladesh
                    </span>
                  </div>
                  <h1 className="text-gradient mt-2 font-display text-[26px] font-semibold leading-tight tracking-tight sm:text-[32px]">
                    {data.name}
                  </h1>
                  <p className="mt-2 max-w-2xl text-[12.5px] leading-relaxed text-muted-foreground">
                    {data.description ??
                      `${data.areaCount} service areas and ${data.tjCount} terminal joints in this district.`}
                  </p>
                </div>

                {isAdmin ? (
                  <div className="flex shrink-0 items-center gap-2">
                    <Button onClick={() => setAreaDialog({ area: null })} className="h-9">
                      <Plus className="size-4" />
                      New area
                    </Button>
                    <Button
                      variant="subtle"
                      size="icon"
                      onClick={() => setDistrictDialogOpen(true)}
                      aria-label="Edit district"
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteDistrict(true)}
                      aria-label="Delete district"
                      className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ) : null}
              </div>

              <div className="relative mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Stat label="Areas" value={data.areaCount} icon={Layers} tone="text-primary" />
                <Stat label="Joints" value={data.tjCount} icon={Waypoints} tone="text-sky-500" />
                <Stat label="Links" value={data.linkCount} icon={Cable} tone="text-teal-500" />
                <Stat
                  label="Cuts"
                  value={data.cutCount}
                  icon={Scissors}
                  tone={data.cutCount > 0 ? 'text-rose-500' : 'text-muted-foreground'}
                />
              </div>
            </section>
          ) : null}

          <section className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="font-display text-[13px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Service areas
                </h2>
                <p className="mt-1 text-[11.5px] text-muted-foreground">
                  {filtered.length} of {areas.length} areas · open an area for its live map
                </p>
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/70" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search areas…"
                  className="h-9 rounded-xl pl-9 pr-9 text-[12px]"
                  aria-label="Search areas"
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
            </div>

            {isLoading && areas.length === 0 ? (
              <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                {[0, 1, 2, 3].map((index) => (
                  <Skeleton key={index} className="h-[148px] w-full rounded-3xl" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-border px-6 py-14 text-center">
                <Layers className="mx-auto size-6 text-muted-foreground/60" />
                <p className="mt-2 font-display text-[14px] font-semibold">
                  {areas.length === 0 ? 'No areas in this district yet' : 'No areas match that search'}
                </p>
                <p className="mt-1 text-[11.5px] text-muted-foreground">
                  {areas.length === 0
                    ? isAdmin
                      ? 'Add the first area, then assign terminal joints to it from the map.'
                      : 'Ask an admin to add service areas here.'
                    : 'Try a different area name or code.'}
                </p>
                {areas.length === 0 && isAdmin ? (
                  <Button onClick={() => setAreaDialog({ area: null })} className="mt-4">
                    <Plus className="size-4" />
                    New area
                  </Button>
                ) : null}
              </div>
            ) : (
              <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                {filtered.map((area, index) => (
                  <article
                    key={area.id}
                    className="group anim-rise relative overflow-hidden rounded-3xl border border-white/60 bg-white/55 p-4 shadow-[0_18px_50px_-38px_rgba(15,23,42,0.6)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_28px_60px_-34px_rgba(20,184,166,0.5)] dark:border-white/[0.08] dark:bg-white/[0.035]"
                    style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
                  >
                    <Link href={`/areas/${area.id}`} className="relative block">
                      <div className="flex items-start gap-2.5 pr-8">
                        <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-white/60 bg-white/70 text-primary dark:border-white/10 dark:bg-white/[0.06]">
                          <MapPin className="size-4" />
                        </span>
                        <div className="min-w-0">
                          <h3 className="truncate font-display text-[14.5px] font-semibold leading-tight">
                            {area.name}
                          </h3>
                          <p className="mt-1 line-clamp-1 text-[10.5px] text-muted-foreground">
                            {area.description ??
                              (area.code ? `${area.districtCode} · ${area.code}` : area.districtName)}
                          </p>
                        </div>
                      </div>

                      <div className="mt-3 flex items-center gap-2 text-[10px] text-muted-foreground">
                        <span className="inline-flex items-center gap-1 rounded-full bg-teal-500/10 px-2 py-0.5 font-semibold text-teal-600 dark:text-teal-300">
                          <Waypoints className="size-2.5" />
                          {area.tjCount} joints
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Cable className="size-2.5" />
                          {area.linkCount} links
                        </span>
                        {area.cutCount > 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2 py-0.5 font-semibold text-rose-500">
                            <Scissors className="size-2.5" />
                            {area.cutCount}
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-3 flex items-center justify-between">
                        <span className="font-mono text-[9.5px] text-muted-foreground">
                          {area.lat !== null && area.lng !== null
                            ? `${area.lat.toFixed(3)}, ${area.lng.toFixed(3)}`
                            : 'No coordinates yet'}
                        </span>
                        <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-primary transition-all duration-300 group-hover:gap-1.5">
                          Open map
                          <ArrowUpRight className="size-3.5" />
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
                              aria-label={`Manage ${area.name}`}
                              className="bg-white/50 dark:bg-white/[0.06]"
                            >
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-40">
                            <DropdownMenuItem onClick={() => setAreaDialog({ area })}>
                              <Pencil className="size-3.5" />
                              Edit area
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => setAreaToDelete(area)}
                            >
                              <Trash2 className="size-3.5" />
                              Delete area
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
        </main>
      </div>

      {data ? (
        <>
          <AreaDialog
            open={Boolean(areaDialog)}
            onOpenChange={(open) => {
              if (!open) setAreaDialog(null);
            }}
            districtId={data.id}
            districtName={data.name}
            area={areaDialog?.area ?? null}
            onSaved={async () => {
              await mutate();
            }}
          />

          <DistrictDialog
            open={districtDialogOpen}
            onOpenChange={setDistrictDialogOpen}
            district={data}
            onSaved={async () => {
              await mutate();
            }}
          />

          <ConfirmDialog
            open={Boolean(areaToDelete)}
            onOpenChange={(open) => {
              if (!open) setAreaToDelete(null);
            }}
            title={`Delete ${areaToDelete?.name ?? 'area'}?`}
            description="The area is removed from this district. Terminal joints inside it stay on the network but become unassigned."
            confirmLabel="Delete area"
            loading={deleting}
            onConfirm={confirmDeleteArea}
          />

          <ConfirmDialog
            open={deleteDistrict}
            onOpenChange={setDeleteDistrict}
            title={`Delete ${data.name}?`}
            description="Every area in this district is removed. Terminal joints stay on the national map but become unassigned."
            confirmLabel="Delete district"
            loading={deleting}
            onConfirm={confirmDeleteDistrict}
          />
        </>
      ) : null}
    </div>
  );
}

function Stat({
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
        <p className="font-display text-[16px] font-semibold leading-none">{value}</p>
        <p className="mt-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {label}
        </p>
      </div>
    </div>
  );
}
