'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Link2, MapPin, MousePointerClick, Scissors, Server, Spline, User, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { FibreLink, Tj } from '@/lib/types';
import { totalCores } from '@/lib/utils';
import type { MapMode } from '@/components/map/network-map';

interface MapOverlayProps {
  mode: MapMode;
  tjs: Tj[];
  links: FibreLink[];
  onCancelMode: () => void;
}

export function MapOverlay({ mode, tjs, links, onCancelMode }: MapOverlayProps) {
  const cuts = tjs.filter((tj) => tj.isCut).length;
  const cores = tjs.reduce((sum, tj) => sum + totalCores(tj), 0);
  const cutSpans = links.filter((link) => link.status === 'cut').length;

  return (
    <>
      <AnimatePresence>
        {mode !== 'idle' && mode !== 'connect' && mode !== 'route' && mode !== 'select' ? (
          <motion.div
            key={mode}
            initial={{ opacity: 0, y: -14, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            className="pointer-events-auto absolute left-1/2 top-4 z-10 w-[calc(100%-2rem)] max-w-md -translate-x-1/2"
          >
            <div className="glass flex items-center gap-3 rounded-2xl px-3 py-2.5">
              <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
                {mode === 'add-olt' ? (
                  <Server className="size-4" />
                ) : mode === 'add-cut-tj' ? (
                  <Scissors className="size-4" />
                ) : mode === 'add-onu' ? (
                  <User className="size-4" />
                ) : (
                  <MapPin className="size-4" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-semibold leading-tight">
                  {mode === 'add-olt'
                    ? 'Place a new OLT cabinet'
                    : mode === 'add-cut-tj'
                      ? 'Place a new fibre cut joint'
                      : mode === 'add-onu'
                        ? 'Place a new ONU'
                        : 'Place a new normal terminal joint'}
                </p>
                <p className="mt-0.5 text-[10.5px] leading-snug text-muted-foreground">
                  {mode === 'add-olt'
                    ? 'Click where the cabinet sits, then add its PON and uplink ports. Esc to cancel.'
                    : mode === 'add-cut-tj'
                      ? 'Click where the fibre cut is located. Press Esc to cancel.'
                      : mode === 'add-onu'
                        ? 'Click the map where the ONU is located. Press Esc to cancel.'
                        : 'Click anywhere inside Bangladesh. Press Esc to cancel.'}
                </p>
              </div>
              <Button variant="ghost" size="icon-sm" onClick={onCancelMode} aria-label="Cancel mode">
                <X className="size-4" />
              </Button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className="pointer-events-auto absolute bottom-3 left-3 z-10 hidden sm:block">
        <div className="glass w-[268px] overflow-hidden rounded-2xl">
          <div className="flex items-center justify-between px-3 pb-2 pt-2.5">
            <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Network pulse
            </p>
            <span className="inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-[0.1em] text-emerald-600 dark:text-emerald-400">
              <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
              live
            </span>
          </div>

          <div className="grid grid-cols-4 divide-x divide-border/60 border-y border-border/60">
            <Stat label="Joints" value={tjs.length} tone="text-primary" />
            <Stat label="Links" value={links.length} tone="text-sky-500" />
            <Stat label="Cores" value={cores} tone="text-violet-500" />
            <Stat label="Cuts" value={cuts + cutSpans} tone={cuts + cutSpans > 0 ? 'text-rose-500' : 'text-foreground'} />
          </div>

          <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 px-3 py-2.5 text-[9.5px] text-muted-foreground">
            <Legend color="#000000" label="Active link" />
            <Legend color="#fb7185" label="Cut link" dashed />
            <Legend color="#22d3ee" label="Joint" dot />
            <Legend color="#a78bfa" label="Splitter" dot />
            <Legend color="#0ea5e9" label="OLT cabinet" dot />
            <Legend color="#f59e0b" label="ONU" dot />
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-4 left-1/2 z-10 hidden -translate-x-1/2 items-center gap-1.5 rounded-full border border-white/60 bg-white/60 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground backdrop-blur sm:flex dark:border-white/10 dark:bg-slate-950/60">
        <MousePointerClick className="size-3" />
        Click a joint, OLT, ONU or link to inspect
      </div>

      <div className="pointer-events-none absolute right-4 top-4 z-[5] hidden items-center gap-1.5 lg:flex">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/60 bg-white/60 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground backdrop-blur dark:border-white/10 dark:bg-slate-950/60">
          <Spline className="size-3 text-primary" />
          Bangladesh · 8 divisions
        </span>
        {cuts > 0 ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-400/30 bg-rose-500/10 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-rose-500 backdrop-blur">
            <Scissors className="size-3" />
            {cuts} cut joint{cuts === 1 ? '' : 's'}
          </span>
        ) : null}
      </div>
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="px-1.5 py-2 text-center">
      <p className={`font-display text-[15px] font-semibold leading-none tracking-tight ${tone}`}>{value}</p>
      <p className="mt-1 text-[8px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{label}</p>
    </div>
  );
}

function Legend({ color, label, dashed, dot }: { color: string; label: string; dashed?: boolean; dot?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {dot ? (
        <span className="size-2 rounded-full" style={{ backgroundColor: color }} />
      ) : (
        <span
          className="h-[2px] w-4 rounded-full"
          style={{
            backgroundImage: dashed
              ? `repeating-linear-gradient(90deg, ${color} 0 3px, transparent 3px 6px)`
              : undefined,
            backgroundColor: dashed ? undefined : color,
          }}
        />
      )}
      {label}
    </span>
  );
}
