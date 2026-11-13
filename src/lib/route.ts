import type { LinkPathPoint } from './types';

const EARTH_RADIUS_M = 6371000;

export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** The span from device A to device B through its drawn waypoints, as GeoJSON [lng, lat] pairs. */
export function routeCoordinates(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
  path?: LinkPathPoint[] | null,
): [number, number][] {
  const waypoints = (path ?? []).filter(
    (point) => Number.isFinite(point.lat) && Number.isFinite(point.lng),
  );
  const coordinates: [number, number][] = [[fromLng, fromLat]];
  waypoints.forEach((point) => coordinates.push([point.lng, point.lat]));
  coordinates.push([toLng, toLat]);
  return coordinates;
}

export function routeLengthMeters(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
  path?: LinkPathPoint[] | null,
): number {
  const coordinates = routeCoordinates(fromLat, fromLng, toLat, toLng, path);
  let total = 0;
  for (let index = 1; index < coordinates.length; index += 1) {
    const [lng1, lat1] = coordinates[index - 1];
    const [lng2, lat2] = coordinates[index];
    total += haversineMeters(lat1, lng1, lat2, lng2);
  }
  return total;
}

/** Total length of an open path through the given points. */
export function pathLengthMeters(points: LinkPathPoint[]): number {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += haversineMeters(
      points[index - 1].lat,
      points[index - 1].lng,
      points[index].lat,
      points[index].lng,
    );
  }
  return total;
}

/** Length around a closed polygon, back to its first point. */
export function polygonPerimeterMeters(points: LinkPathPoint[]): number {
  if (points.length < 2) return 0;
  return pathLengthMeters([...points, points[0]]);
}

/** Spherical polygon area in square metres (accurate at city scale). */
export function polygonAreaM2(points: LinkPathPoint[]): number {
  if (points.length < 3) return 0;
  const toRad = (value: number) => (value * Math.PI) / 180;
  let sum = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    sum +=
      toRad(next.lng - current.lng) *
      (2 + Math.sin(toRad(current.lat)) + Math.sin(toRad(next.lat)));
  }
  return Math.abs((sum * EARTH_RADIUS_M * EARTH_RADIUS_M) / 2);
}

/** Halfway along the drawn route, so the fibre label sits on the line. */
export function routeMidpoint(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
  path?: LinkPathPoint[] | null,
): [number, number] {
  const coordinates = routeCoordinates(fromLat, fromLng, toLat, toLng, path);
  const segments: number[] = [];
  let total = 0;
  for (let index = 1; index < coordinates.length; index += 1) {
    const [lng1, lat1] = coordinates[index - 1];
    const [lng2, lat2] = coordinates[index];
    const length = haversineMeters(lat1, lng1, lat2, lng2);
    segments.push(length);
    total += length;
  }
  if (total === 0) return coordinates[0];

  let remaining = total / 2;
  for (let index = 0; index < segments.length; index += 1) {
    if (remaining <= segments[index]) {
      const ratio = segments[index] === 0 ? 0 : remaining / segments[index];
      const [lng1, lat1] = coordinates[index];
      const [lng2, lat2] = coordinates[index + 1];
      return [lng1 + (lng2 - lng1) * ratio, lat1 + (lat2 - lat1) * ratio];
    }
    remaining -= segments[index];
  }
  return coordinates[coordinates.length - 1];
}
