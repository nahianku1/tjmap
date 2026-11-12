'use client';

import { useEffect, useState } from 'react';
import { Loader2, TriangleAlert } from 'lucide-react';
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
import { api, ApiError } from '@/lib/api';
import type { Area } from '@/lib/types';

interface AreaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  districtId: string;
  districtName: string;
  area?: Area | null;
  onSaved: (area: Area, mode: 'create' | 'update') => void;
}

export function AreaDialog({
  open,
  onOpenChange,
  districtId,
  districtName,
  area,
  onSaved,
}: AreaDialogProps) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setName(area?.name ?? '');
    setCode(area?.code ?? '');
    setDescription(area?.description ?? '');
  }, [open, area]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (name.trim().length < 2) {
      setError('Give the area a name, e.g. Gulshan–Banani.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: name.trim(),
        code: code.trim() ? code.trim().toUpperCase() : undefined,
        description: description.trim() || undefined,
      };
      const saved = area
        ? await api.updateArea(area.id, payload)
        : await api.createArea(districtId, payload);
      toast.success(area ? `${saved.name} updated` : `${saved.name} added to ${districtName}`, {
        description: area ? 'Area details saved.' : 'Assign terminal joints to it from the map.',
      });
      onSaved(saved, area ? 'update' : 'create');
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save this area.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{area ? `Edit ${area.name}` : `New area in ${districtName}`}</DialogTitle>
          <DialogDescription>
            Areas are the map you drill into — every terminal joint belongs to one area.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="area-name">Area name</Label>
            <Input
              id="area-name"
              required
              placeholder="Gulshan–Banani"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="area-code">Code</Label>
            <Input
              id="area-code"
              placeholder="GULSHAN"
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              className="font-mono text-[12px] tracking-wide"
            />
            <p className="text-[10px] text-muted-foreground">
              Optional. Generated from the name when left blank.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="area-description">Description</Label>
            <Textarea
              id="area-description"
              placeholder="8 joints, 2 splitters, fibre cut risk along the flyover…"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="min-h-[70px]"
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
              {area ? 'Save changes' : 'Create area'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
