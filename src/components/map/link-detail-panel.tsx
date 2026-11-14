'use client';

import { useMemo, useState } from 'react';
import {
  ArrowRight,
  Cable,
  CheckCircle2,
  Copy,
  Link2,
  MapPin,
  Pencil,
  Route,
  Ruler,
  Scissors,
  Server,
  ShieldCheck,
  Trash2,
  User,
  Waypoints,
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
import type { DeviceKind, FibreLink } from '@/lib/types';
import { computeSpanLoss } from '@/lib/power-budget';
import { cn, formatDistance } from '@/lib/utils';

interface LinkDetailPanelProps {
  link: FibreLink | null;
  isAdmin: boolean;
  onClose: () => void;
  onEdit: (link: FibreLink) => void;
  onCut: (link: FibreLink) => void;
  onJoin: (link: FibreLink) => void;
  onDelete: (link: FibreLink) => void;
}

const KIND_LABEL: Record<DeviceKind, string> = { tj: 'TJ', olt: 'OLT', onu: 'ONU' };

function DeviceKindIcon({ kind, className }: { kind: DeviceKind; className?: string }) {
  if (kind === 'olt') return <Server className={className} />;
  if (kind === 'onu') return <User className={className} />;
  return <Waypoints className={className} />;
}

export function LinkDetailPanel({
  link,
  isAdmin,
  onClose,
  onEdit,
  onCut,
  onJoin,
  onDelete,
}: LinkDetailPanelProps) {
  const [copied, setCopied] = useState(false);

  const stats = useMemo(() => {
    if (!link) return { total: 0, connected: 0, free: 0 };
    const total = link.cores?.length ?? link.coreCount ?? 0;
    const connected = (link.cores ?? []).filter(
      (core) => core.status === 'connected' || (core.fromCoreLabel && core.toCoreLabel),
    ).length;
    return { total, connected, free: Math.max(0, total - connected) };
  }, [link]);

  async function copyFibreId() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.fibreId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
      toast.success('Fibre ID copied');
    } catch {
      toast.error('Could not access the clipboard');
    }
  }

  const path = link?.path ?? [];
  const isCut = link?.status === 'cut';
  const spanLoss = useMemo(() => (link ? computeSpanLoss(link) : null), [link]);

  return (
    <Sheet
      open={Boolean(link)}
      modal={false}
      onOpenChange={(open) => (!open ? onClose() : undefined)}
    >
      <SheetContent hideOverlay className="max-w-md">
        {link ? (
          <>
            <SheetHeader>
              <div className="mb-1 flex flex-wrap items-center gap-1.5">
                <Badge variant={isCut ? 'cut' : 'active'} className="gap-1">
                  <Cable className="size-2.5" />
                  {isCut ? 'Cut Link' : 'Active Link'}
                </Badge>
                <span className="inline-flex items-center gap-1 rounded-md border border-violet-500/40 bg-violet-500/10 px-2 py-0.5 font-mono text-[10.5px] font-semibold tracking-wide text-violet-700 dark:text-violet-300">
                  <Link2 className="size-3" />
                  {link.fibreId}
                </span>
                {link.color ? (
                  <span
                    className="inline-flex items-center gap-1 rounded-md border border-white/60 bg-white/50 px-2 py-0.5 font-mono text-[10px] text-muted-foreground dark:border-white/10 dark:bg-white/[0.06]"
                    title="Custom link colour"
                  >
                    <span
                      className="size-2.5 rounded-full border border-white/60 dark:border-white/20"
                      style={{ backgroundColor: link.color }}
                    />
                    {link.color.toUpperCase()}
                  </span>
                ) : null}
                {!isAdmin ? <Badge variant="outline">Read only</Badge> : null}
              </div>

              <SheetTitle className="font-mono text-[17px] tracking-wide">
                {link.fromCode}
                <span className="mx-1.5 font-normal text-muted-foreground">→</span>
                {link.toCode}
              </SheetTitle>
              <SheetDescription>
                {KIND_LABEL[link.fromKind]} to {KIND_LABEL[link.toKind]} ·{' '}
                {formatDistance(link.lengthM)} · {stats.total} cores
                {path.length > 0 ? ` · ${path.length} bends` : ' · straight route'}
              </SheetDescription>
            </SheetHeader>

            <SheetBody className="space-y-4">
              {/* METRICS */}
              <div className="grid grid-cols-2 gap-2">
                <Metric
                  label="Length"
                  value={formatDistance(link.lengthM)}
                  icon={Ruler}
                  accent="text-sky-500"
                  mono
                />
                <Metric
                  label="Cores"
                  value={`${stats.connected} in use · ${stats.free} free`}
                  icon={Cable}
                  accent="text-teal-500"
                />
                <Metric
                  label="Cable type"
                  value={link.cableType || '—'}
                  icon={Cable}
                  accent="text-violet-500"
                />
                <Metric
                  label="Route"
                  value={path.length > 0 ? `${path.length} bends` : 'Straight'}
                  icon={Route}
                  accent="text-amber-500"
                />
              </div>

              {/* OPTICAL SPAN LOSS */}
              {spanLoss ? (
                <section className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.04] p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      <Ruler className="size-3 text-amber-500" />
                      Span loss
                    </p>
                    <span className="font-mono text-[12px] font-semibold text-amber-700 dark:text-amber-300">
                      {spanLoss.totalLossDb.toFixed(2)} dB
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5 text-center font-mono">
                    <div className="rounded-xl border border-white/60 bg-white/60 p-1.5 dark:border-white/10 dark:bg-white/[0.04]">
                      <p className="text-[8.5px] font-sans uppercase text-muted-foreground">Fibre</p>
                      <p className="text-[11.5px] font-semibold">{spanLoss.fibreLossDb.toFixed(2)} dB</p>
                    </div>
                    <div className="rounded-xl border border-white/60 bg-white/60 p-1.5 dark:border-white/10 dark:bg-white/[0.04]">
                      <p className="text-[8.5px] font-sans uppercase text-muted-foreground">Splices</p>
                      <p className="text-[11.5px] font-semibold">{spanLoss.spliceLossDb.toFixed(2)} dB</p>
                    </div>
                    <div className="rounded-xl border border-white/60 bg-white/60 p-1.5 dark:border-white/10 dark:bg-white/[0.04]">
                      <p className="text-[8.5px] font-sans uppercase text-muted-foreground">Connectors</p>
                      <p className="text-[11.5px] font-semibold">
                        {spanLoss.connectionLossDb.toFixed(2)} dB
                      </p>
                    </div>
                  </div>
                  <p className="mt-2 text-[10px] text-muted-foreground">
                    {spanLoss.attenuationDbPerKm} dB/km · {spanLoss.spliceCount} splice
                    {spanLoss.spliceCount === 1 ? '' : 's'} · {formatDistance(link.lengthM)} of fibre
                  </p>
                </section>
              ) : null}

              {/* ENDPOINTS */}
              <section className="rounded-2xl border border-white/60 bg-white/45 p-3 dark:border-white/10 dark:bg-white/[0.03]">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    <MapPin className="size-3 text-primary" />
                    Endpoints
                  </p>
                  <Button variant="ghost" size="icon-sm" onClick={copyFibreId} aria-label="Copy fibre ID">
                    {copied ? <CheckCircle2 className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <EndpointCard
                    side="From"
                    kind={link.fromKind}
                    code={link.fromCode}
                    name={link.fromName}
                    lat={link.fromLat}
                    lng={link.fromLng}
                  />
                  <EndpointCard
                    side="To"
                    kind={link.toKind}
                    code={link.toCode}
                    name={link.toName}
                    lat={link.toLat}
                    lng={link.toLng}
                  />
                </div>
              </section>

              {/* FIBRE CORES */}
              <section>
                <div className="mb-2 flex items-end justify-between">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Fibre cores ({stats.connected} in use · {stats.free} free)
                  </p>
                  <span className="font-mono text-[10px] text-muted-foreground">{stats.total} cores</span>
                </div>
                {(link.cores?.length ?? 0) === 0 ? (
                  <p className="rounded-xl border border-dashed border-border px-3 py-4 text-center text-[11px] text-muted-foreground">
                    No cores recorded for this link.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {link.cores.map((core, index) => {
                      const connected =
                        core.status === 'connected' || Boolean(core.fromCoreLabel && core.toCoreLabel);
                      return (
                        <div
                          key={`${core.label}-${index}`}
                          className={cn(
                            'rounded-xl border px-2.5 py-2 transition-colors',
                            connected
                              ? 'border-sky-500/25 bg-sky-500/[0.04]'
                              : 'border-emerald-500/20 bg-emerald-500/[0.03] dark:border-white/10 dark:bg-white/[0.03]',
                          )}
                        >
                          <div className="flex items-center gap-2.5">
                            <span
                              className="size-3 shrink-0 rounded-full border border-white/70 shadow-[0_0_10px] dark:border-slate-900"
                              style={{ backgroundColor: core.color || '#22d3ee', color: core.color || '#22d3ee' }}
                            />
                            <span className="min-w-0 flex-1 truncate text-[11.5px] font-medium">
                              {core.label || `Core ${index + 1}`}
                            </span>
                            <span
                              className={cn(
                                'inline-flex items-center rounded-md px-1.5 py-0.5 text-[9.5px] font-semibold',
                                connected
                                  ? 'bg-sky-500/15 text-sky-700 dark:text-sky-300'
                                  : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
                              )}
                            >
                              {connected ? 'In Use' : 'Free'}
                            </span>
                          </div>

                          <div className="mt-1.5 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5">
                            <div className="min-w-0 rounded-lg bg-white/55 px-1.5 py-1 dark:bg-white/[0.04]">
                              <p className="text-[8px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                                {KIND_LABEL[link.fromKind]} · from
                              </p>
                              <p className="truncate font-mono text-[10.5px] font-semibold">{link.fromCode}</p>
                              <p
                                className={cn(
                                  'truncate font-mono text-[9.5px]',
                                  core.fromCoreLabel ? 'text-foreground/80' : 'text-muted-foreground',
                                )}
                              >
                                {core.fromCoreLabel ?? 'unpatched'}
                              </p>
                            </div>
                            <ArrowRight className="size-3 shrink-0 text-muted-foreground" />
                            <div className="min-w-0 rounded-lg bg-white/55 px-1.5 py-1 dark:bg-white/[0.04]">
                              <p className="text-[8px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                                {KIND_LABEL[link.toKind]} · to
                              </p>
                              <p className="truncate font-mono text-[10.5px] font-semibold">{link.toCode}</p>
                              <p
                                className={cn(
                                  'truncate font-mono text-[9.5px]',
                                  core.toCoreLabel ? 'text-foreground/80' : 'text-muted-foreground',
                                )}
                              >
                                {core.toCoreLabel ?? 'unpatched'}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {link.notes ? (
                <section>
                  <Separator className="mb-3" />
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Field notes
                  </p>
                  <p className="rounded-xl border border-white/60 bg-white/45 px-3 py-2.5 text-[11.5px] leading-relaxed text-muted-foreground dark:border-white/10 dark:bg-white/[0.03]">
                    {link.notes}
                  </p>
                </section>
              ) : null}

              <p className="px-1 font-mono text-[9px] text-muted-foreground">
                Updated {new Date(link.updatedAt).toLocaleString()}
              </p>
            </SheetBody>

            {isAdmin ? (
              <SheetFooter className="flex-wrap">
                <Button size="sm" onClick={() => onEdit(link)} className="flex-1">
                  <Pencil className="size-3.5" />
                  Edit link
                </Button>
                {isCut ? (
                  <Button
                    size="sm"
                    variant="subtle"
                    onClick={() => onJoin(link)}
                    className="flex-1 text-emerald-700 hover:text-emerald-800 dark:text-emerald-300"
                  >
                    <Link2 className="size-3.5" />
                    Join
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => onCut(link)}
                    className="flex-1"
                  >
                    <Scissors className="size-3.5" />
                    Cut link
                  </Button>
                )}
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => onDelete(link)}
                  aria-label={`Delete ${link.fibreId}`}
                  className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                </Button>
              </SheetFooter>
            ) : (
              <SheetFooter>
                <div className="flex w-full items-center gap-2 text-[10.5px] text-muted-foreground">
                  <ShieldCheck className="size-3.5 text-emerald-500" />
                  Viewer access — ask an admin to modify this link.
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

function EndpointCard({
  side,
  kind,
  code,
  name,
  lat,
  lng,
}: {
  side: 'From' | 'To';
  kind: DeviceKind;
  code: string;
  name?: string | null;
  lat: number;
  lng: number;
}) {
  const Icon = DeviceKindIcon;
  return (
    <div className="rounded-xl border border-white/55 bg-white/55 px-2.5 py-2 dark:border-white/[0.06] dark:bg-white/[0.04]">
      <p className="inline-flex items-center gap-1 text-[8.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        <Icon kind={kind} className="size-2.5" />
        {side} · {KIND_LABEL[kind]}
      </p>
      <p className="mt-1 truncate font-mono text-[12px] font-semibold" title={code}>
        {code}
      </p>
      {name ? <p className="truncate text-[10px] text-muted-foreground">{name}</p> : null}
      <p className="mt-1 font-mono text-[9.5px] text-muted-foreground">
        {lat.toFixed(5)}, {lng.toFixed(5)}
      </p>
    </div>
  );
}
