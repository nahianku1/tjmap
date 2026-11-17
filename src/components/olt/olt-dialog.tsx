'use client';

import { useEffect, useState } from 'react';
import { Loader2, Plus, TriangleAlert, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
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
import { OLT_PHOTO } from '@/lib/photos';
import { FibreCorePicker } from '@/components/map/fibre-core-picker';
import type { Area, FibreLink, Olt, PonPort, PortStatus } from '@/lib/types';

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

function PortStatusPill({ status, joints }: { status?: PortStatus; joints?: number }) {
  const inUse = status === 'in_use';
  return (
    <span
      title={inUse ? `${joints ?? 1} joints served` : 'No joints use this port'}
      className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${
        inUse
          ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
          : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
      }`}
    >
      {inUse ? 'In use' : 'Free'}
    </span>
  );
}

function initialPonRows(olt?: Olt | null): PonPort[] {
  if (olt?.ponPorts?.length) return olt.ponPorts.map((port) => ({ ...port }));
  if (olt?.ponPort) return [{ label: olt.ponPort, outputDbm: null }];
  return [{ label: `${PON_PREFIX}1`, outputDbm: 3 }];
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
  const [ponRows, setPonRows] = useState<PonPort[]>([]);
  const [areaId, setAreaId] = useState('none');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [notes, setNotes] = useState('');
  const [areas, setAreas] = useState<Area[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setName(olt?.name ?? '');
    setCode(olt?.code ?? '');
    setPonRows(initialPonRows(olt));
    setAreaId(olt?.areaId ?? defaultAreaId ?? 'none');
    setLat(olt?.lat != null ? String(olt.lat) : draftPoint ? draftPoint.lat.toFixed(6) : '');
    setLng(olt?.lng != null ? String(olt.lng) : draftPoint ? draftPoint.lng.toFixed(6) : '');
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
    return () => {
      cancelled = true;
    };
  }, [open, olt, draftPoint, defaultAreaId]);

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
        ponPorts: ponRows.map((row) => ({
          label: row.label.trim(),
          outputDbm: row.outputDbm,
          vlanId: row.vlanId ?? null,
        })),
        areaId: areaId === 'none' ? null : areaId,
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
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

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="overflow-hidden rounded-xl border border-border">
            <img src={OLT_PHOTO} alt="OLT chassis" className="h-24 w-full object-cover" />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
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
          </div>

          <section className="space-y-2.5 rounded-xl border border-border bg-muted/20 p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[12px] font-semibold">PON ports</p>
                <p className="text-[10px] text-muted-foreground">
                  {ponRows.filter((row) => row.status !== 'in_use').length} of {ponRows.length} free
                  · output power and VLAN per port
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
              <div key={`pon-${index}`} className="flex flex-wrap items-center gap-2">
                <Input
                  aria-label={`PON port ${index + 1}`}
                  placeholder="GPON 0/1/1"
                  value={row.label}
                  onChange={(event) => updatePon(index, { label: event.target.value })}
                  className="h-9 min-w-[120px] flex-1 font-mono text-[11.5px]"
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
                <PortStatusPill status={row.status} joints={row.joints} />
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
            ))}
          </section>

          <div className="space-y-2">
            <Label htmlFor="olt-form-area">Service area</Label>
            <Select value={areaId} onValueChange={setAreaId}>
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

          {olt ? (
            <FibreCorePicker
              kind="olt"
              deviceId={olt.id}
              links={links}
              onPatched={onLinksChanged}
            />
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
    </Dialog>
  );
}
