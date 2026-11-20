'use client';

import { useEffect, useState } from 'react';
import { Loader2, TriangleAlert } from 'lucide-react';
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
import { api, ApiError } from '@/lib/api';
import type { District } from '@/lib/types';

interface DistrictDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  district?: District | null;
  onSaved: (district: District, mode: 'create' | 'update') => void;
}

export function DistrictDialog({ open, onOpenChange, district, onSaved }: DistrictDialogProps) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A cancelled district form is discarded; opening again starts clean.
  useEffect(() => {
    if (open) return;
    setName('');
    setCode('');
    setDescription('');
    setSaving(false);
    setError(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setName(district?.name ?? '');
    setCode(district?.code ?? '');
    setDescription(district?.description ?? '');
  }, [open, district]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (name.trim().length < 2) {
      setError('Give the district a name, e.g. Dhaka.');
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
      const saved = district
        ? await api.updateDistrict(district.id, payload)
        : await api.createDistrict(payload);
      toast.success(district ? `${saved.name} updated` : `${saved.name} added`, {
        description: district ? 'District details saved.' : 'Now add the areas inside this district.',
      });
      onSaved(saved, district ? 'update' : 'create');
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save this district.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{district ? `Edit ${district.name}` : 'New district'}</DialogTitle>
          <DialogDescription>
            Districts group your service areas — a district can hold any number of areas.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <DialogBody className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="district-name">District name</Label>
            <Input
              id="district-name"
              required
              placeholder="Dhaka"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="district-code">Code</Label>
            <Input
              id="district-code"
              placeholder="DHK"
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              className="font-mono text-[12px] tracking-wide"
            />
            <p className="text-[10px] text-muted-foreground">
              Optional. Generated from the name when left blank.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="district-description">Description</Label>
            <Textarea
              id="district-description"
              placeholder="North Dhaka metro ring, 2 OLTs, 14 distribution areas…"
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
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              {district ? 'Save changes' : 'Create district'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
