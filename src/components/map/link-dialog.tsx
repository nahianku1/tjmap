'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Cable, Loader2, Route, Ruler, Trash2, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { api, ApiError } from '@/lib/api';
import type {
  DeviceKind,
  FibreLink,
  LinkDeviceRef,
  LinkPathPoint,
  LinkStatus,
  Olt,
  Onu,
  Tj,
} from '@/lib/types';
import { formatDistance } from '@/lib/utils';
import { routeLengthMeters } from '@/lib/route';

const CORE_COLORS = [
  '#22d3ee',
  '#a78bfa',
  '#f472b6',
  '#fbbf24',
  '#34d399',
  '#60a5fa',
  '#fb7185',
  '#c084fc',
  '#4ade80',
  '#facc15',
  '#38bdf8',
  '#f97316',
];

interface CoreRow {
  label: string;
  color: string;
  fromCore: string;
  toCore: string;
}

interface CoreOption {
  label: string;
  hint: string;
  used: boolean;
}

function splitKey(key: string): { kind: DeviceKind; id: string } | null {
  const [kind, id] = key.split(':');
  if ((kind !== 'tj' && kind !== 'olt' && kind !== 'onu') || !id) return null;
  return { kind, id };
}

function keyOf(ref: LinkDeviceRef | null | undefined): string {
  return ref ? `${ref.kind}:${ref.id}` : '';
}

function makeRows(count: number, existing: CoreRow[] = []): CoreRow[] {
  return Array.from({ length: Math.max(0, Math.min(count, 288)) }, (_value, index) => ({
    label: existing[index]?.label ?? `Core ${index + 1}`,
    color: existing[index]?.color ?? CORE_COLORS[index % CORE_COLORS.length],
    fromCore: existing[index]?.fromCore ?? '',
    toCore: existing[index]?.toCore ?? '',
  }));
}

interface LinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tjs: Tj[];
  olts: Olt[];
  onus: Onu[];
  links: FibreLink[];
  from: LinkDeviceRef | null;
  to: LinkDeviceRef | null;
  link?: FibreLink | null;
  /** Drawn duct waypoints, owned by the workspace so the map can render them. */
  path: LinkPathPoint[];
  onPathChange: (path: LinkPathPoint[]) => void;
  onStartDraw: () => void;
  /** True while the user is drawing on the map; the form is kept mounted but hidden. */
  drawing?: boolean;
  onSaved: (link: FibreLink, mode: 'create' | 'update') => void;
  onRequestDelete?: (link: FibreLink) => void;
}

export function LinkDialog({
  open,
  onOpenChange,
  tjs,
  olts,
  onus,
  links,
  from,
  to,
  link,
  path,
  onPathChange,
  onStartDraw,
  drawing = false,
  onSaved,
  onRequestDelete,
}: LinkDialogProps) {
  const editing = Boolean(link);
  const [fromKey, setFromKey] = useState('');
  const [toKey, setToKey] = useState('');
  const [fibreId, setFibreId] = useState('');
  const [coreCount, setCoreCount] = useState('4');
  const [rows, setRows] = useState<CoreRow[]>([]);
  const [status, setStatus] = useState<LinkStatus>('active');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (link) {
      setFromKey(
        link.fromKind === 'onu'
          ? `onu:${link.fromOnuId}`
          : link.fromKind === 'olt'
            ? `olt:${link.fromOltId}`
            : `tj:${link.fromTjId}`,
      );
      setToKey(
        link.toKind === 'onu'
          ? `onu:${link.toOnuId}`
          : link.toKind === 'olt'
            ? `olt:${link.toOltId}`
            : `tj:${link.toTjId}`,
      );
      setFibreId(link.fibreId);
      setCoreCount(String(link.coreCount || link.cores.length || 0));
      setStatus(link.status);
      setNotes(link.notes ?? '');
      setRows(
        link.cores.length > 0
          ? link.cores.map((core, index) => ({
              label: core.label || `Core ${index + 1}`,
              color: core.color ?? CORE_COLORS[index % CORE_COLORS.length],
              fromCore: core.fromCoreLabel ?? '',
              toCore: core.toCoreLabel ?? '',
            }))
          : makeRows(link.coreCount),
      );
      return;
    }

    setFromKey(keyOf(from));
    setToKey(keyOf(to));
    setFibreId('');
    setCoreCount('4');
    setRows(makeRows(4));
    setStatus('active');
    setNotes('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, link, from, to]);

  // The route belongs to the link, not to the device pickers: load it when the
  // dialog opens for a link and never while the user is drawing on the map.
  useEffect(() => {
    if (!open) return;
    onPathChange(link?.path ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, link]);

  const fromPoint = useMemo(
    () => devicePoint(fromKey, tjs, olts, onus),
    [fromKey, tjs, olts, onus],
  );
  const toPoint = useMemo(() => devicePoint(toKey, tjs, olts, onus), [toKey, tjs, olts, onus]);

  const distance = useMemo(() => {
    if (fromPoint && toPoint) {
      return routeLengthMeters(fromPoint.lat, fromPoint.lng, toPoint.lat, toPoint.lng, path);
    }
    if (editing && link?.lengthM != null) return link.lengthM;
    return null;
  }, [link, editing, fromPoint, toPoint, path]);

  const rawFromOptions = useMemo(
    () => coreOptions(fromKey, tjs, olts, onus, toKey),
    [fromKey, toKey, tjs, olts, onus],
  );
  const rawToOptions = useMemo(
    () => coreOptions(toKey, tjs, olts, onus, fromKey),
    [toKey, fromKey, tjs, olts, onus],
  );
  // A port already assigned to a row in this form is no longer free for another row.
  const fromOptions = useMemo(
    () => markAssigned(rawFromOptions, rows, 'fromCore'),
    [rawFromOptions, rows],
  );
  const toOptions = useMemo(() => markAssigned(rawToOptions, rows, 'toCore'), [rawToOptions, rows]);
  const freeFromOptions = useMemo(() => fromOptions.filter((o) => !o.used), [fromOptions]);
  const freeToOptions = useMemo(() => toOptions.filter((o) => !o.used), [toOptions]);

  const fromInfo = useMemo(
    () => deviceInfo(fromKey, tjs, olts, onus, links, toKey),
    [fromKey, toKey, tjs, olts, onus, links],
  );
  const toInfo = useMemo(
    () => deviceInfo(toKey, tjs, olts, onus, links, fromKey),
    [toKey, fromKey, tjs, olts, onus, links],
  );

  const connectedCount = rows.filter((row) => row.fromCore && row.toCore).length;
  const fromCode = deviceLabel(fromKey, tjs, olts, onus) ?? 'From device';
  const toCode = deviceLabel(toKey, tjs, olts, onus) ?? 'To device';

  function pickFreeFrom(label: string) {
    setRows((current) => {
      const idx = current.findIndex((r) => !r.fromCore);
      if (idx === -1) return current.map((r, i) => (i === 0 ? { ...r, fromCore: label } : r));
      return current.map((r, i) => (i === idx ? { ...r, fromCore: label } : r));
    });
  }

  function pickFreeTo(label: string) {
    setRows((current) => {
      const idx = current.findIndex((r) => !r.toCore);
      if (idx === -1) return current.map((r, i) => (i === 0 ? { ...r, toCore: label } : r));
      return current.map((r, i) => (i === idx ? { ...r, toCore: label } : r));
    });
  }

  function applyCoreCount(value: string) {
    setCoreCount(value);
    const count = Number(value);
    if (!Number.isFinite(count) || count < 0) return;
    setRows((current) => makeRows(Math.round(count), current));
  }

  function updateRow(index: number, patch: Partial<CoreRow>) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!fibreId.trim()) return setError('A fibre ID is required to identify this cable.');
    const fromParts = splitKey(fromKey);
    const toParts = splitKey(toKey);
    if (!fromParts || !toParts) return setError('Pick the device at each end of the fibre.');
    if (fromParts.kind === toParts.kind && fromParts.id === toParts.id) {
      return setError('A device cannot be linked to itself.');
    }
    if (!Number.isFinite(Number(coreCount)) || Number(coreCount) < 0) {
      return setError('Core count must be zero or more.');
    }

    const cores = rows.map((row, index) => ({
      index: index + 1,
      label: row.label.trim() || `Core ${index + 1}`,
      color: row.color,
      fromCoreLabel: row.fromCore || null,
      toCoreLabel: row.toCore || null,
    }));

    const payload = {
      fibreId: fibreId.trim(),
      coreCount: cores.length,
      fromCoreLabel: cores.find((core) => core.fromCoreLabel)?.fromCoreLabel ?? null,
      toCoreLabel: cores.find((core) => core.toCoreLabel)?.toCoreLabel ?? null,
      cores,
      status,
      notes: notes.trim() || undefined,
      path,
    };

    setSaving(true);
    setError(null);
    try {
      const saved =
        editing && link
          ? await api.updateLink(link.id, payload)
          : await api.createLink({
              ...payload,
              ...(fromParts.kind === 'tj'
                ? { fromTjId: fromParts.id }
                : fromParts.kind === 'olt'
                  ? { fromOltId: fromParts.id }
                  : { fromOnuId: fromParts.id }),
              ...(toParts.kind === 'tj'
                ? { toTjId: toParts.id }
                : toParts.kind === 'olt'
                  ? { toOltId: toParts.id }
                  : { toOnuId: toParts.id }),
            });

      toast.success(editing ? `Link ${saved.fibreId} updated` : `Link ${saved.fibreId} added`, {
        description: `${saved.fromCode} → ${saved.toCode} · ${cores.filter((core) => core.fromCoreLabel && core.toCoreLabel).length} of ${cores.length} cores connected`,
      });
      onSaved(saved, editing ? 'update' : 'create');
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save this link.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} modal={!drawing}>
      <DialogContent
        hideOverlay={drawing}
        className={
          drawing
            ? 'hidden'
            : 'max-h-[92vh] w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] overflow-y-auto overflow-x-hidden sm:max-w-4xl'
        }
        onPointerDownOutside={drawing ? (event) => event.preventDefault() : undefined}
        onFocusOutside={drawing ? (event) => event.preventDefault() : undefined}
        onEscapeKeyDown={drawing ? (event) => event.preventDefault() : undefined}
      >
        <DialogHeader>
          <DialogTitle>{editing ? `Link ${link?.fibreId}` : 'Add link'}</DialogTitle>
          <DialogDescription>
            {editing
              ? 'Inspect this fibre and map its cores to the devices at each end.'
              : 'Connect any two devices — terminal joints, OLT cabinets or subscriber ONUs. Choose how many cores the cable has; each core gets a name, colour and connection state.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 rounded-2xl border border-white/60 bg-white/45 p-3 dark:border-white/10 dark:bg-white/[0.03]">
          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              From
            </p>
            <p className="truncate font-mono text-[12px] font-semibold">{fromCode}</p>
          </div>
          <div className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
            <ArrowRight className="size-4" />
          </div>
          <div className="min-w-0 flex-1 text-right">
            <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              To
            </p>
            <p className="truncate font-mono text-[12px] font-semibold">{toCode}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={status === 'cut' ? 'cut' : 'active'}>{status === 'cut' ? 'Cut' : 'Active'}</Badge>
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <Ruler className="size-3" />
            {formatDistance(distance)} route distance
          </span>
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <Cable className="size-3" />
            {rows.length} cores · {connectedCount} connected
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-dashed border-primary/30 bg-primary/[0.04] px-3 py-2.5">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[12px] font-semibold">
              <Route className="size-3.5 text-primary" />
              Cable route
            </p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              {path.length > 0
                ? `${path.length} drawn bend${path.length === 1 ? '' : 's'} · ${formatDistance(distance)} along the duct`
                : 'Draw the duct path like a Google Maps line — click the map to add bends, drag a point to adjust one, double-click to finish.'}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {path.length > 0 ? (
              <Button type="button" size="sm" variant="ghost" onClick={() => onPathChange([])}>
                Clear route
              </Button>
            ) : null}
            <Button type="button" size="sm" variant="outline" onClick={onStartDraw}>
              <Route className="size-3.5" />
              {path.length > 0 ? 'Redraw on map' : 'Draw on map'}
            </Button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="link-from-device">From device</Label>
              <Select value={fromKey} onValueChange={setFromKey} disabled={editing}>
                <SelectTrigger id="link-from-device">
                  <SelectValue placeholder="Pick a joint, OLT or ONU" />
                </SelectTrigger>
                <SelectContent>
                  {tjs.length > 0 ? (
                    <SelectGroup>
                      <SelectLabel>Terminal joints</SelectLabel>
                      {tjs.map((tj) => (
                        <SelectItem key={tj.id} value={`tj:${tj.id}`}>
                          {tj.code}
                          {tj.name ? ` · ${tj.name}` : ''}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ) : null}
                  {olts.length > 0 ? (
                    <SelectGroup>
                      <SelectLabel>OLT cabinets</SelectLabel>
                      {olts.map((olt) => (
                        <SelectItem key={olt.id} value={`olt:${olt.id}`}>
                          {olt.code} · {olt.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ) : null}
                  {onus.length > 0 ? (
                    <SelectGroup>
                      <SelectLabel>ONUs (subscribers)</SelectLabel>
                      {onus.map((onu) => (
                        <SelectItem key={onu.id} value={`onu:${onu.id}`}>
                          {onu.username} · {onu.fibreId}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ) : null}
                </SelectContent>
              </Select>
              {fromInfo ? (
                <DeviceInfoCard
                  info={fromInfo}
                  free={freeFromOptions}
                  side="from"
                  onPick={pickFreeFrom}
                />
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="link-to-device">To device</Label>
              <Select value={toKey} onValueChange={setToKey} disabled={editing}>
                <SelectTrigger id="link-to-device">
                  <SelectValue placeholder="Pick a joint, OLT or ONU" />
                </SelectTrigger>
                <SelectContent>
                  {tjs.length > 0 ? (
                    <SelectGroup>
                      <SelectLabel>Terminal joints</SelectLabel>
                      {tjs.map((tj) => (
                        <SelectItem key={tj.id} value={`tj:${tj.id}`}>
                          {tj.code}
                          {tj.name ? ` · ${tj.name}` : ''}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ) : null}
                  {olts.length > 0 ? (
                    <SelectGroup>
                      <SelectLabel>OLT cabinets</SelectLabel>
                      {olts.map((olt) => (
                        <SelectItem key={olt.id} value={`olt:${olt.id}`}>
                          {olt.code} · {olt.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ) : null}
                  {onus.length > 0 ? (
                    <SelectGroup>
                      <SelectLabel>ONUs (subscribers)</SelectLabel>
                      {onus.map((onu) => (
                        <SelectItem key={onu.id} value={`onu:${onu.id}`}>
                          {onu.username} · {onu.fibreId}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ) : null}
                </SelectContent>
              </Select>
              {toInfo ? (
                <DeviceInfoCard info={toInfo} free={freeToOptions} side="to" onPick={pickFreeTo} />
              ) : null}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="link-fibre">Fibre ID</Label>
              <Input
                id="link-fibre"
                required
                placeholder="F-DHK-GL-BN"
                value={fibreId}
                onChange={(event) => setFibreId(event.target.value)}
                className="font-mono text-[12px]"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="link-cores">Core count</Label>
              <Input
                id="link-cores"
                type="number"
                min={0}
                max={288}
                value={coreCount}
                onChange={(event) => applyCoreCount(event.target.value)}
                className="font-mono text-[12px]"
              />
            </div>
          </div>

          <section className="min-w-0 rounded-xl border border-white/60 bg-white/40 p-3 dark:border-white/10 dark:bg-white/[0.03]">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div>
                <p className="text-[12px] font-semibold">Fibre cores</p>
                <p className="text-[10px] text-muted-foreground">
                  {connectedCount} connected · {rows.length - connectedCount} free · a core connects
                  when both ends are mapped
                </p>
              </div>
            </div>

            <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
              {rows.map((row, index) => {
                const connected = Boolean(row.fromCore && row.toCore);
                return (
                  <div
                    key={index}
                    className="grid grid-cols-[auto_minmax(0,1fr)_1fr_1fr_auto] items-center gap-2 rounded-lg border border-white/50 bg-white/50 px-2 py-1.5 dark:border-white/[0.06] dark:bg-white/[0.02]"
                  >
                    <label
                      className="relative size-4 shrink-0 cursor-pointer rounded-full border border-white/70 shadow-inner transition hover:scale-110 dark:border-white/20"
                      style={{ backgroundColor: row.color }}
                      title={`Edit ${row.label || `Core ${index + 1}`} colour`}
                    >
                      <input
                        type="color"
                        value={row.color}
                        onChange={(event) => updateRow(index, { color: event.target.value })}
                        aria-label={`Core ${index + 1} colour`}
                        className="absolute inset-0 size-full cursor-pointer opacity-0"
                      />
                    </label>
                    <input
                      value={row.label}
                      onChange={(event) => updateRow(index, { label: event.target.value })}
                      aria-label={`Core ${index + 1} name`}
                      placeholder={`Core ${index + 1}`}
                      className="h-8 min-w-0 rounded-md border border-transparent bg-transparent px-1.5 font-mono text-[10.5px] font-semibold outline-none transition focus:border-primary/40 focus:bg-background"
                    />
                    <Select
                      value={row.fromCore || 'none'}
                      onValueChange={(value) =>
                        updateRow(index, { fromCore: value === 'none' ? '' : value })
                      }
                    >
                      <SelectTrigger
                        aria-label={`Core ${index + 1} from endpoint`}
                        className="h-8 font-mono text-[10.5px]"
                      >
                        <SelectValue placeholder="From port" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Not connected</SelectItem>
                        {(row.fromCore && !fromOptions.some((o) => o.label === row.fromCore) ? [{label: row.fromCore, hint: 'core', used: true}] : []).map((option) => (
                          <SelectItem key={`cur-${option.label}`} value={option.label}>
                            {option.label} · {option.hint}
                          </SelectItem>
                        ))}
                        {fromOptions.map((option) => (
                          <SelectItem key={option.label} value={option.label} disabled={option.used && option.label !== row.fromCore}>
                            {option.label} · {option.hint}
                            {option.used ? ' (in use)' : ' (free)'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={row.toCore || 'none'}
                      onValueChange={(value) =>
                        updateRow(index, { toCore: value === 'none' ? '' : value })
                      }
                    >
                      <SelectTrigger
                        aria-label={`Core ${index + 1} to endpoint`}
                        className="h-8 font-mono text-[10.5px]"
                      >
                        <SelectValue placeholder="To port" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Not connected</SelectItem>
                        {(row.toCore && !toOptions.some((o) => o.label === row.toCore) ? [{label: row.toCore, hint: 'core', used: true}] : []).map((option) => (
                          <SelectItem key={`cur-${option.label}`} value={option.label}>
                            {option.label} · {option.hint}
                          </SelectItem>
                        ))}
                        {toOptions.map((option) => (
                          <SelectItem key={option.label} value={option.label} disabled={option.used && option.label !== row.toCore}>
                            {option.label} · {option.hint}
                            {option.used ? ' (in use)' : ' (free)'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <span
                      className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${
                        connected
                          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                          : 'bg-slate-500/10 text-muted-foreground'
                      }`}
                    >
                      {connected ? 'Connected' : 'Free'}
                    </span>
                  </div>
                );
              })}
              {rows.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-[11px] text-muted-foreground">
                  Set a core count above to generate cores.
                </p>
              ) : null}
            </div>
          </section>

          <div className="flex items-center justify-between rounded-xl border border-white/60 bg-white/40 px-3 py-2.5 dark:border-white/10 dark:bg-white/[0.03]">
            <div>
              <p className="text-[12px] font-semibold">Link is cut</p>
              <p className="text-[10px] text-muted-foreground">Cut links render as dashed rose lines.</p>
            </div>
            <Switch
              checked={status === 'cut'}
              onCheckedChange={(checked) => setStatus(checked ? 'cut' : 'active')}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="link-notes">Link notes</Label>
            <Textarea
              id="link-notes"
              placeholder="Duct route, splice closure IDs, right-of-way owner…"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className="min-h-[64px]"
            />
          </div>

          {error ? (
            <div className="flex items-start gap-2 rounded-xl border border-destructive/25 bg-destructive/10 px-3 py-2.5 text-[12px] text-destructive">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}

          <DialogFooter className="sm:justify-between">
            <div className="flex items-center gap-2">
              {editing && link && onRequestDelete ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => onRequestDelete(link)}
                >
                  <Trash2 className="size-3.5" />
                  Delete link
                </Button>
              ) : (
                <span className="hidden text-[10px] text-muted-foreground sm:block">
                  Tip: click a line on the map to edit it.
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 className="size-4 animate-spin" /> : null}
                {editing ? 'Save link' : 'Create link'}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface DeviceInfo {
  kind: DeviceKind;
  code: string;
  name: string | null;
  area: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  totalPorts: number;
  usedPorts: number;
  linkCount: number;
  extra: string | null;
}

function deviceInfo(
  key: string,
  tjs: Tj[],
  olts: Olt[],
  onus: Onu[],
  links: FibreLink[],
  otherKey = '',
): DeviceInfo | null {
  const parts = splitKey(key);
  if (!parts) return null;
  const attached = links.filter((l) => {
    if (parts.kind === 'tj') return l.fromTjId === parts.id || l.toTjId === parts.id;
    if (parts.kind === 'olt') return l.fromOltId === parts.id || l.toOltId === parts.id;
    return l.fromOnuId === parts.id || l.toOnuId === parts.id;
  });
  if (parts.kind === 'onu') {
    const onu = onus.find((item) => item.id === parts.id);
    if (!onu) return null;
    const cores = onu.cores ?? [];
    const used = cores.filter((core) => core.status === 'in_use').length;
    const area = [onu.districtName, onu.areaName].filter(Boolean).join(' · ') || null;
    const extra = [
      `Fibre ${onu.fibreId}`,
      onu.vlanId != null ? `VLAN ${onu.vlanId}` : null,
      onu.macAddress ? `MAC ${onu.macAddress}` : null,
    ]
      .filter(Boolean)
      .join(' · ');
    return {
      kind: 'onu',
      code: onu.username,
      name: onu.fibreId,
      area,
      address: null,
      lat: onu.lat,
      lng: onu.lng,
      totalPorts: cores.length,
      usedPorts: used,
      linkCount: attached.length,
      extra: extra || null,
    };
  }
  if (parts.kind === 'tj') {
    const tj = tjs.find((item) => item.id === parts.id);
    if (!tj) return null;
    const cores = [...(tj.cores ?? []), ...(tj.outputCores ?? [])];
    const used = cores.filter((c) => c.status === 'in_use').length;
    const area = [tj.districtName, tj.areaName].filter(Boolean).join(' · ') || null;
    return {
      kind: 'tj',
      code: tj.code,
      name: tj.name ?? null,
      area,
      address: tj.address ?? null,
      lat: tj.lat,
      lng: tj.lng,
      totalPorts: cores.length,
      usedPorts: used,
      linkCount: attached.length,
      extra: tj.fibreId ? `Fibre ${tj.fibreId}` : null,
    };
  }
  const olt = olts.find((item) => item.id === parts.id);
  if (!olt) return null;
  const other = splitKey(otherKey);
  // TJ ↔ OLT spans only use PON ports, so don't count the uplink ports here.
  const ports =
    other?.kind === 'tj'
      ? (olt.ponPorts ?? [])
      : [...(olt.ponPorts ?? []), ...(olt.ethernetPorts ?? [])];
  const used = ports.filter((p) => p.status === 'in_use').length;
  const area = [olt.districtName, olt.areaName].filter(Boolean).join(' · ') || null;
  return {
    kind: 'olt',
    code: olt.code,
    name: olt.name ?? null,
    area,
    address: null,
    lat: olt.lat ?? null,
    lng: olt.lng ?? null,
    totalPorts: ports.length,
    usedPorts: used,
    linkCount: attached.length,
    extra: olt.ponPort ? `PON ${olt.ponPort}` : null,
  };
}

function DeviceInfoCard({
  info,
  free,
  side,
  onPick,
}: {
  info: DeviceInfo;
  free: CoreOption[];
  side: 'from' | 'to';
  onPick: (label: string) => void;
}) {
  const freeCount = Math.max(0, info.totalPorts - info.usedPorts);
  return (
    <div className="rounded-xl border border-white/60 bg-white/50 p-2.5 text-[11px] dark:border-white/10 dark:bg-white/[0.03]">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-foreground">
            {info.kind === 'olt' ? 'OLT' : info.kind === 'onu' ? 'ONU' : 'TJ'} · {info.code}
            {info.name ? <span className="font-normal text-muted-foreground"> — {info.name}</span> : null}
          </p>
          <div className="mt-1 space-y-0.5 text-[10px] text-muted-foreground">
            {info.area ? <p>Area: {info.area}</p> : <p>Area: —</p>}
            {info.address ? <p className="truncate" title={info.address}>Address: {info.address}</p> : null}
            {info.extra ? <p>{info.extra}</p> : null}
            <p>
              {info.lat != null && info.lng != null
                ? `${info.lat.toFixed(5)}, ${info.lng.toFixed(5)}`
                : 'No coordinates'}
              {' · '}{info.linkCount} existing link{info.linkCount === 1 ? '' : 's'}
            </p>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-mono text-[10px] text-foreground">
            {info.usedPorts}/{info.totalPorts} used
          </p>
          <p className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">{freeCount} free</p>
        </div>
      </div>
      <div className="mt-2">
        <p className="mb-1 text-[9.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Free ports/cores {side === 'from' ? '(from)' : '(to)'} — select to assign
        </p>
        {free.length > 0 ? (
          <div className="flex max-h-24 flex-wrap gap-1 overflow-y-auto pr-1">
            {free.map((opt) => (
              <button
                key={opt.label}
                type="button"
                onClick={() => onPick(opt.label)}
                className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px] font-medium text-emerald-700 transition hover:bg-emerald-500/20 dark:text-emerald-300"
                title={`${opt.label} · ${opt.hint}`}
              >
                {opt.label}
                <span className="text-[9px] text-muted-foreground">{opt.hint}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-[10px] text-muted-foreground">No free ports/cores available on this device.</p>
        )}
      </div>
    </div>
  );
}

function devicePoint(
  key: string,
  tjs: Tj[],
  olts: Olt[],
  onus: Onu[],
): { lat: number; lng: number } | null {
  const parts = splitKey(key);
  if (!parts) return null;
  if (parts.kind === 'tj') {
    const tj = tjs.find((item) => item.id === parts.id);
    return tj ? { lat: tj.lat, lng: tj.lng } : null;
  }
  if (parts.kind === 'onu') {
    const onu = onus.find((item) => item.id === parts.id);
    return onu && onu.lat !== null && onu.lng !== null ? { lat: onu.lat, lng: onu.lng } : null;
  }
  const olt = olts.find((item) => item.id === parts.id);
  return olt && olt.lat !== null && olt.lng !== null ? { lat: olt.lat, lng: olt.lng } : null;
}

function deviceLabel(key: string, tjs: Tj[], olts: Olt[], onus: Onu[]): string | null {
  const parts = splitKey(key);
  if (!parts) return null;
  if (parts.kind === 'tj') {
    const tj = tjs.find((item) => item.id === parts.id);
    return tj ? `TJ · ${tj.code}` : null;
  }
  if (parts.kind === 'onu') {
    const onu = onus.find((item) => item.id === parts.id);
    return onu ? `ONU · ${onu.username}` : null;
  }
  const olt = olts.find((item) => item.id === parts.id);
  return olt ? `OLT · ${olt.code}` : null;
}

function markAssigned(
  options: CoreOption[],
  rows: CoreRow[],
  side: 'fromCore' | 'toCore',
): CoreOption[] {
  const assigned = new Set(
    rows.map((row) => row[side]).filter((label): label is string => Boolean(label)),
  );
  if (assigned.size === 0) return options;
  return options.map((option) => (assigned.has(option.label) ? { ...option, used: true } : option));
}

function coreOptions(
  key: string,
  tjs: Tj[],
  olts: Olt[],
  onus: Onu[],
  otherKey = '',
): CoreOption[] {
  const parts = splitKey(key);
  if (!parts) return [];
  if (parts.kind === 'onu') {
    const onu = onus.find((item) => item.id === parts.id);
    if (!onu) return [];
    return (onu.cores ?? []).map((core) => ({
      label: core.label,
      hint: 'core',
      used: core.status === 'in_use',
    }));
  }
  if (parts.kind === 'tj') {
    const tj = tjs.find((item) => item.id === parts.id);
    if (!tj) return [];
    const seen = new Set<string>();
    const options: CoreOption[] = [];
    [...(tj.cores ?? []), ...(tj.outputCores ?? [])].forEach((core) => {
      if (!core.label || seen.has(core.label)) return;
      seen.add(core.label);
      options.push({
        label: core.label,
        hint: core.status === 'in_use' ? 'core' : 'core',
        used: core.status === 'in_use',
      });
    });
    return options;
  }
  const olt = olts.find((item) => item.id === parts.id);
  if (!olt) return [];
  const other = splitKey(otherKey);

  // A TJ ↔ OLT span is a PON drop: the OLT side can only use a free PON port,
  // never an Ethernet uplink port and never a PON port already serving a span.
  if (other?.kind === 'tj') {
    return olt.ponPorts
      .filter((port) => port.status !== 'in_use')
      .map((port) => ({
        label: port.label,
        hint: port.outputDbm === null ? 'PON' : `PON · +${port.outputDbm} dBm`,
        used: false,
      }));
  }

  return [
    ...olt.ponPorts.map((port) => ({
      label: port.label,
      hint: port.outputDbm === null ? 'PON' : `PON · +${port.outputDbm} dBm`,
      used: port.status === 'in_use',
    })),
    ...olt.ethernetPorts.map((port) => ({
      label: port.label,
      hint: `ETH · ${port.speed}`,
      used: port.status === 'in_use',
    })),
  ];
}
