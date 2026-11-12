'use client';

import { Check, Minus } from 'lucide-react';
import { assessPassword } from '@/lib/password';
import { cn } from '@/lib/utils';

const SEGMENT_COLORS = [
  'bg-rose-500',
  'bg-orange-500',
  'bg-amber-400',
  'bg-lime-400',
  'bg-emerald-400',
];

export function PasswordMeter({ password }: { password: string }) {
  const assessment = assessPassword(password);
  const active = password.length > 0;

  return (
    <div className="space-y-3 rounded-xl border border-white/50 bg-white/40 p-3 dark:border-white/10 dark:bg-white/[0.03]">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Password strength
        </span>
        <span
          className={cn(
            'text-[11px] font-semibold transition-colors',
            !active && 'text-muted-foreground',
            active && assessment.score <= 1 && 'text-rose-500',
            active && assessment.score === 2 && 'text-amber-500',
            active && assessment.score === 3 && 'text-lime-500',
            active && assessment.score === 4 && 'text-emerald-500',
          )}
        >
          {active ? assessment.label : 'Not set'}
        </span>
      </div>

      <div className="flex gap-1.5">
        {[0, 1, 2, 3].map((index) => (
          <div
            key={index}
            className={cn(
              'h-1.5 flex-1 rounded-full transition-all duration-500',
              active && index <= assessment.score ? SEGMENT_COLORS[assessment.score] : 'strength-track',
            )}
          />
        ))}
      </div>

      <div className="grid grid-cols-2 gap-1.5 pt-0.5">
        <Criterion met={assessment.checks.length} text="8+ characters" />
        <Criterion met={assessment.checks.cases} text="Upper & lower" />
        <Criterion met={assessment.checks.number} text="A number" />
        <Criterion met={assessment.checks.symbol} text="A symbol" />
      </div>
    </div>
  );
}

function Criterion({ met, text }: { met: boolean; text: string }) {
  return (
    <div
      className={cn(
        'flex items-center gap-1.5 text-[11px] transition-colors',
        met ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground/70',
      )}
    >
      <span
        className={cn(
          'grid size-3.5 place-items-center rounded-full transition-all',
          met ? 'bg-emerald-500/15 text-emerald-500' : 'bg-muted-foreground/10 text-muted-foreground/60',
        )}
      >
        {met ? <Check className="size-2.5" strokeWidth={3} /> : <Minus className="size-2.5" strokeWidth={3} />}
      </span>
      {text}
    </div>
  );
}
