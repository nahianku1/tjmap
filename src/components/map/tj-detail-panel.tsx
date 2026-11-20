'use client';

import { useMemo, useState } from 'react';
import {
  Activity,
  ArrowRight,
  Box,
  Cable,
  CheckCircle2,
  Copy,
  Gauge,
  Layers,
  Link2,
  MapPin,
  Pencil,
  Radio,
  Scissors,
  ShieldAlert,
  ShieldCheck,
  Server,
  Split,
  Trash2,
  Wrench,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import type { Core, CoreStatus, FibreLink, Olt, Tj } from '@/lib/types';
import { CorePatchLine, linkPatches, type CorePatch } from '@/components/map/core-patch-line';
import { cn, formatDistance, totalCores } from '@/lib/utils';
import { assessOpticalPower, calculateOutputPower, getSplitterLossDb } from '@/lib/optical';
import { findUpstreamPower, getTjInputCoreLabel } from '@/lib/core-power';
import { splitterFeedLabels, splitterFeedName, tjCoreUnavailable } from '@/lib/device-ports';
import { displayCoreLabel } from '@/lib/fibre-cores';

interface TjDetailPanelProps {
  tj: Tj | null;
  tjs: Tj[];
  olts: Olt[];
  links: FibreLink[];
  isAdmin: boolean;
  onClose: () => void;
  onEdit: (tj: Tj) => void;
  onLinkFrom: (tj: Tj) => void;
  onDelete: (tj: Tj) => void;
  onSelectLink: (link: FibreLink) => void;
}

export function TjDetailPanel({
  tj,
  tjs,
  olts,
  links,
  isAdmin,
  onClose,
  onEdit,
  onLinkFrom,
  onDelete,
  onSelectLink,
}: TjDetailPanelProps) {
  const [copied, setCopied] = useState(false);

  const spans = useMemo(() => {
    if (!tj) return [];
    return links.filter(
      (link) =>
        link.fromTjId === tj.id ||
        link.toTjId === tj.id ||
        ((tj.tjType === 'cut' || tj.isCut) && tj.fibreId != null && tj.fibreId !== '' && link.fibreId === tj.fibreId),
    );
  }, [tj, links]);

  /** For each core of this joint, the link patched to it and the device at its far end. */
  const corePatches = useMemo<Map<string, CorePatch>>(
    () => (tj ? linkPatches(spans, { kind: 'tj', id: tj.id }) : new Map()),
    [spans, tj],
  );

  const total = tj ? totalCores(tj) : 0;
  // A joint can carry several splitters; each has its own feed core and outputs.
  const fittedSplitters = (
    tj?.splitters?.length ? tj.splitters : tj?.splitter ? [tj.splitter] : []
  ).filter((splitter) => splitter?.enabled && splitter.ratio);
  const outputCoresCount =
    (fittedSplitters.length > 0
      ? fittedSplitters.reduce(
          (sum, splitter) =>
            sum +
            (splitter.outputs ?? []).reduce((legs, core) => legs + (Number(core.count) || 0), 0),
          0,
        )
      : null) ??
    tj?.outputCores?.reduce((sum, core) => sum + (Number(core.count) || 0), 0) ??
    0;

  const freeCoresCount =
    tj?.cores?.filter((c) => c.status === 'free').reduce((sum, c) => sum + (Number(c.count) || 0), 0) ?? 0;

  // Input cores already shown inside their splitter section are not repeated
  // in the inventory below; cores of a joint without a splitter stay there.
  const feeds = tj ? splitterFeedLabels(tj) : new Set<string>();
  const splitterSections = fittedSplitters.map((splitter, index) => {
    const feed = splitter.inputCoreLabel ?? null;
    const feedCore = feed ? tj?.cores.find((core) => core.label === feed) ?? null : null;
    const stored = splitter.outputs ?? [];
    const outputs = stored.length > 0 ? stored : index === 0 ? tj?.outputCores ?? [] : [];
    const feedPower =
      tj && feed ? findUpstreamPower(tj.id, feed, tjs, olts, links)?.powerDbm ?? null : null;
    const outPower =
      feedPower !== null && splitter.ratio
        ? calculateOutputPower(feedPower, splitter.ratio, 0.2)
        : null;
    return { splitter, index, feed, feedCore, outputs, feedPower, outPower };
  });
  const splitterFeedSet = new Set(
    splitterSections
      .map((section) => section.feed)
      .filter((label): label is string => Boolean(label)),
  );
  const inventoryInputCores =
    splitterSections.length > 0
      ? (tj?.cores ?? []).filter((core) => !splitterFeedSet.has(core.label))
      : tj?.cores ?? [];
  const inventoryFree = inventoryInputCores.filter((core) => core.status === 'free').length;
  const inventoryInUse = inventoryInputCores.length - inventoryFree;

  // Splitter power calculation. Feed power follows the upstream link instead of a
  // manually entered per-core dBm value.
  const splitterLossDb = tj?.splitter?.ratio ? getSplitterLossDb(tj.splitter.ratio, 0.2) : 0;
  const feedCoreLabel = tj ? getTjInputCoreLabel(tj, links) : null;
  const upstreamPower = tj ? findUpstreamPower(tj.id, feedCoreLabel, tjs, olts, links) : null;
  const inputPower = upstreamPower?.powerDbm ?? null;
  const outputPower =
    inputPower !== null && tj?.splitter?.enabled && tj.splitter.ratio
      ? calculateOutputPower(inputPower, tj.splitter.ratio, 0.2)
      : null;
  const powerAssessment = assessOpticalPower(outputPower);

  async function copyCoordinates() {
    if (!tj) return;
    try {
      await navigator.clipboard.writeText(`${tj.lat.toFixed(6)}, ${tj.lng.toFixed(6)}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
      toast.success('Coordinates copied');
    } catch {
      toast.error('Could not access the clipboard');
    }
  }

  const tjType = tj?.tjType ?? (tj?.isCut ? 'cut' : 'box');

  return (
    <Sheet open={Boolean(tj)} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <SheetContent className="max-w-md">
        {tj ? (
          <>
            <SheetHeader>
              <div className="mb-1 flex flex-wrap items-center gap-1.5">
                {/* Joint Type Badge */}
                {tjType === 'cut' ? (
                  <Badge variant="cut" className="gap-1">
                    <Scissors className="size-2.5" />
                    Fibre Cut Joint
                  </Badge>
                ) : tjType === 'pon_power' ? (
                  <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10.5px] font-semibold text-amber-700 dark:text-amber-300">
                    <Zap className="size-2.5" />
                    PON Power TJ
                  </span>
                ) : (
                  <Badge variant="active" className="gap-1">
                    <Box className="size-2.5" />
                    Splitter TJ
                  </Badge>
                )}

                {tj.splitter?.enabled ? (
                  <Badge variant="splitter" className="gap-1">
                    <Split className="size-2.5" />
                    Splitter {tj.splitter.ratio}
                  </Badge>
                ) : null}

                {!isAdmin ? <Badge variant="outline">Read only</Badge> : null}
              </div>

              <SheetTitle className="font-mono text-[17px] tracking-wide">{tj.code}</SheetTitle>
              <SheetDescription>
                {tj.name ?? 'Unnamed terminal joint'}
                {tj.address ? ` · ${tj.address}` : ''}
              </SheetDescription>
            </SheetHeader>

            <SheetBody className="space-y-4">
              {/* FIBRE CUT REPAIR INCIDENT CARD */}
              {tj.isCut || tjType === 'cut' ? (
                <div className="anim-rise rounded-2xl border border-rose-500/35 bg-rose-500/[0.08] p-3 space-y-2">
                  <div className="flex items-center justify-between text-rose-600 dark:text-rose-300">
                    <div className="flex items-center gap-2">
                      <Scissors className="size-4" />
                      <p className="text-[12px] font-semibold uppercase tracking-[0.1em]">
                        Cut Incident · {tj.cutSeverity ?? 'major'}
                      </p>
                    </div>
                    {tj.cutData?.repairStatus ? (
                      <span
                        className={cn(
                          'rounded-md px-2 py-0.5 text-[9.5px] font-semibold uppercase',
                          tj.cutData.repairStatus === 'restored'
                            ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                            : tj.cutData.repairStatus === 'splicing_in_progress'
                              ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300'
                              : 'bg-rose-500/20 text-rose-700 dark:text-rose-300',
                        )}
                      >
                        {tj.cutData.repairStatus === 'restored'
                          ? 'Restored'
                          : tj.cutData.repairStatus === 'splicing_in_progress'
                            ? 'Splicing In Progress'
                            : 'Active Cut'}
                      </span>
                    ) : null}
                  </div>

                  <p className="text-[11.5px] leading-relaxed text-rose-700/90 dark:text-rose-200/90">
                    {tj.cutReason ?? 'Physical fibre cut reported at this joint location.'}
                  </p>

                  <div className="grid grid-cols-3 gap-1.5 pt-1 text-center font-mono text-[11px]">
                    <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 p-1.5">
                      <p className="text-[8.5px] font-sans uppercase text-muted-foreground">OTDR Distance</p>
                      <p className="font-semibold text-rose-700 dark:text-rose-300">
                        {tj.cutData?.faultDistanceMeters ? `${tj.cutData.faultDistanceMeters} m` : '—'}
                      </p>
                    </div>
                    <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 p-1.5">
                      <p className="text-[8.5px] font-sans uppercase text-muted-foreground">Damaged</p>
                      <p className="font-semibold text-rose-700 dark:text-rose-300">
                        {tj.cutData?.damagedCores ? `${tj.cutData.damagedCores} cores` : '—'}
                      </p>
                    </div>
                    <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 p-1.5">
                      <p className="text-[8.5px] font-sans uppercase text-muted-foreground">Restored</p>
                      <p className="font-semibold text-emerald-700 dark:text-emerald-300">
                        {tj.cutData?.restoredCores ? `${tj.cutData.restoredCores} cores` : '0'}
                      </p>
                    </div>
                  </div>

                  {tj.cutData?.restorationNotes ? (
                    <p className="text-[10.5px] text-muted-foreground italic border-t border-rose-500/20 pt-1.5">
                      Note: {tj.cutData.restorationNotes}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {/* PON POWER TELEMETRY CARD */}
              {tjType === 'pon_power' ? (
                <div className="anim-rise rounded-2xl border border-amber-500/35 bg-amber-500/[0.08] p-3 space-y-2">
                  <div className="flex items-center justify-between text-amber-700 dark:text-amber-300">
                    <div className="flex items-center gap-2">
                      <Zap className="size-4" />
                      <p className="text-[12px] font-semibold uppercase tracking-[0.1em]">
                        PON Power Telemetry
                      </p>
                    </div>
                    {tj.ponData?.wavelength ? (
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {tj.ponData.wavelength}
                      </span>
                    ) : null}
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="rounded-xl border border-white/60 bg-white/60 p-2 dark:border-white/10 dark:bg-white/[0.03]">
                      <p className="text-[9px] uppercase tracking-wider text-muted-foreground">OLT / Port</p>
                      <p className="font-mono font-semibold truncate">
                        {tj.ponData?.oltName ?? 'OLT-01'} · {tj.ponData?.ponPort ?? 'PON 1'}
                      </p>
                    </div>
                    <div className="rounded-xl border border-white/60 bg-white/60 p-2 dark:border-white/10 dark:bg-white/[0.03]">
                      <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Budget Margin</p>
                      <p className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                        {tj.ponData?.budgetMarginDb ? `+${tj.ponData.budgetMarginDb} dB` : 'Normal'}
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}

              {/* OLT LINK */}
              {tj.olt ? (
                <div className="anim-rise rounded-2xl border border-sky-500/30 bg-sky-500/[0.06] p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-700 dark:text-sky-300">
                      <Server className="size-3.5" />
                      OLT · {tj.olt.code}
                    </p>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {tj.olt.name}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="rounded-xl border border-white/60 bg-white/60 p-2 dark:border-white/10 dark:bg-white/[0.03]">
                      <p className="text-[9px] uppercase tracking-wider text-muted-foreground">PON port</p>
                      <p className="truncate font-mono font-semibold">
                        {tj.olt.ponPort ?? tj.ponData?.ponPort ?? '—'}
                      </p>
                    </div>
                    <div className="rounded-xl border border-white/60 bg-white/60 p-2 dark:border-white/10 dark:bg-white/[0.03]">
                      <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Uplink port</p>
                      <p className="truncate font-mono font-semibold">
                        {tj.olt.uplinkPort ?? '—'}
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}

              {/* HIGH LEVEL METRICS */}
              <div className="grid grid-cols-2 gap-2">
                <Metric
                  label="Total cores"
                  value={`${total} (${freeCoresCount} Free)`}
                  icon={Radio}
                  accent="text-teal-500"
                />
                <Metric label="Connected links" value={String(spans.length)} icon={Cable} accent="text-sky-500" />
                {!(tj.isCut || tjType === 'cut') ? (
                  <>
                    <Metric
                      label="Input power"
                      value={
                        inputPower !== null && inputPower !== undefined
                          ? `${inputPower > 0 ? `+${inputPower}` : inputPower} dBm`
                          : '—'
                      }
                      icon={Gauge}
                      accent="text-amber-500"
                      mono
                    />
                    <Metric
                      label="Splitter outputs"
                      value={fittedSplitters.length > 0 ? `${outputCoresCount}` : '—'}
                      icon={Split}
                      accent="text-violet-500"
                    />
                  </>
                ) : null}
              </div>

              {/* SPLITTER POWER BUDGET CARD */}
              {fittedSplitters.length <= 1 && tj.splitter?.enabled ? (
                <section className="rounded-2xl border border-violet-500/25 bg-violet-500/[0.04] p-3 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      <Gauge className="size-3 text-violet-500" />
                      Splitter Optical Budget ({tj.splitter.ratio})
                    </p>
                    {powerAssessment ? (
                      <span
                        className={cn(
                          'rounded-md border px-2 py-0.5 text-[9.5px] font-semibold',
                          powerAssessment.badgeTone,
                        )}
                      >
                        {powerAssessment.label}
                      </span>
                    ) : null}
                  </div>

                  {upstreamPower ? (
                    <p className="text-[10px] text-muted-foreground">
                      Feed from {upstreamPower.sourceKind.toUpperCase()} {upstreamPower.sourceCode}
                      {upstreamPower.sourceCore ? ` · ${upstreamPower.sourceCore}` : ''} via{' '}
                      {upstreamPower.fibreId}
                    </p>
                  ) : (
                    <p className="text-[10px] text-muted-foreground">
                      No active upstream link on the feed core — input power appears once it is connected.
                    </p>
                  )}

                  <div className="grid grid-cols-3 gap-1.5 text-center font-mono">
                    <div className="rounded-xl border border-white/60 bg-white/60 p-1.5 dark:border-white/10 dark:bg-white/[0.04]">
                      <p className="text-[8.5px] font-sans uppercase text-muted-foreground">Input</p>
                      <p className="text-[11.5px] font-semibold">
                        {inputPower !== null ? `${inputPower > 0 ? `+${inputPower}` : inputPower} dBm` : '—'}
                      </p>
                    </div>
                    <div className="rounded-xl border border-white/60 bg-white/60 p-1.5 dark:border-white/10 dark:bg-white/[0.04]">
                      <p className="text-[8.5px] font-sans uppercase text-muted-foreground">Loss</p>
                      <p className="text-[11.5px] font-semibold text-rose-500">
                        -{splitterLossDb.toFixed(1)} dB
                      </p>
                    </div>
                    <div className="rounded-xl border border-white/60 bg-white/60 p-1.5 dark:border-white/10 dark:bg-white/[0.04]">
                      <p className="text-[8.5px] font-sans uppercase text-muted-foreground">Output</p>
                      <p className="text-[12px] font-bold text-primary">
                        {outputPower !== null ? `${outputPower} dBm` : '—'}
                      </p>
                    </div>
                  </div>

                  {tj.splitter.inputCoreLabel ? (
                    <p className="text-[10px] text-muted-foreground flex items-center gap-1.5">
                      <span className="size-1.5 rounded-full bg-violet-500" />
                      Fed from input core:{' '}
                      <strong className="text-foreground">
                        {splitterFeedName(tj, tj.splitter.inputCoreLabel) ??
                          displayCoreLabel(tj.splitter.inputCoreLabel)}
                      </strong>
                    </p>
                  ) : null}
                </section>
              ) : null}

              {/* COORDINATES & AREA */}
              <div className="rounded-2xl border border-white/60 bg-white/45 p-3 dark:border-white/10 dark:bg-white/[0.03]">
                <div className="flex items-center justify-between gap-2">
                  <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    <MapPin className="size-3 text-primary" />
                    Coordinates & Area
                  </p>
                  <Button variant="ghost" size="icon-sm" onClick={copyCoordinates} aria-label="Copy coordinates">
                    {copied ? <CheckCircle2 className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
                  </Button>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-white/55 bg-white/55 px-2.5 py-1.5 dark:border-white/[0.06] dark:bg-white/[0.04]">
                    <p className="text-[8.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      Latitude
                    </p>
                    <p className="mt-1 font-mono text-[12px] font-semibold tabular-nums">{tj.lat.toFixed(6)}</p>
                  </div>
                  <div className="rounded-xl border border-white/55 bg-white/55 px-2.5 py-1.5 dark:border-white/[0.06] dark:bg-white/[0.04]">
                    <p className="text-[8.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      Longitude
                    </p>
                    <p className="mt-1 font-mono text-[12px] font-semibold tabular-nums">{tj.lng.toFixed(6)}</p>
                  </div>
                </div>
                <p className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <Layers className="size-3 text-violet-500" />
                  <span className="min-w-0 truncate">
                    {tj.districtName && tj.areaName ? `${tj.districtName} · ${tj.areaName}` : 'Unassigned area'}
                  </span>
                  <span className="ml-auto shrink-0 font-mono text-[9px]">WGS 84</span>
                </p>
                {tj.subAreaName ? (
                  <p className="mt-1.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <Layers className="size-3 text-teal-500" />
                    <span className="shrink-0">Sub-area</span>
                    <span className="ml-auto min-w-0 truncate font-semibold text-primary/90">
                      {tj.subAreaName}
                    </span>
                  </p>
                ) : null}
              </div>

              {/* INPUT CORE INVENTORY — splitter feeds are shown in their own section */}
              {inventoryInputCores.length > 0 || splitterSections.length === 0 ? (
                <section>
                  <div className="mb-2 flex items-end justify-between">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      {splitterSections.length > 0 ? 'Other input cores' : 'Input Cores'} ({inventoryInUse} In Use ·{' '}
                      {inventoryFree} Free)
                    </p>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {splitterSections.length > 0 ? inventoryInputCores.length : total} cores
                    </span>
                  </div>
                  {inventoryInputCores.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-border px-3 py-4 text-center text-[11px] text-muted-foreground">
                      No cores recorded for this joint.
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {inventoryInputCores.map((core, index) => {
                        const isFree = core.status === 'free';
                        const isDamaged = core.status === 'damaged';
                        const patch = corePatches.get(core.label);

                        return (
                          <div
                            key={`${core.label}-${index}`}
                            className={cn(
                              'rounded-xl border px-2.5 py-2 transition-colors',
                              isFree
                                ? 'border-emerald-500/25 bg-emerald-500/[0.04]'
                                : isDamaged
                                  ? 'border-rose-500/25 bg-rose-500/[0.04]'
                                  : 'border-white/60 bg-white/45 dark:border-white/10 dark:bg-white/[0.03]',
                            )}
                          >
                            <div className="flex items-center gap-2.5">
                              <span
                                className="size-3 shrink-0 rounded-full border border-white/70 shadow-[0_0_10px] dark:border-slate-900"
                                style={{ backgroundColor: core.color, color: core.color }}
                              />
                              <span className="min-w-0 flex-1 truncate text-[11.5px] font-medium">
                                {displayCoreLabel(core.label, index + 1)}
                              </span>

                              {/* Free vs In Use chip */}
                              <span
                                className={cn(
                                  'inline-flex items-center rounded-md px-1.5 py-0.5 text-[9.5px] font-semibold',
                                  isFree
                                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                    : isDamaged
                                      ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                                      : 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
                                )}
                              >
                                {isFree ? 'Free' : isDamaged ? 'Cut' : 'In Use'}
                              </span>

                              {core.count > 1 ? (
                                <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px] font-semibold text-muted-foreground">
                                  {core.count}×
                                </span>
                              ) : null}
                            </div>

                            {patch ? (
                              <CorePatchLine
                                localCode={tj.code}
                                localCore={core.label}
                                patch={patch}
                              />
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              ) : null}

              {/* SPLITTERS, EACH WITH ITS INPUT CORE AND OUTPUT PORTS */}
              {splitterSections.length > 0 ? (
                <section className="space-y-2">
                  <Separator />
                  <div className="flex items-end justify-between">
                    <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      <Split className="size-3 text-violet-500" />
                      Splitters &amp; Ports ({splitterSections.length})
                    </p>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {outputCoresCount} outputs
                    </span>
                  </div>
                  {splitterSections.map(({ splitter, index, feed, feedCore, outputs, feedPower, outPower }) => {
                    const feedPatch = feed ? corePatches.get(feed) : undefined;
                    // A feed core stays Free until a cable owns it, matching the
                    // availability rule in the map port picker.
                    const feedUnavailable = feedCore
                      ? tjCoreUnavailable(feedCore, feeds)
                      : Boolean(feedPatch);
                    const feedStatus: 'free' | 'in_use' | 'damaged' =
                      feedCore?.status === 'damaged' ? 'damaged' : feedUnavailable ? 'in_use' : 'free';
                    const lossDb = splitter.ratio ? getSplitterLossDb(splitter.ratio, 0.2) : null;

                    return (
                      <div
                        key={`${feed ?? 'splitter'}-${index}`}
                        className="space-y-1.5 rounded-2xl border border-violet-500/25 bg-violet-500/[0.04] p-2.5"
                      >
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.12em]">
                            Splitter {index + 1}
                          </p>
                          {splitter.ratio ? <Badge variant="splitter">{splitter.ratio}</Badge> : null}
                          {lossDb !== null ? (
                            <span className="font-mono text-[9.5px] text-muted-foreground">
                              -{lossDb.toFixed(1)} dB
                            </span>
                          ) : null}
                          <span className="ml-auto font-mono text-[10px] font-semibold text-primary">
                            {outPower !== null
                              ? `${outPower} dBm out`
                              : feedPower === null
                                ? 'no feed power'
                                : '—'}
                          </span>
                        </div>

                        {/* Feed core: this splitter's one input port */}
                        <div
                          className={cn(
                            'space-y-1 rounded-xl border px-2.5 py-2',
                            feedStatus === 'free'
                              ? 'border-emerald-500/25 bg-emerald-500/[0.04]'
                              : feedStatus === 'damaged'
                                ? 'border-rose-500/25 bg-rose-500/[0.04]'
                                : 'border-sky-500/30 bg-sky-500/[0.04]',
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <span className="min-w-0 flex-1 truncate font-mono text-[11px] font-semibold">
                              {feed ? `S${index + 1}` : 'No feed core'}
                            </span>
                            <span className="rounded px-1 py-0.5 text-[8px] font-semibold uppercase tracking-wide bg-violet-500/15 text-violet-700 dark:text-violet-300">
                              input core
                            </span>
                            <PortStatusChip status={feedStatus} />
                          </div>
                          {feedPower !== null ? (
                            <p className="font-mono text-[9.5px] text-muted-foreground">
                              Input {feedPower > 0 ? `+${feedPower}` : feedPower} dBm
                            </p>
                          ) : null}
                          {feedPatch && feed ? (
                            <CorePatchLine
                              localCode={tj.code}
                              localCore={feed}
                              localName={`S${index + 1}`}
                              patch={feedPatch}
                            />
                          ) : null}
                        </div>

                        <p className="pt-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                          Output cores ({outputs.length})
                        </p>
                        {outputs.length === 0 ? (
                          <p className="rounded-xl border border-dashed border-border px-3 py-2 text-center text-[10.5px] text-muted-foreground">
                            No output legs configured.
                          </p>
                        ) : (
                          <div className="space-y-1.5">
                            {outputs.map((core, coreIndex) => (
                              <OutputPortRow
                                key={`${core.label}-${coreIndex}`}
                                code={tj.code}
                                core={core}
                                index={coreIndex}
                                patch={corePatches.get(core.label)}
                                power={outPower !== null ? outPower : core.powerDbm}
                                userFibres={tj.userFibres}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </section>
              ) : tj.outputCores?.length || tj.splitter?.outputs?.length ? (
                /* Joints without an enabled splitter keep a single output list. */
                <section>
                  <Separator className="mb-3" />
                  <div className="mb-2 flex items-end justify-between">
                    <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      <Split className="size-3 text-violet-500" />
                      Output Cores &amp; User Drops ({outputCoresCount} Cores)
                    </p>
                    {tj.splitter?.enabled ? <Badge variant="splitter">{tj.splitter.ratio}</Badge> : null}
                  </div>
                  <div className="space-y-1.5">
                    {(tj.outputCores && tj.outputCores.length > 0
                      ? tj.outputCores
                      : tj.splitter?.outputs ?? []
                    ).map((core, index) => (
                      <OutputPortRow
                        key={`${core.label}-${index}`}
                        code={tj.code}
                        core={core}
                        index={index}
                        patch={corePatches.get(core.label)}
                        power={tj.splitter?.enabled && outputPower !== null ? outputPower : core.powerDbm}
                        userFibres={tj.userFibres}
                      />
                    ))}
                  </div>
                </section>
              ) : null}

              {/* CONNECTED LINKS */}
              <section>
                <Separator className="mb-3" />
                <div className="mb-2 flex items-end justify-between">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Connected links
                  </p>
                  <span className="font-mono text-[10px] text-muted-foreground">{spans.length}</span>
                </div>
                {spans.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-border px-3 py-4 text-center text-[11px] text-muted-foreground">
                    No fibre links yet.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {spans.map((span) => {
                      const outgoing = span.fromTjId === tj.id;
                      const other = outgoing
                        ? { code: span.toCode, name: span.toName }
                        : { code: span.fromCode, name: span.fromName };
                      return (
                        <button
                          key={span.id}
                          type="button"
                          onClick={() => onSelectLink(span)}
                          className="group flex w-full items-center gap-2.5 rounded-xl border border-white/60 bg-white/45 px-2.5 py-2 text-left transition hover:border-primary/30 hover:bg-white/70 dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-white/[0.06]"
                        >
                          <span
                            className={cn(
                              'grid size-7 shrink-0 place-items-center rounded-lg',
                              span.status === 'cut' ? 'bg-rose-500/12 text-rose-500' : 'bg-teal-500/12 text-teal-500',
                            )}
                          >
                            <Cable className="size-3.5" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1.5">
                              <span className="truncate font-mono text-[10.5px] font-semibold">{span.fibreId}</span>
                              {span.status === 'cut' ? (
                                <Badge variant="cut" className="px-1.5 py-0 text-[8px]">
                                  Cut
                                </Badge>
                              ) : null}
                            </span>
                            <span className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
                              <ArrowRight className="size-2.5" />
                              {other.code}
                              <span className="text-muted-foreground/60">·</span>
                              {formatDistance(span.lengthM)}
                            </span>
                          </span>
                          <ArrowRight className="size-3.5 shrink-0 text-muted-foreground/50 transition group-hover:translate-x-0.5 group-hover:text-primary" />
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* FIELD NOTES */}
              {tj.notes ? (
                <section>
                  <Separator className="mb-3" />
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Field notes
                  </p>
                  <p className="rounded-xl border border-white/60 bg-white/45 px-3 py-2.5 text-[11.5px] leading-relaxed text-muted-foreground dark:border-white/10 dark:bg-white/[0.03]">
                    {tj.notes}
                  </p>
                </section>
              ) : null}
            </SheetBody>

            {isAdmin ? (
              <SheetFooter className="flex-wrap">
                <Button size="sm" onClick={() => onEdit(tj)} className="flex-1">
                  <Pencil className="size-3.5" />
                  Edit joint
                </Button>
                <Button size="sm" variant="subtle" onClick={() => onLinkFrom(tj)}>
                  <Link2 className="size-3.5" />
                  Link
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => onDelete(tj)}
                  aria-label={`Delete ${tj.code}`}
                  className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                </Button>
              </SheetFooter>
            ) : (
              <SheetFooter>
                <div className="flex w-full items-center gap-2 text-[10.5px] text-muted-foreground">
                  <ShieldCheck className="size-3.5 text-emerald-500" />
                  Viewer access — ask an admin to modify this joint.
                </div>
              </SheetFooter>
            )}
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function PortStatusChip({ status }: { status: CoreStatus }) {
  return (
    <span
      className={cn(
        'shrink-0 rounded-md px-1.5 py-0.5 text-[9.5px] font-semibold',
        status === 'free'
          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
          : status === 'damaged'
            ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
            : status === 'spliced'
              ? 'bg-violet-500/15 text-violet-700 dark:text-violet-300'
              : 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
      )}
    >
      {status === 'free' ? 'Free' : status === 'damaged' ? 'Cut' : status === 'spliced' ? 'Spliced' : 'In Use'}
    </span>
  );
}

function OutputPortRow({
  code,
  core,
  index,
  patch,
  power,
  userFibres,
}: {
  code: string;
  core: Core;
  index: number;
  patch?: CorePatch;
  power: number | null | undefined;
  userFibres: Tj['userFibres'];
}) {
  const status = core.status ?? 'free';
  const attachedFibres = userFibres?.filter((uf) => uf.outputCoreLabel === core.label) ?? [];

  return (
    <div
      className={cn(
        'space-y-1.5 rounded-xl border px-2.5 py-2 text-[11px] transition-colors',
        status === 'free'
          ? 'border-emerald-500/20 bg-emerald-500/[0.02]'
          : status === 'damaged'
            ? 'border-rose-500/25 bg-rose-500/[0.04]'
            : 'border-sky-500/30 bg-sky-500/[0.04]',
      )}
    >
      <div className="flex items-center gap-2">
        <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: core.color }} />
        <span className="min-w-0 flex-1 truncate font-semibold">
          {displayCoreLabel(core.label, index + 1)}
        </span>
        <PortStatusChip status={status} />
        {power !== null && power !== undefined ? (
          <span className="font-mono text-[10px] font-semibold text-primary">{power} dBm</span>
        ) : null}
      </div>

      {patch ? <CorePatchLine localCode={code} localCore={core.label} patch={patch} /> : null}

      {attachedFibres.length > 0 ? (
        <div className="space-y-1 border-t border-border/40 pt-1">
          {attachedFibres.map((uf) => {
            const splicedCore = uf.cores.find((c) => c.connectedToOutputCore);
            const spareCores = uf.cores.filter((c) => !c.connectedToOutputCore).length;

            return (
              <div
                key={uf.id}
                className="flex items-center justify-between rounded-lg border border-border/50 bg-background/50 px-2 py-1 text-[10px]"
              >
                <div className="flex items-center gap-1.5">
                  <Cable className="size-3 shrink-0 text-sky-500" />
                  <span className="font-medium">{uf.label}</span>
                  <span className="font-mono text-muted-foreground">({uf.coreCount}F)</span>
                </div>
                {splicedCore ? (
                  <span className="flex items-center gap-1 text-[9.5px] font-semibold text-sky-600 dark:text-sky-400">
                    <span
                      className="size-2 shrink-0 rounded-full border border-white/60 dark:border-white/20"
                      style={{ backgroundColor: splicedCore.color }}
                      title={`Core colour: ${splicedCore.color}`}
                    />
                    ⚡ Spliced: {displayCoreLabel(splicedCore.label, splicedCore.coreIndex)}
                  </span>
                ) : (
                  <span className="text-[9px] text-muted-foreground">{spareCores} spare cores (Free)</span>
                )}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function Metric({
  label,
  value,
  icon: Icon,
  accent,
  mono,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-xl border border-white/60 bg-white/45 px-2.5 py-2 dark:border-white/10 dark:bg-white/[0.03]">
      <div className="flex items-center gap-1.5">
        <Icon className={cn('size-3', accent)} />
        <p className="text-[8.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      </div>
      <p className={cn('mt-1 truncate text-[12.5px] font-semibold', mono && 'font-mono text-[11px]')}>{value}</p>
    </div>
  );
}
