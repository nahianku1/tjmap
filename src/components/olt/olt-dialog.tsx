'use client';

import { useEffect, useState } from 'react';
import { Loader2, Plus, TriangleAlert, X } from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { OltFrontPanel } from '@/components/olt/olt-front-panel';
import { SubAreaDialog } from '@/components/directory/sub-area-dialog';
import { displayCoreLabel } from '@/lib/fibre-cores';
import { ponOnuCapacity, ponPortOccupancy } from '@/lib/pon-capacity';
import type { Area, FibreLink, Olt, PonPort, SubArea } from '@/lib/types';

const PON_DBM = [3, 5, 7, 9];
const MAX_PORTS = 64;

interface OltDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  olt?: Olt | null;
  /** Coordinates picked on the map when placing a new cabinet. */
  draftPoint?: { lat: number; lng: number } | null;
  /** Area to assign when the cabinet is dropped on an area map. */
  defaultAreaId?: string | null;
  /** Fibre spans on this map, used to move the cabinet onto another cable core. */
  links?: FibreLink[];
  onLinksChanged?: () => void | Promise<void>;
  onSaved: (olt: Olt, mode: 'create' | 'update') => void;
}

const PON_PREFIX = 'GPON 0/1/';

/** Next port name: bump the trailing number of the last named port, else start at 1. */
function nextPortLabel(rows: { label: string }[], prefix: string): string {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const label = rows[index].label.trim();
    const match = label.match(/^(.*?)(\d+)$/);
    if (!match) continue;
    const next = String(Number(match[2]) + 1).padStart(match[2].length, '0');
    return `${match[1]}${next}`;
  }
  return `${prefix}1`;
}

function PortStatusPill({ port, capacity }: { port: PonPort; capacity: number }) {
  const { onus, full } = ponPortOccupancy(port, capacity);
  const inUse = port.status === 'in_use';
  return (
    <span className="flex shrink-0 items-center gap-1">
      <span
        title={`${onus} of ${capacity} ONUs provisioned on this PON port`}
        className={`rounded px-1.5 py-0.5 font-mono text-[9.5px] font-semibold ${
          full
            ? 'bg-destructive/15 text-destructive'
            : onus > 0
              ? 'bg-sky-500/15 text-sky-700 dark:text-sky-300'
              : 'bg-muted text-muted-foreground'
        }`}
      >
        {onus}/{capacity} ONU
      </span>
      <span
        title={
          full
            ? `This port serves its ${capacity}-ONU limit`
            : inUse
              ? `${port.joints ?? 1} joints served`
              : 'No joints use this port'
        }
        className={`rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${
          full
            ? 'bg-destructive/15 text-destructive'
            : inUse
              ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
              : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
        }`}
      >
        {full ? 'Full' : inUse ? 'In use' : 'Free'}
      </span>
    </span>
  );
}

function initialPonRows(olt?: Olt | null): PonPort[] {
  if (olt?.ponPorts?.length) return olt.ponPorts.map((port) => ({ ...port }));
  if (olt?.ponPort) return [{ label: olt.ponPort, outputDbm: null }];
  return [{ label: `${PON_PREFIX}1`, outputDbm: 3 }];
}

/** Active cable patched into this cabinet; a span on the primary PON port wins. */
function linkedFibreIdOf(olt: Olt | null | undefined, links: FibreLink[]): string | null {
  if (!olt) return null;
  const touching = links.filter(
    (link) =>
      link.status === 'active' &&
      (link.fromOltId === olt.id || link.toOltId === olt.id),
  );
  if (touching.length === 0) return null;
  const pon = olt.ponPort?.trim().toLowerCase();
  const onPort = pon
    ? touching.find((link) => {
        const core = link.fromOltId === olt.id ? link.fromCoreLabel : link.toCoreLabel;
        return (core ?? '').trim().toLowerCase() === pon;
      })
    : undefined;
  return (onPort ?? touching[0]).fibreId;
}

export function OltDialog({
  open,
  onOpenChange,
  olt,
  draftPoint,
  defaultAreaId,
  links = [],
  onLinksChanged,
  onSaved,
}: OltDialogProps) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [oltType, setOltType] = useState('gpon');
  const [ponRows, setPonRows] = useState<PonPort[]>([]);
  const [areaId, setAreaId] = useState('none');
  const [subAreaId, setSubAreaId] = useState('none');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [fibreId, setFibreId] = useState('');
  const [notes, setNotes] = useState('');
  const [areas, setAreas] = useState<Area[]>([]);
  const [subAreas, setSubAreas] = useState<SubArea[]>([]);
  const [subAreaFormOpen, setSubAreaFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [portChanging, setPortChanging] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Closing by any route drops the draft so the next open shows the OLT as
  // stored (or an empty form), not the half-filled one that was cancelled.
  useEffect(() => {
    if (open) return;
    setName('');
    setCode('');
    setOltType('gpon');
    setPonRows([]);
    setAreaId('none');
    setSubAreaId('none');
    setLat('');
    setLng('');
    setFibreId('');
    setNotes('');
    setSubAreaFormOpen(false);
    setSaving(false);
    setPortChanging(null);
    setError(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setName(olt?.name ?? '');
    setCode(olt?.code ?? '');
    setOltType(olt?.oltType ?? 'gpon');
    setPonRows(initialPonRows(olt));
    setAreaId(olt?.areaId ?? defaultAreaId ?? 'none');
    setSubAreaId(olt?.subAreaId ?? 'none');
    setLat(olt?.lat != null ? String(olt.lat) : draftPoint ? draftPoint.lat.toFixed(6) : '');
    setLng(olt?.lng != null ? String(olt.lng) : draftPoint ? draftPoint.lng.toFixed(6) : '');
    setFibreId(olt?.fibreId ?? '');
    setNotes(olt?.notes ?? '');

    let cancelled = false;
    api
      .areas()
      .then((list) => {
        if (!cancelled) setAreas(list);
      })
      .catch(() => {
        if (!cancelled) setAreas([]);
      });
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
  }, [open, olt, draftPoint, defaultAreaId]);

  const autoFibreId = linkedFibreIdOf(olt, links);
  useEffect(() => {
    if (!autoFibreId) return;
    setFibreId((current) => (current === autoFibreId ? current : autoFibreId));
  }, [autoFibreId]);

  function updatePon(index: number, patch: Partial<PonPort>) {
    setPonRows((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (name.trim().length < 2) {
      setError('Give the OLT a name, e.g. Gulshan Core OLT.');
      return;
    }
    if (ponRows.some((row) => !row.label.trim())) {
      setError('Name every PON port, or remove the empty row.');
      return;
    }
    const vlanOutOfRange = ponRows.some(
      (row) =>
        row.vlanId != null &&
        (!Number.isInteger(row.vlanId) || row.vlanId < 1 || row.vlanId > 4094),
    );
    if (vlanOutOfRange) {
      setError('VLAN IDs must be between 1 and 4094, or left blank.');
      return;
    }
    if (Boolean(lat.trim()) !== Boolean(lng.trim())) {
      setError('Set both latitude and longitude, or leave both empty.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: name.trim(),
        code: code.trim() ? code.trim().toUpperCase() : undefined,
        oltType,
        ponPorts: ponRows.map((row) => ({
          label: row.label.trim(),
          name: row.name?.trim() || null,
          outputDbm: row.outputDbm,
          vlanId: row.vlanId ?? null,
        })),
        fibreId: fibreId.trim() || null,
        areaId: areaId === 'none' ? null : areaId,
        subAreaId: subAreaValue === 'none' ? null : subAreaValue,
        notes: notes.trim() || undefined,
        ...(lat.trim() && lng.trim() ? { lat: Number(lat), lng: Number(lng) } : {}),
      };
      const saved = olt ? await api.updateOlt(olt.id, payload) : await api.createOlt(payload);
      toast.success(olt ? `${saved.name} updated` : `${saved.name} added`, {
        description: olt ? 'OLT details saved.' : 'Pick it on a joint to set its PON port.',
      });
      onSaved(saved, olt ? 'update' : 'create');
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save this OLT.');
    } finally {
      setSaving(false);
    }
  }

  const ponCapacity = ponOnuCapacity(oltType);
  const ponOnuTotal = ponRows.reduce((sum, row) => sum + (row.onus ?? 0), 0);
  const ponFullCount = ponRows.filter((row) => ponPortOccupancy(row, ponCapacity).full).length;
  const areaSubAreas = subAreas.filter((subArea) => subArea.areaId === areaId);
  const activeArea = areas.find((area) => area.id === areaId) ?? null;
  const subAreaValue = areaSubAreas.some((subArea) => subArea.id === subAreaId)
    ? subAreaId
    : 'none';

  const attachedLinks = olt
    ? links.filter((link) => link.fromOltId === olt.id || link.toOltId === olt.id)
    : [];

  async function handleReassignPort(link: FibreLink, coreIndex: number, newPort: string | null) {
    const key = `${link.id}-${coreIndex}`;
    setPortChanging(key);
    try {
      const isFrom = link.fromOltId === olt?.id;
      const existingCores = link.cores ?? [];
      const updatedCores = existingCores.map((core, i) => {
        if (i !== coreIndex) return core;
        return {
          ...core,
          [isFrom ? 'fromCoreLabel' : 'toCoreLabel']: newPort,
        };
      });
      await api.updateLink(link.id, { cores: updatedCores });
      toast.success(newPort ? `Port changed to ${newPort}` : 'Port unassigned');
      await onLinksChanged?.();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not change port');
    } finally {
      setPortChanging(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">        <DialogHeader>
          <DialogTitle>{olt ? `Edit ${olt.name}` : 'New OLT'}</DialogTitle>
          <DialogDescription>
            An OLT carries its PON ports with output power. Joints pick an OLT from this list.
          </DialogDescription>
          {draftPoint && !olt ? (
            <p className="rounded-lg border border-sky-500/30 bg-sky-500/[0.08] px-2.5 py-1.5 font-mono text-[10.5px] text-sky-800 dark:text-sky-200">
              Placed at {draftPoint.lat.toFixed(5)}, {draftPoint.lng.toFixed(5)}
            </p>
          ) : null}
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <DialogBody className="space-y-4">
          <div className="overflow-hidden rounded-xl border border-border bg-[#070d16]">
            <OltFrontPanel
              ports={ponRows}
              links={links}
              oltId={olt?.id ?? null}
              code={code || olt?.code || null}
              className="block h-auto w-full"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="olt-form-name">OLT name</Label>
              <Input
                id="olt-form-name"
                required
                placeholder="Gulshan Core OLT"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="olt-form-code">Code</Label>
              <Input
                id="olt-form-code"
                placeholder="OLT-DHK-01"
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                className="font-mono text-[12px] tracking-wide"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="olt-form-type">OLT Type</Label>
              <Select value={oltType} onValueChange={setOltType}>
                <SelectTrigger id="olt-form-type" className="h-9 text-[12px]">
                  <SelectValue placeholder="OLT Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gpon">GPON</SelectItem>
                  <SelectItem value="epon">EPON</SelectItem>
                  <SelectItem value="xgs_pon">XGS-PON</SelectItem>
                  <SelectItem value="xg_pon">XG-PON</SelectItem>
                  <SelectItem value="combo">Combo PON</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="olt-form-fibre">Input Fibre ID</Label>
            <Input
              id="olt-form-fibre"
              placeholder="F-DHK-GL-01"
              value={fibreId}
              onChange={(event) => setFibreId(event.target.value)}
              readOnly={Boolean(autoFibreId)}
              className={cn(
                'font-mono text-[12px]',
                autoFibreId && 'bg-muted/40 text-muted-foreground',
              )}
            />
            <p className="text-[10px] text-muted-foreground">
              {autoFibreId
                ? 'Assigned automatically from the cable linked into this OLT.'
                : 'Optional. Set manually, or connect a link to this OLT.'}
            </p>
          </div>

          <section className="space-y-2.5 rounded-xl border border-border bg-muted/20 p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[12px] font-semibold">PON ports</p>
                <p className="text-[10px] text-muted-foreground">
                  {ponRows.filter((row) => row.status !== 'in_use').length} of {ponRows.length} free
                  · {ponOnuTotal} ONUs
                  {ponFullCount > 0 ? (
                    <span className="font-semibold text-destructive"> · {ponFullCount} full</span>
                  ) : null}
                  {' '}· {ponCapacity} ONUs per port ({oltType.replace('_', '-').toUpperCase()})
                </p>
              </div>
              <Button
                type="button"
                variant="subtle"
                size="sm"
                disabled={ponRows.length >= MAX_PORTS}
                onClick={() =>
                  setPonRows((rows) => [
                    ...rows,
                    { label: nextPortLabel(rows, PON_PREFIX), outputDbm: 3 },
                  ])
                }
              >
                <Plus className="size-3.5" />
                Add PON
              </Button>
            </div>

            {ponRows.map((row, index) => (
              <div
                key={`pon-${index}`}
                className="space-y-2 rounded-lg border border-border/60 bg-background/60 p-2.5"
              >
                <div className="flex items-center gap-2">
                  <Input
                    aria-label={`PON port ${index + 1}`}
                    placeholder="GPON 0/1/1"
                    value={row.label}
                    onChange={(event) => updatePon(index, { label: event.target.value })}
                    className="h-9 min-w-0 flex-1 font-mono text-[11.5px]"
                  />
                  <PortStatusPill port={row} capacity={ponCapacity} />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove PON port ${index + 1}`}
                    disabled={ponRows.length === 1}
                    onClick={() => setPonRows((rows) => rows.filter((_row, i) => i !== index))}
                  >
                    <X className="size-3.5" />
                  </Button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    aria-label={`PON port ${index + 1} name`}
                    placeholder="Port name, e.g. Gulshan feeder"
                    value={row.name ?? ''}
                    onChange={(event) => updatePon(index, { name: event.target.value })}
                    className="h-9 min-w-[140px] flex-1 text-[11.5px]"
                  />
                  <Select
                    value={row.outputDbm === null ? 'none' : String(row.outputDbm)}
                    onValueChange={(value) =>
                      updatePon(index, { outputDbm: value === 'none' ? null : Number(value) })
                    }
                  >
                    <SelectTrigger
                      aria-label={`PON port ${index + 1} output dBm`}
                      className="h-9 w-[100px] font-mono text-[11.5px]"
                    >
                      <SelectValue placeholder="dBm" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No dBm</SelectItem>
                      {PON_DBM.map((value) => (
                        <SelectItem key={value} value={String(value)}>
                          +{value} dBm
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    min={1}
                    max={4094}
                    step={1}
                    aria-label={`PON port ${index + 1} VLAN`}
                    inputMode="numeric"
                    placeholder="VLAN"
                    value={row.vlanId ?? ''}
                    onChange={(event) => {
                      const digits = event.target.value.replace(/[^0-9]/g, '').slice(0, 4);
                      updatePon(index, { vlanId: digits ? Number(digits) : null });
                    }}
                    className="h-9 w-[76px] font-mono text-[11.5px]"
                  />
                </div>
              </div>
            ))}
          </section>

          <div className="space-y-2">
            <Label htmlFor="olt-form-area">Service area</Label>
            <Select
              value={areaId}
              onValueChange={(value) => {
                setAreaId(value);
                setSubAreaId('none');
              }}
            >
              <SelectTrigger id="olt-form-area">
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Unassigned</SelectItem>
                {areas.map((area) => (
                  <SelectItem key={area.id} value={area.id}>
                    {area.districtName} · {area.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="olt-form-sub-area">Sub-area</Label>
              <Button
                type="button"
                variant="subtle"
                size="sm"
                className="h-7 px-2 text-[10.5px]"
                disabled={areaId === 'none'}
                title={
                  areaId === 'none'
                    ? 'Pick a service area first'
                    : `Create a sub-area in ${activeArea?.name ?? 'this area'}`
                }
                onClick={() => setSubAreaFormOpen(true)}
              >
                <Plus className="size-3" />
                New
              </Button>
            </div>
            <Select
              value={subAreaValue}
              onValueChange={setSubAreaId}
              disabled={areaId === 'none'}
            >
              <SelectTrigger id="olt-form-sub-area">
                <SelectValue
                  placeholder={areaId === 'none' ? 'Pick a service area first' : 'No sub-area'}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No sub-area</SelectItem>
                {areaSubAreas.map((subArea) => (
                  <SelectItem key={subArea.id} value={subArea.id}>
                    {subArea.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="olt-form-lat">Latitude</Label>
              <Input
                id="olt-form-lat"
                inputMode="decimal"
                placeholder="23.7807"
                value={lat}
                onChange={(event) => setLat(event.target.value)}
                className="font-mono text-[12px]"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="olt-form-lng">Longitude</Label>
              <Input
                id="olt-form-lng"
                inputMode="decimal"
                placeholder="90.4172"
                value={lng}
                onChange={(event) => setLng(event.target.value)}
                className="font-mono text-[12px]"
              />
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Optional. OLTs with coordinates appear as cabinet pins on the map.
          </p>

          {olt && attachedLinks.length > 0 ? (
            <section className="space-y-2.5 rounded-xl border border-border bg-muted/20 p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[12px] font-semibold">Port Change / Assignments</p>
                  <p className="text-[10px] text-muted-foreground">
                    Reassign connected cables or links to a different PON port on this OLT
                  </p>
                </div>
                <span className="rounded bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                  {attachedLinks.length} connected cable{attachedLinks.length === 1 ? '' : 's'}
                </span>
              </div>

              <div className="space-y-2">
                {attachedLinks.map((link) => {
                  const isFrom = link.fromOltId === olt.id;
                  const destCode = isFrom ? link.toCode : link.fromCode;
                  const cores = link.cores ?? [];
                  const activeCores = cores.filter((c) => Boolean(isFrom ? c.fromCoreLabel : c.toCoreLabel));
                  const displayList = activeCores.length > 0 ? activeCores : cores.slice(0, 1);

                  return (
                    <div
                      key={link.id}
                      className="space-y-1.5 rounded-lg border border-border/60 bg-background/60 p-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[11.5px] font-semibold text-foreground">
                          {link.fibreId}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          Connected to <strong className="font-mono">{destCode ?? 'Device'}</strong>
                        </span>
                      </div>

                      {displayList.map((core) => {
                        const coreIndex = cores.indexOf(core);
                        const currentPort = isFrom ? core.fromCoreLabel : core.toCoreLabel;
                        const key = `${link.id}-${coreIndex}`;

                        return (
                          <div key={key} className="flex items-center justify-between gap-2 pt-1">
                            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                              <span>Core {displayCoreLabel(core.label, coreIndex + 1)}:</span>
                            </div>

                            <div className="flex items-center gap-2">
                              <Select
                                value={currentPort ?? 'none'}
                                disabled={portChanging === key}
                                onValueChange={(val) =>
                                  handleReassignPort(link, coreIndex, val === 'none' ? null : val)
                                }
                              >
                                <SelectTrigger className="h-8 w-[160px] font-mono text-[11px]">
                                  <SelectValue placeholder="Select PON port" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">Unassigned</SelectItem>
                                  {ponRows.map((port) => (
                                    <SelectItem key={port.label} value={port.label}>
                                      {port.label} {port.name ? `(${port.name})` : ''}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              {portChanging === key ? (
                                <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="olt-form-notes">Notes</Label>
            <Textarea
              id="olt-form-notes"
              placeholder="Rack 3, POP Gulshan, dual power feed…"
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

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              {olt ? 'Save changes' : 'Create OLT'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>

      <SubAreaDialog
        open={subAreaFormOpen}
        onOpenChange={setSubAreaFormOpen}
        areaId={areaId === 'none' ? '' : areaId}
        areaName={activeArea ? `${activeArea.districtName} · ${activeArea.name}` : 'this area'}
        onSaved={(saved) => {
          setSubAreas((list) =>
            list.some((item) => item.id === saved.id) ? list : [...list, saved],
          );
          setSubAreaId(saved.id);
        }}
      />
    </Dialog>
  );
}
