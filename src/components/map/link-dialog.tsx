'use client';

import { useEffect, useMemo, useState, Fragment } from 'react';
import { ArrowRight, Cable, Gauge, Layers, Loader2, Plus, Ruler, Trash2, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogBody,
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
  SubArea,
  Tj,
} from '@/lib/types';
import { cn, formatDistance } from '@/lib/utils';
import { routeLengthMeters } from '@/lib/route';
import { computePowerBudgets, computeSpanLoss, type PowerBudget } from '@/lib/power-budget';
import { splitterFeedLabels, splitterFeedName, tjCoreUnavailable } from '@/lib/device-ports';
import {
  CORES_PER_TUBE,
  displayCoreLabel,
  tiaCoreColor,
  tiaCoreLabel,
  tubeOf,
  uniqueCoreLabel,
  type FibreCableType,
} from '@/lib/fibre-cores';

const CORE_COLORS = Array.from({ length: 12 }, (_item, index) => tiaCoreColor(index + 1));

interface CoreRow {
  /** Stable React key, minted once with crypto.randomUUID() when the row is created. */
  id: string;
  label: string;
  color: string;
  fromCore: string;
  toCore: string;
  /** Extra loss this strand carries (dB); set from a device's core picker. */
  lossDb: number;
}

interface CoreOption {
  /** Unique per option: splitters repeat the same TIA colour names. */
  id: string;
  label: string;
  /** Display name; legacy `T1-01` labels render as their TIA colour name. */
  name?: string;
  hint: string;
  used: boolean;
}

/** Identity for one list item; two splitters can both expose a `Blue` leg. */
function optionId(): string {
  const webCrypto = globalThis.crypto;
  return typeof webCrypto?.randomUUID === 'function'
    ? webCrypto.randomUUID()
    : `port-${Math.random().toString(36).slice(2)}`;
}

function splitKey(key: string): { kind: DeviceKind; id: string } | null {
  const [kind, id] = key.split(':');
  if ((kind !== 'tj' && kind !== 'olt' && kind !== 'onu') || !id) return null;
  return { kind, id };
}

function keyOf(ref: LinkDeviceRef | null | undefined): string {
  return ref ? `${ref.kind}:${ref.id}` : '';
}

/** Default strand name for a 1-based core number: its TIA colour name. */
function labelFor(coreNumber: number): string {
  return tiaCoreLabel(coreNumber);
}

/** Older links carry their construction in `T1-01`-style strand labels. */
function inferFibreType(link: FibreLink): FibreCableType {
  if (link.cores.some((core) => /^T\d+-\d+$/i.test(core.label.trim()))) return 'tube';
  return (link.coreCount ?? link.cores.length) > CORES_PER_TUBE ? 'tube' : 'core';
}

function makeRows(count: number, existing: CoreRow[] = []): CoreRow[] {
  const used = new Set<string>();
  return Array.from({ length: Math.max(0, Math.min(count, 288)) }, (_value, index) => {
    const stored = existing[index]?.label;
    const label = uniqueCoreLabel(
      stored ? displayCoreLabel(stored, index + 1) : labelFor(index + 1),
      used,
    );
    used.add(label);
    return {
      id: existing[index]?.id ?? optionId(),
      label,
      color: existing[index]?.color ?? CORE_COLORS[index % CORE_COLORS.length],
      fromCore: existing[index]?.fromCore ?? '',
      toCore: existing[index]?.toCore ?? '',
      lossDb: Number(existing[index]?.lossDb ?? 0),
    };
  });
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
  /** Ports already picked on the map connection tool, applied to the first core. */
  fromPort?: string | null;
  toPort?: string | null;
  /** Route bends drawn on the map before the form opened. */
  initialPath?: LinkPathPoint[] | null;
  /** Construction picked before the map picks; ignored when editing a link. */
  fibreType?: FibreCableType;
  link?: FibreLink | null;
  /** Drawn duct waypoints, owned by the workspace so the map can render them. */
  path: LinkPathPoint[];
  onPathChange: (path: LinkPathPoint[]) => void;
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
  fromPort = null,
  toPort = null,
  initialPath = null,
  fibreType = 'tube',
  link,
  path,
  onPathChange,
  onSaved,
  onRequestDelete,
}: LinkDialogProps) {
  const editing = Boolean(link);
  // A link's own strands decide its construction; a new one uses the picked type.
  const type: FibreCableType = link ? inferFibreType(link) : fibreType;
  const [fromKey, setFromKey] = useState('');
  const [toKey, setToKey] = useState('');
  const [fibreId, setFibreId] = useState('');
  const [coreCount, setCoreCount] = useState('4');
  const [attenuation, setAttenuation] = useState('0.35');
  const [spliceCount, setSpliceCount] = useState('2');
  const [connectionLoss, setConnectionLoss] = useState('1');
  const [rows, setRows] = useState<CoreRow[]>([]);
  const [status, setStatus] = useState<LinkStatus>('active');
  const [color, setColor] = useState<string | null>(null);
  const [subAreaId, setSubAreaId] = useState('none');
  const [subAreas, setSubAreas] = useState<SubArea[]>([]);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cancel, X, overlay click and Escape all close the dialog; drop whatever was
  // typed so the next open starts from the link (or a clean cable), never the
  // abandoned draft.
  useEffect(() => {
    if (open) return;
    setFromKey('');
    setToKey('');
    setFibreId('');
    setCoreCount(String(CORES_PER_TUBE));
    setAttenuation('0.35');
    setSpliceCount('2');
    setConnectionLoss('1');
    setRows([]);
    setStatus('active');
    setColor(null);
    setSubAreaId('none');
    setNotes('');
    setSaving(false);
    setError(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (link) {      setFromKey(
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
      setAttenuation(String(link.attenuationDbPerKm ?? 0.35));
      setSpliceCount(String(link.spliceCount ?? 2));
      setConnectionLoss(String(link.connectionLossDb ?? 1));
      setColor(link.color ?? null);
      setStatus(link.status);
      setSubAreaId(link.subAreaId ?? 'none');
      setNotes(link.notes ?? '');
      const used = new Set<string>();
      setRows(
        link.cores.length > 0
          ? link.cores.map((core, index) => {
              const label = uniqueCoreLabel(
                displayCoreLabel(core.label, index + 1),
                used,
              );
              used.add(label);
              return {
                id: optionId(),
                label,
                color: core.color ?? CORE_COLORS[index % CORE_COLORS.length],
                fromCore: core.fromCoreLabel ?? '',
                toCore: core.toCoreLabel ?? '',
                lossDb: Number(core.lossDb ?? 0),
              };
            })
          : makeRows(link.coreCount),
      );
      return;
    }

    setFromKey(keyOf(from));
    setToKey(keyOf(to));
    setFibreId('');
    setCoreCount(String(CORES_PER_TUBE));
    setAttenuation('0.35');
    setSpliceCount('2');
    setConnectionLoss('1');
    setColor(null);
    // Both constructions start with 12 strands; names follow the TIA colour
    // code and ports picked in the map connection tool land on the first strand.
    const fresh = makeRows(CORES_PER_TUBE);
    fresh[0] = { ...fresh[0], fromCore: fromPort ?? '', toCore: toPort ?? '' };
    setRows(fresh);
    setStatus('active');
    setSubAreaId('none');
    setNotes('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, link, from, to, fromPort, toPort, fibreType]);

  // The route belongs to the link, not to the device pickers: load it when the
  // dialog opens for a link and never while the user is drawing on the map.
  useEffect(() => {
    if (!open) return;
    onPathChange(link?.path ?? initialPath ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, link, initialPath]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    api
      .subAreas()
      .then((list) => {
        if (!cancelled) setSubAreas(list);
      })
      .catch(() => {
        if (!cancelled) setSubAreas([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const subAreaGroups = useMemo(() => {
    const groups = new Map<string, { areaName: string; items: SubArea[] }>();
    subAreas.forEach((subArea) => {
      const group = groups.get(subArea.areaId) ?? { areaName: subArea.areaName, items: [] };
      group.items.push(subArea);
      groups.set(subArea.areaId, group);
    });
    return [...groups.values()].sort((a, b) => a.areaName.localeCompare(b.areaName));
  }, [subAreas]);

  const subAreaValue =
    subAreaId === 'none' || subAreas.some((subArea) => subArea.id === subAreaId)
      ? subAreaId
      : 'none';

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

  // Re-runs the whole OLT → ONU budget on every edit of the three optical
  // parameters, so each connected ONU's receive power moves as the form changes.
  const opticalChain = useMemo(() => {
    const num = (value: string, fallback: number) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    };
    const attenuationDbPerKm = Math.min(Math.max(num(attenuation, 0.35), 0), 5);
    const splices = Math.max(0, Math.round(num(spliceCount, 2)));
    const connectionLossDb = Math.min(Math.max(num(connectionLoss, 1), 0), 20);
    const lengthM = distance ?? link?.lengthM ?? null;
    const spanLoss = computeSpanLoss({
      lengthM,
      attenuationDbPerKm,
      spliceCount: splices,
      connectionLossDb,
    });

    if (!editing || !link) {
      return {
        spanLoss,
        affected: [] as { onu: Onu; before: PowerBudget | null; after: PowerBudget }[],
      };
    }

    const draft: FibreLink = {
      ...link,
      lengthM,
      attenuationDbPerKm,
      spliceCount: splices,
      connectionLossDb,
    };
    const previewLinks = links.map((item) => (item.id === link.id ? draft : item));
    const before = computePowerBudgets(tjs, olts, onus, links);
    const after = computePowerBudgets(tjs, olts, onus, previewLinks);
    const affected = onus.flatMap((onu) => {
      const next = after.get(onu.id);
      if (!next || !next.spans.some((span) => span.linkId === link.id)) return [];
      return [{ onu, before: before.get(onu.id) ?? null, after: next }];
    });
    return { spanLoss, affected };
  }, [
    editing,
    link,
    distance,
    attenuation,
    spliceCount,
    connectionLoss,
    tjs,
    olts,
    onus,
    links,
  ]);

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

  const fromInfo = useMemo(
    () => deviceInfo(fromKey, tjs, olts, onus, links),
    [fromKey, tjs, olts, onus, links],
  );
  const toInfo = useMemo(
    () => deviceInfo(toKey, tjs, olts, onus, links),
    [toKey, tjs, olts, onus, links],
  );

  const connectedCount = rows.filter((row) => row.fromCore && row.toCore).length;
  const fromCode = deviceLabel(fromKey, tjs, olts, onus) ?? 'From device';
  const toCode = deviceLabel(toKey, tjs, olts, onus) ?? 'To device';
  // Bare device codes for the core table, where the kind is already implied.
  const fromCodeShort = deviceCode(fromKey, tjs, olts, onus) ?? 'from device';
  const toCodeShort = deviceCode(toKey, tjs, olts, onus) ?? 'to device';

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

  /** Appends one strand, named after the next colour the cable is not using. */
  function addCore() {
    setRows((current) => {
      if (current.length >= 288) return current;
      const used = new Set(current.map((row) => row.label.trim()));
      let coreNumber = current.length + 1;
      while (used.has(labelFor(coreNumber))) coreNumber += 1;
      const next = [
        ...current,
        {
          id: optionId(),
          label: labelFor(coreNumber),
          color: tiaCoreColor(coreNumber),
          fromCore: '',
          toCore: '',
          lossDb: 0,
        },
      ];
      setCoreCount(String(next.length));
      return next;
    });
  }

  /** Drops one strand; the remaining strands keep their colour names. */
  function removeCore(removeIndex: number) {
    setRows((current) => {
      const next = current.filter((_row, index) => index !== removeIndex);
      setCoreCount(String(next.length));
      return next;
    });
  }

  /**
   * Appends one whole tube: 12 more TIA-coloured rows numbered from 01 inside
   * the new tube, so a multi-tube cable keeps restarting every 12 cores.
   */
  function addTube() {
    setRows((current) => {
      const next = makeRows(current.length + CORES_PER_TUBE, current);
      setCoreCount(String(next.length));
      return next;
    });
  }

  /**
   * Drops one whole tube (12 rows) and renumbers the rows after it, so the tube
   * headers and TIA colours stay aligned with the new core count.
   */
  function removeTube(startIndex: number) {
    setRows((current) => {
      const next = current
        .filter((_row, index) => index < startIndex || index >= startIndex + CORES_PER_TUBE)
        .map((row, index) =>
          index >= startIndex
            ? { ...row, label: labelFor(index + 1), color: tiaCoreColor(index + 1) }
            : row,
        );
      setCoreCount(String(next.length));
      return next;
    });
  }

  function updateRow(index: number, patch: Partial<CoreRow>) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!fibreId.trim()) return setError('A fibre ID is required to identify this cable.');
    if (fibreId.length < 1) return setError('Fibre ID must be at least 1 character.');
    if (fibreId.length > 60) return setError('Fibre ID must be at most 60 characters.');
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
      label: row.label.trim() || labelFor(index + 1),
      color: row.color,
      fromCoreLabel: row.fromCore || null,
      toCoreLabel: row.toCore || null,
      lossDb: Number.isFinite(row.lossDb) ? Math.min(Math.max(row.lossDb, 0), 99) : 0,
    }));

    const payload = {
      fibreId: fibreId.trim(),
      coreCount: cores.length,
      attenuationDbPerKm: Number.isFinite(Number(attenuation)) ? Number(attenuation) : 0.35,
      spliceCount: Number.isFinite(Number(spliceCount)) ? Math.max(0, Math.round(Number(spliceCount))) : 2,
      connectionLossDb: Number.isFinite(Number(connectionLoss)) ? Number(connectionLoss) : 1,
      color: color ?? null,
      fromCoreLabel: cores.find((core) => core.fromCoreLabel)?.fromCoreLabel ?? null,
      toCoreLabel: cores.find((core) => core.toCoreLabel)?.toCoreLabel ?? null,
      cores,
      status,
      subAreaId: subAreaValue === 'none' ? null : subAreaValue,
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{editing ? `Link ${link?.fibreId}` : 'Add link'}</DialogTitle>
          <DialogDescription>
            {editing
              ? 'Inspect this fibre and map its cores to the devices at each end.'
              : type === 'core'
                ? 'Connect any two devices — terminal joints, OLT cabinets or subscriber ONUs. This cable starts with 12 standard cores; add or delete strands and give each core a name, colour and connection state.'
                : 'Connect any two devices — terminal joints, OLT cabinets or subscriber ONUs. This cable starts with one 12-core tube in the TIA colour code; add whole tubes and give each core a name, colour and connection state.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <DialogBody className="space-y-4">
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
            {rows.length} cores
            {type === 'tube'
              ? ` · ${tubeOf(rows.length)} tube${tubeOf(rows.length) === 1 ? '' : 's'}`
              : ' · standard core cable'}
            {' · '}
            {connectedCount} connected
          </span>
        </div>

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
                          {onu.username}
                          {onu.fibreId ? ` · ${onu.fibreId}` : ''}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ) : null}
                </SelectContent>
              </Select>
              {fromInfo ? (
                <DeviceInfoCard
                  info={fromInfo}
                  options={fromOptions}
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
                          {onu.username}
                          {onu.fibreId ? ` · ${onu.fibreId}` : ''}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ) : null}
                </SelectContent>
              </Select>
              {toInfo ? (
                <DeviceInfoCard info={toInfo} options={toOptions} side="to" onPick={pickFreeTo} />
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

          <div className="space-y-2">
            <Label htmlFor="link-sub-area" className="flex items-center gap-1.5">
              <Layers className="size-3.5 text-teal-500" />
              Sub-area
            </Label>
            <Select value={subAreaValue} onValueChange={setSubAreaId} disabled={subAreas.length === 0}>
              <SelectTrigger id="link-sub-area" className="w-full">
                <SelectValue placeholder="No sub-area" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No sub-area</SelectItem>
                {subAreaGroups.map((group) => (
                  <SelectGroup key={group.areaName}>
                    <SelectLabel>{group.areaName}</SelectLabel>
                    {group.items.map((subArea) => (
                      <SelectItem key={subArea.id} value={subArea.id}>
                        {subArea.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground">
              Files this span under a sub-area for filtering. Device placement is unchanged.
            </p>
          </div>

          <section className="rounded-xl border border-amber-500/25 bg-amber-500/[0.04] p-3">
            <div className="mb-2">
              <p className="text-[12px] font-semibold">Optical link parameters</p>
              <p className="text-[10px] text-muted-foreground">
                Used to compute the power budget from OLT to ONU: {formatDistance(distance)} of fibre at{' '}
                {attenuation || '0'} dB/km, {spliceCount || '0'} splice(s) at 0.1 dB each and{' '}
                {connectionLoss || '0'} dB of connector loss.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="link-attenuation">Attenuation (dB/km)</Label>
                <Input
                  id="link-attenuation"
                  type="number"
                  step="0.01"
                  min={0}
                  max={5}
                  value={attenuation}
                  onChange={(event) => setAttenuation(event.target.value)}
                  className="font-mono text-[12px]"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="link-splices">Splices</Label>
                <Input
                  id="link-splices"
                  type="number"
                  min={0}
                  max={288}
                  value={spliceCount}
                  onChange={(event) => setSpliceCount(event.target.value)}
                  className="font-mono text-[12px]"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="link-connection-loss">Connection loss (dB)</Label>
                <Input
                  id="link-connection-loss"
                  type="number"
                  step="0.1"
                  min={0}
                  max={20}
                  value={connectionLoss}
                  onChange={(event) => setConnectionLoss(event.target.value)}
                  className="font-mono text-[12px]"
                />
              </div>
            </div>

            <div className="mt-3 rounded-xl border border-white/60 bg-white/50 px-2.5 py-2 dark:border-white/10 dark:bg-white/[0.03]">
              <div className="flex items-center justify-between gap-2">
                <p className="inline-flex items-center gap-1.5 text-[9.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  <Gauge className="size-3 text-teal-500" />
                  Optical chain · live
                </p>
                <span className="font-mono text-[11.5px] font-semibold text-amber-700 dark:text-amber-300">
                  {opticalChain.spanLoss.totalLossDb.toFixed(2)} dB this span
                </span>
              </div>
              <p className="mt-1 font-mono text-[9.5px] text-muted-foreground">
                fibre {opticalChain.spanLoss.fibreLossDb.toFixed(2)} dB + splices{' '}
                {opticalChain.spanLoss.spliceLossDb.toFixed(2)} dB + connectors{' '}
                {opticalChain.spanLoss.connectionLossDb.toFixed(2)} dB
                {distance != null ? ` · ${formatDistance(distance)}` : ''}
              </p>
              {editing && link ? (
                opticalChain.affected.length > 0 ? (
                  <div className="mt-2 space-y-1">
                    {opticalChain.affected.map(({ onu, before, after }) => {
                      const previous = before?.rxPowerDbm ?? null;
                      return (
                        <div
                          key={onu.id}
                          className="flex items-center justify-between gap-2 rounded-lg bg-white/60 px-2 py-1 dark:bg-white/[0.04]"
                        >
                          <span
                            className="min-w-0 truncate font-mono text-[10px]"
                            title={after.route.map((node) => node.code).join(' → ')}
                          >
                            {after.route.map((node) => node.code).join(' → ')}
                          </span>
                          <span className="shrink-0 font-mono text-[10px]">
                            {previous === null ? '—' : previous.toFixed(2)}
                            <span className="mx-1 text-muted-foreground">→</span>
                            <span className={`font-semibold ${rxTone(after.status)}`}>
                              {after.rxPowerDbm.toFixed(2)} dBm
                            </span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="mt-1.5 text-[10px] text-muted-foreground">
                    No connected ONU route crosses this span yet.
                  </p>
                )
              ) : (
                <p className="mt-1.5 text-[10px] text-muted-foreground">
                  Connected ONU power previews once this span is saved.
                </p>
              )}
            </div>
          </section>

          <section className="min-w-0 rounded-xl border border-white/60 bg-white/40 p-3 dark:border-white/10 dark:bg-white/[0.03]">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div>
                <p className="text-[12px] font-semibold">Fibre cores</p>
                <p className="text-[10px] text-muted-foreground">
                  {connectedCount} connected · {rows.length - connectedCount} free · a core connects
                  when both ends are mapped
                  {type === 'tube'
                    ? ` · ${tubeOf(rows.length)} tube${tubeOf(rows.length) === 1 ? '' : 's'} of ${CORES_PER_TUBE}`
                    : ` · ${rows.length} standard core${rows.length === 1 ? '' : 's'}`}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={type === 'core' ? addCore : addTube}
                className="h-7 shrink-0 gap-1 px-2 text-[10.5px]"
                title={
                  type === 'core'
                    ? 'Append one more core to this cable'
                    : `Append a ${CORES_PER_TUBE}-core tube with TIA colours restarting at Blue`
                }
              >
                <Plus className="size-3" />
                {type === 'core' ? 'Add core' : `Add tube (${CORES_PER_TUBE} cores)`}
              </Button>
            </div>

            <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
              {rows.length > 0 ? (
                <div className="grid grid-cols-[auto_minmax(0,1fr)_1fr_1fr_auto_auto] items-center gap-2 px-2 pb-0.5 text-[8.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  <span aria-hidden />
                  <span>Core name</span>
                  <span className="truncate" title={`Cores patched at ${fromCode}`}>
                    From · {fromCodeShort}
                  </span>
                  <span className="truncate" title={`Cores patched at ${toCode}`}>
                    To · {toCodeShort}
                  </span>
                  <span className="text-right">State</span>
                  <span aria-hidden className="size-5" />
                </div>
              ) : null}
              {rows.map((row, index) => {
                const connected = Boolean(row.fromCore && row.toCore);
                // Radix mirrors every item into a hidden native <select> keyed by
                // value, so each option needs its own value even when two
                // splitters expose the same core name.
                const fromChoices: CoreOption[] =
                  row.fromCore && !fromOptions.some((option) => option.label === row.fromCore)
                    ? [
                        {
                          id: `cur-from-${row.id}-${row.fromCore}`,
                          label: row.fromCore,
                          name: displayCoreLabel(row.fromCore),
                          hint: 'core',
                          used: true,
                        },
                        ...fromOptions,
                      ]
                    : fromOptions;
                const toChoices: CoreOption[] =
                  row.toCore && !toOptions.some((option) => option.label === row.toCore)
                    ? [
                        {
                          id: `cur-to-${row.id}-${row.toCore}`,
                          label: row.toCore,
                          name: displayCoreLabel(row.toCore),
                          hint: 'core',
                          used: true,
                        },
                        ...toOptions,
                      ]
                    : toOptions;
                const fromValue =
                  fromChoices.find((option) => option.label === row.fromCore)?.id ?? 'none';
                const toValue = toChoices.find((option) => option.label === row.toCore)?.id ?? 'none';
                return (
                  <Fragment key={row.id}>
                  {type === 'tube' && index % CORES_PER_TUBE === 0 ? (
                    <div className="flex items-center gap-2 pt-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      <span>Tube {tubeOf(index + 1)}</span>
                      <span className="font-mono text-[8.5px] normal-case tracking-normal">
                        {tiaCoreLabel(index + 1)} →{' '}
                        {tiaCoreLabel(index + Math.min(CORES_PER_TUBE, rows.length - index))}
                      </span>
                      <span className="h-px flex-1 bg-border/60" />
                      <span>
                        {Math.min(CORES_PER_TUBE, rows.length - index)}/{CORES_PER_TUBE} cores
                      </span>
                      <button
                        type="button"
                        onClick={() => removeTube(index)}
                        title={`Delete tube ${tubeOf(index + 1)} and its cores`}
                        aria-label={`Delete tube ${tubeOf(index + 1)}`}
                        className="grid size-5 shrink-0 place-items-center rounded-md text-muted-foreground/70 transition hover:bg-destructive/10 hover:text-destructive active:scale-90"
                      >
                        <Trash2 className="size-3" />
                      </button>
                    </div>
                  ) : null}
                  <div className="grid grid-cols-[auto_minmax(0,1fr)_1fr_1fr_auto_auto] items-center gap-2 rounded-lg border border-white/50 bg-white/50 px-2 py-1.5 dark:border-white/[0.06] dark:bg-white/[0.02]">
                    <label
                      className="relative size-4 shrink-0 cursor-pointer rounded-full border border-white/70 shadow-inner transition hover:scale-110 dark:border-white/20"
                      style={{ backgroundColor: row.color }}
                      title={`Edit ${row.label || tiaCoreLabel(index + 1)} colour`}
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
                      placeholder={labelFor(index + 1)}
                      title={`${tiaCoreLabel(index + 1)} · core ${index + 1} — ${row.fromCore ? `from ${fromCode} ${displayCoreLabel(row.fromCore)}` : 'not connected at the from end'}, ${row.toCore ? `to ${toCode} ${displayCoreLabel(row.toCore)}` : 'not connected at the to end'}`}
                      className="h-8 min-w-0 rounded-md border border-transparent bg-transparent px-1.5 font-mono text-[10.5px] font-semibold outline-none transition focus:border-primary/40 focus:bg-background"
                    />
                    <Select
                      value={fromValue}
                      onValueChange={(value) => {
                        if (value === 'none') return updateRow(index, { fromCore: '' });
                        const picked = fromChoices.find((option) => option.id === value);
                        if (picked) updateRow(index, { fromCore: picked.label });
                      }}
                    >
                      <SelectTrigger
                        aria-label={`Core ${index + 1} from endpoint`}
                        className="h-8 font-mono text-[10.5px]"
                      >
                        <SelectValue placeholder="From port" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Not connected</SelectItem>
                        {fromChoices.map((option) => (
                          <SelectItem
                            key={option.id}
                            value={option.id}
                            disabled={option.used && option.label !== row.fromCore}
                          >
                            {option.name ?? option.label} · {option.hint}
                            {option.used ? ' (in use)' : ' (free)'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={toValue}
                      onValueChange={(value) => {
                        if (value === 'none') return updateRow(index, { toCore: '' });
                        const picked = toChoices.find((option) => option.id === value);
                        if (picked) updateRow(index, { toCore: picked.label });
                      }}
                    >
                      <SelectTrigger
                        aria-label={`Core ${index + 1} to endpoint`}
                        className="h-8 font-mono text-[10.5px]"
                      >
                        <SelectValue placeholder="To port" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Not connected</SelectItem>
                        {toChoices.map((option) => (
                          <SelectItem
                            key={option.id}
                            value={option.id}
                            disabled={option.used && option.label !== row.toCore}
                          >
                            {option.name ?? option.label} · {option.hint}
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
                    {type === 'core' ? (
                      <button
                        type="button"
                        onClick={() => removeCore(index)}
                        title={`Delete ${row.label || `core ${index + 1}`} from this cable`}
                        aria-label={`Delete ${row.label || `core ${index + 1}`}`}
                        className="grid size-5 shrink-0 place-items-center rounded-md text-muted-foreground/70 transition hover:bg-destructive/10 hover:text-destructive active:scale-90"
                      >
                        <Trash2 className="size-3" />
                      </button>
                    ) : (
                      <span className="size-5" />
                    )}
                  </div>
                  </Fragment>
                );
              })}
              {rows.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-[11px] text-muted-foreground">
                  {type === 'core'
                    ? 'Add cores with the button above, or set a core count.'
                    : 'Add a tube with the button above to generate cores.'}
                </p>
              ) : null}
            </div>
          </section>

          <div className="flex items-center justify-between gap-3 rounded-xl border border-white/60 bg-white/40 px-3 py-2.5 dark:border-white/10 dark:bg-white/[0.03]">
            <div>
              <p className="text-[12px] font-semibold">Link colour</p>
              <p className="text-[10px] text-muted-foreground">
                Draw this cable in any colour on the map; default keeps the live cyan styling.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {color ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-[11px]"
                  onClick={() => setColor(null)}
                >
                  Default
                </Button>
              ) : null}
              <label
                className="relative grid size-9 cursor-pointer place-items-center rounded-xl border border-white/70 shadow-inner transition hover:scale-105 dark:border-white/15"
                style={{ backgroundColor: color ?? '#67e8f9' }}
                title={color ? `Link colour ${color}` : 'Pick a custom link colour'}
              >
                <input
                  type="color"
                  value={color ?? '#67e8f9'}
                  onChange={(event) => setColor(event.target.value)}
                  aria-label="Link colour"
                  className="absolute inset-0 size-full cursor-pointer opacity-0"
                />
              </label>
            </div>
          </div>

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
          </DialogBody>

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
      onu.fibreId ? `Fibre ${onu.fibreId}` : null,
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
    const feeds = splitterFeedLabels(tj);
    const used = cores.filter((core) => tjCoreUnavailable(core, feeds)).length;
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
  // OLT spans only use PON ports.
  const ports = olt.ponPorts ?? [];
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
  options,
  side,
  onPick,
}: {
  info: DeviceInfo;
  /** Every port of the device, free and occupied, so nothing is hidden. */
  options: CoreOption[];
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
          Ports/cores {side === 'from' ? '(from)' : '(to)'} — free selectable · in use listed
        </p>
        {options.length > 0 ? (
          <div className="flex max-h-24 flex-wrap gap-1 overflow-y-auto pr-1">
            {options.map((opt) =>
              opt.used ? (
                <span
                  key={opt.id}
                  className="inline-flex cursor-not-allowed items-center gap-1 rounded-md border border-rose-500/25 bg-rose-500/10 px-2 py-1 text-[10px] font-medium text-rose-600 opacity-70 dark:text-rose-300"
                  title={`${opt.name ?? opt.label} · ${opt.hint} · in use`}
                >
                  {opt.name ?? opt.label}
                  <span className="text-[9px]">in use</span>
                </span>
              ) : (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onPick(opt.label)}
                  className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px] font-medium text-emerald-700 transition hover:bg-emerald-500/20 dark:text-emerald-300"
                  title={`${opt.name ?? opt.label} · ${opt.hint}`}
                >
                  {opt.name ?? opt.label}
                  <span className="text-[9px] text-muted-foreground">{opt.hint}</span>
                </button>
              ),
            )}
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

function deviceCode(key: string, tjs: Tj[], olts: Olt[], onus: Onu[]): string | null {
  const parts = splitKey(key);
  if (!parts) return null;
  if (parts.kind === 'tj') return tjs.find((item) => item.id === parts.id)?.code ?? null;
  if (parts.kind === 'onu') return onus.find((item) => item.id === parts.id)?.username ?? null;
  return olts.find((item) => item.id === parts.id)?.code ?? null;
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
    return (onu.cores ?? []).map((core, index) => ({
      id: optionId(),
      label: core.label,
      name: displayCoreLabel(core.label, index + 1),
      hint: 'drop core',
      used: core.status === 'in_use',
    }));
  }
  if (parts.kind === 'tj') {
    const tj = tjs.find((item) => item.id === parts.id);
    if (!tj) return [];
    const options: CoreOption[] = [];
    const push = (label: string, hint: string, used: boolean, name?: string | null) => {
      if (!label) return;
      options.push({
        id: optionId(),
        label,
        name: name ?? displayCoreLabel(label, options.length + 1),
        hint,
        used,
      });
    };

    const cores = tj.cores ?? [];
    const coreLabels = new Set(cores.map((core) => core.label));
    const feeds = splitterFeedLabels(tj);
    cores.forEach((core) => {
      push(
        core.label,
        feeds.has(core.label) ? 'splitter input' : 'core',
        tjCoreUnavailable(core, feeds),
        splitterFeedName(tj, core.label),
      );
    });
    feeds.forEach((label) => {
      if (!coreLabels.has(label)) {
        push(label, 'splitter input', false, splitterFeedName(tj, label));
      }
    });

    // A joint can carry several splitters; every leg is connectable, labelled with
    // the splitter it belongs to so parallel splitters stay distinguishable.
    const splitters = tj.splitters?.length ? tj.splitters : tj.splitter ? [tj.splitter] : [];
    splitters.forEach((splitter, index) => {
      if (!splitter?.enabled) return;
      const hint = `splitter ${index + 1}${splitter.ratio ? ` · ${splitter.ratio}` : ''}`;
      (splitter.outputs ?? []).forEach((core) => {
        push(core.label, hint, core.status === 'in_use');
      });
    });

    // Legs mirrored onto the joint's output cores that no splitter lists.
    const splitterLegs = new Set(
      splitters.flatMap((splitter) => (splitter?.outputs ?? []).map((core) => core.label)),
    );
    (tj.outputCores ?? []).forEach((core) => {
      if (!splitterLegs.has(core.label)) {
        push(core.label, 'output core', core.status === 'in_use');
      }
    });

    return options;
  }
  const olt = olts.find((item) => item.id === parts.id);
  if (!olt) return [];
  const other = splitKey(otherKey);

  // A TJ ↔ OLT span is a PON drop: the OLT side uses a free PON port only.
  if (other?.kind === 'tj') {
    return olt.ponPorts
      .filter((port) => port.status !== 'in_use')
      .map((port) => ({
        id: optionId(),
        label: port.label,
        hint: `${port.outputDbm === null ? 'PON' : `PON · +${port.outputDbm} dBm`}${
          port.name ? ` · ${port.name}` : ''
        }`,
        used: false,
      }));
  }

  return olt.ponPorts.map((port) => ({
    id: optionId(),
    label: port.label,
    hint: `${port.outputDbm === null ? 'PON' : `PON · +${port.outputDbm} dBm`}${
      port.name ? ` · ${port.name}` : ''
    }`,
    used: port.status === 'in_use',
  }));
}

function rxTone(status: PowerBudget['status']) {
  return cn(
    status === 'ok' && 'text-emerald-600 dark:text-emerald-400',
    status === 'marginal' && 'text-amber-600 dark:text-amber-400',
    status === 'over' && 'text-orange-600 dark:text-orange-400',
    status === 'overload' && 'text-rose-600 dark:text-rose-400',
  );
}
