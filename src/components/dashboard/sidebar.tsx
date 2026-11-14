'use client';

import { useEffect, useMemo, useRef } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Cable, Link2, Search, Server, User, Waypoints, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import type { FibreLink, Olt, Onu, Tj } from '@/lib/types';
import { cn, formatDistance, totalCores } from '@/lib/utils';

export type DeviceFilter = 'all' | 'tj' | 'olt' | 'onu' | 'link';

const FILTERS: Array<{ id: DeviceFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'tj', label: 'TJ' },
  { id: 'olt', label: 'OLT' },
  { id: 'onu', label: 'ONU' },
  { id: 'link', label: 'Links' },
];

const MARK_CLASS =
  'rounded-[3px] bg-amber-300/85 px-0.5 font-semibold text-slate-950 dark:bg-amber-400/35 dark:text-amber-50';

function Highlight({ text, query }: { text: string | null | undefined; query: string }) {
  if (!text) return null;
  if (!query) return <>{text}</>;
  const index = text.toLowerCase().indexOf(query);
  if (index === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, index)}
      <mark className={MARK_CLASS}>{text.slice(index, index + query.length)}</mark>
      {text.slice(index + query.length)}
    </>
  );
}

function matchesQuery(
  query: string,
  values: Array<string | number | null | undefined>,
): boolean {
  if (!query) return true;
  return values.some(
    (value) => value !== null && value !== undefined && String(value).toLowerCase().includes(query),
  );
}

function rowClass(active: boolean, matched: boolean): string {
  return cn(
    'flex w-full items-center gap-2.5 rounded-2xl border p-2 text-left transition-all duration-200',
    active
      ? 'border-primary/40 bg-primary/[0.08] shadow-[0_10px_30px_-18px_color-mix(in_oklab,var(--ring)_60%,transparent)]'
      : matched
        ? 'border-amber-500/55 bg-amber-300/25 shadow-[0_0_0_2px_color-mix(in_oklab,#f59e0b_22%,transparent)] dark:border-amber-400/40 dark:bg-amber-400/10'
        : 'border-transparent hover:border-white/70 hover:bg-white/55 dark:hover:border-white/10 dark:hover:bg-white/[0.045]',
  );
}

interface SidebarProps {
  tjs: Tj[];
  olts: Olt[];
  onus: Onu[];
  links: FibreLink[];
  loading: boolean;
  selectedId: string | null;
  selectedLinkId?: string | null;
  selectedOltId?: string | null;
  selectedOnuId?: string | null;
  filter: DeviceFilter;
  search: string;
  onSearchChange: (value: string) => void;
  onFilterChange: (value: DeviceFilter) => void;
  onSelect: (tj: Tj) => void;
  onSelectOlt?: (olt: Olt) => void;
  onSelectOnu?: (onu: Onu) => void;
  onSelectLink?: (link: FibreLink) => void;
  onClose?: () => void;
}

export function Sidebar({
  tjs,
  olts,
  onus,
  links,
  loading,
  selectedId,
  selectedLinkId = null,
  selectedOltId = null,
  selectedOnuId = null,
  filter,
  search,
  onSearchChange,
  onFilterChange,
  onSelect,
  onSelectOlt,
  onSelectOnu,
  onSelectLink,
  onClose,
}: SidebarProps) {
  const query = search.trim().toLowerCase();
  const listRef = useRef<HTMLDivElement>(null);

  // New results start at the top of the list instead of leaving the old scroll.
  useEffect(() => {
    listRef.current?.scrollTo({ top: 0 });
  }, [query]);

  // Links attached to each terminal joint, for the row's span count.
  const spanCounts = useMemo(() => {
    const counts = new Map<string, number>();
    links.forEach((link) => {
      if (link.fromTjId) counts.set(link.fromTjId, (counts.get(link.fromTjId) ?? 0) + 1);
      if (link.toTjId) counts.set(link.toTjId, (counts.get(link.toTjId) ?? 0) + 1);
    });
    return counts;
  }, [links]);

  const matchedTjs = useMemo(
    () =>
      tjs
        .filter((tj) =>
          matchesQuery(query, [
            tj.code,
            tj.name,
            tj.address,
            tj.fibreId,
            ...tj.cores.map((core) => core.label),
            ...(tj.userFibres ?? []).map((fibre) => fibre.id),
          ]),
        )
        .sort((a, b) => a.code.localeCompare(b.code)),
    [tjs, query],
  );

  const matchedOlts = useMemo(
    () =>
      olts
        .filter((olt) =>
          matchesQuery(query, [
            olt.code,
            olt.name,
            olt.ponPort,
            olt.uplinkPort,
            olt.areaName,
            ...olt.ponPorts.map((port) => port.label),
          ]),
        )
        .sort((a, b) => a.code.localeCompare(b.code)),
    [olts, query],
  );

  const matchedOnus = useMemo(
    () =>
      onus
        .filter((onu) =>
          matchesQuery(query, [
            onu.username,
            onu.fibreId,
            onu.macAddress,
            onu.vlanId,
            onu.vlanId != null ? `vlan ${onu.vlanId}` : null,
            onu.notes,
            ...onu.cores.map((core) => core.label),
          ]),
        )
        .sort((a, b) => a.username.localeCompare(b.username)),
    [onus, query],
  );

  const matchedLinks = useMemo(
    () =>
      links.filter((link) =>
        matchesQuery(query, [
          link.fibreId,
          link.cableType,
          link.fromCode,
          link.toCode,
          link.fromName,
          link.toName,
          link.fromCoreLabel,
          link.toCoreLabel,
          link.notes,
          ...link.cores.map((core) => core.label),
        ]),
      ),
    [links, query],
  );

  const showTjs = filter === 'all' || filter === 'tj';
  const showOlts = filter === 'all' || filter === 'olt';
  const showOnus = filter === 'all' || filter === 'onu';
  const showLinks = filter === 'all' || filter === 'link';

  const shownCount =
    (showTjs ? matchedTjs.length : 0) +
    (showOlts ? matchedOlts.length : 0) +
    (showOnus ? matchedOnus.length : 0) +
    (showLinks ? matchedLinks.length : 0);
  const totalDevices = tjs.length + olts.length + onus.length + links.length;
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
              {tjs.length} TJ · {olts.length} OLT · {onus.length} ONU · {links.length} links
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
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
      </div>

      <div className="space-y-3 px-4 pb-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/70" />
          <Input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search name, code, fibre ID, MAC…"
            className="h-9 rounded-lg pl-9 pr-9 text-[12px]"
            aria-label="Search joints, OLTs, ONUs and links"
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
      </div>

      <div
        ref={listRef}
        className="scroll-slim min-h-0 flex-1 space-y-3 overflow-y-auto px-2.5 pb-4"
      >
        {loading ? (
          <div className="space-y-2 px-1.5">
            {[0, 1, 2, 3, 4, 5].map((index) => (
              <Skeleton key={index + 100} className="h-[58px] w-full" />
            ))}
          </div>
        ) : shownCount === 0 ? (
          <div className="mx-1.5 mt-6 rounded-2xl border border-dashed border-border px-4 py-8 text-center">
            <Search className="mx-auto size-5 text-muted-foreground/60" />
            <p className="mt-2 text-[12px] font-medium">No devices match</p>
            <p className="mt-1 text-[10px] text-muted-foreground">
              Try a name, code, fibre ID, MAC or core label.
            </p>
          </div>
        ) : (
          <>
            {showTjs && matchedTjs.length > 0 ? (
              <section className="space-y-1">
                <SectionHeader
                  icon={Waypoints}
                  label="Terminal joints"
                  shown={matchedTjs.length}
                  total={tjs.length}
                />
                {matchedTjs.map((tj) => {
                  const spans = spanCounts.get(tj.id) ?? 0;
                  const active = tj.id === selectedId;
                  return (
                    <button
                      key={tj.id}
                      type="button"
                      onClick={() => onSelect(tj)}
                      className={rowClass(active, Boolean(query))}
                    >
                      <span className="grid size-8 shrink-0 place-items-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                        <Waypoints className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate font-mono text-[11px] font-semibold text-foreground">
                            <Highlight text={tj.code} query={query} />
                          </span>
                          <div className="ml-auto flex shrink-0 items-center gap-1">
                            {tj.tjType === 'pon_power' ? (
                              <span className="rounded-md border border-amber-500/30 bg-amber-500/10 px-1.5 text-[8px] font-semibold text-amber-600 dark:text-amber-400">
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
                        <p className="truncate text-[11px] text-foreground/80">
                          <Highlight text={tj.name ?? 'Unnamed joint'} query={query} />
                        </p>
                        <div className="mt-1 flex items-center gap-2 text-[9.5px] text-muted-foreground">
                          <div className="flex -space-x-1">
                            {tj.cores.slice(0, 4).map((core, index) => (
                              <span
                                key={`${core.label}-${index}`}
                                className="size-2.5 rounded-full border border-white/70 dark:border-slate-900"
                                style={{ backgroundColor: core.color }}
                              />
                            ))}
                          </div>
                          <span>{totalCores(tj)} cores</span>
                          <span className="ml-auto inline-flex items-center gap-1">
                            <Cable className="size-3" />
                            {spans} {spans === 1 ? 'link' : 'links'}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </section>
            ) : null}

            {showOlts && matchedOlts.length > 0 ? (
              <section className="space-y-1">
                <SectionHeader
                  icon={Server}
                  label="OLT cabinets"
                  shown={matchedOlts.length}
                  total={olts.length}
                />
                {matchedOlts.map((olt) => {
                  const active = olt.id === selectedOltId;
                  const ponUsed = olt.ponPorts.filter((port) => port.status === 'in_use').length;
                  return (
                    <button
                      key={olt.id}
                      type="button"
                      onClick={() => onSelectOlt?.(olt)}
                      className={rowClass(active, Boolean(query))}
                    >
                      <span className="grid size-8 shrink-0 place-items-center rounded-xl border border-sky-500/20 bg-sky-500/10 text-sky-600 dark:text-sky-300">
                        <Server className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate font-mono text-[11px] font-semibold text-foreground">
                            <Highlight text={olt.code} query={query} />
                          </span>
                          {olt.lat === null || olt.lng === null ? (
                            <span className="ml-auto shrink-0 rounded-md border border-amber-500/30 bg-amber-500/10 px-1.5 text-[8px] font-semibold text-amber-600 dark:text-amber-400">
                              No pin
                            </span>
                          ) : null}
                        </div>
                        <p className="truncate text-[11px] text-foreground/80">
                          <Highlight text={olt.name} query={query} />
                        </p>
                        <div className="mt-1 flex items-center gap-2 text-[9.5px] text-muted-foreground">
                          <span>
                            {ponUsed}/{olt.ponPorts.length} PON
                          </span>
                          <span className="ml-auto inline-flex items-center gap-1">
                            <Cable className="size-3" />
                            {olt.tjCount} joints
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </section>
            ) : null}

            {showOnus && matchedOnus.length > 0 ? (
              <section className="space-y-1">
                <SectionHeader
                  icon={User}
                  label="ONUs"
                  shown={matchedOnus.length}
                  total={onus.length}
                />
                {matchedOnus.map((onu) => {
                  const active = onu.id === selectedOnuId;
                  const used = onu.cores.filter((core) => core.status === 'in_use').length;
                  const free = Math.max(0, onu.cores.length - used);
                  return (
                    <button
                      key={onu.id}
                      type="button"
                      onClick={() => onSelectOnu?.(onu)}
                      className={rowClass(active, Boolean(query))}
                    >
                      <span className="grid size-8 shrink-0 place-items-center rounded-xl border border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-300">
                        <User className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate font-mono text-[11px] font-semibold text-foreground">
                            <Highlight text={onu.username} query={query} />
                          </span>
                          {onu.lat === null || onu.lng === null ? (
                            <span className="ml-auto shrink-0 rounded-md border border-amber-500/30 bg-amber-500/10 px-1.5 text-[8px] font-semibold text-amber-600 dark:text-amber-400">
                              No pin
                            </span>
                          ) : null}
                        </div>
                        <p className="truncate text-[11px] text-foreground/80">
                          <Highlight text={onu.fibreId} query={query} />
                        </p>
                        <div className="mt-1 flex items-center gap-2 text-[9.5px] text-muted-foreground">
                          {onu.vlanId != null ? <span>VLAN {onu.vlanId}</span> : null}
                          {onu.macAddress ? (
                            <span className="truncate font-mono">
                              <Highlight text={onu.macAddress} query={query} />
                            </span>
                          ) : null}
                          <span className="ml-auto shrink-0">
                            {used}/{onu.cores.length} used · {free} free
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </section>
            ) : null}

            {showLinks && matchedLinks.length > 0 ? (
              <section className="space-y-1">
                <SectionHeader
                  icon={Link2}
                  label="Fibre links"
                  shown={matchedLinks.length}
                  total={links.length}
                />
                {matchedLinks.map((link) => {
                  const active = link.id === selectedLinkId;
                  return (
                    <button
                      key={link.id}
                      type="button"
                      onClick={() => onSelectLink?.(link)}
                      className={rowClass(active, Boolean(query))}
                      title={`Open link ${link.fibreId}`}
                    >
                      <span className="grid size-8 shrink-0 place-items-center rounded-xl border border-violet-500/20 bg-violet-500/10 text-violet-600 dark:text-violet-300">
                        <Link2 className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-[10.5px] font-semibold text-foreground">
                            <Highlight text={link.fromCode} query={query} />
                            <span className="mx-1 text-muted-foreground">→</span>
                            <Highlight text={link.toCode} query={query} />
                          </span>
                          <Badge
                            variant={link.status === 'cut' ? 'cut' : 'default'}
                            className="ml-auto shrink-0 px-1.5 py-0 text-[8px]"
                          >
                            {link.status}
                          </Badge>
                        </div>
                        <p className="truncate font-mono text-[10px] text-foreground/75">
                          <Highlight text={link.fibreId} query={query} />
                        </p>
                        <div className="mt-1 flex items-center gap-2 text-[9.5px] text-muted-foreground">
                          <span>
                            {link.coreCount} core{link.coreCount === 1 ? '' : 's'}
                          </span>
                          <span>{formatDistance(link.lengthM)}</span>
                          <span className="ml-auto inline-flex items-center gap-1">
                            <Cable className="size-3" />
                            {link.fromKind.toUpperCase()} → {link.toKind.toUpperCase()}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </section>
            ) : null}
          </>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-white/40 px-4 py-3 text-[10px] text-muted-foreground dark:border-white/5">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-primary" />
          {coreTotal} cores tracked
        </span>
        <span className="font-mono">
          {shownCount}/{totalDevices}
        </span>
      </div>
    </div>
  );
}

function SectionHeader({
  icon: Icon,
  label,
  shown,
  total,
}: {
  icon: LucideIcon;
  label: string;
  shown: number;
  total: number;
}) {
  return (
    <div className="flex items-center gap-1.5 px-1.5 pb-1 pt-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
      <Icon className="size-3" />
      {label}
      <span className="ml-auto font-mono text-[9px] font-normal normal-case tracking-normal">
        {shown}
        {shown !== total ? `/${total}` : ''}
      </span>
    </div>
  );
}
