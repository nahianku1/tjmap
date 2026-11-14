'use client';

import { useEffect, useRef, useState } from 'react';
import { FileJson, Loader2, TriangleAlert, Upload } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { parseMapTransferFile, type MapTransferFile } from '@/lib/map-transfer';

interface MapTransferDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Where the imported devices will be assigned, e.g. “Dhaka · Gulshan–Banani”. */
  targetLabel: string | null;
  /** Area of the open map; a file may only be imported into the same area. */
  targetAreaId: string | null;
  /** Devices currently drawn on this map, removed when replacing. */
  currentCounts: { olts: number; tjs: number; onus: number; links: number };
  onImport: (file: MapTransferFile, options: { replace: boolean }) => Promise<void>;
}

export function MapTransferDialog({
  open,
  onOpenChange,
  targetLabel,
  targetAreaId,
  currentCounts,
  onImport,
}: MapTransferDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [file, setFile] = useState<MapTransferFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [replace, setReplace] = useState(false);

  useEffect(() => {
    if (!open) {
      setFileName(null);
      setFile(null);
      setError(null);
      setImporting(false);
      setReplace(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }, [open]);

  async function handleFile(selected: File | null) {
    if (!selected) return;
    setFileName(selected.name);
    setFile(null);
    setError(null);
    try {
      const text = await selected.text();
      setFile(parseMapTransferFile(text));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read this file.');
    }
  }

  const areaMismatch = Boolean(file) && (file?.areaId ?? null) !== targetAreaId;
  const mismatchMessage = !areaMismatch
    ? null
    : file?.areaId
      ? `This file was exported from ${file.areaName ?? 'another service area'} and can only be imported there. Open that area's map to import it.`
      : 'This file was exported from the national map and can only be imported there.';

  async function handleImport() {
    if (!file || importing || areaMismatch) return;
    setImporting(true);
    setError(null);
    try {
      await onImport(file, { replace });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not import this map.');
    } finally {
      setImporting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (importing ? undefined : onOpenChange(next))}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-xl bg-violet-500/15 text-violet-600 dark:text-violet-400">
              <Upload className="size-4" />
            </span>
            Import map
          </DialogTitle>
          <DialogDescription>
            Recreate an exported map snapshot here — OLTs, terminal joints, ONUs and every fibre
            link including its drawn route.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-xl border border-white/60 bg-white/50 px-3 py-2 text-[11px] text-muted-foreground dark:border-white/10 dark:bg-white/[0.03]">
            Importing into{' '}
            <strong className="text-foreground">{targetLabel ?? 'the national map (no service area)'}</strong>
          </div>

          <label
            htmlFor="map-transfer-file"
            className="flex cursor-pointer flex-col items-center gap-1.5 rounded-2xl border border-dashed border-primary/35 bg-primary/[0.04] px-4 py-6 text-center transition hover:border-primary/60 hover:bg-primary/[0.07]"
          >
            <FileJson className="size-6 text-primary" />
            <span className="text-[12px] font-semibold">
              {fileName ?? 'Choose an exported map file'}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {fileName ? 'Click to pick a different JSON file' : 'JSON snapshot · .json'}
            </span>
            <input
              ref={inputRef}
              id="map-transfer-file"
              type="file"
              accept="application/json,.json"
              className="sr-only"
              onChange={(event) => {
                void handleFile(event.target.files?.[0] ?? null);
              }}
            />
          </label>

          {file ? (
            <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.05] p-3">
              <p className="text-[11px] font-semibold">
                {file.areaName ?? 'National map'} snapshot
              </p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                {file.exportedAt
                  ? `Exported ${new Date(file.exportedAt).toLocaleString()}`
                  : 'Export date not recorded'}
              </p>
              <div className="mt-2 grid grid-cols-4 gap-1.5 text-center font-mono">
                {[
                  ['OLT', file.olts.length],
                  ['TJ', file.tjs.length],
                  ['ONU', file.onus.length],
                  ['Links', file.links.length],
                ].map(([label, value]) => (
                  <div
                    key={String(label)}
                    className="rounded-lg border border-white/60 bg-white/60 px-1 py-1 dark:border-white/10 dark:bg-white/[0.04]"
                  >
                    <p className="text-[8px] font-sans uppercase text-muted-foreground">{label}</p>
                    <p className="text-[12px] font-semibold">{value}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/[0.05] px-3 py-2.5">
            <input
              type="checkbox"
              checked={replace}
              onChange={(event) => setReplace(event.target.checked)}
              disabled={importing}
              className="mt-0.5 size-4 shrink-0 accent-rose-500"
            />
            <span className="min-w-0">
              <span className="block text-[11.5px] font-semibold text-rose-700 dark:text-rose-300">
                Replace everything currently on this map
              </span>
              <span className="mt-0.5 block text-[10px] leading-relaxed text-muted-foreground">
                Deletes the {currentCounts.olts} OLT, {currentCounts.tjs} TJ, {currentCounts.onus} ONU
                {' '}and {currentCounts.links} link{currentCounts.links === 1 ? '' : 's'} shown here,
                then imports the file. This cannot be undone.
              </span>
            </span>
          </label>

          {mismatchMessage ? (
            <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/[0.07] px-3 py-2.5 text-[11.5px] text-amber-800 dark:text-amber-200">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              <span>{mismatchMessage}</span>
            </div>
          ) : null}

          <p className="text-[10px] leading-relaxed text-muted-foreground">
            A file can only be imported into the area it was exported from. Devices keep their
            coordinates and use their original codes; if a code or OLT name is already taken, the
            imported copy gets a short suffix. Links pointing at devices that are not in the file
            are skipped.
          </p>

          {error ? (
            <div className="flex items-start gap-2 rounded-xl border border-destructive/25 bg-destructive/10 px-3 py-2.5 text-[12px] text-destructive">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={importing}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleImport}
            disabled={!file || importing || areaMismatch}
            variant={replace ? 'destructive' : 'default'}
          >
            {importing ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            {importing ? 'Importing…' : replace ? 'Replace & import' : 'Import map'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
