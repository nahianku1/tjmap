import { cn } from '@/lib/utils';

export function BrandMark({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'relative grid shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-teal-300 via-cyan-400 to-violet-500 shadow-[0_10px_30px_-10px_rgba(45,212,191,0.85)]',
        className,
      )}
    >
      <div className="absolute inset-[1px] rounded-[inherit] bg-gradient-to-br from-white/40 to-transparent opacity-70" />
      <svg viewBox="0 0 24 24" className="relative size-[62%] text-slate-950" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
        <circle cx="5.4" cy="6.2" r="2" />
        <circle cx="18.6" cy="6.2" r="2" />
        <circle cx="12" cy="18" r="2.2" />
        <path d="M7.4 6.2h9.2M6.4 8.1l4.4 7.9M17.6 8.1l-4.4 7.9" />
      </svg>
    </div>
  );
}

export function Brand({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <BrandMark className={compact ? 'size-9' : 'size-11'} />
      <div className="leading-none">
        <p
          className={cn(
            'font-display font-semibold tracking-tight text-foreground',
            compact ? 'text-sm' : 'text-[17px]',
          )}
        >
          Fibre Atlas
        </p>
        <p className="mt-1.5 text-[9px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
          FTTH Network Ops
        </p>
      </div>
    </div>
  );
}
