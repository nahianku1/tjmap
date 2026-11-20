'use client';

import { cn } from '@/lib/utils';
import type { DeviceKind, FibreLink } from '@/lib/types';
import { displayCoreLabel, tiaCoreLabel } from '@/lib/fibre-cores';
import { CoreDot } from './core-dot';

/** A core/port of the current device and the device patched to its far end. */
export interface CorePatch {
  link: FibreLink;
  kind: DeviceKind;
  code: string;
  coreLabel: string | null;
  /** 1-based position of this strand on the cable, used for its tube/core info. */
  coreIndex: number;
  /** Colour of this end's core, from the link's colour code. */
  color: string | null;
  /** Colour of the far end's core. */
  farColor: string | null;
}

/**
 * Map each core (or OLT port) of one device to the link that uses it and the
 * device at the other end of that link. Local core labels come from the link's
 * per-core mapping, so only cores that an actual link maps can be resolved.
 */
export function linkPatches(
  links: FibreLink[],
  endpoint: { kind: DeviceKind; id: string },
): Map<string, CorePatch> {
  const patches = new Map<string, CorePatch>();

  links.forEach((link) => {
    const fromHere =
      endpoint.kind === 'tj'
        ? link.fromTjId === endpoint.id
        : endpoint.kind === 'olt'
          ? link.fromOltId === endpoint.id
          : link.fromOnuId === endpoint.id;
    const toHere =
      endpoint.kind === 'tj'
        ? link.toTjId === endpoint.id
        : endpoint.kind === 'olt'
          ? link.toOltId === endpoint.id
          : link.toOnuId === endpoint.id;
    if (!fromHere && !toHere) return;

    link.cores.forEach((core, position) => {
      const localLabel = fromHere ? core.fromCoreLabel : core.toCoreLabel;
      if (!localLabel || patches.has(localLabel)) return;
      const farLabel = fromHere ? core.toCoreLabel : core.fromCoreLabel;
      patches.set(localLabel, {
        link,
        kind: fromHere ? link.toKind : link.fromKind,
        code: fromHere ? link.toCode : link.fromCode,
        coreLabel: farLabel,
        coreIndex: Number(core.index) || position + 1,
        color: core.color ?? null,
        farColor:
          (farLabel
            ? link.cores.find((item) => item.label === farLabel)?.color
            : null) ?? null,
      });
    });
  });

  return patches;
}

/** `DEVICE · core → DEVICE · core` line shown under a core or port row. */
export function CorePatchLine({
  localCode,
  localCore,
  localName,
  patch,
}: {
  localCode: string;
  localCore: string;
  /** Display name when the local port is positional (splitter feed: S1, S2 …). */
  localName?: string;
  patch: CorePatch;
}) {
  const strandName = tiaCoreLabel(patch.coreIndex);
  const localDisplay = localName ?? displayCoreLabel(localCore);
  return (
    <div
      className="mt-1.5 flex flex-wrap items-center gap-1.5 border-t border-border/40 pt-1.5 font-mono text-[9.5px]"
      title={`${localCode} ${localDisplay} → ${patch.code} ${patch.coreLabel ? displayCoreLabel(patch.coreLabel) : 'unpatched'} · cable strand ${strandName} · fibre ${patch.link.fibreId}`}
    >
      <span
        className={cn(
          'shrink-0 rounded px-1 py-0.5 text-[8px] font-semibold uppercase tracking-wide',
          patch.kind === 'olt'
            ? 'bg-sky-500/15 text-sky-700 dark:text-sky-300'
            : patch.kind === 'onu'
              ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
              : 'bg-teal-500/15 text-teal-700 dark:text-teal-300',
        )}
      >
        {patch.kind === 'olt' ? 'OLT' : patch.kind === 'onu' ? 'ONU' : 'TJ'}
      </span>
      <span className="flex min-w-0 flex-1 items-center gap-1 truncate">
        <span className="font-semibold">{localCode}</span>
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          · {localName ? null : <CoreDot color={patch.color} className="size-2" />} {localDisplay}
        </span>
        <span className="mx-0.5 text-muted-foreground">→</span>
        <span className="font-semibold">{patch.code}</span>
        <span className="inline-flex min-w-0 items-center gap-1 text-muted-foreground">
          ·{' '}
          {patch.coreLabel ? (
            <>
              <CoreDot color={patch.farColor} className="size-2" />
              <span className="truncate">{displayCoreLabel(patch.coreLabel)}</span>
            </>
          ) : (
            <span className="truncate">unpatched</span>
          )}
        </span>
      </span>
      {patch.link.status === 'cut' ? (
        <span className="shrink-0 rounded bg-rose-500/15 px-1 py-0.5 text-[8px] font-semibold uppercase text-rose-600 dark:text-rose-300">
          Cut
        </span>
      ) : null}
      <span className="shrink-0 text-[8.5px] text-muted-foreground">{patch.link.fibreId}</span>
      <span
        className="inline-flex shrink-0 items-center gap-1 rounded bg-muted/70 px-1 py-0.5 text-[8.5px] font-semibold text-foreground/80"
        title={`Cable strand ${strandName}`}
      >
        <CoreDot color={patch.color} className="size-2" />
        {strandName}
      </span>
    </div>
  );
}
