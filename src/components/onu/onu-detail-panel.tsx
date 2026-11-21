'use client';

import { useMemo, useState } from 'react';
import {
  ArrowRight,
  Cable,
  CheckCircle2,
  Copy,
  Gauge,
  Layers,
  Link2,
  MapPin,
  Pencil,
  Split,
  Trash2,
  TriangleAlert,
  User,
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
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import type { FibreLink, Olt, Onu, Tj } from '@/lib/types';
import {
  computeOnuPowerBudget,
  diagnoseOnuChain,
  type BudgetStatus,
  type OnuChainDiagnosis,
  type OnuChainStatus,
} from '@/lib/power-budget';
import { cn, formatDistance } from '@/lib/utils';

interface OnuDetailPanelProps {
  onu: Onu | null;
  tjs: Tj[];
  olts: Olt[];
  links: FibreLink[];
  isAdmin: boolean;
  onClose: () => void;
  onEdit: (onu: Onu) => void;
  onLinkFrom: (onu: Onu) => void;
  onSelectLink: (link: FibreLink) => void;
  onDelete: (onu: Onu) => void;
}

export function OnuDetailPanel({
  onu,
  tjs,
  olts,
  links,
  isAdmin,
  onClose,
  onEdit,
  onLinkFrom,
  onSelectLink,
  onDelete,
}: OnuDetailPanelProps) {
  /** Fibre spans attached to this ONU; a real ONU has one input port, so one span. */
  const spans = useMemo(
    () =>
      onu ? links.filter((link) => link.fromOnuId === onu.id || link.toOnuId === onu.id) : [],
    [links, onu],
  );
  const budget = useMemo(
    () => (onu ? computeOnuPowerBudget(onu, tjs, olts, links) : null),
    [onu, tjs, olts, links],
  );
  // Chain health is read from the physical route, so it still reports the break
  // when no power budget can be calculated.
  const chain = useMemo(
    () => (onu ? diagnoseOnuChain(onu, tjs, olts, links) : null),
    [onu, tjs, olts, links],
  );
  const onuLeds = useMemo<{
    power: OnuLedState;
    pon: OnuLedState;
    loss: OnuLedState;
    lan: OnuLedState;
  }>(() => {
    const hasDrop = spans.length > 0;
    const dropUp = spans.some((span) => span.status === 'active');
    const lost =
      hasDrop &&
      (!budget ||
        budget.hasCut ||
        budget.coreFaults.length > 0 ||
        budget.status === 'over');
    const degraded =
      Boolean(budget) &&
      !lost &&
      (budget!.status === 'marginal' || budget!.status === 'overload');
    return {
      // The unit is powered once its drop cable is patched; the PON light stays
      // off until the chain actually hands it light.
      power: hasDrop ? 'solid' : 'off',
      pon: !hasDrop || lost ? 'off' : degraded ? 'blink' : 'solid',
      loss: lost ? 'alert' : 'off',
      lan: hasDrop && dropUp ? 'blink' : 'off',
    };
  }, [spans, budget]);

  const onuChain = useMemo(() => {
    if (spans.length === 0) {
      return {
        label: 'No drop cable',
        tone: 'border-slate-600/60 bg-slate-500/10 text-slate-300',
        detail: 'Patch a drop cable into the PON port to bring this ONU online.',
      };
    }
    if (!budget) {
      return {
        label: 'No signal',
        tone: 'border-rose-500/40 bg-rose-500/10 text-rose-300',
        detail:
          'No powered path back to the OLT. Check the splitter feed core and the upstream links.',
      };
    }
    if (budget.hasCut || budget.coreFaults.length > 0) {
      return {
        label: 'Signal lost',
        tone: 'border-rose-500/40 bg-rose-500/10 text-rose-300',
        detail: budget.coreFaults[0] ?? 'The route crosses a cut fibre link.',
      };
    }
    if (budget.status === 'over') {
      return {
        label: 'Signal too low',
        tone: 'border-rose-500/40 bg-rose-500/10 text-rose-300',
        detail: `${budget.rxPowerDbm.toFixed(2)} dBm is below the ONU sensitivity floor.`,
      };
    }
    if (budget.status === 'overload') {
      return {
        label: 'Signal too strong',
        tone: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
        detail: `${budget.rxPowerDbm.toFixed(2)} dBm is above the ONU overload point.`,
      };
    }
    if (budget.status === 'marginal') {
      return {
        label: 'Marginal signal',
        tone: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
        detail: `${budget.rxPowerDbm.toFixed(2)} dBm · only ${budget.marginDb.toFixed(2)} dB of ODN margin left.`,
      };
    }
    return {
      label: 'Registered',
      tone: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
      detail: `${budget.oltCode} · ${budget.ponPort ?? 'PON'} · RX ${budget.rxPowerDbm.toFixed(2)} dBm`,
    };
  }, [spans.length, budget]);
  const [copied, setCopied] = useState(false);

  async function copyCoordinates() {
    if (!onu || onu.lat === null || onu.lng === null) return;
    try {
      await navigator.clipboard.writeText(`${onu.lat.toFixed(6)}, ${onu.lng.toFixed(6)}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
      toast.success('Coordinates copied');
    } catch {
      toast.error('Could not access the clipboard');
    }
  }

  return (
    <Sheet open={Boolean(onu)} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <SheetContent className="max-w-md">
        {onu ? (
          <>
            <SheetHeader>
              <div className="mb-1 flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 font-mono text-[10.5px] font-semibold tracking-wide text-amber-700 dark:text-amber-300">
                  <User className="size-3" />
                  {onu.fibreId ?? 'No fibre ID'}
                </span>
                <span className="rounded-md bg-teal-500/15 px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-teal-700 dark:text-teal-300">
                  ONU
                </span>
                <span className="rounded-md bg-violet-500/15 px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-violet-700 dark:text-violet-300">
                  {(onu.ponType ?? 'gpon').toUpperCase()} {onu.onuClass ?? 'B+'}
                </span>
              </div>
              <SheetTitle className="font-display text-[17px]">{onu.username}</SheetTitle>
              <SheetDescription>
                {onu.districtName && onu.areaName
                  ? `${onu.districtName} · ${onu.areaName}`
                  : 'No service area assigned'}
              </SheetDescription>
            </SheetHeader>

            <SheetBody className="space-y-3">
              {/* LIVE ONU FRONT PANEL */}
              <section className="rounded-2xl border border-slate-700/60 bg-[#0b1220] p-3 shadow-inner">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                    <span className="relative flex size-2">
                      <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                      <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
                    </span>
                    ONU indicators · live
                  </p>
                  <span
                    className={cn(
                      'rounded-md border px-2 py-0.5 text-[9.5px] font-semibold',
                      onuChain.tone,
                    )}
                  >
                    {onuChain.label}
                  </span>
                </div>
                <OnuStatusGraphic
                  power={onuLeds.power}
                  pon={onuLeds.pon}
                  loss={onuLeds.loss}
                  lan={onuLeds.lan}
                />
                <p className="mt-2 font-mono text-[9.5px] leading-relaxed text-slate-400">
                  {onuChain.detail}
                </p>
              </section>

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-2xl border border-white/55 bg-white/45 p-3 dark:border-white/[0.06] dark:bg-white/[0.02]">
                  <p className="text-[8.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    MAC address
                  </p>
                  <p className="mt-1 truncate font-mono text-[12px] font-semibold">
                    {onu.macAddress || '—'}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/55 bg-white/45 p-3 dark:border-white/[0.06] dark:bg-white/[0.02]">
                  <p className="text-[8.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    VLAN ID
                  </p>
                  <p className="mt-1 font-mono text-[12px] font-semibold">{onu.vlanId ?? '—'}</p>
                </div>
              </div>

              {/* OPTICAL POWER BUDGET */}
              <section className="rounded-2xl border border-violet-500/25 bg-violet-500/[0.04] p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    <Gauge className="size-3 text-violet-500" />
                    Power budget · OLT → ONU
                  </p>
                  <div className="flex flex-wrap items-center justify-end gap-1.5">
                    {chain ? <ChainStatusBadge status={chain.status} /> : null}
                    {budget ? <BudgetStatusBadge status={budget.status} /> : null}
                  </div>
                </div>

                {!budget ? (
                  <div className="mt-2 space-y-2">
                    {chain ? (
                      <p
                        className={cn(
                          'rounded-xl border px-2.5 py-2 text-[10.5px] leading-relaxed',
                          chain.status === 'cut' || chain.status === 'open'
                            ? 'border-rose-500/30 bg-rose-500/[0.06] text-rose-700 dark:text-rose-300'
                            : 'border-amber-500/30 bg-amber-500/[0.06] text-amber-700 dark:text-amber-300',
                        )}
                      >
                        {chain.detail}
                      </p>
                    ) : null}
                    {chain ? <ChainStatusList chain={chain} /> : null}
                    <p className="text-[10px] text-muted-foreground">
                      Optical power is not available until the chain above is intact and fed.
                    </p>
                  </div>
                ) : (
                  <div className="mt-2 space-y-2.5">
                    <div className="flex flex-wrap items-center gap-1 font-mono text-[10px]">
                      <span className="rounded bg-sky-500/15 px-1.5 py-0.5 font-semibold text-sky-700 dark:text-sky-300">
                        {budget.oltCode}
                      </span>
                      {budget.route.slice(1, -1).map((node) => (
                        <span key={`${node.kind}-${node.id}`} className="flex items-center gap-1">
                          <ArrowRight className="size-2.5 text-muted-foreground" />
                          <span className="rounded bg-white/60 px-1.5 py-0.5 text-foreground/80 dark:bg-white/[0.06]">
                            {node.code}
                          </span>
                        </span>
                      ))}
                      <ArrowRight className="size-2.5 text-muted-foreground" />
                      <span className="rounded bg-amber-500/15 px-1.5 py-0.5 font-semibold text-amber-700 dark:text-amber-300">
                        {budget.onuCode}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-1.5 text-center font-mono">
                      <div className="rounded-xl border border-white/60 bg-white/60 p-1.5 dark:border-white/10 dark:bg-white/[0.04]">
                        <p className="text-[8.5px] font-sans uppercase text-muted-foreground">
                          OLT TX{budget.ponPort ? ` · ${budget.ponPort}` : ''}
                        </p>
                        <p className="text-[11.5px] font-semibold">{budget.txPowerDbm.toFixed(1)} dBm</p>
                      </div>
                      <div className="rounded-xl border border-white/60 bg-white/60 p-1.5 dark:border-white/10 dark:bg-white/[0.04]">
                        <p className="text-[8.5px] font-sans uppercase text-muted-foreground">Total loss</p>
                        <p className="text-[11.5px] font-semibold text-rose-500">
                          −{budget.totalLossDb.toFixed(2)} dB
                        </p>
                      </div>
                      <div className="rounded-xl border border-white/60 bg-white/60 p-1.5 dark:border-white/10 dark:bg-white/[0.04]">
                        <p className="text-[8.5px] font-sans uppercase text-muted-foreground">ONU RX</p>
                        <p className="text-[12px] font-bold text-primary">{budget.rxPowerDbm.toFixed(2)} dBm</p>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                        <span>{budget.classInfo.label} ODN budget used</span>
                        <span className="font-mono">
                          {budget.budgetUsedPercent}% · margin {budget.marginDb.toFixed(2)} dB
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-white/60 dark:bg-white/[0.08]">
                        <div
                          className={cn(
                            'h-full rounded-full transition-all',
                            budget.status === 'ok'
                              ? 'bg-emerald-500'
                              : budget.status === 'marginal'
                                ? 'bg-amber-500'
                                : 'bg-rose-500',
                          )}
                          style={{ width: `${Math.min(100, Math.max(0, budget.budgetUsedPercent))}%` }}
                        />
                      </div>
                      <p className="font-mono text-[9px] text-muted-foreground">
                        {budget.classInfo.ponType.toUpperCase()} {budget.classInfo.label} · window{' '}
                        {budget.classInfo.minLossDb}–{budget.classInfo.maxLossDb} dB · sensitivity{' '}
                        {budget.classInfo.sensitivityDbm} dBm · overload{' '}
                        {budget.classInfo.overloadDbm} dBm
                      </p>
                    </div>

                    <div className="grid grid-cols-4 gap-1 text-center font-mono text-[10px]">
                      <LossCell label="Fibre" value={budget.fibreLossDb} />
                      <LossCell label="Splice" value={budget.spliceLossDb} />
                      <LossCell label="Connector" value={budget.connectionLossDb} />
                      <LossCell label="Splitter" value={budget.splittingLossDb} />
                    </div>

                    <div className="space-y-1">
                      <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        Route links · {formatDistance(budget.distanceM)}
                      </p>
                      {budget.spans.map((span) => (
                        <div
                          key={span.linkId}
                          className={cn(
                            'rounded-lg border px-2 py-1.5',
                            span.status === 'active'
                              ? 'border-white/60 bg-white/55 dark:border-white/10 dark:bg-white/[0.03]'
                              : 'border-rose-500/30 bg-rose-500/[0.06]',
                          )}
                        >
                          <div className="flex items-center justify-between gap-2 font-mono text-[10px]">
                            <span className="inline-flex min-w-0 items-center gap-1.5">
                              <span
                                className={cn(
                                  'size-1.5 shrink-0 rounded-full',
                                  span.status === 'active' ? 'bg-emerald-500' : 'bg-rose-500',
                                )}
                              />
                              <span className="truncate">
                                {span.fromCode} → {span.toCode}
                              </span>
                            </span>
                            <span className="flex shrink-0 items-center gap-1.5">
                              <span
                                className={cn(
                                  'rounded px-1 py-0.5 text-[8.5px] font-semibold uppercase',
                                  span.status === 'active'
                                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                    : 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
                                )}
                              >
                                {span.status === 'active' ? 'Active' : 'Cut'}
                              </span>
                              <span className="font-semibold">{span.totalLossDb.toFixed(2)} dB</span>
                            </span>
                          </div>
                          <p className="mt-0.5 text-[9px] text-muted-foreground">
                            {span.fibreId}
                            {span.coreLabel ? ` · ${span.coreLabel}` : ''} ·{' '}
                            {formatDistance(span.lengthM)} · fibre {span.fibreLossDb.toFixed(2)}{' '}
                            dB @ {span.attenuationDbPerKm} dB/km · splice {span.spliceLossDb.toFixed(2)} dB ·
                            connector {span.connectionLossDb.toFixed(2)} dB
                            {span.extraLossDb > 0 ? ` · core +${span.extraLossDb.toFixed(2)} dB` : ''}
                          </p>
                        </div>
                      ))}
                      {budget.splitters.length > 0 ? (
                        <div className="space-y-1 pt-0.5">
                          {budget.splitters.map((splitter) => (
                            <div
                              key={splitter.tjId}
                              className="flex items-center gap-1.5 rounded-lg border border-violet-500/25 bg-violet-500/[0.05] px-2 py-1 text-[10px]"
                            >
                              <Split className="size-3 shrink-0 text-violet-500" />
                              <span className="min-w-0 flex-1 truncate font-mono">
                                {splitter.tjCode} · splitter {splitter.ratio}
                              </span>
                              <span
                                className={cn(
                                  'shrink-0 rounded px-1 py-0.5 text-[8.5px] font-semibold uppercase',
                                  splitter.fed
                                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                    : 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
                                )}
                              >
                                {splitter.fed ? 'Fed' : 'No feed'}
                              </span>
                              <span className="shrink-0 font-mono font-semibold text-rose-500">
                                −{splitter.lossDb.toFixed(2)} dB
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>

                    {budget.txAssumed ? (
                      <p className="flex items-start gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/[0.08] px-2 py-1.5 text-[10px] text-amber-700 dark:text-amber-300">
                        <TriangleAlert className="mt-0.5 size-3 shrink-0" />
                        No output power on the OLT PON port; {budget.txPowerDbm} dBm launch power assumed.
                      </p>
                    ) : null}
                    {budget.hasCut ? (
                      <p className="flex items-start gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/[0.08] px-2 py-1.5 text-[10px] text-rose-700 dark:text-rose-300">
                        <TriangleAlert className="mt-0.5 size-3 shrink-0" />
                        Route crosses a cut fibre link; calculated power is for the intact path.
                      </p>
                    ) : null}
                    {budget.coreFaults.map((fault) => (
                      <p
                        key={fault}
                        className="flex items-start gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/[0.08] px-2 py-1.5 text-[10px] text-rose-700 dark:text-rose-300"
                      >
                        <TriangleAlert className="mt-0.5 size-3 shrink-0" />
                        {fault}
                      </p>
                    ))}
                  </div>
                )}
              </section>

              <div className="rounded-2xl border border-white/55 bg-white/45 p-3 dark:border-white/[0.06] dark:bg-white/[0.02]">
                <div className="flex items-center justify-between gap-2">
                  <p className="inline-flex items-center gap-1.5 text-[8.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    <Cable className="size-3" />
                    PON input port
                  </p>
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${
                      spans.length > 0
                        ? 'bg-sky-500/15 text-sky-700 dark:text-sky-300'
                        : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                    }`}
                  >
                    {spans.length > 0 ? 'Connected' : 'Free'}
                  </span>
                </div>
                {spans.length > 0 ? (
                  <ul className="mt-1.5 space-y-1">
                    {spans.map((span) => (
                      <li
                        key={span.id}
                        className="flex items-center gap-1 font-mono text-[11px]"
                      >
                        <ArrowRight className="size-2.5 shrink-0 text-muted-foreground" />
                        <span className="truncate font-semibold">
                          {span.fromOnuId === onu.id ? span.toCode : span.fromCode}
                        </span>
                        <span className="truncate text-muted-foreground">· {span.fibreId}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    One drop-cable input — connect it to a fibre link.
                  </p>
                )}
              </div>

              <div className="rounded-2xl border border-white/55 bg-white/45 p-3 dark:border-white/[0.06] dark:bg-white/[0.02]">
                <div className="flex items-center justify-between gap-2">
                  <p className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    <MapPin className="size-3 text-primary" />
                    Coordinates &amp; Area
                  </p>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={copyCoordinates}
                    disabled={onu.lat === null || onu.lng === null}
                    aria-label="Copy coordinates"
                  >
                    {copied ? (
                      <CheckCircle2 className="size-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="size-3.5" />
                    )}
                  </Button>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-white/55 bg-white/55 px-2.5 py-1.5 dark:border-white/[0.06] dark:bg-white/[0.04]">
                    <p className="text-[8.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      Latitude
                    </p>
                    <p className="mt-1 font-mono text-[12px] font-semibold tabular-nums">
                      {onu.lat === null ? '—' : onu.lat.toFixed(6)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/55 bg-white/55 px-2.5 py-1.5 dark:border-white/[0.06] dark:bg-white/[0.04]">
                    <p className="text-[8.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      Longitude
                    </p>
                    <p className="mt-1 font-mono text-[12px] font-semibold tabular-nums">
                      {onu.lng === null ? '—' : onu.lng.toFixed(6)}
                    </p>
                  </div>
                </div>
                <p className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <Layers className="size-3 text-violet-500" />
                  <span className="min-w-0 truncate">
                    {onu.districtName && onu.areaName
                      ? `${onu.districtName} · ${onu.areaName}`
                      : 'Unassigned area'}
                  </span>
                  <span className="ml-auto shrink-0 font-mono text-[9px]">WGS 84</span>
                </p>
                {onu.subAreaName ? (
                  <p className="mt-1.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <Layers className="size-3 text-teal-500" />
                    <span className="shrink-0">Sub-area</span>
                    <span className="ml-auto min-w-0 truncate font-semibold text-primary/90">
                      {onu.subAreaName}
                    </span>
                  </p>
                ) : null}
              </div>

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
                      const outgoing = span.fromOnuId === onu.id;
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
                            className={`grid size-7 shrink-0 place-items-center rounded-lg ${
                              span.status === 'cut'
                                ? 'bg-rose-500/12 text-rose-500'
                                : 'bg-teal-500/12 text-teal-500'
                            }`}
                          >
                            <Cable className="size-3.5" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1.5">
                              <span className="truncate font-mono text-[10.5px] font-semibold">{span.fibreId}</span>
                              {span.status === 'cut' ? (
                                <span className="rounded bg-rose-500/15 px-1 py-0.5 text-[8px] font-semibold uppercase text-rose-600 dark:text-rose-300">
                                  Cut
                                </span>
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

              {onu.notes ? (
                <div className="rounded-2xl border border-white/55 bg-white/45 p-3 text-[11.5px] leading-relaxed text-muted-foreground dark:border-white/[0.06] dark:bg-white/[0.02]">
                  {onu.notes}
                </div>
              ) : null}

            </SheetBody>

            {isAdmin ? (
              <SheetFooter className="flex-wrap">
                <Button size="sm" onClick={() => onEdit(onu)} className="flex-1">
                  <Pencil className="size-3.5" />
                  Edit ONU
                </Button>
                <Button size="sm" variant="subtle" onClick={() => onLinkFrom(onu)}>
                  <Link2 className="size-3.5" />
                  Link
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => onDelete(onu)}
                  aria-label={`Delete ${onu.fibreId ?? onu.username}`}
                  className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                </Button>
              </SheetFooter>
            ) : null}
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

type OnuLedState = 'off' | 'solid' | 'blink' | 'alert';

/** A small front-panel illustration; the LEDs animate from the live chain state. */
function OnuStatusGraphic({
  power,
  pon,
  loss,
  lan,
}: {
  power: OnuLedState;
  pon: OnuLedState;
  loss: OnuLedState;
  lan: OnuLedState;
}) {
  const leds: { cx: number; label: string; state: OnuLedState; color: string }[] = [
    { cx: 68, label: 'PWR', state: power, color: '#22c55e' },
    { cx: 128, label: 'PON', state: pon, color: '#22c55e' },
    { cx: 188, label: 'LOSS', state: loss, color: '#ef4444' },
    { cx: 248, label: 'LAN', state: lan, color: '#22c55e' },
  ];

  return (
    <svg
      viewBox="0 0 316 140"
      role="img"
      aria-label="ONU front panel with PWR, PON, LOSS and LAN indicator lights"
      className="block w-full"
    >
      <defs>
        <linearGradient id="onu-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3d485c" />
          <stop offset="55%" stopColor="#222b3a" />
          <stop offset="100%" stopColor="#151c27" />
        </linearGradient>
        <linearGradient id="onu-face" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#151d29" />
          <stop offset="100%" stopColor="#0a1018" />
        </linearGradient>
        <filter id="onu-glow" x="-120%" y="-120%" width="340%" height="340%">
          <feGaussianBlur stdDeviation="4" />
        </filter>
      </defs>

      {/* device body */}
      <rect
        x="10"
        y="6"
        width="296"
        height="126"
        rx="16"
        fill="url(#onu-body)"
        stroke="#4a5870"
        strokeWidth="1"
      />
      <rect x="16" y="8" width="284" height="15" rx="8" fill="#ffffff" opacity="0.05" />
      <rect
        x="16"
        y="30"
        width="284"
        height="94"
        rx="10"
        fill="url(#onu-face)"
        stroke="#2b3546"
      />

      {/* brand and ventilation */}
      <text
        x="26"
        y="22"
        fill="#8494ab"
        fontSize="7"
        letterSpacing="1.8"
        fontFamily="ui-monospace, monospace"
      >
        GPON ONU
      </text>
      {[0, 1, 2, 3].map((row) =>
        [0, 1].map((col) => (
          <circle
            key={`vent-${row}-${col}`}
            cx={285 + col * 5}
            cy={17 + row * 4}
            r="1"
            fill="#3f4c60"
          />
        )),
      )}

      {/* indicator LEDs */}
      {leds.map((led) => {
        const active = led.state !== 'off';
        return (
          <g key={led.label}>
            {active ? (
              <>
                <circle
                  cx={led.cx}
                  cy={48}
                  r={12}
                  fill={led.color}
                  opacity={0.18}
                  filter="url(#onu-glow)"
                />
                <circle cx={led.cx} cy={48} r={7} fill={led.color} opacity={0.3} />
              </>
            ) : null}
            <circle cx={led.cx} cy={48} r={4.4} fill={active ? led.color : '#3a4658'}>
              {led.state === 'blink' ? (
                <animate
                  attributeName="opacity"
                  values="1;0.12;1"
                  dur="1.6s"
                  repeatCount="indefinite"
                />
              ) : null}
              {led.state === 'alert' ? (
                <animate
                  attributeName="opacity"
                  values="1;1;0.2;1"
                  keyTimes="0;0.68;0.78;1"
                  dur="1.4s"
                  repeatCount="indefinite"
                />
              ) : null}
            </circle>
            <text
              x={led.cx}
              y={69}
              textAnchor="middle"
              fill="#8b9bb1"
              fontSize="6.8"
              letterSpacing="1.1"
              fontFamily="ui-monospace, monospace"
            >
              {led.label}
            </text>
          </g>
        );
      })}

      {/* PON, LAN and power ports */}
      <g fill="#070c13" stroke="#334155" strokeWidth="0.8">
        <rect x="32" y="90" width="42" height="17" rx="2.5" />
        <rect x="86" y="90" width="34" height="17" rx="2.5" />
        <rect x="128" y="90" width="34" height="17" rx="2.5" />
        <rect x="170" y="90" width="34" height="17" rx="2.5" />
        <rect x="212" y="90" width="34" height="17" rx="2.5" />
        <rect x="262" y="90" width="18" height="17" rx="3.5" />
      </g>
      <g
        fill="#64748b"
        fontSize="5.4"
        textAnchor="middle"
        fontFamily="ui-monospace, monospace"
        letterSpacing="0.4"
      >
        <text x="53" y="101">PON</text>
        <text x="103" y="101">LAN1</text>
        <text x="145" y="101">LAN2</text>
        <text x="187" y="101">LAN3</text>
        <text x="229" y="101">LAN4</text>
        <text x="271" y="101">DC</text>
      </g>
      {/* fibre port dust cap */}
      <rect x="36" y="93" width="7" height="11" rx="1.5" fill="#1f7a4d" opacity="0.7" />
    </svg>
  );
}

const CHAIN_TONES: Record<OnuChainStatus, string> = {
  ok: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  cut: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  unfed: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  open: 'border-slate-500/40 bg-slate-500/10 text-slate-600 dark:text-slate-300',
};

const CHAIN_LABELS: Record<OnuChainStatus, string> = {
  ok: 'Chain OK',
  cut: 'Cut detected',
  unfed: 'Splitter unfed',
  open: 'No path',
};

function ChainStatusBadge({ status }: { status: OnuChainStatus }) {
  return (
    <span
      className={cn(
        'rounded-md border px-2 py-0.5 text-[9.5px] font-semibold',
        CHAIN_TONES[status],
      )}
    >
      {CHAIN_LABELS[status]}
    </span>
  );
}

/** Live span-by-span state of the OLT → ONU chain, shown when no budget exists. */
function ChainStatusList({ chain }: { chain: OnuChainDiagnosis }) {
  return (
    <div className="space-y-1">
      <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        Link chain · live
      </p>
      {chain.spans.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-2 py-2 text-[10px] text-muted-foreground">
          No fibre span is connected to this ONU.
        </p>
      ) : null}
      {chain.spans.map((span) => (
        <div
          key={span.linkId}
          className={cn(
            'rounded-lg border px-2 py-1.5',
            span.status === 'active'
              ? 'border-emerald-500/25 bg-emerald-500/[0.04]'
              : 'border-rose-500/30 bg-rose-500/[0.06]',
          )}
        >
          <div className="flex items-center gap-2 font-mono text-[10px]">
            <span
              className={cn(
                'size-1.5 shrink-0 rounded-full',
                span.status === 'active' ? 'bg-emerald-500' : 'bg-rose-500',
              )}
            />
            <span className="truncate">
              {span.fromCode} → {span.toCode}
            </span>
            <span
              className={cn(
                'ml-auto shrink-0 rounded px-1 py-0.5 text-[8.5px] font-semibold uppercase',
                span.status === 'active'
                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                  : 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
              )}
            >
              {span.status === 'active' ? 'Active' : 'Cut'}
            </span>
          </div>
          <p className="mt-0.5 text-[9px] text-muted-foreground">
            {span.fibreId}
            {span.lengthM !== null ? ` · ${formatDistance(span.lengthM)}` : ''}
            {span.coreLabel ? ` · ${span.coreLabel}` : ''}
          </p>
        </div>
      ))}
      {chain.splitters.map((splitter) => (
        <div
          key={splitter.tjId}
          className={cn(
            'flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[10px]',
            splitter.fed
              ? 'border-violet-500/25 bg-violet-500/[0.05]'
              : 'border-rose-500/30 bg-rose-500/[0.06]',
          )}
        >
          <Split className="size-3 shrink-0 text-violet-500" />
          <span className="min-w-0 flex-1 truncate font-mono">
            {splitter.tjCode} · splitter {splitter.ratio}
          </span>
          <span
            className={cn(
              'shrink-0 rounded px-1 py-0.5 text-[8.5px] font-semibold uppercase',
              splitter.fed
                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                : 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
            )}
          >
            {splitter.fed ? 'Fed' : 'No feed'}
          </span>
        </div>
      ))}
      {chain.faults.length > 0 ? (
        <ul className="space-y-1 pt-0.5">
          {chain.faults.map((fault) => (
            <li
              key={fault}
              className="rounded-lg border border-rose-500/25 bg-rose-500/[0.06] px-2 py-1 text-[9.5px] text-rose-700 dark:text-rose-300"
            >
              {fault}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function BudgetStatusBadge({ status }: { status: BudgetStatus }) {
  const styles: Record<BudgetStatus, string> = {
    ok: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    marginal: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
    over: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
    overload: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  };
  const labels: Record<BudgetStatus, string> = {
    ok: 'Within budget',
    marginal: 'Marginal',
    over: 'Over budget',
    overload: 'RX overload',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[9.5px] font-semibold',
        styles[status],
      )}
    >
      {status === 'ok' ? <Zap className="size-2.5" /> : <TriangleAlert className="size-2.5" />}
      {labels[status]}
    </span>
  );
}

function LossCell({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-white/60 bg-white/60 px-1 py-1 dark:border-white/10 dark:bg-white/[0.04]">
      <p className="text-[8px] font-sans uppercase text-muted-foreground">{label}</p>
      <p className="font-semibold">{value.toFixed(2)}</p>
    </div>
  );
}
