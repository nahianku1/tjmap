'use client';

import { useEffect, useState } from 'react';
import { Loader2, TriangleAlert, User } from 'lucide-react';
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
import { CoreEditor } from '@/components/map/core-editor';
import { api, ApiError } from '@/lib/api';
import { ONU_CLASS_OPTIONS, getOnuClassInfo } from '@/lib/optical';
import { FibreCorePicker } from '@/components/map/fibre-core-picker';
import type { Area, Core, FibreLink, Onu, OnuClass, PonType } from '@/lib/types';

interface OnuDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onu?: Onu | null;
  /** Coordinates picked on the map when placing a new ONU. */
  draftPoint?: { lat: number; lng: number } | null;
  /** Area to assign when dropped on an area map. */
  defaultAreaId?: string | null;
  /** Fibre ID of the link connected to this ONU; set, the field is read-only. */
  linkedFibreId?: string | null;
  /** Fibre spans on this map, used to move the ONU onto another cable core. */
  links?: FibreLink[];
  onLinksChanged?: () => void | Promise<void>;
  onSaved: (onu: Onu, mode: 'create' | 'update') => void;
}

const PALETTE = [
  '#22d3ee',
  '#34d399',
  '#a78bfa',
  '#fbbf24',
  '#fb7185',
  '#60a5fa',
  '#a3e635',
  '#fb923c',
];

function defaultCore(index: number): Core {
  return {
    label: `Core ${String(index).padStart(2, '0')}`,
    color: PALETTE[(index - 1) % PALETTE.length],
    count: 1,
    status: 'free',
  };
}

export function OnuDialog({
  open,
  onOpenChange,
  onu,
  draftPoint,
  defaultAreaId,
  linkedFibreId,
  links = [],
  onLinksChanged,
  onSaved,
}: OnuDialogProps) {
  const [username, setUsername] = useState('');
  const [macAddress, setMacAddress] = useState('');
  const [vlanId, setVlanId] = useState('');
  const [fibreId, setFibreId] = useState('');
  const [ponType, setPonType] = useState<PonType>('gpon');
  const [onuClass, setOnuClass] = useState<OnuClass>('B+');
  const [cores, setCores] = useState<Core[]>([defaultCore(1)]);
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
    setUsername(onu?.username ?? '');
    setMacAddress(onu?.macAddress ?? '');
    setVlanId(onu?.vlanId != null ? String(onu.vlanId) : '');
    setFibreId(onu?.fibreId ?? '');
    setPonType(onu?.ponType === 'epon' ? 'epon' : 'gpon');
    setOnuClass(getOnuClassInfo(onu?.ponType, onu?.onuClass).onuClass);
    setCores(
      onu?.cores?.length
        ? onu.cores.map((core) => ({
            label: core.label,
            color: core.color || PALETTE[0],
            count: 1,
            status: core.status ?? 'free',
          }))
        : [defaultCore(1)],
    );
    setAreaId(onu ? onu.areaId ?? 'none' : defaultAreaId ?? 'none');
    setLat(onu?.lat != null ? String(onu.lat) : draftPoint ? draftPoint.lat.toFixed(6) : '');
    setLng(onu?.lng != null ? String(onu.lng) : draftPoint ? draftPoint.lng.toFixed(6) : '');
    setNotes(onu?.notes ?? '');

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
  }, [open, onu, draftPoint, defaultAreaId]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const name = username.trim();
    const mac = macAddress.trim();
    const fid = fibreId.trim();
    if (!name) {
      setError('Username is required.');
      return;
    }
    if (cores.length === 0) {
      setError('Add at least one core for this fibre.');
      return;
    }
    if (Boolean(lat.trim()) !== Boolean(lng.trim())) {
      setError('Set both latitude and longitude, or leave both empty.');
      return;
    }

    const vidRaw = vlanId.trim();
    const parsedVlanId = vidRaw ? Number(vidRaw) : null;
    if (
      parsedVlanId !== null &&
      (!Number.isInteger(parsedVlanId) || parsedVlanId < 1 || parsedVlanId > 4094)
    ) {
      setError('VLAN ID must be a whole number between 1 and 4094.');
      return;
    }
    // Validate fibre ID length (optional field, but if provided must be 1-60 chars).
    if (fid && fid.length < 1) return setError('Fibre ID must be at least 1 character.');
    if (fid && fid.length > 60) return setError('Fibre ID must be at most 60 characters.');

    setSaving(true);
    setError(null);
    try {
      const payload = {
        username: name,
        macAddress: mac || undefined,
        vlanId: parsedVlanId,
        ponType,
        onuClass,
        cores: cores.map((core) => ({
          label: core.label.trim() || 'Core',
          color: core.color || PALETTE[0],
          status: core.status ?? 'free',
        })),
        areaId: areaId === 'none' ? null : areaId,
        notes: notes.trim() || undefined,
        ...(lat.trim() && lng.trim() ? { lat: Number(lat), lng: Number(lng) } : {}),
      };
      const payloadWithFibre = {
        ...payload,
        fibreId: fid || undefined,
      };
      const saved = onu ? await api.updateOnu(onu.id, payloadWithFibre) : await api.createOnu(payloadWithFibre);
      toast.success(onu ? `${saved.username} updated` : `${saved.username} added`, {
        description: `${saved.fibreId} · ${saved.cores.length} core${
          saved.cores.length === 1 ? '' : 's'
        }${saved.lat != null ? ' · placed on map' : ''}`,
      });
      onSaved(saved, onu ? 'update' : 'create');
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save this ONU.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
              <User className="size-4" />
            </span>
            {onu ? `Edit ${onu.username}` : 'Add ONU'}
          </DialogTitle>
          <DialogDescription>
            Register the subscriber ONU with its fibre, MAC, VLAN and cores.
          </DialogDescription>
          {draftPoint ? (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/[0.08] px-2.5 py-1.5 font-mono text-[10.5px] text-amber-800 dark:text-amber-200">
              Placed at {draftPoint.lat.toFixed(5)}, {draftPoint.lng.toFixed(5)}
            </p>
          ) : null}
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <section className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="onu-username">Username</Label>
              <Input
                id="onu-username"
                required
                placeholder="Customer / subscriber name"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="onu-mac-address">MAC address</Label>
              <Input
                id="onu-mac-address"
                placeholder="AA:BB:CC:DD:EE:FF"
                value={macAddress}
                onChange={(e) => setMacAddress(e.target.value)}
                className="font-mono text-[12px]"
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="onu-vlan-id">VLAN ID</Label>
              <Input
                id="onu-vlan-id"
                type="number"
                inputMode="numeric"
                min={1}
                max={4094}
                placeholder="100"
                value={vlanId}
                onChange={(e) => setVlanId(e.target.value)}
                className="font-mono text-[12px]"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="onu-fibre-id">Fibre ID</Label>
              <Input
                id="onu-fibre-id"
                placeholder="F-DHK-GL-09"
                value={fibreId}
                onChange={(e) => setFibreId(e.target.value)}
                className="font-mono text-[12px]"
                disabled={Boolean(linkedFibreId)}
              />
              {linkedFibreId ? (
                <p className="text-[10px] text-muted-foreground">
                  Taken from the fibre linked to this ONU — remove that link to set it by hand.
                </p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="onu-pon-type">PON technology</Label>
              <Select value={ponType} onValueChange={(value) => setPonType(value as PonType)}>
                <SelectTrigger id="onu-pon-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gpon">GPON</SelectItem>
                  <SelectItem value="epon">EPON</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="onu-class">ONU class</Label>
              <Select value={onuClass} onValueChange={(value) => setOnuClass(value as OnuClass)}>
                <SelectTrigger id="onu-class">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ONU_CLASS_OPTIONS.map((option) => {
                    const info = getOnuClassInfo(ponType, option);
                    return (
                      <SelectItem key={option} value={option}>
                        {info.label} · {info.minLossDb}–{info.maxLossDb} dB
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">
                ODN window {getOnuClassInfo(ponType, onuClass).minLossDb}–
                {getOnuClassInfo(ponType, onuClass).maxLossDb} dB · Rx sensitivity{' '}
                {getOnuClassInfo(ponType, onuClass).sensitivityDbm} dBm
              </p>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="onu-area">Service area</Label>
              <Select value={areaId} onValueChange={setAreaId}>
                <SelectTrigger id="onu-area">
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
            <div className="space-y-1.5">
              <Label htmlFor="onu-lat">Latitude</Label>
              <Input
                id="onu-lat"
                inputMode="decimal"
                placeholder="23.7807"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                className="font-mono text-[12px]"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="onu-lng">Longitude</Label>
              <Input
                id="onu-lng"
                inputMode="decimal"
                placeholder="90.4172"
                value={lng}
                onChange={(e) => setLng(e.target.value)}
                className="font-mono text-[12px]"
              />
            </div>
          </section>

          <section className="space-y-2 rounded-2xl border border-white/60 bg-white/40 p-3 dark:border-white/10 dark:bg-white/[0.03]">
            <div className="flex items-center justify-between">
              <Label className="text-[12px] font-semibold">Fibre cores</Label>
              <span className="text-[10px] text-muted-foreground">
                Add cores, set color/name & status
              </span>
            </div>
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              Each core can be named, color-coded, and marked{' '}
              <strong className="text-emerald-600 dark:text-emerald-400">Free</strong>,{' '}
              <strong className="text-sky-600 dark:text-sky-400">In Use</strong>, or{' '}
              <strong className="text-rose-600 dark:text-rose-400">Cut</strong> (tap status to cycle).
            </p>

            <CoreEditor
              value={cores}
              onChange={setCores}
              addLabel="Add core"
              emptyLabel="Add at least one core for this fibre"
            />
          </section>

          {onu ? (
            <FibreCorePicker
              kind="onu"
              deviceId={onu.id}
              links={links}
              onPatched={onLinksChanged}
            />
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="onu-notes">Notes</Label>
            <Textarea
              id="onu-notes"
              placeholder="ONT model, install date, splitter leg…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="min-h-[60px]"
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
            <Button type="submit" disabled={saving} className="gap-1.5">
              {saving ? <Loader2 className="size-4 animate-spin" /> : <User className="size-4" />}
              {onu ? 'Save changes' : 'Create ONU'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
