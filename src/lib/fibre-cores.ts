/**
 * TIA-598 colour code for a multi-tube cable: every tube carries the same
 * 12-colour sequence (Blue, Orange, Green, Brown, Slate, White, Red, Black,
 * Yellow, Violet, Rose, Aqua), so core 13 is Blue again in tube 2.
 */
export const CORES_PER_TUBE = 12;

export const TIA_CORE_NAMES = [
  'Blue',
  'Orange',
  'Green',
  'Brown',
  'Slate',
  'White',
  'Red',
  'Black',
  'Yellow',
  'Violet',
  'Rose',
  'Aqua',
] as const;

export const TIA_CORE_COLORS = [
  '#2563eb', // 1 Blue
  '#ea580c', // 2 Orange
  '#16a34a', // 3 Green
  '#854d0e', // 4 Brown
  '#64748b', // 5 Slate
  '#e2e8f0', // 6 White
  '#dc2626', // 7 Red
  '#1e293b', // 8 Black
  '#ca8a04', // 9 Yellow
  '#9333ea', // 10 Violet
  '#e11d48', // 11 Rose
  '#0891b2', // 12 Aqua
] as const;

/** 1-based core number → tube number. */
export function tubeOf(coreNumber: number): number {
  return Math.floor((Math.max(1, coreNumber) - 1) / CORES_PER_TUBE) + 1;
}

/** 1-based core number → position inside its tube (1–12). */
export function coreInTubeOf(coreNumber: number): number {
  return ((Math.max(1, coreNumber) - 1) % CORES_PER_TUBE) + 1;
}

/** TIA colour for a 1-based core number, repeating every 12 cores. */
export function tiaCoreColor(coreNumber: number): string {
  return TIA_CORE_COLORS[coreInTubeOf(coreNumber) - 1];
}

/** TIA colour name for a 1-based core number, e.g. `Slate` for core 5. */
export function tiaCoreName(coreNumber: number): string {
  return TIA_CORE_NAMES[coreInTubeOf(coreNumber) - 1];
}

/**
 * Label for a 1-based core number, numbered from 1 inside each tube so the
 * count restarts with every tube — core 13 is `T2-01`, not `Core 13`.
 */
export function tubeCoreLabel(coreNumber: number): string {
  return `T${tubeOf(coreNumber)}-${String(coreInTubeOf(coreNumber)).padStart(2, '0')}`;
}

/** Label for a single-sheath cable, where cores are numbered across the cable. */
export function plainCoreLabel(coreNumber: number): string {
  return `Core ${String(Math.max(1, coreNumber)).padStart(2, '0')}`;
}

/** Cable construction: 12 plain cores, or 12-core tubes repeated. */
export type FibreCableType = 'core' | 'tube';

/** `Tube 2 · core 5 · Slate` for a 1-based core number. */
export function tubeCoreHint(coreNumber: number): string {
  return `Tube ${tubeOf(coreNumber)} · core ${coreInTubeOf(coreNumber)} · ${tiaCoreName(coreNumber)}`;
}
