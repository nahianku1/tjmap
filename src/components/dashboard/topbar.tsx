'use client';

import Link from 'next/link';
import {
  ChevronLeft,
  Download,
  PanelLeftClose,
  PanelLeftOpen,
  Radio,
  Scissors,
  Upload,
  Waypoints,
} from 'lucide-react';
import { Brand, BrandMark } from '@/components/brand';
import { ThemeToggle } from '@/components/theme-toggle';
import { UserMenu } from './user-menu';
import { cn } from '@/lib/utils';

interface TopbarProps {
  tjCount: number;
  linkCount: number;
  cutCount: number;
  /** Shown instead of “National FTTH map”, e.g. “Dhaka · Gulshan–Banani”. */
  contextLabel?: string;
  back?: { href: string; label: string };
  sidebarOpen?: boolean;
  onToggleSidebar?: () => void;
  /** Downloads the current map as a JSON snapshot. */
  onExportMap?: () => void;
  /** Opens the import dialog; omitted for viewers. */
  onImportMap?: () => void;
}

export function Topbar({
  tjCount,
  linkCount,
  cutCount,
  contextLabel,
  back,
  sidebarOpen = true,
  onToggleSidebar,
  onExportMap,
  onImportMap,
}: TopbarProps) {
  return (
    <header className="relative z-20 flex h-[58px] shrink-0 items-center gap-2 border-b border-white/40 px-3 sm:h-16 sm:gap-3 sm:px-4 dark:border-white/[0.06]">
      {back ? (
        <Link
          href={back.href}
          className="inline-flex h-9 shrink-0 items-center gap-1 rounded-xl border border-white/60 bg-white/50 px-2 text-[11px] font-medium text-muted-foreground shadow-sm transition hover:text-foreground dark:border-white/10 dark:bg-white/[0.05]"
          aria-label={`Back to ${back.label}`}
        >
          <ChevronLeft className="size-4" />
          <span className="hidden max-w-[120px] truncate xl:inline">{back.label}</span>
        </Link>
      ) : null}

      {/* Inventory toggle: opens the drawer on phones, collapses the rail on desktop */}
      {onToggleSidebar ? (
        <>
          <button
            type="button"
            onClick={onToggleSidebar}
            className="grid size-9 shrink-0 place-items-center rounded-xl border border-white/60 bg-white/50 text-muted-foreground shadow-sm transition hover:border-primary/40 hover:bg-white/80 hover:text-foreground active:scale-95 lg:hidden dark:border-white/10 dark:bg-white/[0.05] dark:hover:bg-white/[0.1]"
            title="Open network inventory"
            aria-label="Open network inventory"
          >
            <PanelLeftOpen className="size-4 text-primary" />
          </button>
          <button
            type="button"
            onClick={onToggleSidebar}
            className="hidden size-9 shrink-0 place-items-center rounded-xl border border-white/60 bg-white/50 text-muted-foreground shadow-sm transition hover:border-primary/40 hover:bg-white/80 hover:text-foreground active:scale-95 lg:grid dark:border-white/10 dark:bg-white/[0.05] dark:hover:bg-white/[0.1]"
            title={sidebarOpen ? 'Collapse sidebar (Ctrl+B)' : 'Open sidebar (Ctrl+B)'}
            aria-label={sidebarOpen ? 'Collapse sidebar' : 'Open sidebar'}
          >
            {sidebarOpen ? (
              <PanelLeftClose className="size-4 text-primary" />
            ) : (
              <PanelLeftOpen className="size-4 text-muted-foreground" />
            )}
          </button>
        </>
      ) : null}

      <div className="hidden sm:block">
        <Brand compact />
      </div>
      <div className="sm:hidden">
        <BrandMark className="size-8" />
      </div>

      <div className="mx-1 hidden h-7 w-px bg-border/70 lg:block" />

      <div className="min-w-0 sm:hidden">
        <p className="truncate text-[11px] font-semibold leading-tight">
          {contextLabel ?? 'National map'}
        </p>
        <p className="text-[8px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          FTTH ops
        </p>
      </div>

      <div className="hidden min-w-0 items-center gap-2 lg:flex">
        <span className="inline-flex max-w-[280px] items-center gap-1.5 truncate rounded-full border border-white/60 bg-white/50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground dark:border-white/10 dark:bg-white/[0.04]">
          <Waypoints className="size-3 shrink-0 text-primary" />
          <span className="truncate">{contextLabel ?? 'National FTTH map'}</span>
        </span>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-600 dark:text-emerald-300">
          <span className="relative flex size-1.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-70" />
            <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
          </span>
          PostGIS live
        </span>
      </div>

      <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
        <div className="hidden items-center gap-2.5 rounded-xl border border-white/60 bg-white/50 px-3 py-1.5 text-[9.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground shadow-sm md:flex dark:border-white/10 dark:bg-white/[0.04]">
          <span className="inline-flex items-center gap-1 text-foreground/85">
            <Waypoints className="size-3 text-teal-500" />
            {tjCount}
          </span>
          <span className="h-3 w-px bg-border" />
          <span className="inline-flex items-center gap-1 text-foreground/85">
            <Radio className="size-3 text-sky-500" />
            {linkCount}
          </span>
          <span className="h-3 w-px bg-border" />
          <span className={cn('inline-flex items-center gap-1', cutCount > 0 ? 'text-rose-500' : 'text-foreground/85')}>
            <Scissors className="size-3" />
            {cutCount}
          </span>
        </div>

        {onExportMap ? (
          <button
            type="button"
            onClick={onExportMap}
            title="Export map as JSON"
            aria-label="Export map"
            className="grid size-9 shrink-0 place-items-center rounded-xl border border-white/60 bg-white/50 text-muted-foreground shadow-sm transition hover:border-primary/40 hover:bg-white/80 hover:text-foreground active:scale-95 dark:border-white/10 dark:bg-white/[0.05] dark:hover:bg-white/[0.1]"
          >
            <Download className="size-4" />
          </button>
        ) : null}
        {onImportMap ? (
          <button
            type="button"
            onClick={onImportMap}
            title="Import a map snapshot"
            aria-label="Import map"
            className="grid size-9 shrink-0 place-items-center rounded-xl border border-white/60 bg-white/50 text-muted-foreground shadow-sm transition hover:border-violet-400/50 hover:bg-white/80 hover:text-foreground active:scale-95 dark:border-white/10 dark:bg-white/[0.05] dark:hover:bg-white/[0.1]"
          >
            <Upload className="size-4" />
          </button>
        ) : null}

        <ThemeToggle />
        <UserMenu />
      </div>
    </header>
  );
}
