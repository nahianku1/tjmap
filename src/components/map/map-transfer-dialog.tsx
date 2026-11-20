'use client';

import { useEffect, useRef, useState } from 'react';
import { FileJson, Loader2, Map as MapIcon, TriangleAlert, Upload } from 'lucide-react';
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
import {
  convertKmzFile,
  type KmzDeviceCounts,
  type KmzImportPayload,
  type KmzLayer,
} from '@/lib/kmz';
import { parseMapTransferFile, type MapTransferFile } from '@/lib/map-transfer';

interface MapTransferDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Where the imported devices will be assigned, e.g. “Dhaka · Gulshan–Banani”. */
  targetLabel: string | null;
  /** Area of the open map; a file may only be imported into the same area. */
  targetAreaId: string | null;
  /** Sub-area of the open map; a sub-area file may only be imported there. */
  targetSubArea?: { id: string; name: string } | null;
  /** Area the open map belongs to, used to file Google Earth imports. */
  scopeArea?: { id: string; name: string } | null;
  /** Devices currently drawn on this map, removed when replacing. */
  currentCounts: { olts: number; tjs: number; onus: number; links: number };
  onImport: (payload: KmzImportPayload, options: { replace: boolean }) => Promise<void>;
}

export function MapTransferDialog({
  open,
  onOpenChange,
  targetLabel,
  targetAreaId,
  targetSubArea = null,
  scopeArea = null,
  currentCounts,
  onImport,
}: MapTransferDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [file, setFile] = useState<MapTransferFile | null>(null);
  const [kmzCounts, setKmzCounts] = useState<KmzDeviceCounts | null>(null);
  const [kmzLayers, setKmzLayers] = useState<KmzLayer[]>([]);
  const [kmzWarnings, setKmzWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [replace, setReplace] = useState(false);

  useEffect(() => {
    if (!open) {
      setFileName(null);
      setFile(null);
      setKmzCounts(null);
      setKmzLayers([]);
      setKmzWarnings([]);
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
    setKmzCounts(null);
    setKmzLayers([]);
    setKmzWarnings([]);
    setError(null);
    try {
      if (/\.(kmz|kml)$/i.test(selected.name)) {
        const converted = await convertKmzFile(selected, {
          area: scopeArea,
          subArea: targetSubArea ? { id: targetSubArea.id, name: targetSubArea.name } : null,
        });
        setFile(converted.file);
        setKmzCounts(converted.counts);
        setKmzLayers(converted.layers);
        setKmzWarnings(converted.warnings);
      } else {
        const text = await selected.text();
        setFile(parseMapTransferFile(text));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read this file.');
    }
  }

  const areaMismatch = Boolean(file) && (file?.areaId ?? null) !== targetAreaId;
  const subAreaMismatch =
    Boolean(file) && !areaMismatch && (file?.subAreaId ?? null) !== (targetSubArea?.id ?? null);
  const scopeMismatch = areaMismatch || subAreaMismatch;
  const existingCount =
    currentCounts.olts + currentCounts.tjs + currentCounts.onus + currentCounts.links;
  const fileCount = file
    ? file.olts.length + file.tjs.length + file.onus.length + file.links.length
    : 0;
  // Anything already filed here would be duplicated by the import, so the file
  // may only land once the replace option is chosen.
  const needsReplace = Boolean(file) && !scopeMismatch && existingCount > 0 && fileCount > 0;
  const blockedUntilReplace = needsReplace && !replace;
  const scopeLabel = targetSubArea ? 'in this sub-area' : 'on this map';
  const scopeName = targetLabel ?? 'The national map';
  // Google Earth layers become sub-areas, which only exist inside a service area.
  const layerMode = Boolean(scopeArea) && !targetSubArea && kmzLayers.length > 0;
  const layersBlocked = kmzLayers.length > 0 && !scopeArea && !targetSubArea;
  const mismatchMessage = !file
    ? null
    : areaMismatch
      ? file.areaId
        ? `This file was exported from ${file.areaName ?? 'another service area'} and can only be imported there. Open that area's map to import it.`
        : 'This file was exported from the national map and can only be imported there.'
      : subAreaMismatch
        ? file.subAreaId
          ? targetSubArea
            ? `This file was exported from sub-area ${file.subAreaName ?? 'another sub-area'} and can only be imported there. Pick that sub-area's file, or export from ${targetSubArea.name} first.`
            : `This file belongs to sub-area ${file.subAreaName ?? 'another sub-area'} and can only be imported from that sub-area's card.`
          : `This file was exported from the whole map and can only be imported into the map, not into ${targetSubArea?.name ?? 'a sub-area'}.`
        : null;

  async function handleImport() {
    if (!file || importing || scopeMismatch || blockedUntilReplace) return;
    setImporting(true);
    setError(null);
    try {
      await onImport({ file, layers: layerMode ? kmzLayers : null }, { replace });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not import this map.');
    } finally {
      setImporting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (importing ? undefined : onOpenChange(next))}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-xl bg-violet-500/15 text-violet-600 dark:text-violet-400">
              <Upload className="size-4" />
            </span>
            Import map
          </DialogTitle>
          <DialogDescription>
            Recreate an exported map or sub-area snapshot here — OLTs, terminal joints, ONUs and
            every fibre link including its drawn route. Google Earth .kmz/.kml files are converted
            on the fly: point placemarks become devices, line placemarks become fibre links.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-3">
          <div className="rounded-xl border border-white/60 bg-white/50 px-3 py-2 text-[11px] text-muted-foreground dark:border-white/10 dark:bg-white/[0.03]">
            Importing into{' '}
            <strong className="text-foreground">{targetLabel ?? 'the national map (no service area)'}</strong>
          </div>

          <label
            htmlFor="map-transfer-file"
            className="flex cursor-pointer flex-col items-center gap-1.5 rounded-2xl border border-dashed border-primary/35 bg-primary/[0.04] px-4 py-6 text-center transition hover:border-primary/60 hover:bg-primary/[0.07]"
          >
            {kmzCounts ? (
              <MapIcon className="size-6 text-primary" />
            ) : (
              <FileJson className="size-6 text-primary" />
            )}
            <span className="text-[12px] font-semibold">
              {fileName ?? 'Choose an exported map file or Google Earth file'}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {fileName
                ? 'Click to pick a different file'
                : 'JSON snapshot · .json, or Google Earth .kmz / .kml'}
            </span>
            <input
              ref={inputRef}
              id="map-transfer-file"
              type="file"
              accept="application/json,.json,application/vnd.google-earth.kmz,.kmz,application/vnd.google-earth.kml+xml,.kml"
              className="sr-only"
              onChange={(event) => {
                void handleFile(event.target.files?.[0] ?? null);
              }}
            />
          </label>

          {file ? (
            <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.05] p-3">
              {kmzCounts ? (
                <>
                  <p className="text-[11px] font-semibold">Converted from Google Earth</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    Point placemarks became devices; route lines became fibre links. Each device
                    starts with one free core.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-[11px] font-semibold">
                    {file.subAreaName
                      ? `${file.areaName ?? 'Area'} · ${file.subAreaName} sub-area`
                      : (file.areaName ?? 'National map')} snapshot
                  </p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    {file.exportedAt
                      ? `Exported ${new Date(file.exportedAt).toLocaleString()}`
                      : 'Export date not recorded'}
                  </p>
                </>
              )}
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
              {layerMode ? (
                <div className="mt-2 rounded-lg border border-emerald-500/25 bg-white/60 px-2 py-1.5 dark:bg-white/[0.04]">
                  <p className="text-[10px] font-semibold">
                    {kmzLayers.length} Google Earth layer{kmzLayers.length === 1 ? '' : 's'} →{' '}
                    {kmzLayers.length === 1 ? '1 sub-area' : `${kmzLayers.length} sub-areas`}
                  </p>
                  <ul className="mt-1 flex flex-wrap gap-1">
                    {kmzLayers.map((layer) => (
                      <li
                        key={layer.name}
                        className="rounded-md border border-emerald-500/25 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[9.5px]"
                        title={`${layer.file.tjs.length} TJ · ${layer.file.olts.length} OLT · ${layer.file.onus.length} ONU · ${layer.file.links.length} link${layer.file.links.length === 1 ? '' : 's'}`}
                      >
                        {layer.name}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {kmzWarnings.length > 0 ? (
                <ul className="mt-2 space-y-1">
                  {kmzWarnings.map((warning) => (
                    <li
                      key={warning}
                      className="flex items-start gap-1.5 text-[10px] text-amber-800 dark:text-amber-200"
                    >
                      <TriangleAlert className="mt-0.5 size-3 shrink-0" />
                      <span>{warning}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          {layersBlocked ? (
            <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/[0.07] px-3 py-2.5 text-[11.5px] text-amber-800 dark:text-amber-200">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              <span>
                Sub-areas only exist inside a service area, so this file’s{' '}
                {kmzLayers.length === 1 ? 'layer is' : `${kmzLayers.length} layers are`} imported
                into the national map directly. Open a service area map to file each layer into its
                own sub-area.
              </span>
            </div>
          ) : null}

          {needsReplace ? (
            <div
              className={
                replace
                  ? 'flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/[0.07] px-3 py-2.5 text-[11.5px] text-rose-700 dark:text-rose-300'
                  : 'flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/[0.07] px-3 py-2.5 text-[11.5px] text-amber-800 dark:text-amber-200'
              }
            >
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              <span>
                {replace
                  ? `${scopeName} already has ${currentCounts.tjs} TJ, ${currentCounts.olts} OLT, ${currentCounts.onus} ONU and ${currentCounts.links} link${currentCounts.links === 1 ? '' : 's'} filed here; they will be deleted before the file is imported.`
                  : `${scopeName} already has ${currentCounts.tjs} TJ, ${currentCounts.olts} OLT, ${currentCounts.onus} ONU and ${currentCounts.links} link${currentCounts.links === 1 ? '' : 's'} filed here. Importing would duplicate them — tick “Replace everything currently ${scopeLabel}” below to continue.`}
              </span>
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
                Replace everything currently {targetSubArea ? 'in this sub-area' : 'on this map'}
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
            {kmzCounts
              ? layerMode
                ? `Each Google Earth layer becomes its own sub-area, named after the layer, and that layer's devices and links are filed inside it. Existing sub-areas with the same name are reused.`
                : `Google Earth files have no area of their own, so everything is filed into ${targetLabel ?? 'the national map'}.`
              : `A file can only be imported into the ${targetSubArea ? 'sub-area' : 'area'} it was exported from.`}{' '}
            Devices keep their coordinates and use their original codes; if a code or OLT name is
            already taken, the imported copy gets a short suffix. Links pointing at devices that
            are not in the file are skipped.
          </p>

          {error ? (
            <div className="flex items-start gap-2 rounded-xl border border-destructive/25 bg-destructive/10 px-3 py-2.5 text-[12px] text-destructive">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}
        </DialogBody>

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
            disabled={!file || importing || scopeMismatch || blockedUntilReplace}
            variant={replace ? 'destructive' : 'default'}
          >
            {importing ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            {importing
              ? 'Importing…'
              : replace
                ? 'Replace & import'
                : kmzCounts
                  ? 'Convert & import'
                  : 'Import map'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
