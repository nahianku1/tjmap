'use client';

import { cn } from '@/lib/utils';

/** Colour swatch matching the fibre colour code of a core. */
export function CoreDot({
  color,
  className,
}: {
  color?: string | null;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-block size-2.5 shrink-0 rounded-full border border-white/70 shadow-[0_0_8px] dark:border-slate-900',
        !color && 'border-dashed border-muted-foreground/50 bg-transparent shadow-none',
        className,
      )}
      style={color ? { backgroundColor: color, color } : undefined}
    />
  );
}
