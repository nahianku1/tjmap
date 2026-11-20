'use client';

import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Cable,
  ChevronRight,
  Download,
  Ellipsis,
  Layers,
  Link2,
  Pencil,
  Plus,
  Search,
  Server,
  Trash2,
  Upload,
  User,
  Waypoints,
  X,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { DeviceKind, FibreLink, LinkCore, Olt, Onu, SubArea, Tj } from '@/lib/types';
import { cn, formatDistance, totalCores } from '@/lib/utils';
import { displayCoreLabel } from '@/lib/fibre-cores';

export type DeviceFilter = 'all' | 'tj' | 'olt' | 'onu' | 'link';

interface InventorySlice {
  tjs: Tj[];
  olts: Olt[];
  onus: Onu[];
  links: FibreLink[];
}

interface InventoryTotals {
  tjs: number;
  olts: number;
  onus: number;
  links: number;
}

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

interface DeviceConnection {
  link: FibreLink;
  peerCode: string;
  peerKind: DeviceKind;
  atFrom: boolean;
}

/** The strand this link runs on: the first patched core, else the first core. */
function coreSummary(link: FibreLink): { core: LinkCore; strand: number; used: number } | null {
  const cores = link.cores ?? [];
  if (cores.length === 0) return null;
  const used = cores.filter(
    (core) => core.status === 'connected' || Boolean(core.fromCoreLabel && core.toCoreLabel),
  );
  const core = used[0] ?? cores[0];
  const index = Math.max(0, cores.indexOf(core));
  return { core, strand: Number(core.index) || index + 1, used: used.length };
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
  /** Current service area; sub-areas only exist inside an area. */
  areaId?: string | null;
  areaName?: string | null;
  subAreas?: SubArea[];
  isAdmin?: boolean;
  onCreateSubArea?: () => void;
  /** Sub-area ids whose layers are hidden on the map. */
  hiddenSubAreaIds?: string[];
  onToggleSubAreaVisibility?: (subAreaId: string, visible: boolean) => void;
  onEditSubArea?: (subArea: SubArea) => void;
  onDeleteSubArea?: (subArea: SubArea) => void;
  onExportSubArea?: (subArea: SubArea) => void;
  onImportSubArea?: (subArea: SubArea) => void;
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
  areaId = null,
  areaName = null,
  subAreas = [],
  isAdmin = false,
  onCreateSubArea,
  hiddenSubAreaIds = [],
  onToggleSubAreaVisibility,
  onEditSubArea,
  onDeleteSubArea,
  onExportSubArea,
  onImportSubArea,
}: SidebarProps) {
  const query = search.trim().toLowerCase();
  const listRef = useRef<HTMLDivElement>(null);
  const [expandedSubAreas, setExpandedSubAreas] = useState<string[]>([]);
  const hiddenSet = useMemo(() => new Set(hiddenSubAreaIds), [hiddenSubAreaIds]);

  const toggleSubAreaExpanded = (id: string) => {
    setExpandedSubAreas((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  };

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

  // Each device's links with the peer device they connect to.
  const connectionsByDevice = useMemo(() => {
    const map = new Map<string, DeviceConnection[]>();
    const push = (key: string, entry: DeviceConnection) => {
      const list = map.get(key);
      if (list) list.push(entry);
      else map.set(key, [entry]);
    };
    links.forEach((link) => {
      const fromId = link.fromTjId ?? link.fromOltId ?? link.fromOnuId;
      const toId = link.toTjId ?? link.toOltId ?? link.toOnuId;
      if (!fromId || !toId) return;
      const fromKey = `${link.fromKind}:${fromId}`;
      const toKey = `${link.toKind}:${toId}`;
      if (fromKey === toKey) return;
      push(fromKey, { link, peerCode: link.toCode, peerKind: link.toKind, atFrom: true });
      push(toKey, { link, peerCode: link.fromCode, peerKind: link.fromKind, atFrom: false });
    });
    map.forEach((list) =>
      list.sort((a, b) => a.peerCode.localeCompare(b.peerCode) || a.link.fibreId.localeCompare(b.link.fibreId)),
    );
    return map;
  }, [links]);

  const connectedLinks = (kind: DeviceKind, id: string): DeviceConnection[] => {
    const list = connectionsByDevice.get(`${kind}:${id}`) ?? [];
    if (!query) return list;
    return list.filter(({ link, peerCode }) =>
      matchesQuery(query, [
        link.fibreId,
        link.cableType,
        peerCode,
        link.fromCoreLabel,
        link.toCoreLabel,
        ...link.cores.map((core) => core.label),
      ]),
    );
  };

  const matchedTjs = useMemo(
    () =>
      tjs
        .filter((tj) =>
          matchesQuery(query, [
            tj.code,
            tj.name,
            tj.address,
            tj.fibreId,
            tj.subAreaName,
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
            olt.subAreaName,
            ...olt.ponPorts.map((port) => port.label),
            ...olt.ponPorts.map((port) => port.name ?? ''),
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
            onu.subAreaName,
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
          link.subAreaName,
          ...link.cores.map((core) => core.label),
        ]),
      ),
    [links, query],
  );

  const showTjs = filter === 'all' || filter === 'tj';
  const showOlts = filter === 'all' || filter === 'olt';
  const showOnus = filter === 'all' || filter === 'onu';
  const showLinks = filter === 'all' || filter === 'link';

  // Everything filed under each sub-area, so the map layer checkbox has a
  // matching inventory tree. Search narrows the groups just like the flat lists.
  const subAreaGroups = useMemo(
    () =>
      subAreas
        .map((subArea) => ({
          subArea,
          tjs: matchedTjs.filter((tj) => tj.subAreaId === subArea.id),
          olts: matchedOlts.filter((olt) => olt.subAreaId === subArea.id),
          onus: matchedOnus.filter((onu) => onu.subAreaId === subArea.id),
          links: matchedLinks.filter((link) => link.subAreaId === subArea.id),
          totals: {
            tjs: tjs.filter((tj) => tj.subAreaId === subArea.id).length,
            olts: olts.filter((olt) => olt.subAreaId === subArea.id).length,
            onus: onus.filter((onu) => onu.subAreaId === subArea.id).length,
            links: links.filter((link) => link.subAreaId === subArea.id).length,
          },
        }))
        .filter(
          (group) =>
            !query ||
            group.tjs.length + group.olts.length + group.onus.length + group.links.length > 0,
        ),
    [subAreas, matchedTjs, matchedOlts, matchedOnus, matchedLinks, tjs, olts, onus, links, query],
  );

  const unassigned = useMemo<InventorySlice>(
    () => ({
      tjs: matchedTjs.filter((tj) => !tj.subAreaId),
      olts: matchedOlts.filter((olt) => !olt.subAreaId),
      onus: matchedOnus.filter((onu) => !onu.subAreaId),
      links: matchedLinks.filter((link) => !link.subAreaId),
    }),
    [matchedTjs, matchedOlts, matchedOnus, matchedLinks],
  );
  const unassignedTotals = useMemo<InventoryTotals>(
    () => ({
      tjs: tjs.filter((tj) => !tj.subAreaId).length,
      olts: olts.filter((olt) => !olt.subAreaId).length,
      onus: onus.filter((onu) => !onu.subAreaId).length,
      links: links.filter((link) => !link.subAreaId).length,
    }),
    [tjs, olts, onus, links],
  );
  const unassignedCount =
    unassigned.tjs.length + unassigned.olts.length + unassigned.onus.length + unassigned.links.length;

  // Areas with sub-areas present every asset inside its sub-area card; the flat
  // type lists remain only where sub-areas do not apply (national map / empty area).
  const grouped = Boolean(areaId) && subAreas.length > 0;
  const unassignedKey = '__unassigned__';

  // The four inventory sections keep their full design; grouped mode just feeds
  // them a sub-area slice, flat mode feeds them the whole set.
  const renderTjSection = (list: Tj[], total: number) => {
    if (!showTjs || list.length === 0) return null;
    return (
      <section className="space-y-1">
        <SectionHeader
          icon={Waypoints}
          label="Terminal joints"
          shown={list.length}
          total={total}
        />
        {list.map((tj) => {
          const spans = spanCounts.get(tj.id) ?? 0;
          const active = tj.id === selectedId;
          return (
            <Fragment key={tj.id}>
            <button
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
                  {tj.subAreaName ? (
                    <span className="truncate text-primary/80">{tj.subAreaName}</span>
                  ) : null}
                  <span className="ml-auto inline-flex items-center gap-1">
                    <Cable className="size-3" />
                    {spans} {spans === 1 ? 'link' : 'links'}
                  </span>
                </div>
              </div>
            </button>
            <DeviceLinkList
              entries={connectedLinks('tj', tj.id)}
              query={query}
              selectedLinkId={selectedLinkId}
              onSelectLink={onSelectLink}
            />
            </Fragment>
          );
        })}
      </section>
    );
  };

  const renderOltSection = (list: Olt[], total: number) => {
    if (!showOlts || list.length === 0) return null;
    return (
      <section className="space-y-1">
        <SectionHeader icon={Server} label="OLT cabinets" shown={list.length} total={total} />
        {list.map((olt) => {
          const active = olt.id === selectedOltId;
          const ponUsed = olt.ponPorts.filter((port) => port.status === 'in_use').length;
          return (
            <Fragment key={olt.id}>
            <button
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
                  {olt.subAreaName ? (
                    <span className="truncate text-primary/80">{olt.subAreaName}</span>
                  ) : null}
                  <span className="ml-auto inline-flex items-center gap-1">
                    <Cable className="size-3" />
                    {olt.tjCount} joints
                  </span>
                </div>
              </div>
            </button>
            <DeviceLinkList
              entries={connectedLinks('olt', olt.id)}
              query={query}
              selectedLinkId={selectedLinkId}
              onSelectLink={onSelectLink}
            />
            </Fragment>
          );
        })}
      </section>
    );
  };

  const renderOnuSection = (list: Onu[], total: number) => {
    if (!showOnus || list.length === 0) return null;
    return (
      <section className="space-y-1">
        <SectionHeader icon={User} label="ONUs" shown={list.length} total={total} />
        {list.map((onu) => {
          const active = onu.id === selectedOnuId;
          const used = onu.cores.filter((core) => core.status === 'in_use').length;
          const free = Math.max(0, onu.cores.length - used);
          return (
            <Fragment key={onu.id}>
            <button
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
                  {onu.subAreaName ? (
                    <span className="truncate text-primary/80">
                      <Highlight text={onu.subAreaName} query={query} />
                    </span>
                  ) : null}
                  <span className="ml-auto shrink-0">
                    {used}/{onu.cores.length} used · {free} free
                  </span>
                </div>
              </div>
            </button>
            <DeviceLinkList
              entries={connectedLinks('onu', onu.id)}
              query={query}
              selectedLinkId={selectedLinkId}
              onSelectLink={onSelectLink}
            />
            </Fragment>
          );
        })}
      </section>
    );
  };

  const renderLinkSection = (list: FibreLink[], total: number) => {
    if (!showLinks || list.length === 0) return null;
    return (
      <section className="space-y-1">
        <SectionHeader icon={Link2} label="Fibre links" shown={list.length} total={total} />
        {list.map((link) => {
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
                  <span className="min-w-0 truncate text-[10.5px] font-semibold text-foreground">
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
                <LinkCoreLine link={link} query={query} />
                <div className="mt-1 flex items-center gap-2 text-[9.5px] text-muted-foreground">
                  <span>
                    {link.coreCount} core{link.coreCount === 1 ? '' : 's'}
                  </span>
                  <span>{formatDistance(link.lengthM)}</span>
                  {link.subAreaName ? (
                    <span className="truncate text-primary/80">
                      <Highlight text={link.subAreaName} query={query} />
                    </span>
                  ) : null}
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
    );
  };

  const renderGroupRows = (group: InventorySlice & { totals: InventoryTotals }) => {
    const total = group.tjs.length + group.olts.length + group.onus.length + group.links.length;
    if (total === 0) {
      return (
        <p className="px-1.5 py-1 text-[9.5px] text-muted-foreground">
          No devices or links filed here yet.
        </p>
      );
    }
    const anyShown =
      (showTjs && group.tjs.length > 0) ||
      (showOlts && group.olts.length > 0) ||
      (showOnus && group.onus.length > 0) ||
      (showLinks && group.links.length > 0);
    if (!anyShown) {
      return (
        <p className="px-1.5 py-1 text-[9.5px] text-muted-foreground">
          Nothing here for this filter.
        </p>
      );
    }
    return (
      <>
        {renderTjSection(group.tjs, group.totals.tjs)}
        {renderOltSection(group.olts, group.totals.olts)}
        {renderOnuSection(group.onus, group.totals.onus)}
        {renderLinkSection(group.links, group.totals.links)}
      </>
    );
  };

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

      {areaId ? (
        <div className="space-y-1.5 px-4 pb-3">
          <div className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            <Layers className="size-3" />
            {areaName ? `${areaName} sub-areas` : 'Sub-areas'}
            <span className="ml-auto font-mono text-[9px] font-normal normal-case tracking-normal">
              {subAreas.length}
            </span>
            {isAdmin && onCreateSubArea ? (
              <button
                type="button"
                onClick={onCreateSubArea}
                aria-label="Create sub-area"
                title="Create sub-area"
                className="grid size-6 place-items-center rounded-md border border-white/60 bg-white/50 text-primary transition hover:border-primary/40 hover:bg-primary/10 dark:border-white/10 dark:bg-white/[0.04]"
              >
                <Plus className="size-3" />
              </button>
            ) : null}
          </div>

          {subAreas.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border px-2.5 py-2 text-[10px] text-muted-foreground">
              No sub-areas yet.
              {isAdmin && onCreateSubArea ? ' Create one to group devices and links.' : ''}
            </p>
          ) : null}
        </div>
      ) : null}

      <div
        ref={listRef}
        className="scroll-slim min-h-0 flex-1 space-y-3 overflow-y-auto px-2.5 pb-4"
      >
        {grouped ? (
          <section className="space-y-1.5">
            {subAreaGroups.map((group) => {
              const id = group.subArea.id;
              const expanded = expandedSubAreas.includes(id);
              const hidden = hiddenSet.has(id);
              const deviceCount = group.tjs.length + group.olts.length + group.onus.length;
              return (
                <GroupCard
                  key={id}
                  title={group.subArea.name}
                  icon={Layers}
                  meta={`${deviceCount}d · ${group.links.length}l`}
                  expanded={expanded}
                  onToggle={() => toggleSubAreaExpanded(id)}
                  hidden={hidden}
                  visibility={{
                    checked: !hidden,
                    label: `${hidden ? 'Show' : 'Hide'} ${group.subArea.name} on the map`,
                    onChange: (visible) => onToggleSubAreaVisibility?.(id, visible),
                  }}
                  actions={
                    onEditSubArea || onDeleteSubArea || onExportSubArea || onImportSubArea ? (
                      <SubAreaActions
                        subArea={group.subArea}
                        isAdmin={isAdmin}
                        onEdit={onEditSubArea}
                        onDelete={onDeleteSubArea}
                        onExport={onExportSubArea}
                        onImport={onImportSubArea}
                      />
                    ) : null
                  }
                >
                  {renderGroupRows(group)}
                </GroupCard>
              );
            })}

            {unassignedCount > 0 ? (
              <GroupCard
                title="Unassigned"
                icon={Layers}
                meta={`${
                  unassigned.tjs.length + unassigned.olts.length + unassigned.onus.length
                }d · ${unassigned.links.length}l`}
                expanded={expandedSubAreas.includes(unassignedKey)}
                onToggle={() => toggleSubAreaExpanded(unassignedKey)}
                hint="Not filed under any sub-area"
              >
                {renderGroupRows({ ...unassigned, totals: unassignedTotals })}
              </GroupCard>
            ) : null}
          </section>
        ) : null}

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
        ) : grouped ? null : (
          <>
            {renderTjSection(matchedTjs, tjs.length)}

            {renderOltSection(matchedOlts, olts.length)}

            {renderOnuSection(matchedOnus, onus.length)}

            {renderLinkSection(matchedLinks, links.length)}
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

function LinkCoreLine({
  link,
  atFrom,
  query,
  className,
}: {
  link: FibreLink;
  /** Show the core patched at the from end first (device-level rows). */
  atFrom?: boolean;
  query: string;
  className?: string;
}) {
  const summary = coreSummary(link);
  if (!summary) return null;
  const { core, strand, used } = summary;
  const hostLabel =
    atFrom === undefined ? link.fromCoreLabel : atFrom ? core.fromCoreLabel : core.toCoreLabel;
  const peerLabel =
    atFrom === undefined ? link.toCoreLabel : atFrom ? core.toCoreLabel : core.fromCoreLabel;

  return (
    <span
      className={cn(
        'flex w-full min-w-0 items-center gap-1 text-[8.5px] text-muted-foreground',
        className,
      )}
    >
      <span
        className="size-2 shrink-0 rounded-full border border-white/70 dark:border-slate-900"
        style={{ backgroundColor: core.color || '#22d3ee' }}
      />
      <span className="min-w-0 truncate text-[9px] font-medium text-foreground/80">
        <Highlight text={displayCoreLabel(core.label, strand)} query={query} />
      </span>
      {used > 1 ? <span className="shrink-0 text-[8px]">+{used - 1}</span> : null}
      <span className="ml-auto min-w-0 shrink truncate text-right font-mono text-[8.5px]">
        <Highlight text={hostLabel ?? 'unpatched'} query={query} />
        <span className="mx-0.5">→</span>
        <Highlight text={peerLabel ?? 'unpatched'} query={query} />
      </span>
    </span>
  );
}

function DeviceLinkList({
  entries,
  query,
  selectedLinkId,
  onSelectLink,
}: {
  entries: DeviceConnection[];
  query: string;
  selectedLinkId?: string | null;
  onSelectLink?: (link: FibreLink) => void;
}) {
  if (entries.length === 0) return null;
  return (
    <ul className="ml-[1.35rem] space-y-0.5 border-l border-dashed border-border/80 pl-3">
      {entries.map(({ link, peerCode, peerKind, atFrom }) => {
        const PeerIcon = peerKind === 'olt' ? Server : peerKind === 'onu' ? User : Waypoints;
        const active = link.id === selectedLinkId;
        return (
          <li key={link.id}>
            <button
              type="button"
              onClick={() => onSelectLink?.(link)}
              title={`Open link ${link.fibreId}`}
              className={cn(
                'flex w-full flex-col gap-0.5 rounded-lg px-1.5 py-1 text-left transition-colors',
                active
                  ? 'bg-violet-500/12 text-foreground'
                  : 'text-muted-foreground hover:bg-white/55 hover:text-foreground dark:hover:bg-white/[0.045]',
              )}
            >
              <span className="flex w-full items-center gap-1.5">
                <span
                  className={cn('size-1.5 shrink-0 rounded-full', link.status === 'cut' && 'bg-rose-500')}
                  style={link.status === 'cut' ? undefined : { backgroundColor: link.color ?? '#22d3ee' }}
                />
                <span className="min-w-0 truncate font-mono text-[9.5px] font-semibold text-foreground/85">
                  <Highlight text={link.fibreId} query={query} />
                </span>
                <span className="ml-auto inline-flex min-w-0 items-center gap-1 text-[9.5px]">
                  <PeerIcon
                    className={cn(
                      'size-3 shrink-0',
                      peerKind === 'olt'
                        ? 'text-sky-500'
                        : peerKind === 'onu'
                          ? 'text-amber-500'
                          : 'text-primary',
                    )}
                  />
                  <span className="truncate">
                    <Highlight text={peerCode} query={query} />
                  </span>
                </span>
                {link.status === 'cut' ? (
                  <span className="shrink-0 rounded bg-rose-500/12 px-1 text-[7.5px] font-bold uppercase tracking-wide text-rose-500">
                    cut
                  </span>
                ) : null}
              </span>
              <LinkCoreLine link={link} atFrom={atFrom} query={query} className="pl-3" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function SubAreaActions({
  subArea,
  isAdmin,
  onEdit,
  onDelete,
  onExport,
  onImport,
}: {
  subArea: SubArea;
  isAdmin: boolean;
  onEdit?: (subArea: SubArea) => void;
  onDelete?: (subArea: SubArea) => void;
  onExport?: (subArea: SubArea) => void;
  onImport?: (subArea: SubArea) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Actions for ${subArea.name}`}
          title="Sub-area actions"
          className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Ellipsis className="size-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[170px]">
        <DropdownMenuItem
          disabled={!isAdmin || !onEdit}
          onSelect={() => onEdit?.(subArea)}
          className="gap-2 text-[12px]"
        >
          <Pencil className="size-3.5 text-muted-foreground" />
          Edit sub-area
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!onExport}
          onSelect={() => onExport?.(subArea)}
          className="gap-2 text-[12px]"
        >
          <Download className="size-3.5 text-muted-foreground" />
          Export
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!isAdmin || !onImport}
          onSelect={() => onImport?.(subArea)}
          className="gap-2 text-[12px]"
        >
          <Upload className="size-3.5 text-muted-foreground" />
          Import
        </DropdownMenuItem>
        {isAdmin ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={!onDelete}
              onSelect={() => onDelete?.(subArea)}
              className="gap-2 text-[12px] text-destructive focus:text-destructive"
            >
              <Trash2 className="size-3.5" />
              Delete sub-area
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function GroupCard({
  title,
  icon: Icon,
  meta,
  expanded,
  onToggle,
  hidden = false,
  hint,
  visibility,
  actions,
  children,
}: {
  title: string;
  icon: LucideIcon;
  meta: string;
  expanded: boolean;
  onToggle: () => void;
  hidden?: boolean;
  hint?: string;
  visibility?: { checked: boolean; label: string; onChange: (visible: boolean) => void };
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border transition-colors',
        hidden
          ? 'border-white/40 bg-white/20 dark:border-white/[0.06] dark:bg-white/[0.015]'
          : 'border-white/70 bg-white/45 dark:border-white/10 dark:bg-white/[0.04]',
      )}
    >
      <div className="flex items-center gap-2 px-2 py-1.5">
        {visibility ? (
          <input
            type="checkbox"
            checked={visibility.checked}
            onChange={(event) => visibility.onChange(event.target.checked)}
            aria-label={visibility.label}
            title={visibility.checked ? 'Hide from the map' : 'Show on the map'}
            className="size-3.5 shrink-0 cursor-pointer accent-[var(--primary)]"
          />
        ) : null}
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          title={hint}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
        >
          <ChevronRight
            className={cn(
              'size-3.5 shrink-0 text-muted-foreground transition-transform',
              expanded && 'rotate-90',
            )}
          />
          <Icon
            className={cn(
              'size-3 shrink-0',
              hidden || !visibility ? 'text-muted-foreground/60' : 'text-teal-500',
            )}
          />
          <span
            className={cn(
              'truncate text-[10.5px] font-semibold',
              hidden ? 'text-muted-foreground' : 'text-foreground',
            )}
          >
            {title}
          </span>
          <span className="ml-auto shrink-0 font-mono text-[8.5px] text-muted-foreground">
            {meta}
          </span>
        </button>
        {actions}
      </div>

      {expanded ? (
        <div
          className={cn(
            'space-y-3 border-t border-border/50 p-1.5',
            hidden && 'opacity-55',
          )}
        >
          {children}
        </div>
      ) : null}
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
