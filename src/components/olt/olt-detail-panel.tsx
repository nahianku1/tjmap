'use client';

import { useMemo, useState } from 'react';
import { ArrowRight, Cable, CheckCircle2, Copy, Layers, Link2, MapPin, Pencil, Trash2 } from 'lucide-react';
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
import type { FibreLink, Olt } from '@/lib/types';
import { formatDistance } from '@/lib/utils';

interface OltDetailPanelProps {
  olt: Olt | null;
  links: FibreLink[];
  isAdmin: boolean;
  onClose: () => void;
  onEdit: (olt: Olt) => void;
  onLinkFrom: (olt: Olt) => void;
  onSelectLink: (link: FibreLink) => void;
  onDelete: (olt: Olt) => void;
}

export function OltDetailPanel({
  olt,
  links,
  isAdmin,
  onClose,
  onEdit,
  onLinkFrom,
  onSelectLink,
  onDelete,
}: OltDetailPanelProps) {
  const spans = useMemo(
    () =>
      olt ? links.filter((link) => link.fromOltId === olt.id || link.toOltId === olt.id) : [],
    [links, olt],
  );
  /** Per-port far-end mapping from the area's fibre links. */
  const patches = useMemo<Map<string, CorePatch>>(
    () => (olt ? linkPatches(links, { kind: 'olt', id: olt.id }) : new Map()),
    [links, olt],
  );
  const [copied, setCopied] = useState(false);

  async function copyCoordinates() {
    if (!olt || olt.lat === null || olt.lng === null) return;
    try {
      await navigator.clipboard.writeText(`${olt.lat.toFixed(6)}, ${olt.lng.toFixed(6)}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
      toast.success('Coordinates copied');
    } catch {
      toast.error('Could not access the clipboard');
    }
  }

  return (
    <Sheet open={Boolean(olt)} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <SheetContent className="max-w-md">
        {olt ? (
          <>
            <SheetHeader>
              <div className="mb-1 flex flex-wrap items-center gap-1.5">
                <span className="rounded-md border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 font-mono text-[10.5px] font-semibold tracking-wide text-sky-700 dark:text-sky-300">
                  {olt.code}
                </span>
                <span className="rounded-md bg-teal-500/15 px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-teal-700 dark:text-teal-300">
                  OLT
                </span>
              </div>
              <SheetTitle className="font-display text-[17px]">{olt.name}</SheetTitle>
              <SheetDescription>
                {olt.districtName && olt.areaName
                  ? `${olt.districtName} · ${olt.areaName}`
                  : 'No service area assigned'}
              </SheetDescription>
            </SheetHeader>

            <SheetBody className="space-y-3">
              <div className="rounded-2xl border border-white/55 bg-white/45 p-3 dark:border-white/[0.06] dark:bg-white/[0.02]">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[8.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    PON ports
                  </p>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {olt.ponPorts.filter((port) => port.status !== 'in_use').length} free ·{' '}
                    {olt.ponPorts.length}
                  </span>
                </div>
                {olt.ponPorts.length > 0 ? (
                  <ul className="mt-1.5 space-y-1">
                    {olt.ponPorts.map((port, index) => (
                      <li
                        key={`${port.label}-${index}`}
                        className="font-mono text-[11.5px]"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate font-semibold">{port.label}</span>
                          <span className="flex shrink-0 items-center gap-1.5">
                            <span className="text-muted-foreground">
                              {port.outputDbm === null ? '—' : `+${port.outputDbm} dBm`}
                            </span>
                            {port.vlanId != null ? (
                              <span className="rounded border border-violet-500/35 bg-violet-500/10 px-1.5 py-0.5 text-[9.5px] font-semibold text-violet-700 dark:text-violet-300">
                                VLAN {port.vlanId}
                              </span>
                            ) : null}
                            <span
                              title={
                                port.status === 'in_use'
                                  ? `${port.joints ?? 1} joints served`
                                  : 'No joints use this port'
                              }
                              className={`rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${
                                port.status === 'in_use'
                                  ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                                  : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                              }`}
                            >
                              {port.status === 'in_use'
                                ? `In use${port.joints ? ` · ${port.joints}` : ''}`
                                : 'Free'}
                            </span>
                          </span>
                        </div>
                        {patches.get(port.label) ? (
                          <CorePatchLine
                            localCode={olt.code}
                            localCore={port.label}
                            patch={patches.get(port.label)!}
                          />
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 font-mono text-[12.5px] font-semibold">{olt.ponPort ?? '—'}</p>
                )}
              </div>

              <div className="rounded-2xl border border-white/55 bg-white/45 p-3 dark:border-white/[0.06] dark:bg-white/[0.02]">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[8.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Ethernet ports
                  </p>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {olt.ethernetPorts.filter((port) => port.status !== 'in_use').length} free ·{' '}
                    {olt.ethernetPorts.length}
                  </span>
                </div>
                {olt.ethernetPorts.length > 0 ? (
                  <ul className="mt-1.5 space-y-1">
                    {olt.ethernetPorts.map((port, index) => (
                      <li
                        key={`${port.label}-${index}`}
                        className="font-mono text-[11.5px]"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate font-semibold">{port.label}</span>
                          <span className="flex shrink-0 items-center gap-1.5">
                            <span className="rounded border border-teal-500/35 bg-teal-500/10 px-1.5 py-0.5 text-[9.5px] font-semibold text-teal-700 dark:text-teal-300">
                              {port.speed}
                            </span>
                            {port.vlanId != null ? (
                              <span className="rounded border border-violet-500/35 bg-violet-500/10 px-1.5 py-0.5 text-[9.5px] font-semibold text-violet-700 dark:text-violet-300">
                                VLAN {port.vlanId}
                              </span>
                            ) : null}
                            <span
                              className={`rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${
                                port.status === 'in_use'
                                  ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                                  : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                              }`}
                            >
                              {port.status === 'in_use' ? 'In use' : 'Free'}
                            </span>
                          </span>
                        </div>
                        {patches.get(port.label) ? (
                          <CorePatchLine
                            localCode={olt.code}
                            localCore={port.label}
                            patch={patches.get(port.label)!}
                          />
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 font-mono text-[12.5px] font-semibold">{olt.uplinkPort ?? '—'}</p>
                )}
              </div>

              <div className="rounded-2xl border border-white/55 bg-white/45 p-3 dark:border-white/[0.06] dark:bg-white/[0.02]">
                <div className="flex items-center justify-between gap-2">
                  <p className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    <MapPin className="size-3 text-primary" />
                    Coordinates &amp; Area
                  </p>
                  <span className="flex shrink-0 items-center gap-1">
                    <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Cable className="size-3" />
                      {olt.tjCount} joints
                    </span>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={copyCoordinates}
                      disabled={olt.lat === null || olt.lng === null}
                      aria-label="Copy coordinates"
                    >
                      {copied ? (
                        <CheckCircle2 className="size-3.5 text-emerald-500" />
                      ) : (
                        <Copy className="size-3.5" />
                      )}
                    </Button>
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-white/55 bg-white/55 px-2.5 py-1.5 dark:border-white/[0.06] dark:bg-white/[0.04]">
                    <p className="text-[8.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      Latitude
                    </p>
                    <p className="mt-1 font-mono text-[12px] font-semibold tabular-nums">
                      {olt.lat === null ? '—' : olt.lat.toFixed(6)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/55 bg-white/55 px-2.5 py-1.5 dark:border-white/[0.06] dark:bg-white/[0.04]">
                    <p className="text-[8.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      Longitude
                    </p>
                    <p className="mt-1 font-mono text-[12px] font-semibold tabular-nums">
                      {olt.lng === null ? '—' : olt.lng.toFixed(6)}
                    </p>
                  </div>
                </div>
                <p className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <Layers className="size-3 text-violet-500" />
                  <span className="min-w-0 truncate">
                    {olt.districtName && olt.areaName
                      ? `${olt.districtName} · ${olt.areaName}`
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
                      const outgoing = span.fromOltId === olt.id;
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

              {olt.notes ? (
                <div className="rounded-2xl border border-white/55 bg-white/45 p-3 text-[11.5px] leading-relaxed text-muted-foreground dark:border-white/[0.06] dark:bg-white/[0.02]">
                  {olt.notes}
                </div>
              ) : null}

            </SheetBody>

            {isAdmin ? (
              <SheetFooter className="flex-wrap">
                <Button size="sm" onClick={() => onEdit(olt)} className="flex-1">
                  <Pencil className="size-3.5" />
                  Edit OLT
                </Button>
                <Button size="sm" variant="subtle" onClick={() => onLinkFrom(olt)}>
                  <Link2 className="size-3.5" />
                  Link
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => onDelete(olt)}
                  aria-label={`Delete ${olt.code}`}
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
