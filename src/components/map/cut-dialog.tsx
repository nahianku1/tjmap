'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Scissors, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api, ApiError } from '@/lib/api';
import type { CutSeverity, Tj } from '@/lib/types';

interface CutDialogProps {
  tj: Tj | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (tj: Tj) => void;
}

export function CutDialog({ tj, open, onOpenChange, onSaved }: CutDialogProps) {
  const [reason, setReason] = useState('');
  const [severity, setSeverity] = useState<CutSeverity>('major');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !tj) return;
    setReason(tj.cutReason ?? '');
    setSeverity(tj.cutSeverity ?? 'major');
    setError(null);
  }, [open, tj]);

  async function submit(cut: boolean) {
    if (!tj) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await api.updateTj(tj.id, {
        isCut: cut,
        cutReason: cut ? reason.trim() || undefined : undefined,
        cutSeverity: cut ? severity : null,
      });
      toast.success(cut ? `Cut recorded on ${saved.code}` : `${saved.code} restored`, {
        description: cut ? 'The map now flags this joint as cut.' : 'Joint is back in service.',
      });
      onSaved(saved);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update the cut status.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-xl bg-rose-500/12 text-rose-500">
              <Scissors className="size-4" />
            </span>
            {tj?.isCut ? 'Fibre cut details' : 'Record a fibre cut'}
          </DialogTitle>
          <DialogDescription>
            {tj ? `${tj.code}${tj.name ? ` · ${tj.name}` : ''}` : ''} — cuts are highlighted on the map and summarised for the division.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="severity">Severity</Label>
            <Select value={severity} onValueChange={(value) => setSeverity(value as CutSeverity)}>
              <SelectTrigger id="severity">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="minor">Minor · partial degradation</SelectItem>
                <SelectItem value="major">Major · link down</SelectItem>
                <SelectItem value="outage">Outage · full service loss</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reason">Cause / field report</Label>
            <Textarea
              id="reason"
              placeholder="Third-party excavation cut the 24F duct near the bridge approach."
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </div>

          {error ? (
            <div className="flex items-start gap-2 rounded-xl border border-destructive/25 bg-destructive/10 px-3 py-2.5 text-[12px] text-destructive">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}
        </div>

        <DialogFooter className="sm:justify-between">
          {tj?.isCut ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => submit(false)}
              disabled={saving}
              className="border-emerald-400/40 text-emerald-600 hover:bg-emerald-500/10 dark:text-emerald-300"
            >
              <CheckCircle2 className="size-4" />
              Clear cut
            </Button>
          ) : (
            <span className="hidden text-[10px] text-muted-foreground sm:block">
              Admin action · viewers see the result instantly.
            </span>
          )}
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => submit(true)}
              disabled={saving}
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Scissors className="size-4" />}
              {tj?.isCut ? 'Update cut' : 'Record cut'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
