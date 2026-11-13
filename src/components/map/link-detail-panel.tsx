'use client';

import { ArrowRight, Cable, Link2, Pencil, Route, Server, Trash2, User, Waypoints } from 'lucide-react';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import type { DeviceKind, FibreLink } from '@/lib/types';
import { formatDistance } from '@/lib/utils';

interface LinkDetailPanelProps {
  link: FibreLink | null;
  isAdmin: boolean;
  onClose: () => void;
  onEdit: (link: FibreLink) => void;
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
  onDelete,
}: LinkDetailPanelProps) {
  const path = link?.path ?? [];

  return (
    <Sheet open={Boolean(link)} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <SheetContent className="max-w-md">
        {link ? (
          <>
            <SheetHeader>
              <div className="mb-1 flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center gap-1 rounded-md border border-violet-500/40 bg-violet-500/10 px-2 py-0.5 font-mono text-[10.5px] font-semibold tracking-wide text-violet-700 dark:text-violet-300">
                  <Link2 className="size-3" />
                  {link.fibreId}
                </span>
                <span
                  className={`rounded-md px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.14em] ${
                    link.status === 'cut'
                      ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                      : 'bg-teal-500/15 text-teal-700 dark:text-teal-300'
                  }`}
                >
                  {link.status === 'cut' ? 'Cut' : 'Active'}
                </span>
              </div>
              <SheetTitle className="font-display text-[17px]">
                {link.fromCode}
                <span className="mx-1.5 font-normal text-muted-foreground">→</span>
                {link.toCode}
              </SheetTitle>
              <SheetDescription>
                {link.coreCount} cores · {formatDistance(link.lengthM)} ·{' '}
                {path.length > 0
                  ? `${path.length} drawn bend${path.length === 1 ? '' : 's'}`
                  : 'straight link'}
              </SheetDescription>
            </SheetHeader>

            <SheetBody className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-2xl border border-white/55 bg-white/45 p-3 dark:border-white/[0.06] dark:bg-white/[0.02]">
                  <p className="inline-flex items-center gap-1 text-[8.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    <DeviceKindIcon kind={link.fromKind} className="size-2.5" />
                    From · {KIND_LABEL[link.fromKind]}
                  </p>
                  <p className="mt-1 truncate font-mono text-[12px] font-semibold">{link.fromCode}</p>
                  {link.fromName ? (
                    <p className="truncate text-[10px] text-muted-foreground">{link.fromName}</p>
                  ) : null}
                  <p className="mt-1 font-mono text-[9.5px] text-muted-foreground">
                    {link.fromLat.toFixed(5)}, {link.fromLng.toFixed(5)}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/55 bg-white/45 p-3 dark:border-white/[0.06] dark:bg-white/[0.02]">
                  <p className="inline-flex items-center gap-1 text-[8.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    <DeviceKindIcon kind={link.toKind} className="size-2.5" />
                    To · {KIND_LABEL[link.toKind]}
                  </p>
                  <p className="mt-1 truncate font-mono text-[12px] font-semibold">{link.toCode}</p>
                  {link.toName ? (
                    <p className="truncate text-[10px] text-muted-foreground">{link.toName}</p>
                  ) : null}
                  <p className="mt-1 font-mono text-[9.5px] text-muted-foreground">
                    {link.toLat.toFixed(5)}, {link.toLng.toFixed(5)}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-2xl border border-white/55 bg-white/45 p-3 dark:border-white/[0.06] dark:bg-white/[0.02]">
                  <p className="text-[8.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Length
                  </p>
                  <p className="mt-1 font-mono text-[12px] font-semibold">
                    {formatDistance(link.lengthM)}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/55 bg-white/45 p-3 dark:border-white/[0.06] dark:bg-white/[0.02]">
                  <p className="text-[8.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Cable
                  </p>
                  <p className="mt-1 truncate font-mono text-[12px] font-semibold">
                    {link.cableType || '—'}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/55 bg-white/45 p-3 dark:border-white/[0.06] dark:bg-white/[0.02]">
                  <p className="inline-flex items-center gap-1 text-[8.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    <Route className="size-2.5" />
                    Route
                  </p>
                  <p className="mt-1 font-mono text-[12px] font-semibold">
                    {path.length > 0 ? `${path.length} bends` : 'Straight'}
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-white/55 bg-white/45 p-3 dark:border-white/[0.06] dark:bg-white/[0.02]">
                <div className="flex items-center justify-between gap-2">
                  <p className="inline-flex items-center gap-1.5 text-[8.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    <Cable className="size-3" />
                    Fibre cores
                  </p>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {link.cores.filter((core) => core.status === 'connected').length} connected ·{' '}
                    {link.cores.length}
                  </span>
                </div>
                {link.cores.length > 0 ? (
                  <ul className="mt-1.5 space-y-1.5">
                    {link.cores.map((core, index) => {
                      const connected = core.status === 'connected';
                      return (
                        <li
                          key={`${core.label}-${index}`}
                          className="rounded-xl border border-white/50 bg-white/35 p-2 dark:border-white/[0.05] dark:bg-white/[0.02]"
                        >
                          <div className="flex items-center gap-2 font-mono text-[11.5px]">
                            <span
                              className="size-2.5 shrink-0 rounded-full"
                              style={{ backgroundColor: core.color }}
                            />
                            <span className="min-w-0 flex-1 truncate font-semibold">
                              {core.label}
                            </span>
                            <span
                              className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${
                                connected
                                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                  : 'bg-slate-500/10 text-muted-foreground'
                              }`}
                            >
                              {connected ? 'Connected' : 'Free'}
                            </span>
                          </div>
                          <div className="mt-1.5 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5">
                            <div
                              className="min-w-0 rounded-lg bg-white/55 px-1.5 py-1 dark:bg-white/[0.04]"
                              title={link.fromName ?? link.fromCode}
                            >
                              <p className="text-[8px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                                {KIND_LABEL[link.fromKind]} · from
                              </p>
                              <p className="truncate font-mono text-[10.5px] font-semibold">
                                {link.fromCode}
                              </p>
                              <p
                                className={`truncate font-mono text-[9.5px] ${
                                  core.fromCoreLabel
                                    ? 'text-foreground/80'
                                    : 'text-muted-foreground'
                                }`}
                              >
                                {core.fromCoreLabel ?? 'unpatched'}
                              </p>
                            </div>
                            <ArrowRight className="size-3 shrink-0 text-muted-foreground" />
                            <div
                              className="min-w-0 rounded-lg bg-white/55 px-1.5 py-1 dark:bg-white/[0.04]"
                              title={link.toName ?? link.toCode}
                            >
                              <p className="text-[8px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                                {KIND_LABEL[link.toKind]} · to
                              </p>
                              <p className="truncate font-mono text-[10.5px] font-semibold">
                                {link.toCode}
                              </p>
                              <p
                                className={`truncate font-mono text-[9.5px] ${
                                  core.toCoreLabel
                                    ? 'text-foreground/80'
                                    : 'text-muted-foreground'
                                }`}
                              >
                                {core.toCoreLabel ?? 'unpatched'}
                              </p>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="mt-1 text-[11px] text-muted-foreground">No cores recorded.</p>
                )}
              </div>

              {link.notes ? (
                <div className="rounded-2xl border border-white/55 bg-white/45 p-3 text-[11.5px] leading-relaxed text-muted-foreground dark:border-white/[0.06] dark:bg-white/[0.02]">
                  {link.notes}
                </div>
              ) : null}

              <p className="px-1 font-mono text-[9px] text-muted-foreground">
                Updated {new Date(link.updatedAt).toLocaleString()}
              </p>

              {isAdmin ? (
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="subtle" onClick={() => onEdit(link)}>
                    <Pencil className="size-3.5" />
                    Edit link
                  </Button>
                  <Button
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => onDelete(link)}
                  >
                    <Trash2 className="size-3.5" />
                    Delete link
                  </Button>
                </div>
              ) : null}
            </SheetBody>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
