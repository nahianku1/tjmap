import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-0 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.985] [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=size-])]:size-4',
  {
    variants: {
      variant: {
        default:
          'bg-gradient-to-br from-teal-400 via-teal-500 to-cyan-600 text-slate-950 shadow-[0_12px_30px_-14px_rgba(20,184,166,0.9)] hover:brightness-[1.06] hover:shadow-[0_18px_40px_-16px_rgba(20,184,166,0.95)]',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-accent',
        outline:
          'border border-border bg-transparent text-foreground hover:border-primary/40 hover:bg-accent/50',
        ghost: 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
        destructive:
          'bg-destructive/90 text-destructive-foreground shadow-[0_12px_30px_-16px_rgba(244,63,94,0.9)] hover:bg-destructive',
        subtle:
          'border border-white/60 bg-white/55 text-foreground shadow-sm backdrop-blur hover:bg-white/75 dark:border-white/10 dark:bg-white/[0.05] dark:hover:bg-white/[0.09]',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4',
        sm: 'h-8 rounded-lg px-3 text-xs',
        lg: 'h-11 rounded-xl px-6',
        icon: 'size-9 rounded-xl',
        'icon-sm': 'size-8 rounded-lg',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'button';
  return <Comp className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

export { Button, buttonVariants };
