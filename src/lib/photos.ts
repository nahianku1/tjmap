import type { TjType } from './types';

/** Bundled sample photos shown for OLTs and terminal joints. */
export const OLT_PHOTO = '/assets/olt-cabinet.svg';

const TJ_PHOTOS: Record<TjType, string> = {
  box: '/assets/tj-box.svg',
  cut: '/assets/tj-cut.svg',
  pon_power: '/assets/tj-pon.svg',
};

export function tjPhoto(type: TjType): string {
  return TJ_PHOTOS[type] ?? TJ_PHOTOS.box;
}
