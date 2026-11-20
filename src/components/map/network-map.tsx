'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import type { StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useTheme } from 'next-themes';
import { Cable, Loader2, X } from 'lucide-react';
import type { DeviceKind, FibreLink, LinkPathPoint, Olt, Onu, Tj } from '@/lib/types';
import type { DevicePort } from '@/lib/device-ports';
import { cn, formatDistance, primaryCore } from '@/lib/utils';
import {
  haversineMeters,
  pathLengthMeters,
  polygonAreaM2,
  polygonPerimeterMeters,
  routeCoordinates,
  routeLengthMeters,
  routeMidpoint,
} from '@/lib/route';
import {
  MeasurePanel,
  type MeasureKind,
  type MeasureMode,
} from '@/components/map/measure-panel';

export type MapMode =
  | 'idle'
  | 'add-tj'
  | 'add-cut-tj'
  | 'add-olt'
  | 'add-onu'
  | 'draw-link'
  /** Click a device, pick a port, click the far device, pick its port — no modal. */
  | 'connect'
  /** Route planner: the next map click sets the endpoint being picked. */
  | 'route'
  /** Multi-select mode: click devices or drag marquee box to select multiple devices. */
  | 'select';

/** Route planner highlight drawn above the cable graph. */
export interface MapRouteOverlay {
  /** Links that make up the shortest path. */
  linkIds: string[];
  /** Approaches from free endpoints to their snapped fibre nodes (street geometry or straight drop). */
  drops: { coordinates: [number, number][] }[];
  /** Free-point start pin. */
  start: { lat: number; lng: number; label: string } | null;
  /** Free-point destination pin. */
  target: { lat: number; lng: number; label: string } | null;
  /** Changes when the path, a free endpoint or a street leg changes. */
  signature: string;
}

interface NetworkMapProps {
  tjs: Tj[];
  links: FibreLink[];
  olts: Olt[];
  onus?: Onu[];
  onSelectOlt: (id: string) => void;
  onSelectOnu?: (id: string) => void;
  mode: MapMode;
  selectedTjId: string | null;
  selectedLinkId: string | null;
  selectedOltId?: string | null;
  selectedOnuId?: string | null;
  focus?: { lng: number; lat: number; zoom?: number; nonce: number } | null;
  /** Area camera. When omitted the map frames the whole country. */
  initialView?: { lat: number; lng: number; zoom: number } | null;
  /** Area extent. Preferred over `initialView` so the whole area always fits. */
  initialBounds?: { minLat: number; maxLat: number; minLng: number; maxLng: number } | null;
  /** Identifies the camera context (e.g. the area id) so switching areas reframes. */
  cameraScope?: string;
  /** True once the view context (e.g. area data) is resolved so the camera can be framed. */
  viewReady?: boolean;
  pinnedLocation?: {
    lat: number;
    lng: number;
    title: string;
    subtitle?: string;
    pinOnly?: boolean;
  } | null;
  onSelectTj: (id: string) => void;
  onSelectLink: (id: string) => void;
  onMapClick: (point: { lng: number; lat: number }) => void;
  /** Waypoints of the cable route being drawn for a link. */
  drawPath?: LinkPathPoint[];
  onDrawPoint?: (point: { lng: number; lat: number }) => void;
  onMoveDrawPoint?: (index: number, point: { lng: number; lat: number }) => void;
  onFinishDraw?: () => void;
  onBackgroundClick: () => void;
  onClearPinnedLocation?: () => void;
  onAddTjAtPinnedLocation?: (point: { lat: number; lng: number; address: string }) => void;
  onAddOltAtPinnedLocation?: (point: { lat: number; lng: number; address: string }) => void;
  onAddOnuAtPinnedLocation?: (point: { lat: number; lng: number; address: string }) => void;
  /** Admins can drag devices to new coordinates; the move is committed on drop. */
  canMoveDevices?: boolean;
  onMoveDevice?: (move: {
    kind: 'tj' | 'olt' | 'onu';
    id: string;
    lat: number;
    lng: number;
  }) => void;
  /** Saves a dragged cable route (its waypoint coordinates). */
  onMoveLinkPath?: (id: string, path: LinkPathPoint[]) => void;
  /** Device whose ports the connection tool is showing in its anchored popover. */
  connectTarget?: {
    kind: DeviceKind;
    id: string;
    code: string;
    name: string | null;
    lat?: number;
    lng?: number;
  } | null;
  /** Ports of `connectTarget`, free and occupied, for the connection tool. */
  connectPorts?: DevicePort[];
  /** A device was clicked while the connection tool is active. */
  onConnectDevice?: (device: { kind: DeviceKind; id: string }) => void;
  onPickConnectPort?: (label: string) => void;
  onCancelConnectTarget?: () => void;
  /** Shortest-route highlight produced by the route planner. */
  routeOverlay?: MapRouteOverlay | null;
  /** A device was clicked while the route planner is picking endpoints. */
  onRouteDevice?: (device: { kind: DeviceKind; id: string }) => void;
  /** Multi-select devices state */
  selectedDeviceIds?: Set<string>;
  onToggleSelectDevice?: (device: { kind: DeviceKind; id: string }) => void;
  onSelectDevicesInBox?: (devices: Array<{ kind: DeviceKind; id: string }>, append?: boolean) => void;
}

const OSM_TILE_URLS = [
  'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
  'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
  'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png',
];

const EMPTY: { type: 'FeatureCollection'; features: unknown[] } = {
  type: 'FeatureCollection',
  features: [],
};

function samePath(a: LinkPathPoint[], b: LinkPathPoint[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (point, index) =>
        Math.abs(point.lat - b[index].lat) < 1e-7 &&
        Math.abs(point.lng - b[index].lng) < 1e-7,
    )
  );
}

const DASH_FRAMES: number[][] = [
  [0.5, 4],
  [1, 4],
  [1.5, 4],
  [2, 4],
  [2.5, 4],
  [3, 4],
  [3.5, 4],
  [4, 4],
];

function getOsmStyle(dark: boolean): StyleSpecification {
  return {
    version: 8,
    name: 'OpenStreetMap',
    sources: {
      'osm-tiles': {
        type: 'raster',
        tiles: OSM_TILE_URLS,
        tileSize: 256,
        maxzoom: 19,
        attribution: '',
      },
    },
    layers: [
      {
        id: 'osm-tiles-layer',
        type: 'raster',
        source: 'osm-tiles',
        minzoom: 0,
        // Keep the layer visible past the source's native tile level (it
        // overzooms) so deep zooms never drop the base map to a black canvas.
        maxzoom: 24,
        paint: dark
          ? {
              'raster-brightness-min': 0.08,
              'raster-brightness-max': 0.72,
              'raster-contrast': 0.3,
              'raster-saturation': -0.7,
            }
          : {
              'raster-saturation': 0.05,
              'raster-contrast': 0.05,
            },
      },
    ],
  };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}

function linksToGeoJson(
  links: FibreLink[],
  lanes: Map<string, { offset: number; stagger: number }> = new Map(),
) {
  return {
    type: 'FeatureCollection' as const,
    features: links.map((link) => ({
      type: 'Feature' as const,
      properties: {
        id: link.id,
        fibreId: link.fibreId,
        status: link.status,
        color: link.color ?? null,
        offset: lanes.get(link.id)?.offset ?? 0,
      },
      geometry: {
        type: 'LineString' as const,
        coordinates: routeCoordinates(link.fromLat, link.fromLng, link.toLat, link.toLng, link.path),
      },
    })),
  };
}

const PARALLEL_LINK_GAP_PX = 7;
const PARALLEL_LABEL_GAP_PX = 40;

interface LinkLane {
  /** Perpendicular pixel shift for the line itself. */
  offset: number;
  /** Along-route pixel shift for the link label, so IDs do not stack. */
  stagger: number;
}

function linkEndKey(link: FibreLink, side: 'from' | 'to'): string {
  if (side === 'from') {
    if (link.fromTjId) return `tj:${link.fromTjId}`;
    if (link.fromOltId) return `olt:${link.fromOltId}`;
    if (link.fromOnuId) return `onu:${link.fromOnuId}`;
    return `${link.fromLat.toFixed(5)},${link.fromLng.toFixed(5)}`;
  }
  if (link.toTjId) return `tj:${link.toTjId}`;
  if (link.toOltId) return `olt:${link.toOltId}`;
  if (link.toOnuId) return `onu:${link.toOnuId}`;
  return `${link.toLat.toFixed(5)},${link.toLng.toFixed(5)}`;
}

/**
 * Links between the same two devices otherwise draw on top of each other, so
 * each one is fanned out with a small pixel offset perpendicular to its route.
 */
function linkParallelLanes(links: FibreLink[]): Map<string, LinkLane> {
  const groups = new Map<string, FibreLink[]>();
  links.forEach((link) => {
    const from = linkEndKey(link, 'from');
    const to = linkEndKey(link, 'to');
    const key = from === to ? from : [from, to].sort().join('|');
    const group = groups.get(key);
    if (group) group.push(link);
    else groups.set(key, [link]);
  });

  const lanes = new Map<string, LinkLane>();
  groups.forEach((group) => {
    if (group.length < 2) return;
    const ordered = [...group].sort((a, b) => a.id.localeCompare(b.id));
    ordered.forEach((link, index) => {
      const step = index - (ordered.length - 1) / 2;
      // A link stored in the opposite direction would otherwise offset to the
      // same side as its neighbour.
      const reversed = linkEndKey(link, 'from') !== linkEndKey(ordered[0], 'from');
      lanes.set(link.id, {
        offset: step * PARALLEL_LINK_GAP_PX * (reversed ? -1 : 1),
        stagger: step * PARALLEL_LABEL_GAP_PX,
      });
    });
  });
  return lanes;
}

function draftToGeoJson(path: LinkPathPoint[], cursor: { lng: number; lat: number } | null) {
  const coordinates: [number, number][] = path.map(
    (point): [number, number] => [point.lng, point.lat],
  );
  if (cursor && coordinates.length > 0) coordinates.push([cursor.lng, cursor.lat]);
  if (coordinates.length < 2) return EMPTY;
  return {
    type: 'FeatureCollection' as const,
    features: [
      {
        type: 'Feature' as const,
        properties: {},
        geometry: { type: 'LineString' as const, coordinates },
      },
    ],
  };
}

function syncDraftData(
  map: maplibregl.Map,
  path: LinkPathPoint[],
  cursor: { lng: number; lat: number } | null,
) {
  const source = map.getSource('draft-path') as maplibregl.GeoJSONSource | undefined;
  source?.setData(draftToGeoJson(path, cursor) as never);
}

function measureGeoJson(
  points: LinkPathPoint[],
  cursor: { lng: number; lat: number } | null,
  mode: MeasureMode,
) {
  if (points.length === 0) return { line: EMPTY, fill: EMPTY };
  const base: [number, number][] = points.map(
    (point): [number, number] => [point.lng, point.lat],
  );
  const last = base[base.length - 1];
  const preview: [number, number][] =
    cursor && (Math.abs(cursor.lng - last[0]) > 1e-12 || Math.abs(cursor.lat - last[1]) > 1e-12)
      ? [...base, [cursor.lng, cursor.lat] as [number, number]]
      : base;

  const closed = mode === 'area' && preview.length >= 3;
  const ring = closed ? [...preview, preview[0]] : preview;

  return {
    line:
      ring.length >= 2
        ? {
            type: 'FeatureCollection' as const,
            features: [
              {
                type: 'Feature' as const,
                properties: {},
                geometry: { type: 'LineString' as const, coordinates: ring },
              },
            ],
          }
        : EMPTY,
    fill: closed
      ? {
          type: 'FeatureCollection' as const,
          features: [
            {
              type: 'Feature' as const,
              properties: {},
              geometry: { type: 'Polygon' as const, coordinates: [ring] },
            },
          ],
        }
      : EMPTY,
  };
}

function syncMeasureData(
  map: maplibregl.Map,
  points: LinkPathPoint[],
  cursor: { lng: number; lat: number } | null,
  mode: MeasureMode,
) {
  const data = measureGeoJson(points, cursor, mode);
  const line = map.getSource('measure-line') as maplibregl.GeoJSONSource | undefined;
  line?.setData(data.line as never);
  const fill = map.getSource('measure-fill') as maplibregl.GeoJSONSource | undefined;
  fill?.setData(data.fill as never);
}

function addNetworkLayers(map: maplibregl.Map, dark: boolean) {
  if (!map.getSource('links')) {
    map.addSource('links', { type: 'geojson', data: EMPTY as never });
  }
  if (!map.getSource('selected-link')) {
    map.addSource('selected-link', { type: 'geojson', data: EMPTY as never });
  }
  if (!map.getSource('draft-path')) {
    map.addSource('draft-path', { type: 'geojson', data: EMPTY as never });
  }
  if (!map.getSource('measure-fill')) {
    map.addSource('measure-fill', { type: 'geojson', data: EMPTY as never });
  }
  if (!map.getSource('measure-line')) {
    map.addSource('measure-line', { type: 'geojson', data: EMPTY as never });
  }
  if (!map.getSource('route-links')) {
    map.addSource('route-links', { type: 'geojson', data: EMPTY as never });
  }
  if (!map.getSource('route-drop')) {
    map.addSource('route-drop', { type: 'geojson', data: EMPTY as never });
  }

  if (!map.getLayer('links-glow')) {
    map.addLayer({
      id: 'links-glow',
      type: 'line',
      source: 'links',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': [
          'case',
          ['==', ['get', 'status'], 'cut'],
          dark ? '#fb7185' : '#e11d48',
          ['case', ['!=', ['get', 'color'], null], ['get', 'color'], '#000000'],
        ] as never,
        'line-width': ['interpolate', ['linear'], ['zoom'], 4, 5, 10, 8, 15, 11] as never,
        'line-blur': 7,
        'line-opacity': dark ? 0.35 : 0.18,
        'line-offset': ['get', 'offset'] as never,
      },
    });
  } else {
    map.setPaintProperty(
      'links-glow',
      'line-color',
      [
        'case',
        ['==', ['get', 'status'], 'cut'],
        dark ? '#fb7185' : '#e11d48',
        ['case', ['!=', ['get', 'color'], null], ['get', 'color'], '#000000'],
      ] as never,
    );
    map.setPaintProperty('links-glow', 'line-opacity', dark ? 0.35 : 0.18);
  }

  if (!map.getLayer('links-base')) {
    map.addLayer({
      id: 'links-base',
      type: 'line',
      source: 'links',
      filter: ['==', ['get', 'status'], 'active'],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ['case', ['!=', ['get', 'color'], null], ['get', 'color'], '#000000'] as never,
        'line-width': ['interpolate', ['linear'], ['zoom'], 4, 1.2, 10, 2, 15, 3] as never,
        'line-opacity': 0.95,
        'line-offset': ['get', 'offset'] as never,
      },
    });
  } else {
    map.setPaintProperty(
      'links-base',
      'line-color',
      ['case', ['!=', ['get', 'color'], null], ['get', 'color'], '#000000'] as never,
    );
    map.setPaintProperty('links-base', 'line-opacity', 0.95);
  }

  if (!map.getLayer('links-cut')) {
    map.addLayer({
      id: 'links-cut',
      type: 'line',
      source: 'links',
      filter: ['==', ['get', 'status'], 'cut'],
      layout: { 'line-cap': 'butt', 'line-join': 'round' },
      paint: {
        'line-color': dark ? '#fb7185' : '#dc2626',
        'line-width': ['interpolate', ['linear'], ['zoom'], 4, 1.4, 10, 2.2, 15, 3.2] as never,
        'line-dasharray': [2.2, 1.7],
        'line-opacity': 0.95,
        'line-offset': ['get', 'offset'] as never,
      },
    });
  }

  if (!map.getLayer('links-flow')) {
    map.addLayer({
      id: 'links-flow',
      type: 'line',
      source: 'links',
      filter: ['==', ['get', 'status'], 'active'],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ['case', ['!=', ['get', 'color'], null], ['get', 'color'], '#67e8f9'] as never,
        'line-width': ['interpolate', ['linear'], ['zoom'], 6, 0.7, 12, 1.5] as never,
        'line-opacity': 0.85,
        'line-dasharray': [1, 5],
        'line-offset': ['get', 'offset'] as never,
      },
    });
  } else {
    map.setPaintProperty(
      'links-flow',
      'line-color',
      ['case', ['!=', ['get', 'color'], null], ['get', 'color'], '#67e8f9'] as never,
    );
    map.setPaintProperty('links-flow', 'line-opacity', 0.85);
  }

  if (!map.getLayer('links-hit')) {
    map.addLayer({
      id: 'links-hit',
      type: 'line',
      source: 'links',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#ffffff',
        'line-width': 20,
        'line-opacity': 0.001,
        'line-offset': ['get', 'offset'] as never,
      },
    });
  }

  if (!map.getLayer('draft-path-glow')) {
    map.addLayer({
      id: 'draft-path-glow',
      type: 'line',
      source: 'draft-path',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#000000',
        'line-width': 10,
        'line-blur': 6,
        'line-opacity': 0.25,
      },
    });
  } else {
    map.setPaintProperty('draft-path-glow', 'line-color', '#000000');
    map.setPaintProperty('draft-path-glow', 'line-opacity', 0.25);
  }

  if (!map.getLayer('draft-path')) {
    map.addLayer({
      id: 'draft-path',
      type: 'line',
      source: 'draft-path',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#000000',
        'line-width': 3,
        'line-dasharray': [1.6, 1.2],
        'line-opacity': 0.95,
      },
    });
  } else {
    map.setPaintProperty('draft-path', 'line-color', '#000000');
    map.setPaintProperty('draft-path', 'line-opacity', 0.95);
  }

  if (!map.getLayer('measure-fill')) {
    map.addLayer({
      id: 'measure-fill',
      type: 'fill',
      source: 'measure-fill',
      paint: {
        'fill-color': '#000000',
        'fill-opacity': 0.12,
      },
    });
  } else {
    map.setPaintProperty('measure-fill', 'fill-color', '#000000');
    map.setPaintProperty('measure-fill', 'fill-opacity', 0.12);
  }

  if (!map.getLayer('measure-line')) {
    map.addLayer({
      id: 'measure-line',
      type: 'line',
      source: 'measure-line',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#000000',
        'line-width': 2.2,
        'line-dasharray': [2, 1.4],
      },
    });
  } else {
    map.setPaintProperty('measure-line', 'line-color', '#000000');
  }

  if (!map.getLayer('links-selected')) {
    map.addLayer({
      id: 'links-selected',
      type: 'line',
      source: 'selected-link',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#f8fafc',
        'line-width': 3.2,
        'line-opacity': 0.9,
        'line-blur': 1.2,
        'line-dasharray': [2.2, 1.6],
        'line-offset': ['get', 'offset'] as never,
      },
    });
  }

  // Shortest-route highlight sits above every cable layer.
  if (!map.getLayer('route-links-glow')) {
    map.addLayer({
      id: 'route-links-glow',
      type: 'line',
      source: 'route-links',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#f59e0b',
        'line-width': 11,
        'line-blur': 6,
        'line-opacity': 0.4,
        'line-offset': ['get', 'offset'] as never,
      },
    });
  }
  if (!map.getLayer('route-links')) {
    map.addLayer({
      id: 'route-links',
      type: 'line',
      source: 'route-links',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#fbbf24',
        'line-width': ['interpolate', ['linear'], ['zoom'], 4, 3.4, 10, 4.6, 15, 6] as never,
        'line-opacity': 0.95,
        'line-offset': ['get', 'offset'] as never,
      },
    });
  }
  if (!map.getLayer('route-drop')) {
    map.addLayer({
      id: 'route-drop',
      type: 'line',
      source: 'route-drop',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#f59e0b',
        'line-width': 2.4,
        'line-dasharray': [1.1, 1.6],
        'line-opacity': 0.9,
      },
    });
  }
}

function syncLinkData(map: maplibregl.Map, links: FibreLink[], selectedLinkId: string | null) {
  // Lanes are computed across every link so the selected overlay keeps the
  // same parallel lane as its own line.
  const lanes = linkParallelLanes(links);
  const source = map.getSource('links') as maplibregl.GeoJSONSource | undefined;
  source?.setData(linksToGeoJson(links, lanes) as never);

  const selectedSource = map.getSource('selected-link') as maplibregl.GeoJSONSource | undefined;
  const selected = links.filter((link) => link.id === selectedLinkId);
  selectedSource?.setData(linksToGeoJson(selected, lanes) as never);
}

function syncRouteData(
  map: maplibregl.Map,
  links: FibreLink[],
  overlay: MapRouteOverlay | null,
) {
  const lanes = linkParallelLanes(links);
  const routeSource = map.getSource('route-links') as maplibregl.GeoJSONSource | undefined;
  const routeLinks = overlay
    ? links.filter((link) => overlay.linkIds.includes(link.id))
    : [];
  routeSource?.setData(linksToGeoJson(routeLinks, lanes) as never);

  const dropSource = map.getSource('route-drop') as maplibregl.GeoJSONSource | undefined;
  const dropFeatures = (overlay?.drops ?? [])
    .filter((drop) => drop.coordinates.length > 1)
    .map((drop) => ({
      type: 'Feature' as const,
      properties: {},
      geometry: { type: 'LineString' as const, coordinates: drop.coordinates },
    }));
  dropSource?.setData(
    (dropFeatures.length ? { type: 'FeatureCollection', features: dropFeatures } : EMPTY) as never,
  );
}

/** Lucide-style icon markup shared by the device pins. */
function pinIcon(paths: string, size = 14): string {
  return `<svg class="tj-marker__icon" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}

// Terminal joint: a fibre split/splice node.
const TJ_ICON = pinIcon(
  '<path d="M16 3h5v5"/><path d="M8 3H3v5"/><path d="M12 22v-8.3a4 4 0 0 0-1.172-2.872L3 3"/><path d="m15 9 6-6"/>',
);
// OLT: a rack-mounted optical line terminal.
const OLT_ICON = pinIcon(
  '<rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><path d="M6 6h.01"/><path d="M6 18h.01"/>',
);
// ONU: the subscriber's wireless router.
const ONU_ICON = pinIcon(
  '<path d="M12 20h.01"/><path d="M2 8.82a15 15 0 0 1 20 0"/><path d="M5 12.859a10 10 0 0 1 14 0"/><path d="M8.5 16.429a5 5 0 0 1 7 0"/>',
);

function buildMarkerContent(tj: Tj): string {
  const isCut = tj.isCut || tj.tjType === 'cut';
  const isPon = tj.tjType === 'pon_power';
  return `
    ${isCut ? '<span class="tj-marker__pulse"></span>' : ''}
    <span class="tj-marker__pin">
      ${TJ_ICON}
      <span class="tj-marker__ring"></span>
      ${isCut ? '<span class="tj-marker__cut-badge">!</span>' : isPon ? '<span class="tj-marker__cut-badge" style="background:#f59e0b;color:#000;font-size:6px;">⚡</span>' : ''}
    </span>
    <span class="tj-marker__chip">${escapeHtml(tj.code)}${isPon ? ' · PON' : ''}</span>
  `;
}

function buildOnuMarkerContent(onu: Onu): string {
  return `
    <span class="onu-marker__pin">
      ${ONU_ICON}
    </span>
    <span class="tj-marker__chip onu-marker__chip">${escapeHtml(onu.username || onu.fibreId || 'ONU')}</span>
  `;
}

function buildOltMarkerContent(olt: Olt): string {
  return `
    <span class="olt-marker__tile">
      ${OLT_ICON}
    </span>
    <span class="tj-marker__chip olt-marker__chip">${escapeHtml(olt.code)}</span>
  `;
}

export function NetworkMap({
  tjs,
  links,
  olts,
  onus = [],
  onSelectOlt,
  onSelectOnu,
  mode,
  selectedTjId,
  selectedLinkId,
  selectedOltId = null,
  selectedOnuId = null,
  focus,
  initialView,
  initialBounds,
  cameraScope,
  viewReady = true,
  pinnedLocation,
  onSelectTj,
  onSelectLink,
  onMapClick,
  drawPath = [],
  onDrawPoint,
  onMoveDrawPoint,
  onFinishDraw,
  onBackgroundClick,
  onClearPinnedLocation,
  onAddTjAtPinnedLocation,
  onAddOltAtPinnedLocation,
  onAddOnuAtPinnedLocation,
  canMoveDevices = false,
  onMoveDevice,
  onMoveLinkPath,
  connectTarget = null,
  connectPorts = [],
  onConnectDevice,
  onPickConnectPort,
  onCancelConnectTarget,
  routeOverlay = null,
  onRouteDevice,
  selectedDeviceIds,
  onToggleSelectDevice,
  onSelectDevicesInBox,
}: NetworkMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [selectionBox, setSelectionBox] = useState<{
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
  } | null>(null);
  const devicesRef = useRef({ tjs, olts, onus });
  devicesRef.current = { tjs, olts, onus };
  const markerRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const oltMarkerRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const onuMarkerRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const labelRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const bendMarkerRef = useRef<maplibregl.Marker[]>([]);
  const routeMarkerRef = useRef<maplibregl.Marker[]>([]);
  const drawCursorRef = useRef<{ lng: number; lat: number } | null>(null);
  const pinnedMarkerRef = useRef<maplibregl.Marker | null>(null);
  const routeStartMarkerRef = useRef<maplibregl.Marker | null>(null);
  const routeTargetMarkerRef = useRef<maplibregl.Marker | null>(null);
  const routeOverlayRef = useRef<MapRouteOverlay | null>(routeOverlay);
  const { resolvedTheme } = useTheme();
  const [ready, setReady] = useState(false);
  const [styleVersion, setStyleVersion] = useState(0);
  const [connectAnchor, setConnectAnchor] = useState<{ x: number; y: number } | null>(null);

  const themeRef = useRef(resolvedTheme);
  const appliedThemeRef = useRef<string | null>(null);
  const darkLayersRef = useRef(resolvedTheme !== 'light');
  const modeRef = useRef<MapMode>(mode);
  const linksRef = useRef(links);
  const selectedLinkRef = useRef(selectedLinkId);
  const drawPathRef = useRef(drawPath);
  drawPathRef.current = drawPath;
  const moveCallbacks = useRef({ onMoveDevice, onMoveLinkPath });
  moveCallbacks.current = { onMoveDevice, onMoveLinkPath };
  const canMoveRef = useRef(canMoveDevices);
  canMoveRef.current = canMoveDevices;
  const [dragging, setDragging] = useState<{
    kind: 'tj' | 'olt' | 'onu';
    id: string;
    lat: number;
    lng: number;
  } | null>(null);
  const [linkPathPreview, setLinkPathPreview] = useState<{
    id: string;
    path: LinkPathPoint[];
  } | null>(null);
  const linkDragRef = useRef<{
    id: string;
    start: { lng: number; lat: number };
    originalPath: LinkPathPoint[];
    currentPath: LinkPathPoint[];
    moved: boolean;
  } | null>(null);

  // Link endpoints are derived from the live device records rather than trusting
  // the link's stored endpoint coordinates, so a moved device can never leave its
  // spans rendered at the old position. While a device is mid-drag the cursor
  // position is used until the save lands. Lengths are recomputed from the same
  // resolved geometry.
  const viewLinks = useMemo(() => {
    const tjById = new Map(tjs.map((item) => [item.id, item]));
    const oltById = new Map(olts.map((item) => [item.id, item]));
    const onuById = new Map(onus.map((item) => [item.id, item]));

    // Endpoints are always resolved from the live device records. A link's
    // stored from/to coordinates can lag behind (or come back stale after a
    // refetch), which previously made a span jump back to its old position
    // after the device had already been moved.
    const resolveEndpoints = (link: FibreLink) => {
      const fromDevice = link.fromTjId
        ? tjById.get(link.fromTjId)
        : link.fromOltId
          ? oltById.get(link.fromOltId)
          : link.fromOnuId
            ? onuById.get(link.fromOnuId)
            : undefined;
      const toDevice = link.toTjId
        ? tjById.get(link.toTjId)
        : link.toOltId
          ? oltById.get(link.toOltId)
          : link.toOnuId
            ? onuById.get(link.toOnuId)
            : undefined;

      let fromLat = fromDevice?.lat ?? link.fromLat;
      let fromLng = fromDevice?.lng ?? link.fromLng;
      let toLat = toDevice?.lat ?? link.toLat;
      let toLng = toDevice?.lng ?? link.toLng;

      // Follow the cursor while a device is mid-drag, before it is saved.
      if (dragging) {
        if (
          (dragging.kind === 'tj' && link.fromTjId === dragging.id) ||
          (dragging.kind === 'olt' && link.fromOltId === dragging.id) ||
          (dragging.kind === 'onu' && link.fromOnuId === dragging.id)
        ) {
          fromLat = dragging.lat;
          fromLng = dragging.lng;
        }
        if (
          (dragging.kind === 'tj' && link.toTjId === dragging.id) ||
          (dragging.kind === 'olt' && link.toOltId === dragging.id) ||
          (dragging.kind === 'onu' && link.toOnuId === dragging.id)
        ) {
          toLat = dragging.lat;
          toLng = dragging.lng;
        }
      }

      return { fromLat, fromLng, toLat, toLng };
    };

    return links.map((link) => {
      const endpoints = resolveEndpoints(link);
      const pathChanged = linkPathPreview?.id === link.id;
      const path = pathChanged && linkPathPreview ? linkPathPreview.path : link.path;
      const coordsChanged =
        endpoints.fromLat !== link.fromLat ||
        endpoints.fromLng !== link.fromLng ||
        endpoints.toLat !== link.toLat ||
        endpoints.toLng !== link.toLng;
      if (!coordsChanged && !pathChanged) return link;
      return {
        ...link,
        ...endpoints,
        path,
        lengthM: routeLengthMeters(
          endpoints.fromLat,
          endpoints.fromLng,
          endpoints.toLat,
          endpoints.toLng,
          path,
        ),
      };
    });
  }, [links, tjs, olts, onus, dragging, linkPathPreview]);

  // Release the overlay once the saved device arrives at the dragged position.
  useEffect(() => {
    if (!dragging) return;
    const device =
      dragging.kind === 'tj'
        ? tjs.find((item) => item.id === dragging.id)
        : dragging.kind === 'olt'
          ? olts.find((item) => item.id === dragging.id)
          : onus.find((item) => item.id === dragging.id);
    if (!device || device.lat === null || device.lng === null) return;
    if (
      Math.abs(device.lat - dragging.lat) < 1e-7 &&
      Math.abs(device.lng - dragging.lng) < 1e-7
    ) {
      setDragging(null);
    }
  }, [tjs, olts, onus, dragging]);

  // Release the route overlay once the saved link carries the dragged path.
  useEffect(() => {
    if (!linkPathPreview) return;
    const link = links.find((item) => item.id === linkPathPreview.id);
    if (!link) {
      setLinkPathPreview(null);
      return;
    }
    if (samePath(link.path ?? [], linkPathPreview.path)) setLinkPathPreview(null);
  }, [links, linkPathPreview]);

  // Never leave a route overlay behind if its save silently never lands.
  useEffect(() => {
    if (!linkPathPreview) return;
    const timer = window.setTimeout(() => {
      setLinkPathPreview((current) => (current === linkPathPreview ? null : current));
    }, 8000);
    return () => window.clearTimeout(timer);
  }, [linkPathPreview]);

  const [measureMode, setMeasureMode] = useState<MeasureMode>('none');
  const [measureKind, setMeasureKind] = useState<MeasureKind | null>(null);
  const [measurePoints, setMeasurePoints] = useState<LinkPathPoint[]>([]);
  const measureModeRef = useRef<MeasureMode>(measureMode);
  const measurePointsRef = useRef(measurePoints);
  const measureCursorRef = useRef<{ lng: number; lat: number } | null>(null);
  const measureVertexRef = useRef<maplibregl.Marker[]>([]);
  const measureLabelRef = useRef<maplibregl.Marker[]>([]);
  measureModeRef.current = measureMode;
  measurePointsRef.current = measurePoints;
  const canDragDevice = canMoveDevices && mode === 'idle' && measureMode === 'none';

  const appendMeasurePoint = useCallback((point: { lat: number; lng: number }) => {
    setMeasurePoints((current) => {
      const last = current[current.length - 1];
      if (last && Math.abs(last.lat - point.lat) < 1e-7 && Math.abs(last.lng - point.lng) < 1e-7) {
        return current;
      }
      return [...current, point];
    });
  }, []);
  const appendMeasureRef = useRef(appendMeasurePoint);
  appendMeasureRef.current = appendMeasurePoint;

  const startMeasure = useCallback((kind: MeasureKind) => {
    measureCursorRef.current = null;
    setMeasurePoints([]);
    setMeasureKind(kind);
    setMeasureMode(kind);
  }, []);

  const undoMeasure = useCallback(() => {
    setMeasurePoints((current) => current.slice(0, -1));
  }, []);

  const clearMeasure = useCallback(() => {
    measureCursorRef.current = null;
    setMeasurePoints([]);
    setMeasureMode('none');
    setMeasureKind(null);
  }, []);

  const measureDistance = useMemo(() => pathLengthMeters(measurePoints), [measurePoints]);
  const measurePerimeter = useMemo(() => polygonPerimeterMeters(measurePoints), [measurePoints]);
  const measureArea = useMemo(() => polygonAreaM2(measurePoints), [measurePoints]);

  // Splitters carry their own sections so a joint's feed and branches stay apart.
  const connectPortGroups = useMemo(() => {
    const groups: { name: string | null; ports: DevicePort[] }[] = [];
    connectPorts.forEach((port) => {
      const name = port.group ?? null;
      const last = groups[groups.length - 1];
      if (last && last.name === name) last.ports.push(port);
      else groups.push({ name, ports: [port] });
    });
    return groups;
  }, [connectPorts]);
  const measureRenderMode: MeasureMode =
    measureMode !== 'none' ? measureMode : measureKind === 'area' ? 'area' : 'distance';
  const measureRenderModeRef = useRef<MeasureMode>(measureRenderMode);
  measureRenderModeRef.current = measureRenderMode;

  const callbacks = useRef({
    onSelectTj,
    onSelectLink,
    onSelectOlt,
    onSelectOnu,
    onMapClick,
    onBackgroundClick,
    onConnectDevice,
    onRouteDevice,
    onToggleSelectDevice,
    onSelectDevicesInBox,
  });
  const drawCallbacks = useRef({ onDrawPoint, onMoveDrawPoint, onFinishDraw });
  drawCallbacks.current = { onDrawPoint, onMoveDrawPoint, onFinishDraw };
  modeRef.current = mode;
  linksRef.current = viewLinks;
  selectedLinkRef.current = selectedLinkId;
  callbacks.current = {
    onSelectTj,
    onSelectLink,
    onSelectOlt,
    onSelectOnu,
    onMapClick,
    onBackgroundClick,
    onConnectDevice,
    onRouteDevice,
    onToggleSelectDevice,
    onSelectDevicesInBox,
  };
  routeOverlayRef.current = routeOverlay;

  const VIEW_KEY = 'fibreAtlas.mapView';
  const frameKeyRef = useRef<string>('default');

  function loadSavedView() {
    if (typeof window === 'undefined') return null;
    try {
      const raw = localStorage.getItem(VIEW_KEY);
      if (!raw) return null;
      const v = JSON.parse(raw);
      if (v && typeof v.lng === 'number' && typeof v.lat === 'number' && typeof v.zoom === 'number') {
        return { lng: v.lng, lat: v.lat, zoom: v.zoom, scope: typeof v.scope === 'string' ? v.scope : null };
      }
    } catch {
      // ignore corrupt storage
    }
    return null;
  }

  function saveView(lng: number, lat: number, zoom: number) {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(VIEW_KEY, JSON.stringify({ lng, lat, zoom, scope: frameKeyRef.current }));
    } catch {
      // ignore storage errors
    }
  }

  useEffect(() => {
    if (!containerRef.current) return;

    let disposed = false;
    const initialDark = themeRef.current !== 'light';
    appliedThemeRef.current = initialDark ? 'dark' : 'light';

    const savedView = loadSavedView();

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: getOsmStyle(initialDark),
      center: [savedView?.lng ?? 90.28, savedView?.lat ?? 23.75],
      zoom: savedView?.zoom ?? 6.3,
      minZoom: 5,
      maxZoom: 20,
      maxBounds: [
        [84.5, 18.2],
        [96.5, 28.6],
      ],
      attributionControl: false,
      dragRotate: false,
      boxZoom: false,
    });

    mapRef.current = map;
    if (process.env.NODE_ENV !== 'production') {
      (window as unknown as { __fibreMap?: maplibregl.Map }).__fibreMap = map;
    }
    const resizeMap = () => {
      try {
        map.resize();
      } catch {
        // Map torn down mid-resize.
      }
    };
    const rafId = requestAnimationFrame(resizeMap);
    window.addEventListener('resize', resizeMap);
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');

    // Every style (initial OSM raster, theme swap)
    // drops custom layers, so re-attach the network overlay each time.
    map.on('style.load', () => {
      if (disposed) return;
      try {
        addNetworkLayers(map, darkLayersRef.current);
        syncLinkData(map, linksRef.current, selectedLinkRef.current);
        syncRouteData(map, linksRef.current, routeOverlayRef.current);
        syncDraftData(map, drawPathRef.current, null);
        syncMeasureData(map, measurePointsRef.current, null, measureRenderModeRef.current);
      } catch (error) {
        console.warn('[FibreAtlas] overlay layers failed to attach', error);
      }
      setStyleVersion((version) => version + 1);
      setReady(true);
    });

    map.on('load', () => {
      if (disposed) return;
      resizeMap();
      try {
        addNetworkLayers(map, darkLayersRef.current);
        syncLinkData(map, linksRef.current, selectedLinkRef.current);
        syncRouteData(map, linksRef.current, routeOverlayRef.current);
        syncDraftData(map, drawPathRef.current, null);
        syncMeasureData(map, measurePointsRef.current, null, measureRenderModeRef.current);
      } catch (error) {
        console.warn('[FibreAtlas] overlay layers failed to attach', error);
      }
      setReady(true);
    });

    map.on('error', (event) => {
      if (!disposed) console.warn('[FibreAtlas] map warning', event.error?.message ?? event);
    });

    // Remember the last view so it survives page refreshes.
    let saveThrottle: ReturnType<typeof setTimeout> | null = null;
    const onViewChange = () => {
      if (saveThrottle) clearTimeout(saveThrottle);
      saveThrottle = setTimeout(() => {
        const c = map.getCenter();
        const z = map.getZoom();
        saveView(c.lng, c.lat, z);
      }, 400);
    };
    map.on('moveend', onViewChange);
    map.on('zoomend', onViewChange);

    map.on('click', (event) => {
      if (measureModeRef.current !== 'none') {
        appendMeasureRef.current({ lng: event.lngLat.lng, lat: event.lngLat.lat });
        return;
      }
      if (modeRef.current === 'draw-link') {
        drawCallbacks.current.onDrawPoint?.({ lng: event.lngLat.lng, lat: event.lngLat.lat });
        return;
      }
      if (modeRef.current === 'connect') {
        drawCallbacks.current.onDrawPoint?.({ lng: event.lngLat.lng, lat: event.lngLat.lat });
        return;
      }
      if (modeRef.current === 'route') {
        callbacks.current.onMapClick({ lng: event.lngLat.lng, lat: event.lngLat.lat });
        return;
      }
      if (
        modeRef.current === 'add-tj' ||
        modeRef.current === 'add-cut-tj' ||
        modeRef.current === 'add-olt' ||
        modeRef.current === 'add-onu'
      ) {
        callbacks.current.onMapClick({ lng: event.lngLat.lng, lat: event.lngLat.lat });
        return;
      }
      const layers = map.getLayer('links-hit') ? ['links-hit'] : [];
      if (layers.length > 0) {
        const hits = map.queryRenderedFeatures(event.point, { layers });
        const id = hits[0]?.properties?.id;
        if (id) {
          callbacks.current.onSelectLink(String(id));
          return;
        }
      }
      callbacks.current.onBackgroundClick();
    });

    map.on('dblclick', () => {
      if (measureModeRef.current !== 'none') {
        measureCursorRef.current = null;
        setMeasureMode('none');
        return;
      }
      if (modeRef.current === 'draw-link') drawCallbacks.current.onFinishDraw?.();
    });

    // Grab a cable route and slide its drawn waypoints with the pointer. The
    // device endpoints stay fixed, so the span and its length change live.
    map.on('mousedown', (event) => {
      if (modeRef.current !== 'idle' || measureModeRef.current !== 'none') return;
      if (!canMoveRef.current) return;
      if (!map.getLayer('links-hit')) return;
      const hits = map.queryRenderedFeatures(event.point, { layers: ['links-hit'] });
      const id = hits[0]?.properties?.id;
      if (!id) return;
      const link = linksRef.current.find((item) => item.id === String(id));
      if (!link) return;
      const originalPath = (link.path ?? []).map((point) => ({
        lat: point.lat,
        lng: point.lng,
      }));
      linkDragRef.current = {
        id: link.id,
        start: { lng: event.lngLat.lng, lat: event.lngLat.lat },
        originalPath,
        currentPath: originalPath,
        moved: false,
      };
      map.dragPan.disable();
      map.getCanvas().style.cursor = 'grabbing';
    });

    const finishLinkDrag = () => {
      const drag = linkDragRef.current;
      if (!drag) return;
      linkDragRef.current = null;
      map.dragPan.enable();
      map.getCanvas().style.cursor = '';
      if (!drag.moved) {
        setLinkPathPreview(null);
        return;
      }
      setLinkPathPreview({ id: drag.id, path: drag.currentPath });
      moveCallbacks.current.onMoveLinkPath?.(drag.id, drag.currentPath);
      const settledPath = drag.currentPath;
      window.setTimeout(() => {
        setLinkPathPreview((current) =>
          current && current.id === drag.id && samePath(current.path, settledPath)
            ? null
            : current,
        );
      }, 8000);
    };
    window.addEventListener('mouseup', finishLinkDrag);

    let boxSelectStart: { x: number; y: number } | null = null;
    let boxSelectMoved = false;

    const handleBoxSelectMouseDown = (event: maplibregl.MapMouseEvent) => {
      const isSelectMode = modeRef.current === 'select';
      const isShift = event.originalEvent.shiftKey;
      if (!isSelectMode && !isShift) return;

      map.dragPan.disable();
      boxSelectStart = { x: event.point.x, y: event.point.y };
      boxSelectMoved = false;
    };
    map.on('mousedown', handleBoxSelectMouseDown);

    const finishBoxSelect = (event: MouseEvent) => {
      if (!boxSelectStart) return;
      const start = boxSelectStart;
      boxSelectStart = null;
      setSelectionBox(null);
      map.dragPan.enable();

      if (!boxSelectMoved) return;

      const rect = map.getContainer().getBoundingClientRect();
      const currentX = event.clientX - rect.left;
      const currentY = event.clientY - rect.top;

      const p1 = map.unproject([Math.min(start.x, currentX), Math.min(start.y, currentY)]);
      const p2 = map.unproject([Math.max(start.x, currentX), Math.max(start.y, currentY)]);
      const minLng = Math.min(p1.lng, p2.lng);
      const maxLng = Math.max(p1.lng, p2.lng);
      const minLat = Math.min(p1.lat, p2.lat);
      const maxLat = Math.max(p1.lat, p2.lat);

      const inside: Array<{ kind: DeviceKind; id: string }> = [];
      devicesRef.current.tjs.forEach((tj) => {
        if (tj.lat >= minLat && tj.lat <= maxLat && tj.lng >= minLng && tj.lng <= maxLng) {
          inside.push({ kind: 'tj', id: tj.id });
        }
      });
      devicesRef.current.olts.forEach((olt) => {
        if (olt.lat !== null && olt.lng !== null && olt.lat >= minLat && olt.lat <= maxLat && olt.lng >= minLng && olt.lng <= maxLng) {
          inside.push({ kind: 'olt', id: olt.id });
        }
      });
      devicesRef.current.onus.forEach((onu) => {
        if (onu.lat !== null && onu.lng !== null && onu.lat >= minLat && onu.lat <= maxLat && onu.lng >= minLng && onu.lng <= maxLng) {
          inside.push({ kind: 'onu', id: onu.id });
        }
      });

      if (inside.length > 0) {
        callbacks.current.onSelectDevicesInBox?.(inside, true);
      }
    };
    window.addEventListener('mouseup', finishBoxSelect);

    map.on('mousemove', (event) => {
      if (boxSelectStart) {
        const dx = Math.abs(event.point.x - boxSelectStart.x);
        const dy = Math.abs(event.point.y - boxSelectStart.y);
        if (dx > 4 || dy > 4) {
          boxSelectMoved = true;
          setSelectionBox({
            startX: boxSelectStart.x,
            startY: boxSelectStart.y,
            currentX: event.point.x,
            currentY: event.point.y,
          });
        }
        return;
      }
      const activeLinkDrag = linkDragRef.current;
      if (activeLinkDrag) {
        const link = linksRef.current.find((item) => item.id === activeLinkDrag.id);
        if (link) {
          const dLng = event.lngLat.lng - activeLinkDrag.start.lng;
          const dLat = event.lngLat.lat - activeLinkDrag.start.lat;
          const basePath = activeLinkDrag.originalPath.length
            ? activeLinkDrag.originalPath
            : [
                {
                  lat: (link.fromLat + link.toLat) / 2,
                  lng: (link.fromLng + link.toLng) / 2,
                },
              ];
          const movedPath = basePath.map((point) => ({
            lat: point.lat + dLat,
            lng: point.lng + dLng,
          }));
          activeLinkDrag.currentPath = movedPath;
          if (Math.abs(dLat) > 1e-9 || Math.abs(dLng) > 1e-9) activeLinkDrag.moved = true;
          if (activeLinkDrag.moved) {
            setLinkPathPreview({ id: activeLinkDrag.id, path: movedPath });
          }
        }
        map.getCanvas().style.cursor = 'grabbing';
        return;
      }
      if (measureModeRef.current !== 'none') {
        map.getCanvas().style.cursor = 'crosshair';
        measureCursorRef.current = { lng: event.lngLat.lng, lat: event.lngLat.lat };
        syncMeasureData(
          map,
          measurePointsRef.current,
          measureCursorRef.current,
          measureModeRef.current,
        );
        return;
      }
      if (modeRef.current === 'draw-link' || modeRef.current === 'connect') {
        map.getCanvas().style.cursor = 'crosshair';
        drawCursorRef.current = { lng: event.lngLat.lng, lat: event.lngLat.lat };
        if (drawPathRef.current.length > 0) {
          syncDraftData(map, drawPathRef.current, drawCursorRef.current);
        }
        return;
      }
      if (
        modeRef.current === 'add-tj' ||
        modeRef.current === 'add-cut-tj' ||
        modeRef.current === 'add-olt' ||
        modeRef.current === 'add-onu' ||
        modeRef.current === 'route'
      ) {
        map.getCanvas().style.cursor = 'crosshair';
        return;
      }
      const layers = map.getLayer('links-hit') ? ['links-hit'] : [];
      const hits = layers.length > 0 ? map.queryRenderedFeatures(event.point, { layers }) : [];
      map.getCanvas().style.cursor = hits.length > 0 ? 'pointer' : '';
    });

    const observer = new ResizeObserver(() => map.resize());
    observer.observe(containerRef.current);

    return () => {
      disposed = true;
      if (saveThrottle) clearTimeout(saveThrottle);
      window.removeEventListener('mouseup', finishLinkDrag);
      window.removeEventListener('mouseup', finishBoxSelect);
      map.off('mousedown', handleBoxSelectMouseDown);
      map.off('moveend', onViewChange);
      map.off('zoomend', onViewChange);
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resizeMap);
      observer.disconnect();
      markerRef.current.forEach((marker) => marker.remove());
      markerRef.current.clear();
      oltMarkerRef.current.forEach((marker) => marker.remove());
      oltMarkerRef.current.clear();
      onuMarkerRef.current.forEach((marker) => marker.remove());
      onuMarkerRef.current.clear();
      labelRef.current.forEach((marker) => marker.remove());
      labelRef.current.clear();
      bendMarkerRef.current.forEach((marker) => marker.remove());
      bendMarkerRef.current = [];
      routeMarkerRef.current.forEach((marker) => marker.remove());
      routeMarkerRef.current = [];
      measureVertexRef.current.forEach((marker) => marker.remove());
      measureVertexRef.current = [];
      measureLabelRef.current.forEach((marker) => marker.remove());
      measureLabelRef.current = [];
      mapRef.current = null;
      try {
        map.remove();
      } catch {
        // Map already torn down.
      }
      setReady(false);
    };
  }, []);

  const framedRef = useRef<{ map: maplibregl.Map; key: string } | null>(null);

  // Camera key: the area is framed once when its context resolves. Later data
  // changes never move the camera, so it stays where the user left it until they
  // pan or zoom — switching to another area changes the scope and reframes.
  const frameKey = cameraScope ?? 'default';
  frameKeyRef.current = frameKey;

  // Frame the selected area exactly: its own joints plus OLTs, then its recorded
  // extent, then its parent district — the country only when no area is selected.
  // A view saved for this same area wins instead, so a hard refresh lands on the
  // exact centre and zoom the user left rather than a recomputed fit.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !viewReady) return;
    if (framedRef.current?.map === map && framedRef.current.key === frameKey) return;
    framedRef.current = { map, key: frameKey };

    const saved = loadSavedView();
    if (saved && saved.scope === frameKey) return;

    if (initialBounds) {
      map.fitBounds(
        [
          [initialBounds.minLng, initialBounds.minLat],
          [initialBounds.maxLng, initialBounds.maxLat],
        ],
        {
          padding: { top: 80, bottom: 100, left: 70, right: 70 },
          maxZoom: 15.5,
          duration: 0,
        },
      );
    } else if (initialView) {
      map.jumpTo({ center: [initialView.lng, initialView.lat], zoom: initialView.zoom });
    } else {
      map.fitBounds(
        [
          [87.9, 20.7],
          [92.8, 26.9],
        ],
        { padding: { top: 70, bottom: 110, left: 70, right: 70 }, duration: 0 },
      );
    }
    const centre = map.getCenter();
    saveView(centre.lng, centre.lat, map.getZoom());
    // Deliberately keyed on the scope only: re-running on every data refresh would
    // yank a camera the user has moved. The first resolved extent wins per area.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, viewReady, frameKey]);

  // Animated camera move for explicit focus requests (search results).
  // Google Maps style fly: curves to the target, then map stays static unless user pans/zooms.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !focus) return;
    map.flyTo({
      center: [focus.lng, focus.lat],
      zoom: focus.zoom ?? 14,
      speed: 1.2,
      curve: 1.42,
      essential: true,
    });
  }, [focus, ready]);

  // Theme switching swaps OpenStreetMap basemaps without losing markers.
  useEffect(() => {
    const map = mapRef.current;
    const nextTheme = resolvedTheme === 'light' ? 'light' : 'dark';
    if (!map || !ready || appliedThemeRef.current === nextTheme) return;
    appliedThemeRef.current = nextTheme;
    darkLayersRef.current = nextTheme === 'dark';

    map.setStyle(getOsmStyle(nextTheme === 'dark'));
  }, [resolvedTheme, ready]);

  // Keep fibre data in sync with server state and live drag positions.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    syncLinkData(map, viewLinks, selectedLinkId);
  }, [viewLinks, selectedLinkId, ready, styleVersion]);

  // Route highlight and final-approach line.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    syncRouteData(map, viewLinks, routeOverlay);
  }, [viewLinks, routeOverlay, ready, styleVersion]);

  // Pins for free-point route endpoints.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    routeStartMarkerRef.current?.remove();
    routeStartMarkerRef.current = null;
    routeTargetMarkerRef.current?.remove();
    routeTargetMarkerRef.current = null;
    const addPin = (
      point: { lat: number; lng: number; label: string } | null,
      tone: string,
    ): maplibregl.Marker | null => {
      if (!point) return null;
      const element = document.createElement('div');
      element.className = `flex -translate-y-1 items-center gap-1 rounded-full border border-white/80 px-2 py-0.5 text-[9.5px] font-semibold text-slate-950 shadow-[0_10px_24px_-10px_rgba(15,23,42,0.55)] ${tone}`;
      element.innerHTML = `<span class="size-1.5 rounded-full bg-slate-950"></span>${escapeHtml(point.label)}`;
      return new maplibregl.Marker({ element, anchor: 'bottom' })
        .setLngLat([point.lng, point.lat])
        .addTo(map);
    };
    routeStartMarkerRef.current = addPin(routeOverlay?.start ?? null, 'bg-emerald-400');
    routeTargetMarkerRef.current = addPin(routeOverlay?.target ?? null, 'bg-amber-500');
  }, [
    routeOverlay?.start?.lat,
    routeOverlay?.start?.lng,
    routeOverlay?.start?.label,
    routeOverlay?.target?.lat,
    routeOverlay?.target?.lng,
    routeOverlay?.target?.label,
    ready,
  ]);

  // Frame a freshly computed route.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !routeOverlay) return;
    const bounds = new maplibregl.LngLatBounds();
    const extend = (lng: number, lat: number) => bounds.extend([lng, lat]);
    routeOverlay.linkIds.forEach((id) => {
      const link = viewLinks.find((item) => item.id === id);
      if (!link) return;
      extend(link.fromLng, link.fromLat);
      extend(link.toLng, link.toLat);
      (link.path ?? []).forEach((point) => extend(point.lng, point.lat));
    });
    // Street detours can be far longer than the cable path; only frame them when
    // there is no cable span between the two snapped nodes.
    if (routeOverlay.linkIds.length === 0) {
      routeOverlay.drops.forEach((drop) => drop.coordinates.forEach(([lng, lat]) => extend(lng, lat)));
    }
    if (routeOverlay.start) extend(routeOverlay.start.lng, routeOverlay.start.lat);
    if (routeOverlay.target) extend(routeOverlay.target.lng, routeOverlay.target.lat);
    if (bounds.isEmpty()) return;
    // Frame the path, then ease in past the fit so short spans read clearly.
    const wide = window.innerWidth >= 768;
    const padding = wide
      ? { top: 60, bottom: 80, left: 80, right: 420 }
      : { top: 60, bottom: 80, left: 40, right: 40 };
    const camera = map.cameraForBounds(bounds, { padding, maxZoom: 20 });
    if (camera) {
      map.easeTo({
        center: camera.center,
        zoom: Math.min((camera.zoom ?? map.getZoom()) + 0.2, map.getMaxZoom()),
        duration: 650,
      });
    } else {
      map.fitBounds(bounds, { padding, maxZoom: 20, duration: 650 });
    }
    // `routeOverlay.signature` changes when the path, endpoints or street legs change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeOverlay?.signature, ready]);

  // Draft route being drawn in the link dialog.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const drawing = mode === 'draw-link' || mode === 'connect';
    syncDraftData(map, drawing ? drawPath : [], drawing ? drawCursorRef.current : null);
  }, [drawPath, mode, ready, styleVersion]);

  // Draggable waypoint dots while drawing.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    routeMarkerRef.current.forEach((marker) => marker.remove());
    routeMarkerRef.current = [];
    if (mode !== 'draw-link' && mode !== 'connect') return;

    drawPath.forEach((point, index) => {
      const element = document.createElement('button');
      element.type = 'button';
      element.className = 'route-vertex';
      element.title = `Bend ${index + 1} — drag to move`;
      element.setAttribute('aria-label', `Route bend ${index + 1}`);
      Object.assign(element.style, {
        width: '12px',
        height: '12px',
        borderRadius: '9999px',
        background: '#67e8f9',
        border: '2px solid #0b1220',
        boxShadow: '0 0 0 2px rgba(103,232,249,0.35)',
        cursor: 'grab',
      });

      const marker = new maplibregl.Marker({ element, anchor: 'center', draggable: true })
        .setLngLat([point.lng, point.lat])
        .addTo(map);
      marker.on('dragend', () => {
        const position = marker.getLngLat();
        drawCallbacks.current.onMoveDrawPoint?.(index, {
          lat: position.lat,
          lng: position.lng,
        });
      });
      routeMarkerRef.current.push(marker);
    });
  }, [drawPath, mode, ready, styleVersion]);

  // Measurement overlay follows the click path and the live cursor preview.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    syncMeasureData(
      map,
      measurePoints,
      measureMode === 'none' ? null : measureCursorRef.current,
      measureRenderMode,
    );
  }, [measurePoints, measureMode, measureRenderMode, ready, styleVersion]);

  // Measure dots and per-segment distances.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    measureVertexRef.current.forEach((marker) => marker.remove());
    measureVertexRef.current = [];
    measureLabelRef.current.forEach((marker) => marker.remove());
    measureLabelRef.current = [];
    if (measurePoints.length === 0) return;

    const dark = resolvedTheme !== 'light';
    const vertexColor = dark ? '#67e8f9' : '#111827';
    const vertexBorder = dark ? '#0b1220' : '#ffffff';

    measurePoints.forEach((point, index) => {
      const element = document.createElement('button');
      element.type = 'button';
      element.className = 'measure-vertex';
      element.setAttribute('aria-label', `Measure point ${index + 1}`);
      Object.assign(element.style, {
        width: '10px',
        height: '10px',
        borderRadius: '9999px',
        background: vertexColor,
        border: `2px solid ${vertexBorder}`,
        boxShadow: '0 1px 3px rgba(2,6,23,0.35)',
        cursor: measureMode === 'none' ? 'default' : 'grab',
      });

      const marker = new maplibregl.Marker({
        element,
        anchor: 'center',
        draggable: measureMode !== 'none',
      })
        .setLngLat([point.lng, point.lat])
        .addTo(map);
      marker.on('dragend', () => {
        const position = marker.getLngLat();
        setMeasurePoints((current) =>
          current.map((item, i) =>
            i === index ? { lat: position.lat, lng: position.lng } : item,
          ),
        );
      });
      measureVertexRef.current.push(marker);
    });

    if (measureKind === 'distance' && measurePoints.length >= 2) {
      for (let index = 1; index < measurePoints.length; index += 1) {
        const from = measurePoints[index - 1];
        const to = measurePoints[index];
        const element = document.createElement('div');
        element.textContent = formatDistance(
          haversineMeters(from.lat, from.lng, to.lat, to.lng),
        );
        Object.assign(element.style, {
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: '9px',
          padding: '2px 5px',
          borderRadius: '5px',
          color: dark ? '#e2e8f0' : '#0f172a',
          background: dark ? 'rgba(7,11,20,0.82)' : 'rgba(255,255,255,0.92)',
          border: `1px solid ${dark ? 'rgba(255,255,255,0.1)' : 'rgba(15,23,42,0.12)'}`,
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
        });
        const marker = new maplibregl.Marker({ element, anchor: 'center' })
          .setLngLat([(from.lng + to.lng) / 2, (from.lat + to.lat) / 2])
          .addTo(map);
        measureLabelRef.current.push(marker);
      }
    }
  }, [measurePoints, measureKind, measureMode, ready, styleVersion, resolvedTheme]);

  // Starting another map tool ends any measurement in progress.
  useEffect(() => {
    if (mode === 'idle') return;
    measureCursorRef.current = null;
    setMeasureMode('none');
    setMeasureKind(null);
    setMeasurePoints([]);
  }, [mode]);

  // Escape finishes the current measurement (its result stays on the map).
  useEffect(() => {
    if (measureMode === 'none') return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      measureCursorRef.current = null;
      setMeasureMode('none');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [measureMode]);

  // Double-click finishes the route or measurement instead of zooming.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (mode === 'draw-link' || measureMode !== 'none') map.doubleClickZoom.disable();
    else map.doubleClickZoom.enable();
  }, [mode, measureMode, ready]);

  // Sync joint markers.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const live = new Set(tjs.map((tj) => tj.id));
    markerRef.current.forEach((marker, id) => {
      if (!live.has(id)) {
        marker.remove();
        markerRef.current.delete(id);
      }
    });

    tjs.forEach((tj) => {
      let marker = markerRef.current.get(tj.id);
      if (!marker) {
        let dragged = false;
        const element = document.createElement('button');
        element.type = 'button';
        element.className = 'tj-marker';
        element.setAttribute('aria-label', `${tj.code}${tj.name ? ` — ${tj.name}` : ''}`);
        element.innerHTML = buildMarkerContent(tj);
        element.addEventListener('click', (event) => {
          event.stopPropagation();
          if (dragged) return;
          if (event.shiftKey || modeRef.current === 'select') {
            callbacks.current.onToggleSelectDevice?.({ kind: 'tj', id: tj.id });
            return;
          }
          const position = marker?.getLngLat();
          const point = position
            ? { lat: position.lat, lng: position.lng }
            : { lat: tj.lat, lng: tj.lng };
          if (measureModeRef.current !== 'none') {
            appendMeasureRef.current(point);
            return;
          }
          if (modeRef.current === 'draw-link') {
            drawCallbacks.current.onDrawPoint?.(point);
            return;
          }
          if (modeRef.current === 'connect') {
            callbacks.current.onConnectDevice?.({ kind: 'tj', id: tj.id });
            return;
          }
          if (modeRef.current === 'route') {
            callbacks.current.onRouteDevice?.({ kind: 'tj', id: tj.id });
            return;
          }
          callbacks.current.onSelectTj(tj.id);
        });

        const created = new maplibregl.Marker({
          element,
          anchor: 'center',
          draggable: canDragDevice,
        })
          .setLngLat([tj.lng, tj.lat])
          .addTo(map);
        created.on('dragstart', () => {
          dragged = true;
        });
        created.on('drag', () => {
          const position = created.getLngLat();
          setDragging({ kind: 'tj', id: tj.id, lat: position.lat, lng: position.lng });
        });
        created.on('dragend', () => {
          const position = created.getLngLat();
          setDragging({ kind: 'tj', id: tj.id, lat: position.lat, lng: position.lng });
          moveCallbacks.current.onMoveDevice?.({
            kind: 'tj',
            id: tj.id,
            lat: position.lat,
            lng: position.lng,
          });
          window.setTimeout(() => {
            dragged = false;
          }, 250);
          // If the save fails the overlay must not keep the link lines at a
          // position the device never reached.
          window.setTimeout(() => {
            setDragging((current) =>
              current &&
              current.kind === 'tj' &&
              current.id === tj.id &&
              Math.abs(current.lat - position.lat) < 1e-9 &&
              Math.abs(current.lng - position.lng) < 1e-9
                ? null
                : current,
            );
          }, 8000);
        });
        marker = created;
        markerRef.current.set(tj.id, marker);
      } else {
        marker.setLngLat([tj.lng, tj.lat]);
      }
      (marker as unknown as { setDraggable?: (value: boolean) => void }).setDraggable?.(
        canDragDevice,
      );

      const element = marker.getElement();
      const isCut = tj.isCut || tj.tjType === 'cut';
      const isPon = tj.tjType === 'pon_power';
      // Keep MapLibre's own positioning classes: replacing className drops them and
      // leaves the pin off its coordinate, away from the cable ends.
      element.classList.add('tj-marker');
      element.classList.toggle('is-cut', isCut);
      element.classList.toggle('is-pon', isPon);
      element.style.setProperty('--core-color', primaryCore(tj.cores));
      element.innerHTML = buildMarkerContent(tj);
      const isMulti = selectedDeviceIds?.has(tj.id) ?? false;
      element.classList.toggle('is-multi-selected', isMulti);
      element.classList.toggle('is-selected', tj.id === selectedTjId || isMulti);
      element.style.zIndex = isMulti ? '10' : tj.id === selectedTjId ? '6' : '';
    });
  }, [tjs, selectedTjId, selectedDeviceIds, ready, styleVersion, canDragDevice]);

  // Sync OLT cabinet markers.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

        const live = new Set(olts.map((olt) => olt.id));
    oltMarkerRef.current.forEach((marker, id) => {
      if (!live.has(id)) {
        marker.remove();
        oltMarkerRef.current.delete(id);
      }
    });

    olts.forEach((olt) => {
      if (olt.lat === null || olt.lng === null) return;
      let marker = oltMarkerRef.current.get(olt.id);
      if (!marker) {
        let dragged = false;
        const element = document.createElement('button');
        element.type = 'button';
        element.className = 'olt-marker';
        element.setAttribute('aria-label', `${olt.code} — ${olt.name}`);
        element.innerHTML = buildOltMarkerContent(olt);
        element.addEventListener('click', (event) => {
          event.stopPropagation();
          if (dragged) return;
          if (event.shiftKey || modeRef.current === 'select') {
            callbacks.current.onToggleSelectDevice?.({ kind: 'olt', id: olt.id });
            return;
          }
          const position = marker?.getLngLat();
          const point = position
            ? { lat: position.lat, lng: position.lng }
            : { lat: olt.lat!, lng: olt.lng! };
          if (measureModeRef.current !== 'none') {
            appendMeasureRef.current(point);
            return;
          }
          if (modeRef.current === 'draw-link') {
            drawCallbacks.current.onDrawPoint?.(point);
            return;
          }
          if (modeRef.current === 'connect') {
            callbacks.current.onConnectDevice?.({ kind: 'olt', id: olt.id });
            return;
          }
          if (modeRef.current === 'route') {
            callbacks.current.onRouteDevice?.({ kind: 'olt', id: olt.id });
            return;
          }
          callbacks.current.onSelectOlt(olt.id);
        });

        const created = new maplibregl.Marker({
          element,
          anchor: 'center',
          draggable: canDragDevice,
        })
          .setLngLat([olt.lng, olt.lat])
          .addTo(map);
        created.on('dragstart', () => {
          dragged = true;
        });
        created.on('drag', () => {
          const position = created.getLngLat();
          setDragging({ kind: 'olt', id: olt.id, lat: position.lat, lng: position.lng });
        });
        created.on('dragend', () => {
          const position = created.getLngLat();
          setDragging({ kind: 'olt', id: olt.id, lat: position.lat, lng: position.lng });
          moveCallbacks.current.onMoveDevice?.({
            kind: 'olt',
            id: olt.id,
            lat: position.lat,
            lng: position.lng,
          });
          window.setTimeout(() => {
            dragged = false;
          }, 250);
          window.setTimeout(() => {
            setDragging((current) =>
              current &&
              current.kind === 'olt' &&
              current.id === olt.id &&
              Math.abs(current.lat - position.lat) < 1e-9 &&
              Math.abs(current.lng - position.lng) < 1e-9
                ? null
                : current,
            );
          }, 8000);
        });
        marker = created;
        oltMarkerRef.current.set(olt.id, marker);
      } else {
        marker.setLngLat([olt.lng, olt.lat]);
      }
      (marker as unknown as { setDraggable?: (value: boolean) => void }).setDraggable?.(
        canDragDevice,
      );

      const element = marker.getElement();
      element.innerHTML = buildOltMarkerContent(olt);
      element.setAttribute('aria-label', `${olt.code} — ${olt.name}`);
      const isMulti = selectedDeviceIds?.has(olt.id) ?? false;
      element.classList.toggle('is-multi-selected', isMulti);
      element.classList.toggle('is-selected', olt.id === selectedOltId || isMulti);
      element.style.zIndex = isMulti ? '10' : olt.id === selectedOltId ? '6' : '';
    });
  }, [olts, selectedOltId, selectedDeviceIds, ready, styleVersion, canDragDevice]);

  // Sync ONU markers.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

        const live = new Set(onus.map((onu) => onu.id));
    onuMarkerRef.current.forEach((marker, id) => {
      if (!live.has(id)) {
        marker.remove();
        onuMarkerRef.current.delete(id);
      }
    });

    onus.forEach((onu) => {
      if (onu.lat === null || onu.lng === null) return;
      let marker = onuMarkerRef.current.get(onu.id);
      if (!marker) {
        let dragged = false;
        const element = document.createElement('button');
        element.type = 'button';
        element.className = 'onu-marker';
        element.setAttribute(
          'aria-label',
          `ONU ${onu.username}${onu.fibreId ? ` — ${onu.fibreId}` : ''}`,
        );
        element.innerHTML = buildOnuMarkerContent(onu);
        element.addEventListener('click', (event) => {
          event.stopPropagation();
          if (dragged) return;
          if (event.shiftKey || modeRef.current === 'select') {
            callbacks.current.onToggleSelectDevice?.({ kind: 'onu', id: onu.id });
            return;
          }
          const position = marker?.getLngLat();
          const point = position
            ? { lat: position.lat, lng: position.lng }
            : { lat: onu.lat!, lng: onu.lng! };
          if (measureModeRef.current !== 'none') {
            appendMeasureRef.current(point);
            return;
          }
          if (modeRef.current === 'draw-link') {
            drawCallbacks.current.onDrawPoint?.(point);
            return;
          }
          if (modeRef.current === 'connect') {
            callbacks.current.onConnectDevice?.({ kind: 'onu', id: onu.id });
            return;
          }
          if (modeRef.current === 'route') {
            callbacks.current.onRouteDevice?.({ kind: 'onu', id: onu.id });
            return;
          }
          callbacks.current.onSelectOnu?.(onu.id);
        });

        const created = new maplibregl.Marker({
          element,
          anchor: 'center',
          draggable: canDragDevice,
        })
          .setLngLat([onu.lng, onu.lat])
          .addTo(map);
        created.on('dragstart', () => {
          dragged = true;
        });
        created.on('drag', () => {
          const position = created.getLngLat();
          setDragging({ kind: 'onu', id: onu.id, lat: position.lat, lng: position.lng });
        });
        created.on('dragend', () => {
          const position = created.getLngLat();
          setDragging({ kind: 'onu', id: onu.id, lat: position.lat, lng: position.lng });
          moveCallbacks.current.onMoveDevice?.({
            kind: 'onu',
            id: onu.id,
            lat: position.lat,
            lng: position.lng,
          });
          window.setTimeout(() => {
            dragged = false;
          }, 250);
          window.setTimeout(() => {
            setDragging((current) =>
              current &&
              current.kind === 'onu' &&
              current.id === onu.id &&
              Math.abs(current.lat - position.lat) < 1e-9 &&
              Math.abs(current.lng - position.lng) < 1e-9
                ? null
                : current,
            );
          }, 8000);
        });
        marker = created;
        onuMarkerRef.current.set(onu.id, marker);
      } else {
        marker.setLngLat([onu.lng, onu.lat]);
      }
      (marker as unknown as { setDraggable?: (value: boolean) => void }).setDraggable?.(
        canDragDevice,
      );

      const element = marker.getElement();
      element.innerHTML = buildOnuMarkerContent(onu);
      element.setAttribute(
        'aria-label',
        `ONU ${onu.username}${onu.fibreId ? ` — ${onu.fibreId}` : ''}`,
      );
      const isMulti = selectedDeviceIds?.has(onu.id) ?? false;
      element.classList.toggle('is-multi-selected', isMulti);
      element.classList.toggle('is-selected', onu.id === selectedOnuId || isMulti);
      element.style.zIndex = isMulti ? '10' : onu.id === selectedOnuId ? '6' : '';
    });
  }, [onus, selectedOnuId, selectedDeviceIds, ready, styleVersion, canDragDevice]);

  // Mid-span fibre labels. Markers are reused so dragging only moves them and
  // updates the live distance instead of rebuilding the overlay every frame.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    const live = new Set(viewLinks.map((link) => link.id));
    labelRef.current.forEach((marker, id) => {
      if (!live.has(id)) {
        marker.remove();
        labelRef.current.delete(id);
      }
    });

    const visible = map.getZoom() >= 8.6;
    const lanes = linkParallelLanes(viewLinks);
    viewLinks.forEach((link) => {
      const movedWithDrag = Boolean(
        (dragging &&
          ((dragging.kind === 'tj' &&
            (link.fromTjId === dragging.id || link.toTjId === dragging.id)) ||
            (dragging.kind === 'olt' &&
              (link.fromOltId === dragging.id || link.toOltId === dragging.id)) ||
            (dragging.kind === 'onu' &&
              (link.fromOnuId === dragging.id || link.toOnuId === dragging.id)))) ||
          linkPathPreview?.id === link.id,
      );

      let marker = labelRef.current.get(link.id);
      if (!marker) {
        const element = document.createElement('button');
        element.type = 'button';
        element.className = 'link-label';
        element.setAttribute('aria-label', `Fibre link ${link.fibreId}`);
        element.addEventListener('click', (event) => {
          event.stopPropagation();
          callbacks.current.onSelectLink(link.id);
        });
        marker = new maplibregl.Marker({ element, anchor: 'center' })
          .setLngLat(
            routeMidpoint(link.fromLat, link.fromLng, link.toLat, link.toLng, link.path),
          )
          .addTo(map);
        labelRef.current.set(link.id, marker);
      }

      marker.setLngLat(
        routeMidpoint(link.fromLat, link.fromLng, link.toLat, link.toLng, link.path),
      );
      // Keep the label beside its own line when several share one device pair,
      // and slide it along the route so the fibre IDs do not stack.
      const lane = lanes.get(link.id);
      if (lane && (lane.offset !== 0 || lane.stagger !== 0)) {
        const fromPoint = map.project([link.fromLng, link.fromLat]);
        const toPoint = map.project([link.toLng, link.toLat]);
        const dx = toPoint.x - fromPoint.x;
        const dy = toPoint.y - fromPoint.y;
        const length = Math.hypot(dx, dy) || 1;
        const ux = dx / length;
        const uy = dy / length;
        marker.setOffset([
          -uy * lane.offset + ux * lane.stagger,
          ux * lane.offset + uy * lane.stagger,
        ]);
      } else {
        marker.setOffset([0, 0]);
      }
      const element = marker.getElement();
      element.dataset.status = link.status;
      element.textContent = movedWithDrag
        ? `${link.fibreId} · ${formatDistance(link.lengthM)}`
        : link.fibreId;
      element.style.display = visible ? '' : 'none';
    });

    const applyZoomVisibility = () => {
      const show = map.getZoom() >= 8.6;
      labelRef.current.forEach((marker) => {
        marker.getElement().style.display = show ? '' : 'none';
      });
    };
    map.on('zoom', applyZoomVisibility);

    return () => {
      map.off('zoom', applyZoomVisibility);
    };
  }, [viewLinks, ready, styleVersion, dragging, linkPathPreview]);

  // Google-Maps-style bend editing for the selected link: drag a solid handle to
  // move an existing bend, or drag a midpoint handle to add a new bend.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    bendMarkerRef.current.forEach((marker) => marker.remove());
    bendMarkerRef.current = [];
    if (!selectedLinkId || !canDragDevice || dragging) return;
    const link = links.find((item) => item.id === selectedLinkId);
    if (!link) return;

    const savedPath = link.path ?? [];
    const route = [
      { lat: link.fromLat, lng: link.fromLng },
      ...savedPath,
      { lat: link.toLat, lng: link.toLng },
    ];

    const makeHandle = (ghost: boolean) => {
      const element = document.createElement('div');
      element.style.cssText = [
        `width:${ghost ? 10 : 13}px`,
        `height:${ghost ? 10 : 13}px`,
        'border-radius:9999px',
        `background:${ghost ? 'rgba(34,211,238,0.55)' : '#ffffff'}`,
        'border:2px solid #06b6d4',
        'box-shadow:0 1px 4px rgba(2,6,23,0.45)',
        'cursor:grab',
        ghost ? 'opacity:0.85' : '',
      ].join(';');
      element.title = ghost ? 'Drag to add a bend' : 'Drag to move this bend';
      return element;
    };

    savedPath.forEach((point, index) => {
      const marker = new maplibregl.Marker({
        element: makeHandle(false),
        anchor: 'center',
        draggable: true,
      })
        .setLngLat([point.lng, point.lat])
        .addTo(map);

      const pathWithPoint = (lat: number, lng: number) =>
        savedPath.map((item, itemIndex) =>
          itemIndex === index ? { lat, lng } : { lat: item.lat, lng: item.lng },
        );

      marker.on('drag', () => {
        const position = marker.getLngLat();
        setLinkPathPreview({
          id: link.id,
          path: pathWithPoint(position.lat, position.lng),
        });
      });
      marker.on('dragend', () => {
        const position = marker.getLngLat();
        const path = pathWithPoint(position.lat, position.lng);
        setLinkPathPreview({ id: link.id, path });
        moveCallbacks.current.onMoveLinkPath?.(link.id, path);
      });
      bendMarkerRef.current.push(marker);
    });

    // A drag from a midpoint inserts one new bend for that segment.
    for (let segment = 0; segment < route.length - 1; segment += 1) {
      const start = route[segment];
      const end = route[segment + 1];
      const marker = new maplibregl.Marker({
        element: makeHandle(true),
        anchor: 'center',
        draggable: true,
      })
        .setLngLat([(start.lng + end.lng) / 2, (start.lat + end.lat) / 2])
        .addTo(map);

      const pathWithInsertedBend = (lat: number, lng: number) => {
        const next = savedPath.map((item) => ({ lat: item.lat, lng: item.lng }));
        next.splice(segment, 0, { lat, lng });
        return next;
      };

      marker.on('drag', () => {
        const position = marker.getLngLat();
        setLinkPathPreview({
          id: link.id,
          path: pathWithInsertedBend(position.lat, position.lng),
        });
      });
      marker.on('dragend', () => {
        const position = marker.getLngLat();
        const path = pathWithInsertedBend(position.lat, position.lng);
        setLinkPathPreview({ id: link.id, path });
        moveCallbacks.current.onMoveLinkPath?.(link.id, path);
      });
      bendMarkerRef.current.push(marker);
    }
  }, [selectedLinkId, links, ready, styleVersion, canDragDevice, dragging]);

  // Travelling light along active spans.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    let frame = 0;
    const interval = window.setInterval(() => {
      if (!map.getLayer('links-flow')) return;
      frame = (frame + 1) % DASH_FRAMES.length;
      map.setPaintProperty('links-flow', 'line-dasharray', DASH_FRAMES[frame]);
    }, 150);
    return () => window.clearInterval(interval);
  }, [ready, styleVersion]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.getCanvas().style.cursor =
      mode === 'add-tj' ||
      mode === 'add-cut-tj' ||
      mode === 'add-olt' ||
      mode === 'add-onu' ||
      mode === 'draw-link' ||
      mode === 'route' ||
      mode === 'select' ||
      measureMode !== 'none'
        ? 'crosshair'
        : '';
  }, [mode, measureMode, ready]);

  // Google Maps style location search pin marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    if (pinnedMarkerRef.current) {
      pinnedMarkerRef.current.remove();
      pinnedMarkerRef.current = null;
    }

    if (!pinnedLocation) return;

    const el = document.createElement('div');
    el.className = cn(
      'location-pin-container',
      pinnedLocation.pinOnly && 'location-pin-container--pin-only',
    );

    if (pinnedLocation.pinOnly) {
      el.innerHTML = `
        <div class="location-pin-pulse"></div>
        <div class="location-pin-marker" title="${escapeHtml(pinnedLocation.title)}" style="cursor: pointer;">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
            <circle cx="12" cy="10" r="3"/>
          </svg>
        </div>
      `;

      const pinMarker = el.querySelector('.location-pin-marker');
      pinMarker?.addEventListener('click', (e) => {
        e.stopPropagation();
        onClearPinnedLocation?.();
      });
    } else {
      el.innerHTML = `
        <div class="location-pin-pulse"></div>
        <div class="location-pin-marker" title="${escapeHtml(pinnedLocation.title)}">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
            <circle cx="12" cy="10" r="3"/>
          </svg>
        </div>
        <div class="location-pin-card">
          <div class="location-pin-card__header">
            <div class="location-pin-card__title">${escapeHtml(pinnedLocation.title)}</div>
            <button type="button" class="location-pin-card__close" aria-label="Dismiss pin" title="Dismiss pin">✕</button>
          </div>
          ${
            pinnedLocation.subtitle
              ? `<div class="location-pin-card__subtitle">${escapeHtml(pinnedLocation.subtitle)}</div>`
              : ''
          }
          <div class="location-pin-card__coords">${pinnedLocation.lat.toFixed(5)}° N, ${pinnedLocation.lng.toFixed(5)}° E</div>
          <div class="location-pin-card__actions">
            <button type="button" class="location-pin-card__btn-add location-pin-card__btn-add-tj">
              + Add TJ Here
            </button>
            <button type="button" class="location-pin-card__btn-add location-pin-card__btn-add-olt">
              + Add OLT Here
            </button>
            <button type="button" class="location-pin-card__btn-add location-pin-card__btn-add-onu">
              + Add ONU Here
            </button>
          </div>
        </div>
      `;

      const closeBtn = el.querySelector('.location-pin-card__close');
      closeBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        onClearPinnedLocation?.();
      });

      const addTjBtn = el.querySelector('.location-pin-card__btn-add-tj');
      addTjBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        onAddTjAtPinnedLocation?.({
          lat: pinnedLocation.lat,
          lng: pinnedLocation.lng,
          address: pinnedLocation.title,
        });
      });

      const addOltBtn = el.querySelector('.location-pin-card__btn-add-olt');
      addOltBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        onAddOltAtPinnedLocation?.({
          lat: pinnedLocation.lat,
          lng: pinnedLocation.lng,
          address: pinnedLocation.title,
        });
      });

      const addOnuBtn = el.querySelector('.location-pin-card__btn-add-onu');
      addOnuBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        onAddOnuAtPinnedLocation?.({
          lat: pinnedLocation.lat,
          lng: pinnedLocation.lng,
          address: pinnedLocation.title,
        });
      });
    }

    const marker = new maplibregl.Marker({
      element: el,
      anchor: 'bottom',
    })
      .setLngLat([pinnedLocation.lng, pinnedLocation.lat])
      .addTo(map);

    pinnedMarkerRef.current = marker;

    return () => {
      marker.remove();
      pinnedMarkerRef.current = null;
    };
  }, [pinnedLocation, ready, onClearPinnedLocation, onAddTjAtPinnedLocation, onAddOltAtPinnedLocation, onAddOnuAtPinnedLocation]);

  // Keep the connection tool's port popover pinned to its device while the map moves.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !connectTarget || connectTarget.lat == null || connectTarget.lng == null) {
      setConnectAnchor(null);
      return;
    }
    const targetLng = connectTarget.lng;
    const targetLat = connectTarget.lat;
    const place = () => {
      const point = map.project([targetLng, targetLat]);
      const width = containerRef.current?.clientWidth ?? 800;
      setConnectAnchor({
        x: Math.min(Math.max(point.x, 132), Math.max(132, width - 132)),
        y: point.y,
      });
    };
    place();
    map.on('move', place);
    map.on('zoom', place);
    map.on('resize', place);
    return () => {
      map.off('move', place);
      map.off('zoom', place);
      map.off('resize', place);
    };
  }, [connectTarget, ready]);

  return (
    <div className="map-frame">
      <div ref={containerRef} className="absolute inset-0" />
      {connectTarget ? (
        <div
          className="absolute z-30 w-[252px]"
          style={
            connectAnchor
              ? {
                  left: connectAnchor.x,
                  top: Math.max(8, connectAnchor.y - 16),
                  transform: 'translate(-50%, -100%)',
                }
              : { left: '50%', top: 88, transform: 'translateX(-50%)' }
          }
        >
          <div className="overflow-hidden rounded-2xl border border-white/60 bg-background/95 shadow-2xl backdrop-blur dark:border-white/10">
            <div className="flex items-center gap-2 border-b border-border/60 px-2.5 py-2">
              <span className="grid size-6 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary">
                <Cable className="size-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-[11px] font-semibold">{connectTarget.code}</p>
                <p className="text-[8.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  {connectTarget.kind.toUpperCase()} · pick a port
                </p>
              </div>
              <button
                type="button"
                aria-label="Close port picker"
                onClick={() => onCancelConnectTarget?.()}
                className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            </div>
            <div className="max-h-64 overflow-y-auto p-1">
              {connectPorts.length === 0 ? (
                <p className="px-2 py-3 text-center text-[10.5px] text-muted-foreground">
                  This device has no ports to patch.
                </p>
              ) : (
                connectPortGroups.map((group, groupIndex) => (
                  <div key={group.name ?? `ports-${groupIndex}`}>
                    {group.name ? (
                      <p className="px-2 pb-0.5 pt-1.5 text-[8px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        {group.name}
                      </p>
                    ) : null}
                    {group.ports.map((port, portIndex) => (
                      <button
                        key={`${group.name ?? `ports-${groupIndex}`}-${portIndex}`}
                        type="button"
                        aria-label={`${connectTarget.code} port ${port.name ?? port.label}`}
                        disabled={port.used}
                        onClick={() => onPickConnectPort?.(port.label)}
                        className={cn(
                          'flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left transition',
                          port.used
                            ? 'cursor-not-allowed opacity-45'
                            : 'hover:bg-primary/10',
                        )}
                      >
                        <span
                          className={cn(
                            'inline-block size-2.5 shrink-0 rounded-full border border-white/70 dark:border-slate-900',
                            !port.color && 'border-dashed border-muted-foreground/50 bg-transparent',
                          )}
                          style={port.color ? { backgroundColor: port.color } : undefined}
                        />
                        <span
                          className="min-w-0 flex-1 truncate font-mono text-[10.5px] font-semibold"
                          title={port.name && port.name !== port.label ? `Port ${port.label}` : undefined}
                        >
                          {port.name ?? port.label}
                        </span>
                        <span className="max-w-[86px] truncate text-[8.5px] text-muted-foreground">
                          {port.hint}
                        </span>
                        <span
                          className={cn(
                            'shrink-0 rounded px-1 py-0.5 text-[8px] font-semibold uppercase tracking-wide',
                            port.used
                              ? 'bg-rose-500/15 text-rose-600 dark:text-rose-300'
                              : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
                          )}
                        >
                          {port.used ? 'in use' : 'free'}
                        </span>
                      </button>
                    ))}
                  </div>
                ))
              )}
            </div>
            <div className="border-t border-border/60 px-2.5 py-1.5 text-[8.5px] text-muted-foreground">
              Occupied ports stay disabled · Esc cancels
            </div>
          </div>
        </div>
      ) : null}
      {ready && mode !== 'draw-link' && mode !== 'connect' ? (
        <MeasurePanel
          mode={measureMode}
          kind={measureKind}
          points={measurePoints.length}
          distanceM={measureDistance}
          areaM2={measureArea}
          perimeterM={measurePerimeter}
          onStart={startMeasure}
          onUndo={undoMeasure}
          onClear={clearMeasure}
        />
      ) : null}
      {selectionBox ? (
        <div
          className="pointer-events-none absolute z-30 rounded border-2 border-dashed border-rose-500 bg-rose-500/20 backdrop-blur-[0.5px]"
          style={{
            left: Math.min(selectionBox.startX, selectionBox.currentX),
            top: Math.min(selectionBox.startY, selectionBox.currentY),
            width: Math.abs(selectionBox.currentX - selectionBox.startX),
            height: Math.abs(selectionBox.currentY - selectionBox.startY),
          }}
        />
      ) : null}
      {!ready ? (
        <div className="pointer-events-none absolute inset-0 z-[3] grid place-items-center bg-background/70 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <span className="relative grid size-12 place-items-center rounded-2xl border border-primary/20 bg-primary/10">
              <Loader2 className="size-5 animate-spin text-primary" />
            </span>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em]">
              Rendering national network…
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
