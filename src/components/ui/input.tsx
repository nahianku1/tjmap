import * as React from 'react';
import { cn } from '@/lib/utils';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'flex h-11 w-full min-w-0 rounded-xl border border-input bg-white/60 px-3.5 py-2 text-sm text-foreground shadow-sm transition-all duration-200 outline-none',
        'placeholder:text-muted-foreground/70',
        'focus-visible:border-primary/50 focus-visible:bg-white/85 focus-visible:ring-4 focus-visible:ring-primary/10',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'dark:bg-white/[0.04] dark:focus-visible:bg-white/[0.06]',
        'file:border-0 file:bg-transparent file:text-sm file:font-medium',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
