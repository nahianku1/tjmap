'use client';

import { useMemo } from 'react';
import { Cable, Link2, Plus, Search, ShieldCheck, Waypoints, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import type { FibreLink, Tj } from '@/lib/types';
import { cn, totalCores } from '@/lib/utils';
import type { MapMode } from '@/components/map/network-map';

export type TjFilter = 'all' | 'cut' | 'splitter' | 'linked';

const FILTERS: Array<{ id: TjFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'cut', label: 'Cuts' },
  { id: 'splitter', label: 'Splitters' },
  { id: 'linked', label: 'Linked' },
];

interface SidebarProps {
  tjs: Tj[];
  links: FibreLink[];
  loading: boolean;
  selectedId: string | null;
  filter: TjFilter;
  search: string;
  mode: MapMode;
  isAdmin: boolean;
  onSearchChange: (value: string) => void;
  onFilterChange: (value: TjFilter) => void;
  onSelect: (tj: Tj) => void;
  onAdd: () => void;
  onStartLink: () => void;
  onClose?: () => void;
}

export function Sidebar({
  tjs,
  links,
  loading,
  selectedId,
  filter,
  search,
  mode,
  isAdmin,
  onSearchChange,
  onFilterChange,
  onSelect,
  onAdd,
  onStartLink,
  onClose,
}: SidebarProps) {
  const spanCounts = useMemo(() => {
    const counts = new Map<string, number>();
    links.forEach((link) => {
      counts.set(link.fromTjId, (counts.get(link.fromTjId) ?? 0) + 1);
      counts.set(link.toTjId, (counts.get(link.toTjId) ?? 0) + 1);
    });
    return counts;
  }, [links]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return tjs
      .filter((tj) => {
        const matchesQuery =
          !query ||
          tj.code.toLowerCase().includes(query) ||
          (tj.name ?? '').toLowerCase().includes(query) ||
          (tj.address ?? '').toLowerCase().includes(query) ||
          (tj.fibreId ?? '').toLowerCase().includes(query);
        const spans = spanCounts.get(tj.id) ?? 0;
        const matchesFilter =
          filter === 'all' ||
          (filter === 'cut' && tj.isCut) ||
          (filter === 'splitter' && tj.splitter?.enabled) ||
          (filter === 'linked' && spans > 0);
        return matchesQuery && matchesFilter;
      })
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [tjs, search, filter, spanCounts]);

  const coreTotal = useMemo(() => tjs.reduce((sum, tj) => sum + totalCores(tj), 0), [tjs]);

  return (
    <div className="flex h-full flex-col bg-gradient-to-b from-white/30 to-transparent dark:from-white/[0.015]">
      <div className="flex items-center justify-between gap-2 px-4 pb-3 pt-4">
        <div className="flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-lg border border-white/60 bg-white/60 text-primary dark:border-white/10 dark:bg-white/5">
            <Waypoints className="size-3.5" />
          </span>
          <div>
            <p className="font-display text-[13px] font-semibold leading-tight">Network inventory</p>
            <p className="text-[10px] text-muted-foreground">
              {tjs.length} joints · {links.length} spans
            </p>
          </div>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="grid size-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-accent hover:text-foreground lg:hidden"
            aria-label="Close inventory"
          >
            <X className="size-4" />
          </button>
        ) : null}
      </div>

      <div className="space-y-3 px-4 pb-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/70" />
          <Input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search code, site, fibre ID…"
            className="h-9 rounded-lg pl-9 pr-9 text-[12px]"
            aria-label="Search terminal joints"
          />
          {search ? (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="absolute right-1.5 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="size-3" />
            </button>
          ) : null}
        </div>

        <div className="no-scrollbar flex gap-1 overflow-x-auto">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onFilterChange(item.id)}
              className={cn(
                'shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] transition-all duration-200',
                filter === item.id
                  ? 'border-primary/40 bg-primary/12 text-primary shadow-[0_0_0_3px_color-mix(in_oklab,var(--ring)_8%,transparent)]'
                  : 'border-white/60 bg-white/40 text-muted-foreground hover:border-primary/25 hover:text-foreground dark:border-white/10 dark:bg-white/[0.03]',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        {isAdmin ? (
          <div className="grid grid-cols-2 gap-2">
            <Button
              size="sm"
              className="h-8"
              variant={mode === 'add-tj' ? 'secondary' : 'default'}
              onClick={onAdd}
            >
              <Plus className="size-3.5" />
              Add TJ
            </Button>
            <Button
              size="sm"
              variant="subtle"
              className="h-8"
              onClick={onStartLink}
            >
              <Link2 className="size-3.5" />
              Link TJs
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-lg border border-white/60 bg-white/40 px-2.5 py-2 text-[10px] text-muted-foreground dark:border-white/10 dark:bg-white/[0.03]">
            <ShieldCheck className="size-3.5 text-emerald-500" />
            Read-only viewer seat · editing is admin-only
          </div>
        )}
      </div>

      <div className="scroll-slim min-h-0 flex-1 space-y-1 overflow-y-auto px-2.5 pb-4">
        {loading ? (
          <div className="space-y-2 px-1.5">
            {[0, 1, 2, 3, 4, 5].map((index) => (
              <Skeleton key={index} className="h-[74px] w-full" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="mx-1.5 mt-6 rounded-2xl border border-dashed border-border px-4 py-8 text-center">
            <Search className="mx-auto size-5 text-muted-foreground/60" />
            <p className="mt-2 text-[12px] font-medium">No joints match</p>
            <p className="mt-1 text-[10px] text-muted-foreground">Adjust the search or filters.</p>
          </div>
        ) : (
          filtered.map((tj) => (
            <button
              key={tj.id}
              type="button"
              onClick={() => onSelect(tj)}
              className={cn(
                'group relative w-full rounded-2xl border p-2.5 pl-3.5 text-left transition-all duration-200',
                tj.id === selectedId
                  ? 'border-primary/40 bg-primary/[0.08] shadow-[0_10px_30px_-18px_color-mix(in_oklab,var(--ring)_60%,transparent)]'
                  : 'border-transparent hover:border-white/70 hover:bg-white/55 dark:hover:border-white/10 dark:hover:bg-white/[0.045]',
              )}
            >
              <span
                className="absolute bottom-3 left-1.5 top-3 w-[3px] rounded-full transition-opacity"
                style={{
                  backgroundColor: tj.cores[0]?.color ?? '#22d3ee',
                  opacity: tj.id === selectedId ? 1 : 0.4,
                }}
              />

              <div className="flex items-center gap-2">
                <span className="font-mono text-[11px] font-semibold tracking-wide text-foreground">
                  {tj.code}
                </span>
                <div className="ml-auto flex items-center gap-1">
                  {tj.tjType === 'pon_power' ? (
                    <span className="rounded-md border border-amber-500/30 bg-amber-500/10 px-1.5 py-0 text-[8px] font-semibold text-amber-600 dark:text-amber-400">
                      PON
                    </span>
                  ) : null}
                  {tj.splitter?.enabled ? (
                    <Badge variant="splitter" className="px-1.5 py-0 text-[8px]">
                      {tj.splitter.ratio ?? 'SPL'}
                    </Badge>
                  ) : null}
                  {tj.isCut ? (
                    <Badge variant="cut" className="px-1.5 py-0 text-[8px]">
                      Cut
                    </Badge>
                  ) : null}
                </div>
              </div>

              <p className="mt-0.5 truncate text-[11.5px] text-foreground/85">
                {tj.name ?? 'Unnamed joint'}
              </p>

              <div className="mt-1.5 flex items-center gap-2">
                <div className="flex -space-x-1">
                  {tj.cores.slice(0, 4).map((core, index) => (
                    <span
                      key={`${core.label}-${index}`}
                      className="size-2.5 rounded-full border border-white/70 dark:border-slate-900"
                      style={{ backgroundColor: core.color }}
                    />
                  ))}
                  {tj.cores.length > 4 ? (
                    <span className="grid size-2.5 place-items-center rounded-full bg-muted text-[6px] font-bold text-muted-foreground">
                      +
                    </span>
                  ) : null}
                </div>
                <span className="text-[9.5px] text-muted-foreground">{totalCores(tj)} cores</span>
                <span className="ml-auto inline-flex items-center gap-1 text-[9.5px] text-muted-foreground">
                  <Cable className="size-3" />
                  {spanCounts.get(tj.id) ?? 0}
                </span>
              </div>
            </button>
          ))
        )}
      </div>

      <div className="flex items-center justify-between border-t border-white/40 px-4 py-3 text-[10px] text-muted-foreground dark:border-white/5">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-primary" />
          {coreTotal} cores tracked
        </span>
        <span className="font-mono">{filtered.length}/{tjs.length}</span>
      </div>
    </div>
  );
}
