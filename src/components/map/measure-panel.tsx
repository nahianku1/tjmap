'use client';

import { Pentagon, Ruler, Trash2, Undo2, X } from 'lucide-react';
import { formatDistance } from '@/lib/utils';

export type MeasureKind = 'distance' | 'area';
export type MeasureMode = 'none' | MeasureKind;

export function formatArea(m2: number): string {
  if (!Number.isFinite(m2) || m2 <= 0) return '0 m²';
  if (m2 >= 1_000_000) return `${(m2 / 1_000_000).toFixed(2)} km²`;
  if (m2 >= 10_000) return `${(m2 / 10_000).toFixed(2)} ha`;
  return `${Math.round(m2)} m²`;
}

interface MeasurePanelProps {
  mode: MeasureMode;
  kind: MeasureKind | null;
  points: number;
  distanceM: number;
  areaM2: number;
  perimeterM: number;
  onStart: (kind: MeasureKind) => void;
  onUndo: () => void;
  onClear: () => void;
}

const TOOL_BUTTON =
  'inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[11px] font-medium text-foreground transition hover:bg-foreground/10';

const ICON_BUTTON =
  'inline-flex size-7 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-foreground/10 hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent';

export function MeasurePanel({
  mode,
  kind,
  points,
  distanceM,
  areaM2,
  perimeterM,
  onStart,
  onUndo,
  onClear,
}: MeasurePanelProps) {
  // Sits above the Network pulse card on wider screens, where that card is visible.
  const shell =
    'pointer-events-auto absolute bottom-3 left-3 z-20 rounded-2xl border border-white/60 bg-white/95 shadow-[0_18px_40px_-24px_rgba(15,23,42,0.6)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/90 sm:bottom-[10.75rem]';

  if (mode === 'none') {
    if (points === 0) {
      return (
        <div className={`${shell} flex items-center gap-0.5 p-1`}>
          <button type="button" className={TOOL_BUTTON} onClick={() => onStart('distance')}>
            <Ruler className="size-3.5 text-primary" />
            Distance
          </button>
          <button type="button" className={TOOL_BUTTON} onClick={() => onStart('area')}>
            <Pentagon className="size-3.5 text-primary" />
            Area
          </button>
        </div>
      );
    }

    return (
      <div className={`${shell} flex items-center gap-2 p-2 pl-3`}>
        <div className="min-w-0">
          <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {kind === 'area' ? 'Measured area' : 'Measured distance'}
          </p>
          <p className="font-mono text-[13px] font-semibold">
            {kind === 'area' ? formatArea(areaM2) : formatDistance(distanceM)}
          </p>
          {kind === 'area' ? (
            <p className="text-[10px] text-muted-foreground">
              Perimeter {formatDistance(perimeterM)} · {points} points
            </p>
          ) : (
            <p className="text-[10px] text-muted-foreground">{points} points</p>
          )}
        </div>
        <button type="button" className={ICON_BUTTON} onClick={onClear} aria-label="Clear measurement">
          <X className="size-4" />
        </button>
      </div>
    );
  }

  const active = mode === 'area';
  return (
    <div className={`${shell} w-[min(300px,calc(100vw-1.5rem))] p-3`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">
            {active ? <Pentagon className="size-3.5" /> : <Ruler className="size-3.5" />}
            Measure {active ? 'area' : 'distance'}
          </p>
          <p className="mt-1 font-mono text-[18px] font-semibold leading-none">
            {active ? formatArea(areaM2) : formatDistance(distanceM)}
          </p>
          {active ? (
            <p className="mt-1 text-[10px] text-muted-foreground">
              Perimeter {formatDistance(perimeterM)}
            </p>
          ) : null}
        </div>
        <button type="button" className={ICON_BUTTON} onClick={onClear} aria-label="Close measurement">
          <X className="size-4" />
        </button>
      </div>

      <p className="mt-2 rounded-lg bg-foreground/[0.04] px-2 py-1.5 text-[10px] leading-relaxed text-muted-foreground">
        Click the map to add points{active ? '; the area closes automatically' : ''}. Double-click to
        finish.
      </p>

      <div className="mt-2 flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground">
          {points} point{points === 1 ? '' : 's'}
          {!active && points > 1 ? ` · ${points - 1} segment${points - 1 === 1 ? '' : 's'}` : ''}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className={ICON_BUTTON}
            onClick={onUndo}
            disabled={points === 0}
            aria-label="Undo last point"
            title="Undo last point"
          >
            <Undo2 className="size-4" />
          </button>
          <button
            type="button"
            className={ICON_BUTTON}
            onClick={onClear}
            disabled={points === 0}
            aria-label="Clear measurement"
            title="Clear measurement"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
