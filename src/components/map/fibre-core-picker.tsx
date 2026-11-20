'use client';

import { useState } from 'react';
import { Cable, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { api, ApiError } from '@/lib/api';
import type { DeviceKind, FibreLink, LinkCore } from '@/lib/types';
import { displayCoreLabel, tubeOf } from '@/lib/fibre-cores';
import { CoreDot } from './core-dot';

interface FibreCorePickerProps {
  kind: DeviceKind;
  deviceId?: string | null;
  links: FibreLink[];
  /** Called after a core patch is saved so the map and power budgets refresh. */
  onPatched?: () => void | Promise<void>;
}

function sideOf(link: FibreLink, deviceId: string): 'from' | 'to' | null {
  if (link.fromTjId === deviceId || link.fromOltId === deviceId || link.fromOnuId === deviceId) {
    return 'from';
  }
  if (link.toTjId === deviceId || link.toOltId === deviceId || link.toOnuId === deviceId) {
    return 'to';
  }
  return null;
}

function sideKey(side: 'from' | 'to'): 'fromCoreLabel' | 'toCoreLabel' {
  return side === 'from' ? 'fromCoreLabel' : 'toCoreLabel';
}

/** The strand this device currently terminates on at its end of the cable. */
function patchedCore(cores: LinkCore[], side: 'from' | 'to'): LinkCore | null {
  const key = sideKey(side);
  return cores.find((core) => Boolean(core[key])) ?? null;
}

/**
 * Lets a device move onto another core of a cable already connected to it — the
 * field fix when one core is faulty — and records the extra loss that core carries
 * so the OLT → ONU power budget reflects the new run.
 */
export function FibreCorePicker({ kind, deviceId, links, onPatched }: FibreCorePickerProps) {
  const [busy, setBusy] = useState<string | null>(null);
  // Cores as last saved from this picker. The parent's link props can still be the
  // pre-save ones when the next change is made, which used to leave a stale core
  // selected after un-patching.
  const [savedCores, setSavedCores] = useState<Record<string, LinkCore[]>>({});

  const coresFor = (link: FibreLink): LinkCore[] => savedCores[link.id] ?? link.cores ?? [];

  const attached = deviceId
    ? links.filter((link) => sideOf(link, deviceId) !== null && coresFor(link).length > 0)
    : [];
  if (attached.length === 0) return null;

  async function patch(
    link: FibreLink,
    side: 'from' | 'to',
    targetLabel: string | null,
    lossDb: number,
  ) {
    const existingCores = coresFor(link);
    const current = patchedCore(existingCores, side);
    // A strand only carries a run when both ends are patched on the same row, so
    // moving onto another core moves the far end with it; the local port labels
    // at each end are kept.
    const cores: LinkCore[] = existingCores.map((core) => {
      const next: LinkCore = { ...core, lossDb: Number(core.lossDb ?? 0) };
      if (targetLabel && core.label === targetLabel) {
        next.fromCoreLabel = current?.fromCoreLabel ?? core.fromCoreLabel ?? null;
        next.toCoreLabel = current?.toCoreLabel ?? core.toCoreLabel ?? null;
        next.lossDb = lossDb;
      } else if (current && core.label === current.label && core.label !== targetLabel) {
        next.fromCoreLabel = null;
        next.toCoreLabel = null;
      }
      return next;
    });

    setBusy(link.id);
    try {
      const saved = await api.updateLink(link.id, { cores });
      setSavedCores((previous) => ({ ...previous, [link.id]: saved.cores ?? cores }));
      const landed = targetLabel
        ? `moved to ${displayCoreLabel(targetLabel)} on ${saved.fibreId}`
        : `unpatched from ${saved.fibreId}`;
      toast.success(`${kind.toUpperCase()} ${landed}`, {
        description:
          lossDb > 0 && targetLabel ? `Core loss ${lossDb.toFixed(2)} dB applied.` : undefined,
      });
      await onPatched?.();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not move this core.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="space-y-2 rounded-2xl border border-white/60 bg-white/40 p-3 dark:border-white/10 dark:bg-white/[0.03]">
      <div className="flex items-center justify-between">
        <p className="inline-flex items-center gap-1.5 text-[12px] font-semibold">
          <Cable className="size-3.5 text-primary" />
          Fibre core
        </p>
        <span className="text-[10px] text-muted-foreground">Move this device onto another core</span>
      </div>
      <p className="text-[10px] leading-relaxed text-muted-foreground">
        Pick the strand of the connected cable this device terminates on. Every tube of the cable is
        listed; strands already used by another device are disabled, so a faulty core can be moved
        onto any free core of any tube. Extra loss (dB) follows the chosen core into the OLT → ONU
        power budget.
      </p>

      {attached.map((link) => {
        const side = sideOf(link, deviceId!);
        if (!side) return null;
        const cores = coresFor(link);
        const current = patchedCore(cores, side);
        // Group the cable's strands by tube so every tube of a multi-tube cable is
        // selectable, and mark strands another device already occupies.
        const tubes = new Map<number, { core: LinkCore; position: number; used: boolean }[]>();
        cores.forEach((core, position) => {
          const used =
            Boolean(core.fromCoreLabel || core.toCoreLabel) && core.label !== current?.label;
          const tube = tubeOf(Number(core.index) || position + 1);
          const list = tubes.get(tube) ?? [];
          list.push({ core, position, used });
          tubes.set(tube, list);
        });
        return (
          <div key={link.id} className="flex flex-wrap items-center gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate font-mono text-[11px] font-semibold">{link.fibreId}</p>
              <p className="truncate text-[10px] text-muted-foreground">
                {side === 'from' ? link.toCode : link.fromCode} · {cores.length} core
                {cores.length === 1 ? '' : 's'}
              </p>
            </div>
            <Select
              value={current?.label ?? 'none'}
              disabled={busy === link.id}
              onValueChange={(value) =>
                patch(
                  link,
                  side,
                  value === 'none' ? null : value,
                  Number(cores.find((core) => core.label === value)?.lossDb ?? 0),
                )
              }
            >
              <SelectTrigger aria-label={`Core on ${link.fibreId}`} className="h-9 w-[168px] font-mono text-[11px]">
                <span className="flex min-w-0 items-center gap-1.5">
                  <CoreDot color={current?.color} />
                  <span className="truncate">
                    {current
                      ? displayCoreLabel(
                          current.label,
                          Number(current.index) || cores.indexOf(current) + 1,
                        )
                      : 'Unpatched'}
                  </span>
                </span>
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="none">
                  <span className="inline-flex items-center gap-1.5">
                    <CoreDot color={null} />
                    Unpatched
                  </span>
                </SelectItem>
                {[...tubes.entries()].map(([tube, entries]) => {
                  const freeCount = entries.filter((entry) => !entry.used).length;
                  return (
                    <SelectGroup key={`${link.id}-tube-${tube}`}>
                      <SelectLabel className="font-mono text-[9.5px] uppercase tracking-[0.1em]">
                        Tube {tube} · {freeCount} selectable
                        {entries.length - freeCount > 0
                          ? ` · ${entries.length - freeCount} in use`
                          : ''}
                      </SelectLabel>
                      {entries.map(({ core, position, used }) => (
                        <SelectItem
                          key={`${link.id}-${core.label}`}
                          value={core.label}
                          disabled={used}
                        >
                          <span className="inline-flex items-center gap-1.5">
                            <CoreDot color={core.color} />
                            <span>
                              {displayCoreLabel(
                                core.label,
                                Number(core.index) || position + 1,
                              )}
                            </span>
                            {Number(core.lossDb ?? 0) > 0 ? (
                              <span className="text-[9px] text-amber-600 dark:text-amber-400">
                                +{Number(core.lossDb).toFixed(2)} dB
                              </span>
                            ) : null}
                            {used ? (
                              <span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                                in use
                              </span>
                            ) : null}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  );
                })}
              </SelectContent>
            </Select>
            <Input
              aria-label={`Extra loss on ${link.fibreId} ${
                current
                  ? displayCoreLabel(current.label, Number(current.index) || cores.indexOf(current) + 1)
                  : 'core'
              }`}
              inputMode="decimal"
              disabled={busy === link.id || !current}
              defaultValue={current ? String(Number(current.lossDb ?? 0)) : '0'}
              key={`${link.id}-${current?.label ?? 'none'}-loss`}
              onBlur={(event) => {
                const value = Number(event.target.value);
                if (!current || !Number.isFinite(value)) return;
                const clamped = Math.min(Math.max(value, 0), 99);
                if (Math.abs(clamped - Number(current.lossDb ?? 0)) < 0.005) return;
                void patch(link, side, current.label, clamped);
              }}
              className="h-9 w-[78px] font-mono text-[11px]"
            />
            {busy === link.id ? <Loader2 className="size-3.5 animate-spin text-muted-foreground" /> : null}
          </div>
        );
      })}
    </section>
  );
}
