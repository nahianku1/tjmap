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
 * Strand name for a 1-based core number, using the TIA-598 colour itself:
 * `Blue`, `Orange`, … `Aqua`. Colours repeat every 12 cores, so later rounds
 * carry a short suffix — core 13 is `Blue 2`, not `Blue`.
 */
export function tiaCoreLabel(coreNumber: number): string {
  const n = Math.max(1, Math.round(coreNumber));
  const round = Math.ceil(n / CORES_PER_TUBE);
  const name = tiaCoreName(n);
  return round > 1 ? `${name} ${round}` : name;
}

/**
 * Turns the labels older builds generated (`T1-01`, `Core 01`, `Leg 01`,
 * `S2-L01`) into the strand's TIA colour name. Any other label is a manual
 * name and is returned untouched.
 */
export function displayCoreLabel(label: string | null | undefined, fallbackNumber = 1): string {
  const raw = (label ?? '').trim();
  if (!raw) return tiaCoreLabel(fallbackNumber);

  const tube = raw.match(/^T(\d+)-(\d+)$/i);
  if (tube) {
    return tiaCoreLabel((Number(tube[1]) - 1) * CORES_PER_TUBE + Number(tube[2]));
  }

  const numbered = raw.match(/^(?:Core|Leg)\s+(\d+)$/i);
  if (numbered) return tiaCoreLabel(Number(numbered[1]));

  const extra = raw.match(/^S(\d+)-L(\d+)$/i);
  if (extra) {
    const coreNumber = (Number(extra[1]) - 2) * CORES_PER_TUBE + Number(extra[2]);
    return tiaCoreLabel(coreNumber > 0 ? coreNumber : Number(extra[2]));
  }

  // A splitter-owned leg is stored under its splitter's prefix (`S2:Blue`) so
  // two splitters in one joint never share a label; it still reads as `Blue`.
  const owned = raw.match(/^S\d+:(.+)$/);
  if (owned) return owned[1].trim();

  return raw;
}

/**
 * The leg's own name without its splitter prefix: `S2:Blue` → `Blue`. Plain
 * labels (the primary splitter's legs, manual names) come back unchanged.
 */
export function splitterLegBase(label: string | null | undefined): string {
  const raw = (label ?? '').trim();
  const owned = raw.match(/^S\d+:(.+)$/);
  return owned ? owned[1].trim() : raw;
}

/**
 * The stored identity of a splitter's leg. The primary splitter keeps the plain
 * colour names so existing links stay valid; every extra splitter stamps its
 * legs with its own ordinal (`S2:Blue`), which keeps legs of different
 * splitters in the same joint distinct even when the colours repeat.
 */
export function splitterLegLabel(ordinal: number, base: string): string {
  const trimmed = (base ?? '').trim();
  if (!trimmed || ordinal <= 1) return trimmed;
  return `S${ordinal}:${trimmed}`;
}

/** Appends ` 2`, ` 3`, … until the label is free inside one device. */
export function uniqueCoreLabel(label: string, used: Set<string>): string {
  if (!used.has(label)) return label;
  let suffix = 2;
  while (used.has(`${label} ${suffix}`)) suffix += 1;
  return `${label} ${suffix}`;
}

/** Cable construction: 12 plain cores, or 12-core tubes repeated. */
export type FibreCableType = 'core' | 'tube';
