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
import type { SubArea } from '@/lib/types';

interface SubAreaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  areaId: string;
  areaName: string;
  subArea?: SubArea | null;
  onSaved: (subArea: SubArea, mode: 'create' | 'update') => void;
}

export function SubAreaDialog({
  open,
  onOpenChange,
  areaId,
  areaName,
  subArea,
  onSaved,
}: SubAreaDialogProps) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A cancelled sub-area form is discarded; opening again starts clean.
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
    setName(subArea?.name ?? '');
    setCode(subArea?.code ?? '');
    setDescription(subArea?.description ?? '');
  }, [open, subArea]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (name.trim().length < 2) {
      setError('Give the sub-area a name, e.g. Block C · Road 12.');
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
      const saved = subArea
        ? await api.updateSubArea(subArea.id, payload)
        : await api.createSubArea(areaId, payload);
      toast.success(subArea ? `${saved.name} updated` : `${saved.name} added to ${areaName}`, {
        description: subArea
          ? 'Sub-area details saved.'
          : 'Pick it when placing devices or links in this area.',
      });
      onSaved(saved, subArea ? 'update' : 'create');
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save this sub-area.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{subArea ? `Edit ${subArea.name}` : `New sub-area in ${areaName}`}</DialogTitle>
          <DialogDescription>
            Sub-areas split this service area into placement zones. Devices and links can be filed
            under one.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <DialogBody className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="sub-area-name">Sub-area name</Label>
              <Input
                id="sub-area-name"
                required
                placeholder="Block C · Road 12"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="sub-area-code">Code</Label>
              <Input
                id="sub-area-code"
                placeholder="BLK-C"
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                className="font-mono text-[12px] tracking-wide"
              />
              <p className="text-[10px] text-muted-foreground">
                Optional. Leave blank to keep the sub-area name as its only identifier.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="sub-area-description">Description</Label>
              <Textarea
                id="sub-area-description"
                placeholder="Devices serving the eastern blocks of this area…"
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
              {subArea ? 'Save changes' : 'Create sub-area'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
