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
import type { FibreLink, Tj } from '@/lib/types';
import { cn, formatDistance, totalCores } from '@/lib/utils';
import { assessOpticalPower, getSplitterLossDb } from '@/lib/optical';

interface TjDetailPanelProps {
  tj: Tj | null;
  links: FibreLink[];
  isAdmin: boolean;
  onClose: () => void;
  onEdit: (tj: Tj) => void;
  onLinkFrom: (tj: Tj) => void;
  onManageCut: (tj: Tj) => void;
  onDelete: (tj: Tj) => void;
  onSelectLink: (link: FibreLink) => void;
}

export function TjDetailPanel({
  tj,
  links,
  isAdmin,
  onClose,
  onEdit,
  onLinkFrom,
  onManageCut,
  onDelete,
  onSelectLink,
}: TjDetailPanelProps) {
  const [copied, setCopied] = useState(false);

  const spans = useMemo(() => {
    if (!tj) return [];
    return links.filter((link) => link.fromTjId === tj.id || link.toTjId === tj.id);
  }, [tj, links]);

  const total = tj ? totalCores(tj) : 0;
  const outputCoresCount =
    tj?.splitter?.outputs?.reduce((sum, core) => sum + (Number(core.count) || 0), 0) ??
    tj?.outputCores?.reduce((sum, core) => sum + (Number(core.count) || 0), 0) ??
    0;

  const freeCoresCount =
    tj?.cores?.filter((c) => c.status === 'free').reduce((sum, c) => sum + (Number(c.count) || 0), 0) ?? 0;
  const inUseCoresCount = total - freeCoresCount;

  // Splitter power calculation
  const splitterLossDb = tj?.splitter?.ratio ? getSplitterLossDb(tj.splitter.ratio, 0.2) : 0;
  const inputPower = tj?.splitter?.inputPowerDbm ?? tj?.inputPowerDbm ?? null;
  const outputPower = tj?.splitter?.outputPowerDbm ?? null;
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
                    Normal Box TJ
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

              {/* HIGH LEVEL METRICS */}
              <div className="grid grid-cols-2 gap-2">
                <Metric
                  label="Total cores"
                  value={`${total} (${freeCoresCount} Free)`}
                  icon={Radio}
                  accent="text-teal-500"
                />
                <Metric label="Connected spans" value={String(spans.length)} icon={Cable} accent="text-sky-500" />
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
                  value={tj.splitter?.enabled ? `${outputCoresCount}` : '—'}
                  icon={Split}
                  accent="text-violet-500"
                />
              </div>

              {/* SPLITTER POWER BUDGET CARD */}
              {tj.splitter?.enabled ? (
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
                      Fed from input core: <strong className="text-foreground">{tj.splitter.inputCoreLabel}</strong>
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
              </div>

              {/* INPUT CORE INVENTORY WITH FREE / IN USE STATUS */}
              <section>
                <div className="mb-2 flex items-end justify-between">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Input Cores ({inUseCoresCount} In Use · {freeCoresCount} Free)
                  </p>
                  <span className="font-mono text-[10px] text-muted-foreground">{total} cores</span>
                </div>
                {tj.cores.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-border px-3 py-4 text-center text-[11px] text-muted-foreground">
                    No cores recorded for this joint.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {tj.cores.map((core, index) => {
                      const isFree = core.status === 'free';
                      const isDamaged = core.status === 'damaged';

                      return (
                        <div
                          key={`${core.label}-${index}`}
                          className={cn(
                            'flex items-center gap-2.5 rounded-xl border px-2.5 py-2 transition-colors',
                            isFree
                              ? 'border-emerald-500/25 bg-emerald-500/[0.04]'
                              : isDamaged
                                ? 'border-rose-500/25 bg-rose-500/[0.04]'
                                : 'border-white/60 bg-white/45 dark:border-white/10 dark:bg-white/[0.03]',
                          )}
                        >
                          <span
                            className="size-3 shrink-0 rounded-full border border-white/70 shadow-[0_0_10px] dark:border-slate-900"
                            style={{ backgroundColor: core.color, color: core.color }}
                          />
                          <span className="min-w-0 flex-1 truncate text-[11.5px] font-medium">{core.label}</span>

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

                          {core.powerDbm !== null && core.powerDbm !== undefined ? (
                            <span className="font-mono text-[10px] text-amber-600 dark:text-amber-400">
                              {core.powerDbm} dBm
                            </span>
                          ) : null}

                          {core.count > 1 ? (
                            <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px] font-semibold text-muted-foreground">
                              {core.count}×
                            </span>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* OUTPUT CORES & USER FIBRES */}
              {(tj.outputCores?.length || tj.splitter?.outputs?.length) ? (
                <section>
                  <Separator className="mb-3" />
                  <div className="mb-2 flex items-end justify-between">
                    <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      <Split className="size-3 text-violet-500" />
                      Output Cores & User Drops ({outputCoresCount} Cores)
                    </p>
                    {tj.splitter?.enabled ? <Badge variant="splitter">{tj.splitter.ratio}</Badge> : null}
                  </div>
                  <div className="space-y-1.5">
                    {(tj.outputCores && tj.outputCores.length > 0 ? tj.outputCores : tj.splitter?.outputs ?? []).map(
                      (core, index) => {
                        const isFree = core.status === 'free';
                        const attachedFibres =
                          tj.userFibres?.filter((uf) => uf.outputCoreLabel === core.label) ?? [];

                        return (
                          <div
                            key={`${core.label}-${index}`}
                            className={cn(
                              'rounded-xl border px-2.5 py-2 text-[11px] space-y-1.5 transition-colors',
                              !isFree
                                ? 'border-sky-500/30 bg-sky-500/[0.04]'
                                : 'border-emerald-500/20 bg-emerald-500/[0.02]',
                            )}
                          >
                            <div className="flex items-center gap-2">
                              <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: core.color }} />
                              <span className="min-w-0 flex-1 font-semibold truncate">{core.label}</span>
                              <span
                                className={cn(
                                  'rounded-md px-1.5 py-0.5 text-[9.5px] font-semibold',
                                  isFree
                                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                    : 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
                                )}
                              >
                                {isFree ? 'Free' : 'In Use'}
                              </span>
                              {core.powerDbm !== null && core.powerDbm !== undefined ? (
                                <span className="font-mono text-[10px] font-semibold text-primary">
                                  {core.powerDbm} dBm
                                </span>
                              ) : null}
                            </div>

                            {/* Attached User Fibres summary in detail panel */}
                            {attachedFibres.length > 0 ? (
                              <div className="pt-1 border-t border-border/40 space-y-1">
                                {attachedFibres.map((uf) => {
                                  const splicedCore = uf.cores.find((c) => c.connectedToOutputCore);
                                  const freeCores = uf.cores.filter((c) => !c.connectedToOutputCore).length;

                                  return (
                                    <div
                                      key={uf.id}
                                      className="flex items-center justify-between text-[10px] bg-background/50 rounded-lg px-2 py-1 border border-border/50"
                                    >
                                      <div className="flex items-center gap-1.5">
                                        <span
                                          className="size-2 rounded-full shrink-0"
                                          style={{ backgroundColor: uf.color }}
                                        />
                                        <span className="font-medium">{uf.label}</span>
                                        <span className="text-muted-foreground font-mono">({uf.coreCount}F)</span>
                                      </div>
                                      {splicedCore ? (
                                        <span className="text-sky-600 dark:text-sky-400 font-semibold text-[9.5px]">
                                          ⚡ Spliced: {splicedCore.label}
                                        </span>
                                      ) : (
                                        <span className="text-muted-foreground text-[9px]">
                                          {freeCores} spare cores (Free)
                                        </span>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            ) : null}
                          </div>
                        );
                      },
                    )}
                  </div>
                </section>
              ) : null}

              {/* CONNECTED SPANS */}
              <section>
                <Separator className="mb-3" />
                <div className="mb-2 flex items-end justify-between">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Connected spans
                  </p>
                  <span className="font-mono text-[10px] text-muted-foreground">{spans.length}</span>
                </div>
                {spans.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-border px-3 py-4 text-center text-[11px] text-muted-foreground">
                    No fibre spans linked yet.
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
                  size="sm"
                  variant="subtle"
                  onClick={() => onManageCut(tj)}
                  className={cn(tj.isCut && 'border-rose-400/40 text-rose-500')}
                >
                  <Scissors className="size-3.5" />
                  Cut
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
