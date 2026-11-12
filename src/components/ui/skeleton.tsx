import { cn } from '@/lib/utils';

function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn('relative overflow-hidden rounded-xl bg-muted/70', className)}
      {...props}
    >
      <div className="shimmer absolute inset-0" />
    </div>
  );
}

export { Skeleton };
