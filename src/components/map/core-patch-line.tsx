'use client';

import { cn } from '@/lib/utils';
import type { DeviceKind, FibreLink } from '@/lib/types';

/** A core/port of the current device and the device patched to its far end. */
export interface CorePatch {
  link: FibreLink;
  kind: DeviceKind;
  code: string;
  coreLabel: string | null;
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

    link.cores.forEach((core) => {
      const localLabel = fromHere ? core.fromCoreLabel : core.toCoreLabel;
      if (!localLabel || patches.has(localLabel)) return;
      patches.set(localLabel, {
        link,
        kind: fromHere ? link.toKind : link.fromKind,
        code: fromHere ? link.toCode : link.fromCode,
        coreLabel: fromHere ? core.toCoreLabel : core.fromCoreLabel,
      });
    });
  });

  return patches;
}

/** `DEVICE · core → DEVICE · core` line shown under a core or port row. */
export function CorePatchLine({
  localCode,
  localCore,
  patch,
}: {
  localCode: string;
  localCore: string;
  patch: CorePatch;
}) {
  return (
    <div
      className="mt-1.5 flex items-center gap-1.5 border-t border-border/40 pt-1.5 font-mono text-[9.5px]"
      title={`${localCode} ${localCore} → ${patch.code} ${patch.coreLabel ?? 'unpatched'} · fibre ${patch.link.fibreId}`}
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
      <span className="min-w-0 flex-1 truncate">
        <span className="font-semibold">{localCode}</span>
        <span className="text-muted-foreground"> · {localCore}</span>
        <span className="mx-1 text-muted-foreground">→</span>
        <span className="font-semibold">{patch.code}</span>
        <span className="text-muted-foreground"> · {patch.coreLabel ?? 'unpatched'}</span>
      </span>
      {patch.link.status === 'cut' ? (
        <span className="shrink-0 rounded bg-rose-500/15 px-1 py-0.5 text-[8px] font-semibold uppercase text-rose-600 dark:text-rose-300">
          Cut
        </span>
      ) : null}
      <span className="shrink-0 text-[8.5px] text-muted-foreground">{patch.link.fibreId}</span>
    </div>
  );
}
