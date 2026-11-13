'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Cable, Link2, Plus, Scissors, Server, User, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MapMode } from '@/components/map/network-map';

interface MapFabProps {
  isAdmin: boolean;
  mode: MapMode;
  onAddSplitterTj: () => void;
  onAddCutTj: () => void;
  onAddOlt: () => void;
  onAddLink: () => void;
  onAddOnu: () => void;
}

type Action = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  active?: boolean;
  iconClass: string;
  btnClass: string;
  ringClass: string;
};

export function MapFab({
  isAdmin,
  mode,
  onAddSplitterTj,
  onAddCutTj,
  onAddOlt,
  onAddLink,
  onAddOnu,
}: MapFabProps) {
  const [open, setOpen] = useState(false);

  if (!isAdmin) return null;

  const actions: Action[] = [
    {
      id: 'splitter-tj',
      label: 'Splitter TJ',
      icon: Cable,
      onClick: onAddSplitterTj,
      active: mode === 'add-tj',
      iconClass: 'text-teal-700 dark:text-teal-200',
      btnClass:
        'bg-gradient-to-br from-teal-400/90 to-emerald-500/90 text-white shadow-[0_10px_24px_-10px_rgba(20,184,166,0.9)]',
      ringClass: 'ring-teal-400/40',
    },
    {
      id: 'cut-tj',
      label: 'Fibre Cut TJ',
      icon: Scissors,
      onClick: onAddCutTj,
      active: mode === 'add-cut-tj',
      iconClass: 'text-rose-700 dark:text-rose-200',
      btnClass:
        'bg-gradient-to-br from-rose-400/90 to-orange-500/90 text-white shadow-[0_10px_24px_-10px_rgba(244,63,94,0.9)]',
      ringClass: 'ring-rose-400/40',
    },
    {
      id: 'olt',
      label: 'OLT',
      icon: Server,
      onClick: onAddOlt,
      active: mode === 'add-olt',
      iconClass: 'text-sky-700 dark:text-sky-200',
      btnClass:
        'bg-gradient-to-br from-sky-400/90 to-indigo-500/90 text-white shadow-[0_10px_24px_-10px_rgba(14,165,233,0.9)]',
      ringClass: 'ring-sky-400/40',
    },
    {
      id: 'link',
      label: 'Link',
      icon: Link2,
      onClick: onAddLink,
      iconClass: 'text-violet-700 dark:text-violet-200',
      btnClass:
        'bg-gradient-to-br from-violet-400/90 to-fuchsia-500/90 text-white shadow-[0_10px_24px_-10px_rgba(139,92,246,0.9)]',
      ringClass: 'ring-violet-400/40',
    },
    {
      id: 'onu',
      label: 'ONU',
      icon: User,
      onClick: onAddOnu,
      iconClass: 'text-amber-700 dark:text-amber-200',
      btnClass:
        'bg-gradient-to-br from-amber-400/90 to-pink-500/90 text-white shadow-[0_10px_24px_-10px_rgba(245,158,11,0.85)]',
      ringClass: 'ring-amber-400/40',
    },
  ];

  const handleAction = (action: Action) => {
    action.onClick();
    setOpen(false);
  };

  return (
    <div className="pointer-events-none absolute bottom-[5.75rem] right-4 z-20 sm:bottom-24 sm:right-5">
      <AnimatePresence>
        {open ? (
          <motion.button
            type="button"
            aria-label="Close add menu"
            className="pointer-events-auto fixed inset-0 z-10 cursor-default bg-transparent"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
          />
        ) : null}
      </AnimatePresence>

      <div className="pointer-events-none relative z-20 flex flex-col items-end gap-2.5">
        <AnimatePresence>
          {open ? (
            <motion.div
              className="pointer-events-none flex flex-col items-end gap-2.5"
              initial="hidden"
              animate="show"
              exit="hidden"
              variants={{
                hidden: { transition: { staggerChildren: 0.035, staggerDirection: -1 } },
                show: { transition: { staggerChildren: 0.045, delayChildren: 0.02 } },
              }}
            >
              {actions.map((action) => {
                const Icon = action.icon;
                return (
                  <motion.div
                    key={action.id}
                    className="pointer-events-auto flex items-center gap-2.5"
                    variants={{
                      hidden: { opacity: 0, y: 14, scale: 0.85, filter: 'blur(4px)' },
                      show: {
                        opacity: 1,
                        y: 0,
                        scale: 1,
                        filter: 'blur(0px)',
                        transition: { type: 'spring', stiffness: 520, damping: 28, mass: 0.7 },
                      },
                    }}
                  >
                    <motion.button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAction(action);
                      }}
                      whileHover={{ x: -2, scale: 1.02 }}
                      whileTap={{ scale: 0.97 }}
                      className={cn(
                        'group flex cursor-pointer items-center gap-2 rounded-full border border-white/60 bg-white/75 py-1.5 pl-3 pr-1.5 shadow-[0_12px_30px_-16px_rgba(15,23,42,0.45)] backdrop-blur-xl transition-colors dark:border-white/10 dark:bg-slate-900/70',
                        action.active && `ring-2 ${action.ringClass}`,
                      )}
                    >
                      <span className="text-[11.5px] font-semibold tracking-tight text-foreground/90">
                        {action.label}
                      </span>
                      <span
                        className={cn(
                          'grid size-8 place-items-center rounded-full transition-transform duration-200 group-hover:scale-105',
                          action.btnClass,
                        )}
                      >
                        <Icon className="size-4" />
                      </span>
                    </motion.button>
                  </motion.div>
                );
              })}
            </motion.div>
          ) : null}
        </AnimatePresence>

        <motion.button
          type="button"
          aria-label={open ? 'Close add menu' : 'Open add menu'}
          aria-expanded={open}
          onClick={(e) => {
            e.stopPropagation();
            setOpen((v) => !v);
          }}
          className={cn(
            'pointer-events-auto relative grid size-14 cursor-pointer place-items-center rounded-2xl border border-white/50 text-white shadow-[0_18px_40px_-14px_rgba(79,70,229,0.65)] backdrop-blur-xl transition-shadow dark:border-white/10',
            'bg-gradient-to-br from-primary via-violet-500 to-sky-500',
            open
              ? 'shadow-[0_18px_40px_-14px_rgba(244,63,94,0.55)] from-rose-500 via-fuchsia-500 to-amber-500'
              : 'hover:shadow-[0_22px_46px_-14px_rgba(79,70,229,0.8)]',
          )}
          whileHover={{ scale: 1.05, y: -1 }}
          whileTap={{ scale: 0.94 }}
          animate={{ rotate: open ? 45 : 0 }}
          transition={{ type: 'spring', stiffness: 420, damping: 26 }}
        >
          <span className="pointer-events-none absolute inset-0 rounded-2xl bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.45),transparent_45%)]" />
          <span className="pointer-events-none absolute -inset-1 rounded-[1.15rem] bg-gradient-to-br from-primary/40 to-sky-400/30 opacity-70 blur-md" />
          {open ? <X className="relative size-6" /> : <Plus className="relative size-6" />}
        </motion.button>
      </div>
    </div>
  );
}
