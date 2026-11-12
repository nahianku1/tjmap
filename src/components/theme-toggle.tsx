'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const isDark = mounted ? resolvedTheme === 'dark' : true;

  return (
    <button
      type="button"
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className={cn(
        'group relative grid size-9 place-items-center overflow-hidden rounded-xl border border-white/60 bg-white/55 text-muted-foreground shadow-sm backdrop-blur transition-all hover:text-foreground hover:shadow-md active:scale-95 dark:border-white/10 dark:bg-white/[0.05] dark:hover:bg-white/[0.09]',
        className,
      )}
    >
      <Sun
        className={cn(
          'absolute size-4 transition-all duration-500',
          isDark ? 'translate-y-8 rotate-90 opacity-0' : 'translate-y-0 rotate-0 opacity-100',
        )}
      />
      <Moon
        className={cn(
          'absolute size-4 transition-all duration-500',
          isDark ? 'translate-y-0 rotate-0 opacity-100' : '-translate-y-8 -rotate-90 opacity-0',
        )}
      />
    </button>
  );
}
