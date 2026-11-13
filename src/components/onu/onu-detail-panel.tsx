'use client';

import { useMemo, useState } from 'react';
import {
  ArrowRight,
  Cable,
  CheckCircle2,
  Copy,
  Layers,
  Link2,
  MapPin,
  Network,
  Pencil,
  Trash2,
  User,
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
import { CorePatchLine, linkPatches, type CorePatch } from '@/components/map/core-patch-line';
import type { CoreStatus, FibreLink, Onu } from '@/lib/types';
import { formatDistance } from '@/lib/utils';

interface OnuDetailPanelProps {
  onu: Onu | null;
  links: FibreLink[];
  isAdmin: boolean;
  onClose: () => void;
  onEdit: (onu: Onu) => void;
  onLinkFrom: (onu: Onu) => void;
  onSelectLink: (link: FibreLink) => void;
  onDelete: (onu: Onu) => void;
}

const STATUS_STYLES: Record<CoreStatus, string> = {
  free: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  in_use: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
  spliced: 'bg-teal-500/15 text-teal-700 dark:text-teal-300',
  damaged: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
};

const STATUS_LABELS: Record<CoreStatus, string> = {
  free: 'Free',
  in_use: 'In use',
  spliced: 'Spliced',
  damaged: 'Cut',
};

export function OnuDetailPanel({
  onu,
  links,
  isAdmin,
  onClose,
  onEdit,
  onLinkFrom,
  onSelectLink,
  onDelete,
}: OnuDetailPanelProps) {
  const spans = useMemo(
    () =>
      onu ? links.filter((link) => link.fromOnuId === onu.id || link.toOnuId === onu.id) : [],
    [links, onu],
  );
  /** Per-core far-end mapping from the area's fibre links. */
  const patches = useMemo<Map<string, CorePatch>>(
    () => (onu ? linkPatches(links, { kind: 'onu', id: onu.id }) : new Map()),
    [links, onu],
  );
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
                  {onu.fibreId}
                </span>
                <span className="rounded-md bg-teal-500/15 px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-teal-700 dark:text-teal-300">
                  ONU
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

              <div className="rounded-2xl border border-white/55 bg-white/45 p-3 dark:border-white/[0.06] dark:bg-white/[0.02]">
                <div className="flex items-center justify-between gap-2">
                  <p className="inline-flex items-center gap-1.5 text-[8.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    <Network className="size-3" />
                    Fibre cores
                  </p>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {onu.cores.filter((core) => core.status === 'free').length} free ·{' '}
                    {onu.cores.length}
                  </span>
                </div>
                {onu.cores.length > 0 ? (
                  <ul className="mt-1.5 space-y-1">
                    {onu.cores.map((core, index) => {
                      const status = (core.status ?? 'free') as CoreStatus;
                      const patch = patches.get(core.label);
                      return (
                        <li
                          key={`${core.label}-${index}`}
                          className="font-mono text-[11.5px]"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="flex min-w-0 items-center gap-1.5">
                              <span
                                className="size-2.5 shrink-0 rounded-full"
                                style={{ backgroundColor: core.color }}
                              />
                              <span className="truncate font-semibold">{core.label}</span>
                            </span>
                            <span
                              className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${
                                STATUS_STYLES[status] ?? STATUS_STYLES.free
                              }`}
                            >
                              {STATUS_LABELS[status] ?? 'Free'}
                            </span>
                          </div>
                          {patch ? (
                            <CorePatchLine
                              localCode={onu.fibreId}
                              localCore={core.label}
                              patch={patch}
                            />
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="mt-1 text-[11px] text-muted-foreground">No cores recorded.</p>
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
                              <span className="truncate font-mono text-[10.5px] font-semibold">
                                {span.fibreId}
                              </span>
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
                  aria-label={`Delete ${onu.fibreId}`}
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
