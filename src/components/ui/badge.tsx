import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] whitespace-nowrap',
  {
    variants: {
      variant: {
        default: 'border-primary/25 bg-primary/10 text-primary',
        outline: 'border-border bg-transparent text-muted-foreground',
        active: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-600 dark:text-emerald-300',
        cut: 'border-rose-400/35 bg-rose-500/10 text-rose-600 dark:text-rose-300',
        splitter: 'border-violet-400/30 bg-violet-400/10 text-violet-600 dark:text-violet-300',
        roleAdmin: 'border-amber-400/35 bg-amber-400/10 text-amber-700 dark:text-amber-300',
        roleUser: 'border-sky-400/30 bg-sky-400/10 text-sky-700 dark:text-sky-300',
        muted: 'border-white/50 bg-white/60 text-muted-foreground dark:border-white/10 dark:bg-white/5',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

function Badge({ className, variant, ...props }: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
