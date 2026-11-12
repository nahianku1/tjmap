'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Cable, Loader2, Ruler, Trash2, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { api, ApiError } from '@/lib/api';
import type { FibreLink, LinkStatus, Tj } from '@/lib/types';
import { formatDistance } from '@/lib/utils';

const CABLE_TYPES = [
  '12F Armoured',
  '24F Duct',
  '48F Duct',
  '96F Backbone',
  '12F Aerial',
  '24F Submarine',
  'Other',
];

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const radius = 6371000;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * radius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface LinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  from: Tj | null;
  to: Tj | null;
  link?: FibreLink | null;
  onSaved: (link: FibreLink, mode: 'create' | 'update') => void;
  onRequestDelete?: (link: FibreLink) => void;
}

export function LinkDialog({ open, onOpenChange, from, to, link, onSaved, onRequestDelete }: LinkDialogProps) {
  const editing = Boolean(link);
  const [fibreId, setFibreId] = useState('');
  const [cableType, setCableType] = useState('24F Duct');
  const [coreCount, setCoreCount] = useState('12');
  const [status, setStatus] = useState<LinkStatus>('active');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (link) {
      setFibreId(link.fibreId);
      setCableType(link.cableType ?? '24F Duct');
      setCoreCount(String(link.coreCount));
      setStatus(link.status);
      setNotes(link.notes ?? '');
    } else {
      setFibreId('');
      setCableType('24F Duct');
      setCoreCount('12');
      setStatus('active');
      setNotes('');
    }
  }, [open, link]);

  const distance = useMemo(() => {
    if (link?.lengthM != null) return link.lengthM;
    if (from && to) return haversine(from.lat, from.lng, to.lat, to.lng);
    return null;
  }, [link, from, to]);

  const fromCode = link?.fromCode ?? from?.code ?? '—';
  const toCode = link?.toCode ?? to?.code ?? '—';

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!editing && (!from || !to)) return;
    if (!fibreId.trim()) return setError('A fibre ID is required to identify this span.');

    const count = Number(coreCount);
    if (!Number.isFinite(count) || count < 0) return setError('Core count must be zero or more.');

    setSaving(true);
    setError(null);
    try {
      const saved = editing && link
        ? await api.updateLink(link.id, {
            fibreId: fibreId.trim(),
            cableType: cableType.trim() || undefined,
            coreCount: Math.round(count),
            status,
            notes: notes.trim() || undefined,
          })
        : await api.createLink({
            fromTjId: from!.id,
            toTjId: to!.id,
            fibreId: fibreId.trim(),
            cableType: cableType.trim() || undefined,
            coreCount: Math.round(count),
            status,
            notes: notes.trim() || undefined,
          });

      toast.success(editing ? `Span ${saved.fibreId} updated` : `Span ${saved.fibreId} linked`, {
        description: `${saved.fromCode} → ${saved.toCode}`,
      });
      onSaved(saved, editing ? 'update' : 'create');
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save this fibre span.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? `Span ${link?.fibreId}` : 'Link two terminal joints'}</DialogTitle>
          <DialogDescription>
            {editing
              ? 'Inspect and update this fibre span. Changes apply immediately on the map.'
              : 'Describe the cable between these joints. Distance is measured with PostGIS geography.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 rounded-2xl border border-white/60 bg-white/45 p-3 dark:border-white/10 dark:bg-white/[0.03]">
          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">From</p>
            <p className="truncate font-mono text-[12px] font-semibold">{fromCode}</p>
          </div>
          <div className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
            <ArrowRight className="size-4" />
          </div>
          <div className="min-w-0 flex-1 text-right">
            <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">To</p>
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
            {coreCount || 0} cores
          </span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
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

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="link-type">Cable type</Label>
              <Select value={cableType} onValueChange={setCableType}>
                <SelectTrigger id="link-type">
                  <SelectValue placeholder="Select cable" />
                </SelectTrigger>
                <SelectContent>
                  {CABLE_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="link-cores">Core count</Label>
              <Input
                id="link-cores"
                type="number"
                min={0}
                max={288}
                value={coreCount}
                onChange={(event) => setCoreCount(event.target.value)}
                className="font-mono text-[12px]"
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-white/60 bg-white/40 px-3 py-2.5 dark:border-white/10 dark:bg-white/[0.03]">
            <div>
              <p className="text-[12px] font-semibold">Span is cut</p>
              <p className="text-[10px] text-muted-foreground">Cuts render as dashed rose lines on the map.</p>
            </div>
            <Switch
              checked={status === 'cut'}
              onCheckedChange={(checked) => setStatus(checked ? 'cut' : 'active')}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="link-notes">Span notes</Label>
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
                  Delete span
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
                {editing ? 'Save span' : 'Create link'}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
