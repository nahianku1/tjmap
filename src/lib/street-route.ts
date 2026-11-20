import { useEffect, useState } from 'react';
import { haversineMeters } from './route';

export interface Point {
  lat: number;
  lng: number;
}

export interface StreetRoute {
  /** Road distance in metres. */
  distanceM: number;
  /** Estimated drive time in seconds. */
  durationS: number;
  /** Road geometry as GeoJSON [lng, lat] pairs. */
  coordinates: [number, number][];
}

export interface StreetState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  distanceM: number | null;
  durationS: number | null;
  coordinates: [number, number][] | null;
}

export const EMPTY_STREET: StreetState = {
  status: 'idle',
  distanceM: null,
  durationS: null,
  coordinates: null,
};

const OSRM_ROUTE_URL = 'https://router.project-osrm.org/route/v1/driving';

interface OsrmResponse {
  code?: string;
  routes?: {
    distance?: number;
    duration?: number;
    geometry?: { coordinates?: [number, number][] };
  }[];
}

/** Drives from one coordinate to another along public roads (OSRM demo server). */
export async function fetchStreetRoute(from: Point, to: Point): Promise<StreetRoute> {
  const coordinates = `${from.lng},${from.lat};${to.lng},${to.lat}`;
  const response = await fetch(
    `${OSRM_ROUTE_URL}/${coordinates}?overview=full&geometries=geojson`,
  );
  if (!response.ok) {
    throw new Error(`Street routing unavailable (${response.status})`);
  }
  const data = (await response.json()) as OsrmResponse;
  const route = data.routes?.[0];
  if (data.code !== 'Ok' || !route?.geometry?.coordinates?.length) {
    throw new Error('No street route found');
  }
  return {
    distanceM: Math.round(route.distance ?? 0),
    durationS: Math.round(route.duration ?? 0),
    coordinates: route.geometry.coordinates,
  };
}

/** Road approach from a free map point to the fibre node it snapped to. */
export function useStreetApproach(
  enabled: boolean,
  point: Point | null,
  snapped: Point | null,
): StreetState {
  const [state, setState] = useState<StreetState>(EMPTY_STREET);
  const lat = point?.lat ?? null;
  const lng = point?.lng ?? null;
  const snapLat = snapped?.lat ?? null;
  const snapLng = snapped?.lng ?? null;

  useEffect(() => {
    if (!enabled || lat === null || lng === null || snapLat === null || snapLng === null) {
      setState(EMPTY_STREET);
      return;
    }
    if (haversineMeters(snapLat, snapLng, lat, lng) < 5) {
      setState({ status: 'ready', distanceM: 0, durationS: 0, coordinates: null });
      return;
    }
    let cancelled = false;
    setState({ status: 'loading', distanceM: null, durationS: null, coordinates: null });
    fetchStreetRoute({ lat: snapLat, lng: snapLng }, { lat, lng })
      .then((result) => {
        if (!cancelled) setState({ status: 'ready', ...result });
      })
      .catch(() => {
        if (!cancelled) {
          setState({ status: 'error', distanceM: null, durationS: null, coordinates: null });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, lat, lng, snapLat, snapLng]);

  return state;
}
