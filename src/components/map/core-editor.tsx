'use client';

import { Plus, Trash2 } from 'lucide-react';
import type { Core, CoreStatus } from '@/lib/types';
import { cn } from '@/lib/utils';

const PALETTE = [
  '#22d3ee', // Cyan
  '#34d399', // Emerald
  '#a78bfa', // Violet
  '#fbbf24', // Amber
  '#fb7185', // Rose
  '#60a5fa', // Sky
  '#a3e635', // Lime
  '#fb923c', // Orange
  '#f472b6', // Pink
  '#facc15', // Yellow
  '#94a3b8', // Slate
  '#818cf8', // Indigo
];

export function CoreEditor({
  value,
  onChange,
  addLabel = 'Add core',
  emptyLabel = 'No cores added yet',
  showPowerInput = false,
  splitterCoreLabel,
  className,
}: {
  value: Core[];
  onChange: (cores: Core[]) => void;
  addLabel?: string;
  emptyLabel?: string;
  showPowerInput?: boolean;
  splitterCoreLabel?: string;
  className?: string;
}) {
  function update(index: number, patch: Partial<Core>) {
    onChange(value.map((core, position) => (position === index ? { ...core, ...patch } : core)));
  }

  function remove(index: number) {
    onChange(value.filter((_, position) => position !== index));
  }

  function toggleStatus(index: number, current?: CoreStatus) {
    // Default is 'free'. Cycle: free -> in_use -> damaged -> free
    const cur = current ?? 'free';
    const next: CoreStatus =
      cur === 'free' ? 'in_use' : cur === 'in_use' ? 'damaged' : 'free';
    update(index, { status: next });
  }

  function add() {
    const next = value.length + 1;
    onChange([
      ...value,
      {
        label: `Core ${String(next).padStart(2, '0')}`,
        color: PALETTE[(next - 1) % PALETTE.length],
        count: 1,
        status: 'free', // By default all cores are free
      },
    ]);
  }

  const total = value.length;
  const freeCount = value.filter((c) => (c.status ?? 'free') === 'free').length;
  const inUseCount = value.filter((c) => c.status === 'in_use').length;
  const cutCount = value.filter((c) => c.status === 'damaged').length;

  return (
    <div className={cn('space-y-2', className)}>
      {value.length > 0 ? (
        <div className="flex items-center justify-between text-[10.5px] text-muted-foreground px-0.5">
          <span>
            {total} {total === 1 ? 'core' : 'cores'}
          </span>
          <span className="flex items-center gap-2">
            <span className="text-emerald-600 dark:text-emerald-400 font-medium">
              {freeCount} Free
            </span>
            <span>·</span>
            <span className="text-sky-600 dark:text-sky-400 font-medium">
              {inUseCount} In Use
            </span>
            {cutCount > 0 ? (
              <>
                <span>·</span>
                <span className="text-rose-600 dark:text-rose-400 font-medium">
                  {cutCount} Cut
                </span>
              </>
            ) : null}
          </span>
        </div>
      ) : null}

      {value.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-3 py-4 text-center text-[11px] text-muted-foreground">
          {emptyLabel}
        </p>
      ) : null}

      {value.map((core, index) => {
        const status = core.status ?? 'free'; // default to free
        const isFree = status === 'free';
        const isDamaged = status === 'damaged';

        return (
          <div
            key={index}
            className={cn(
              'anim-rise flex items-center gap-2 rounded-xl border p-2 shadow-sm transition-colors',
              isFree
                ? 'border-emerald-500/30 bg-emerald-500/[0.04] dark:border-emerald-500/20 dark:bg-emerald-500/[0.03]'
                : isDamaged
                  ? 'border-rose-500/30 bg-rose-500/[0.04] dark:border-rose-500/20 dark:bg-rose-500/[0.03]'
                  : 'border-white/60 bg-white/50 dark:border-white/10 dark:bg-white/[0.03]',
            )}
          >
            <label
              className="relative size-8 shrink-0 cursor-pointer rounded-lg border border-white/70 shadow-inner transition hover:scale-105 dark:border-white/20"
              style={{ backgroundColor: core.color }}
              title="Core colour code"
            >
              <input
                type="color"
                value={core.color}
                onChange={(event) => update(index, { color: event.target.value })}
                className="absolute inset-0 size-full cursor-pointer opacity-0"
                aria-label={`Colour for ${core.label || `core ${index + 1}`}`}
              />
            </label>

            <input
              value={core.label}
              onChange={(event) => update(index, { label: event.target.value })}
              placeholder="Core label"
              aria-label="Core label"
              className="h-8 min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 text-[12px] font-medium outline-none transition focus:border-primary/30 focus:bg-white/70 dark:focus:bg-white/[0.06]"
            />

            {splitterCoreLabel && core.label === splitterCoreLabel ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-violet-500/15 border border-violet-500/30 px-1.5 py-0.5 text-[9.5px] font-semibold text-violet-600 dark:text-violet-300 shrink-0">
                ⚡ Splitter Feed
              </span>
            ) : null}

            {/* Status toggle pill button */}
            <button
              type="button"
              onClick={() => toggleStatus(index, status)}
              title="Click to toggle status: Free (Default), In Use, or Cut"
              className={cn(
                'inline-flex h-7 items-center gap-1 rounded-lg px-2 text-[10.5px] font-semibold transition active:scale-95 shrink-0',
                isFree
                  ? 'border border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/25'
                  : isDamaged
                    ? 'border border-rose-500/40 bg-rose-500/15 text-rose-700 dark:text-rose-300 hover:bg-rose-500/25'
                    : 'border border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300 hover:bg-sky-500/20',
              )}
            >
              <span
                className={cn(
                  'size-1.5 rounded-full',
                  isFree ? 'bg-emerald-500' : isDamaged ? 'bg-rose-500' : 'bg-sky-500',
                )}
              />
              {isFree ? 'Free' : isDamaged ? 'Cut' : 'In Use'}
            </button>

            {/* Per-core optical power input */}
            {showPowerInput ? (
              <div
                className={cn(
                  'flex shrink-0 items-center gap-1 rounded-lg border px-1.5 py-0.5 transition-colors',
                  splitterCoreLabel && core.label === splitterCoreLabel
                    ? 'border-violet-500/50 bg-violet-500/10'
                    : 'border-white/60 bg-white/70 dark:border-white/10 dark:bg-white/[0.05]',
                )}
                title={
                  splitterCoreLabel && core.label === splitterCoreLabel
                    ? 'Splitter feed power. Output branch powers are automatically computed from this dBm.'
                    : 'Input optical power (dBm) for this core'
                }
              >
                <input
                  type="number"
                  step="0.1"
                  placeholder="+3.0"
                  aria-label={`Optical power (dBm) for ${core.label}`}
                  value={core.powerDbm !== null && core.powerDbm !== undefined ? core.powerDbm : ''}
                  onChange={(e) => {
                    const val = e.target.value === '' ? null : Number(e.target.value);
                    update(index, { powerDbm: val });
                  }}
                  className="w-12 bg-transparent font-mono text-[11px] font-semibold outline-none"
                />
                <span className="text-[9px] font-medium text-muted-foreground">dBm</span>
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => remove(index)}
              className="grid size-7 shrink-0 place-items-center rounded-lg text-muted-foreground/70 transition hover:bg-destructive/10 hover:text-destructive active:scale-90"
              aria-label="Remove core"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        );
      })}

      <button
        type="button"
        onClick={add}
        className="flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border text-[11px] font-medium text-muted-foreground transition hover:border-primary/40 hover:text-primary"
      >
        <Plus className="size-3.5" />
        {addLabel}
      </button>
    </div>
  );
}
