import type { Olt, PonPort, Tj } from './types';

/** ONU slots one PON port offers, by the cabinet's PON technology. */
const PON_ONU_LIMITS: Record<string, number> = {
  gpon: 128,
  epon: 64,
  xg_pon: 128,
  xgs_pon: 128,
  combo: 128,
};

export const DEFAULT_PON_ONU_LIMIT = 128;

export function ponOnuCapacity(oltType?: string | null): number {
  return PON_ONU_LIMITS[(oltType ?? '').trim().toLowerCase()] ?? DEFAULT_PON_ONU_LIMIT;
}

export type PonFamily = 'epon' | 'gpon' | 'both';

/** EPON is IEEE, GPON and XG(S)-PON are ITU; a combo cabinet carries both. */
export function ponOltFamily(oltType?: string | null): PonFamily {
  const type = (oltType ?? '').trim().toLowerCase();
  if (type === 'epon') return 'epon';
  if (type === 'combo') return 'both';
  return 'gpon';
}

/** The PON standard an ONU is built for. */
export function ponOnuFamily(ponType?: string | null): 'epon' | 'gpon' {
  return (ponType ?? '').trim().toLowerCase() === 'epon' ? 'epon' : 'gpon';
}

export interface PonPortOccupancy {
  onus: number;
  capacity: number;
  full: boolean;
}

/** ONU occupancy of one PON port; the server's numbers win, the fallback fills the gaps. */
export function ponPortOccupancy(
  port: Pick<PonPort, 'onus' | 'capacity' | 'full'> | null | undefined,
  fallbackCapacity?: number | null,
): PonPortOccupancy {
  const capacity = port?.capacity ?? fallbackCapacity ?? DEFAULT_PON_ONU_LIMIT;
  const onus = port?.onus ?? 0;
  return { onus, capacity, full: port?.full ?? onus >= capacity };
}

/** The PON port a joint is served from: the one recorded on it, else the cabinet's primary port. */
export function tjPonPortLabel(tj: Tj, olt?: Olt | null): string | null {
  return tj.ponData?.ponPort?.trim() || tj.olt?.ponPort || olt?.ponPort || null;
}
