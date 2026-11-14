'use client';

import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
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

interface MapExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Suggested file name, including the .json extension. */
  defaultFileName: string;
  counts: { olts: number; tjs: number; onus: number; links: number };
  onExport: (fileName: string) => void;
}

export function MapExportDialog({
  open,
  onOpenChange,
  defaultFileName,
  counts,
  onExport,
}: MapExportDialogProps) {
  const [fileName, setFileName] = useState(defaultFileName);

  useEffect(() => {
    if (open) setFileName(defaultFileName);
  }, [open, defaultFileName]);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const name = fileName.trim();
    if (!name) return;
    onExport(name);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-xl bg-sky-500/15 text-sky-600 dark:text-sky-400">
              <Download className="size-4" />
            </span>
            Export map
          </DialogTitle>
          <DialogDescription>
            Save {counts.olts} OLT · {counts.tjs} TJ · {counts.onus} ONU · {counts.links} links as
            a JSON snapshot.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="map-export-name">File name</Label>
            <Input
              id="map-export-name"
              value={fileName}
              autoFocus
              onChange={(event) => setFileName(event.target.value)}
              className="font-mono text-[12px]"
            />
            <p className="text-[10px] text-muted-foreground">
              The file is saved with a .json extension.
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!fileName.trim()}>
              <Download className="size-4" />
              Download
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
