'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Cable,
  Crosshair,
  Loader2,
  MapPin,
  Route as RouteIcon,
  Search,
  TriangleAlert,
  X,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { searchLocationSuggestions, type SearchResultItem } from '@/lib/geocoding';
import {
  buildRouteNodes,
  parseCoordinates,
  routeKey,
  type RouteNode,
  type ShortestRoute,
} from '@/lib/route-graph';
import type { StreetState } from '@/lib/street-route';
import type { Olt, Onu, Tj } from '@/lib/types';
import { cn, formatDistance } from '@/lib/utils';

export type RouteTarget =
  | { kind: 'device'; key: string }
  | { kind: 'point'; lat: number; lng: number; label: string };

export type RouteEndpoint = 'start' | 'end';

interface RoutePanelProps {
  open: boolean;
  onClose: () => void;
  tjs: Tj[];
  olts: Olt[];
  onus: Onu[];
  start: RouteTarget | null;
  onStartChange: (target: RouteTarget | null) => void;
  startSnapped: { node: RouteNode; distanceM: number } | null;
  startStreet: StreetState;
  target: RouteTarget | null;
  onTargetChange: (target: RouteTarget | null) => void;
  snapped: { node: RouteNode; distanceM: number } | null;
  street: StreetState;
  picking: RouteEndpoint | null;
  onTogglePicking: (which: RouteEndpoint) => void;
  route: ShortestRoute | null;
  streetEnabled: boolean;
  onStreetEnabled: (value: boolean) => void;
  onSelectNode: (node: { kind: RouteNode['kind']; id: string }) => void;
}

const KIND_LABEL: Record<RouteNode['kind'], string> = {
  olt: 'OLT',
  tj: 'TJ',
  onu: 'ONU',
};

function kindTone(kind: RouteNode['kind']) {
  if (kind === 'olt') return 'bg-sky-500/12 text-sky-600 dark:text-sky-400';
  if (kind === 'onu') return 'bg-amber-500/12 text-amber-600 dark:text-amber-400';
  return 'bg-teal-500/12 text-teal-600 dark:text-teal-400';
}

function duration(minutes: number | null): string {
  if (minutes === null || !Number.isFinite(minutes)) return '—';
  if (minutes < 1) return '<1 min';
  return `${Math.round(minutes)} min`;
}

interface EndpointFieldProps {
  label: string;
  placeholder: string;
  value: RouteTarget | null;
  node: RouteNode | null;
  onChange: (target: RouteTarget | null) => void;
  picking: boolean;
  onTogglePicking: () => void;
  nodes: RouteNode[];
  tjs: Tj[];
  olts: Olt[];
  onus: Onu[];
  tone: 'start' | 'end';
}

function EndpointField({
  label,
  placeholder,
  value,
  node,
  onChange,
  picking,
  onTogglePicking,
  nodes,
  tjs,
  olts,
  onus,
  tone,
}: EndpointFieldProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<SearchResultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const parsed = useMemo(() => parseCoordinates(query), [query]);
  const deviceMatches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return nodes.slice(0, 10);
    return nodes
      .filter(
        (item) =>
          item.code.toLowerCase().includes(needle) ||
          (item.name ?? '').toLowerCase().includes(needle),
      )
      .slice(0, 6);
  }, [nodes, query]);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed || trimmed.length < 2 || parseCoordinates(trimmed)) {
      abortRef.current?.abort();
      setSuggestions([]);
      setLoading(false);
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const results = await searchLocationSuggestions(trimmed, { tjs, olts, onus }, controller.signal);
        if (!controller.signal.aborted) {
          setSuggestions(results.slice(0, 10));
          setLoading(false);
        }
      } catch {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 260);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, tjs, olts, onus]);

  const placeResults = suggestions.filter((item) => {
    if (item.type === 'place' || item.type === 'landmark') return true;
    return !deviceMatches.some(
      (match) =>
        (item.type === 'tj' && match.key === `tj:${item.tjId}`) ||
        (item.type === 'olt' && match.key === `olt:${item.oltId}`) ||
        (item.type === 'onu' && match.key === `onu:${item.onuId}`),
    );
  });

  function chooseDevice(item: RouteNode) {
    onChange({ kind: 'device', key: item.key });
    setQuery('');
    setOpen(false);
    setSuggestions([]);
  }

  function choose(item: SearchResultItem) {
    if (item.type === 'tj' && item.tjId) {
      onChange({ kind: 'device', key: routeKey('tj', item.tjId) });
    } else if (item.type === 'olt' && item.oltId) {
      onChange({ kind: 'device', key: routeKey('olt', item.oltId) });
    } else if (item.type === 'onu' && item.onuId) {
      onChange({ kind: 'device', key: routeKey('onu', item.onuId) });
    } else {
      onChange({ kind: 'point', lat: item.lat, lng: item.lng, label: item.title });
    }
    setQuery('');
    setOpen(false);
    setSuggestions([]);
  }

  function applyCoordinates() {
    if (!parsed) return;
    onChange({
      kind: 'point',
      lat: parsed.lat,
      lng: parsed.lng,
      label: `${parsed.lat.toFixed(5)}, ${parsed.lng.toFixed(5)}`,
    });
    setQuery('');
    setOpen(false);
    setSuggestions([]);
  }

  function clear() {
    onChange(null);
    setQuery('');
    setOpen(false);
    setSuggestions([]);
  }

  const displayName =
    value?.kind === 'device' ? node?.code ?? 'device' : value?.kind === 'point' ? value.label : null;

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {label}
        </p>
        <button
          type="button"
          onClick={onTogglePicking}
          className={cn(
            'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.1em] transition',
            picking
              ? 'border-primary/40 bg-primary/10 text-primary'
              : 'border-border/70 text-muted-foreground hover:text-foreground',
          )}
        >
          <Crosshair className="size-3" />
          {picking ? 'Click map…' : 'Pick on map'}
        </button>
      </div>

      {value ? (
        <div className="flex items-center gap-2 rounded-xl border border-white/70 bg-white/70 px-2 py-1.5 dark:border-white/10 dark:bg-white/[0.05]">
          <span
            className={cn(
              'grid size-6 shrink-0 place-items-center rounded-lg text-[8px] font-bold uppercase',
              value.kind === 'device' && node
                ? kindTone(node.kind)
                : tone === 'start'
                  ? 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400'
                  : 'bg-rose-500/12 text-rose-500',
            )}
          >
            {value.kind === 'device' && node ? KIND_LABEL[node.kind] : <MapPin className="size-3.5" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11.5px] font-semibold">{displayName}</p>
            <p className="truncate font-mono text-[9.5px] text-muted-foreground">
              {value.kind === 'point'
                ? `${value.lat.toFixed(5)}, ${value.lng.toFixed(5)}`
                : 'Fibre device'}
            </p>
          </div>
          <button
            type="button"
            onClick={clear}
            className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground transition hover:bg-foreground/10 hover:text-foreground"
            aria-label={`Clear ${label.toLowerCase()}`}
          >
            <X className="size-3.5" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/70" />
          <Input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                if (parsed) applyCoordinates();
                else if (deviceMatches[0]) chooseDevice(deviceMatches[0]);
                else if (suggestions[0]) choose(suggestions[0]);
              }
              if (event.key === 'Escape') setOpen(false);
            }}
            placeholder={placeholder}
            className="h-8 rounded-xl pl-8 pr-8 text-[11.5px]"
            aria-label={`Route ${label.toLowerCase()}`}
          />
          {loading ? (
            <Loader2 className="absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-primary" />
          ) : null}
          {open ? (
            <div className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-white/70 bg-white p-1 shadow-xl dark:border-white/10 dark:bg-slate-900">
              {parsed ? (
                <button
                  type="button"
                  onClick={applyCoordinates}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-muted/70"
                >
                  <Crosshair className="size-3.5 shrink-0 text-primary" />
                  <span className="font-mono text-[11px]">
                    Go to {parsed.lat.toFixed(5)}, {parsed.lng.toFixed(5)}
                  </span>
                </button>
              ) : deviceMatches.length === 0 && placeResults.length === 0 && !loading ? (
                <p className="px-2 py-2 text-[10.5px] text-muted-foreground">
                  Type 2+ characters, a device code, or “lat, lng”.
                </p>
              ) : (
                <>
                  {deviceMatches.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => chooseDevice(item)}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1 transition hover:bg-muted/70"
                    >
                      <span
                        className={cn(
                          'grid size-5 shrink-0 place-items-center rounded-md text-[7px] font-bold uppercase',
                          kindTone(item.kind),
                        )}
                      >
                        {KIND_LABEL[item.kind]}
                      </span>
                      <span className="truncate font-mono text-[11px] font-semibold">{item.code}</span>
                      <span className="min-w-0 flex-1 truncate text-[9.5px] text-muted-foreground">
                        {item.name ?? ''}
                      </span>
                    </button>
                  ))}
                  {placeResults.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => choose(item)}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-muted/70"
                    >
                      <span
                        className={cn(
                          'grid size-5 shrink-0 place-items-center rounded-md text-[7px] font-bold uppercase',
                          item.type === 'tj'
                            ? 'bg-teal-500/12 text-teal-600 dark:text-teal-400'
                            : item.type === 'olt'
                              ? 'bg-sky-500/12 text-sky-600 dark:text-sky-400'
                              : item.type === 'onu'
                                ? 'bg-amber-500/12 text-amber-600 dark:text-amber-400'
                                : 'bg-rose-500/12 text-rose-500',
                        )}
                      >
                        {item.type === 'place' || item.type === 'landmark' ? 'LOC' : item.type.toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[11px] font-semibold">{item.title}</span>
                        <span className="block truncate text-[9px] text-muted-foreground">{item.subtitle}</span>
                      </span>
                    </button>
                  ))}
                </>
              )}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

export function RoutePanel({
  open,
  onClose,
  tjs,
  olts,
  onus,
  start,
  onStartChange,
  startSnapped,
  startStreet,
  target,
  onTargetChange,
  snapped,
  street,
  picking,
  onTogglePicking,
  route,
  streetEnabled,
  onStreetEnabled,
  onSelectNode,
}: RoutePanelProps) {
  const nodes = useMemo(() => buildRouteNodes(tjs, olts, onus), [tjs, olts, onus]);
  const nodeByKey = useMemo(() => new Map(nodes.map((node) => [node.key, node])), [nodes]);

  const startNode = start?.kind === 'device' ? nodeByKey.get(start.key) ?? null : null;
  const targetNode = target?.kind === 'device' ? nodeByKey.get(target.key) ?? null : null;
  const startPoint = start?.kind === 'point' ? start : null;
  const targetPoint = target?.kind === 'point' ? target : null;

  if (!open) return null;

  const startName = startPoint?.label ?? startNode?.code ?? null;
  const targetName = targetPoint?.label ?? targetNode?.code ?? null;

  return (
    <div className="pointer-events-auto absolute bottom-[10.25rem] right-3 z-20 w-[min(390px,calc(100vw-1.5rem))] rounded-2xl border border-white/60 bg-white/95 p-3 shadow-[0_18px_40px_-24px_rgba(15,23,42,0.6)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/95 sm:right-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">
            <RouteIcon className="size-3.5" />
            Shortest route
          </p>
          <p className="mt-1 text-[10.5px] leading-snug text-muted-foreground">
            Shortest cable path between two locations, with optional street approaches at either end.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="grid size-7 shrink-0 place-items-center rounded-lg text-muted-foreground transition hover:bg-foreground/10 hover:text-foreground"
          aria-label="Close route planner"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="mt-2.5 max-h-[min(40vh,430px)] space-y-2 overflow-y-auto pr-0.5 sm:max-h-[min(56vh,430px)]">
        <EndpointField
          label="From location"
          placeholder="Device, place, or 23.8103, 90.4125"
          value={start}
          node={startNode}
          onChange={onStartChange}
          picking={picking === 'start'}
          onTogglePicking={() => onTogglePicking('start')}
          nodes={nodes}
          tjs={tjs}
          olts={olts}
          onus={onus}
          tone="start"
        />

        <EndpointField
          label="To location"
          placeholder="Device, place, or 23.8103, 90.4125"
          value={target}
          node={targetNode}
          onChange={onTargetChange}
          picking={picking === 'end'}
          onTogglePicking={() => onTogglePicking('end')}
          nodes={nodes}
          tjs={tjs}
          olts={olts}
          onus={onus}
          tone="end"
        />

        {/* Result */}
        {route ? (
          <div className="rounded-xl border border-white/70 bg-white/60 px-2.5 py-2 dark:border-white/10 dark:bg-white/[0.04]">
            <div className="flex items-end justify-between gap-2">
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Cable distance
                </p>
                <p className="font-mono text-[17px] font-semibold leading-none">
                  {formatDistance(route.distanceM)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Route loss
                </p>
                <p className="font-mono text-[13px] font-semibold text-amber-700 dark:text-amber-300">
                  {route.lossDb.toFixed(2)} dB
                </p>
              </div>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-1">
              {route.nodes.map((node, index) => (
                <span key={node.key} className="inline-flex items-center gap-1">
                  {index > 0 ? (
                    <ArrowRight className="size-2.5 shrink-0 text-muted-foreground/70" />
                  ) : null}
                  <button
                    type="button"
                    onClick={() => onSelectNode({ kind: node.kind, id: node.id })}
                    title={`Open ${node.code}`}
                    aria-label={`Open ${node.code}`}
                    className={cn(
                      'cursor-pointer rounded-md border px-1.5 py-0.5 font-mono text-[9.5px] font-semibold transition hover:brightness-95 hover:ring-1 hover:ring-foreground/20 dark:hover:brightness-125',
                      node.kind === 'olt'
                        ? 'border-sky-400/40 bg-sky-500/10 text-sky-700 dark:text-sky-300'
                        : node.kind === 'onu'
                          ? 'border-amber-400/40 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                          : 'border-teal-400/40 bg-teal-500/10 text-teal-700 dark:text-teal-300',
                    )}
                  >
                    {node.code}
                  </button>
                </span>
              ))}
            </div>
            <p className="mt-1 font-mono text-[9px] text-muted-foreground">
              {route.hops.length} span{route.hops.length === 1 ? '' : 's'} · cable{' '}
              {route.cableLossDb.toFixed(2)} dB
              {route.splitterLossDb > 0 ? ` · splitters ${route.splitterLossDb.toFixed(2)} dB` : ''}
            </p>
            {route.crossesCut ? (
              <p className="mt-1.5 inline-flex items-center gap-1 rounded-lg bg-rose-500/10 px-2 py-1 text-[9.5px] font-semibold text-rose-500">
                <TriangleAlert className="size-3" />
                Only usable path crosses spans marked as cut
              </p>
            ) : null}
          </div>
        ) : start && target ? (
          <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-2.5 py-2 text-[10px] leading-snug text-amber-700 dark:text-amber-300">
            No cable path connects {startName ?? 'start'} to {targetName ?? 'target'}. Check that the
            joints between them are linked.
          </div>
        ) : null}

        {/* Final approach for free points */}
        {route && (startPoint || targetPoint) ? (
          <div className="rounded-xl border border-white/70 bg-white/60 px-2.5 py-2 dark:border-white/10 dark:bg-white/[0.04]">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Final approach
              </p>
              <label className="flex items-center gap-1.5 text-[9.5px] text-muted-foreground">
                <Switch
                  checked={streetEnabled}
                  onCheckedChange={onStreetEnabled}
                  aria-label="Street route to endpoints"
                />
                Street
              </label>
            </div>
            {startPoint ? (
              <ApproachRow
                label="From"
                point={startPoint}
                snapped={startSnapped}
                street={startStreet}
                enabled={streetEnabled}
              />
            ) : null}
            {targetPoint ? (
              <ApproachRow
                label="To"
                point={targetPoint}
                snapped={snapped}
                street={street}
                enabled={streetEnabled}
              />
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => {
            onStartChange(null);
            onTargetChange(null);
          }}
          className="text-[10px] font-medium text-muted-foreground transition hover:text-foreground"
        >
          Clear route
        </button>
        <span className="inline-flex items-center gap-1 text-[9px] text-muted-foreground">
          <ArrowRight className="size-3" />
          {start ? (route ? route.hops.length : '—') : 'Pick a start location'}
        </span>
      </div>
    </div>
  );
}

function ApproachRow({
  label,
  point,
  snapped,
  street,
  enabled,
}: {
  label: string;
  point: { lat: number; lng: number; label: string };
  snapped: { node: RouteNode; distanceM: number } | null;
  street: StreetState;
  enabled: boolean;
}) {
  return (
    <div className="mt-1.5 border-t border-border/40 pt-1.5">
      <p className="text-[10px] leading-snug text-muted-foreground">
        {label} · {point.label}
        {snapped ? (
          <>
            {' '}
            snaps to <span className="font-mono font-semibold text-foreground">{snapped.node.code}</span> ·{' '}
            {formatDistance(snapped.distanceM)}
          </>
        ) : (
          ' · no fibre node nearby'
        )}
      </p>
      {!snapped ? null : enabled ? (
        <p className="mt-1 inline-flex items-center gap-1.5 font-mono text-[10px]">
          {street.status === 'loading' ? (
            <>
              <Loader2 className="size-3 animate-spin text-primary" />
              Finding street route…
            </>
          ) : street.status === 'ready' ? (
            <>
              <Cable className="size-3 text-emerald-500" />
              {formatDistance(street.distanceM ?? 0)} · {duration((street.durationS ?? 0) / 60)}
            </>
          ) : street.status === 'error' ? (
            <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
              <TriangleAlert className="size-3" />
              Street route unavailable — showing straight drop
            </span>
          ) : (
            <span className="text-muted-foreground">Straight drop</span>
          )}
        </p>
      ) : (
        <p className="mt-1 font-mono text-[10px] text-muted-foreground">
          Straight drop {formatDistance(snapped.distanceM)}
        </p>
      )}
    </div>
  );
}
