'use client';

import { Cable, Layers } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { TIA_CORE_COLORS, type FibreCableType } from '@/lib/fibre-cores';

interface LinkTypeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Device the cable is starting from, shown for context. */
  deviceCode?: string | null;
  onSelect: (type: FibreCableType) => void;
}

/**
 * Step zero of adding a cable: pick the cable construction, then the ports on
 * the map. Each option opens a differently structured cable form.
 */
export function LinkTypeDialog({ open, onOpenChange, deviceCode, onSelect }: LinkTypeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-lg">
        <DialogHeader>
          <DialogTitle>Add link</DialogTitle>
          <DialogDescription>
            Choose the cable construction for this link
            {deviceCode ? ` from ${deviceCode}` : ''}. You will pick the two device ports on the map
            next, then fill in the cable details.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2.5 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => onSelect('core')}
            aria-label="Standard core cable"
            className="group flex flex-col items-start gap-2 rounded-2xl border border-white/60 bg-white/50 p-3 text-left transition hover:border-primary/40 hover:bg-primary/[0.06] focus-visible:border-primary focus-visible:outline-none dark:border-white/10 dark:bg-white/[0.03]"
          >
            <span className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">
              <Cable className="size-4" />
            </span>
            <span className="text-[12.5px] font-semibold text-foreground">Standard core cable</span>
            <span className="text-[10.5px] leading-relaxed text-muted-foreground">
              12 standard cores in one sheath. Add more cores or delete individual strands in the
              cable form.
            </span>
            <span className="mt-auto flex flex-wrap gap-1 pt-1">
              {Array.from({ length: 12 }, (_value, index) => (
                <span
                  key={index}
                  className="size-2 rounded-full ring-1 ring-black/10 dark:ring-white/15"
                  style={{ backgroundColor: TIA_CORE_COLORS[index] }}
                />
              ))}
            </span>
          </button>

          <button
            type="button"
            onClick={() => onSelect('tube')}
            aria-label="Multi-tube cable"
            className="group flex flex-col items-start gap-2 rounded-2xl border border-white/60 bg-white/50 p-3 text-left transition hover:border-primary/40 hover:bg-primary/[0.06] focus-visible:border-primary focus-visible:outline-none dark:border-white/10 dark:bg-white/[0.03]"
          >
            <span className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">
              <Layers className="size-4" />
            </span>
            <span className="text-[12.5px] font-semibold text-foreground">Multi-tube cable</span>
            <span className="text-[10.5px] leading-relaxed text-muted-foreground">
              Starts with one 12-core tube and adds whole tubes in the TIA colour code, each core
              numbered inside its tube.
            </span>
            <span className="mt-auto space-y-1 pt-1">
              {[1, 2].map((tube) => (
                <span key={tube} className="flex items-center gap-1">
                  <span className="font-mono text-[8px] text-muted-foreground">T{tube}</span>
                  {Array.from({ length: 12 }, (_value, index) => (
                    <span
                      key={index}
                      className="size-2 rounded-full ring-1 ring-black/10 dark:ring-white/15"
                      style={{ backgroundColor: TIA_CORE_COLORS[index] }}
                    />
                  ))}
                </span>
              ))}
            </span>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
