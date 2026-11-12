import * as React from 'react';
import { cn } from '@/lib/utils';

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'flex min-h-[84px] w-full rounded-xl border border-input bg-white/60 px-3.5 py-2.5 text-sm shadow-sm transition-all outline-none',
        'placeholder:text-muted-foreground/70',
        'focus-visible:border-primary/50 focus-visible:bg-white/85 focus-visible:ring-4 focus-visible:ring-primary/10',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'dark:bg-white/[0.04] dark:focus-visible:bg-white/[0.06]',
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
