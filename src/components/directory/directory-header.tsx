'use client';

import Link from 'next/link';
import { Map as MapIcon } from 'lucide-react';
import { Brand } from '@/components/brand';
import { ThemeToggle } from '@/components/theme-toggle';
import { UserMenu } from '@/components/dashboard/user-menu';
import { Button } from '@/components/ui/button';

export function DirectoryHeader({ mapHref = '/map' }: { mapHref?: string }) {
  return (
    <header className="flex items-center gap-3">
      <Link href="/" className="transition hover:opacity-80">
        <Brand compact />
      </Link>

      <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
        <Button asChild variant="subtle" size="sm" className="h-9 rounded-xl px-2 sm:px-3">
          <Link href={mapHref} aria-label="Open the national FTTH map">
            <MapIcon className="size-3.5 text-primary" />
            <span className="hidden sm:inline">National map</span>
          </Link>
        </Button>
        <ThemeToggle />
        <UserMenu />
      </div>
    </header>
  );
}
