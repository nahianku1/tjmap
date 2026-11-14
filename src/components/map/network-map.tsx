'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import type { StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useTheme } from 'next-themes';
import { Loader2 } from 'lucide-react';
import type { FibreLink, LinkPathPoint, Olt, Onu, Tj } from '@/lib/types';
import { formatDistance, primaryCore } from '@/lib/utils';
import {
  haversineMeters,
  pathLengthMeters,
  polygonAreaM2,
  polygonPerimeterMeters,
  routeCoordinates,
  routeMidpoint,
} from '@/lib/route';
import {
  MeasurePanel,
  type MeasureKind,
  type MeasureMode,
} from '@/components/map/measure-panel';
import { OLT_PHOTO, tjPhoto } from '@/lib/photos';

export type MapMode = 'idle' | 'add-tj' | 'add-cut-tj' | 'add-olt' | 'add-onu' | 'draw-link';

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
        maxzoom: 19,
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

function linksToGeoJson(links: FibreLink[]) {
  return {
    type: 'FeatureCollection' as const,
    features: links.map((link) => ({
      type: 'Feature' as const,
      properties: { id: link.id, fibreId: link.fibreId, status: link.status },
      geometry: {
        type: 'LineString' as const,
        coordinates: routeCoordinates(link.fromLat, link.fromLng, link.toLat, link.toLng, link.path),
      },
    })),
  };
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
          '#000000',
        ] as never,
        'line-width': ['interpolate', ['linear'], ['zoom'], 4, 5, 10, 8, 15, 11] as never,
        'line-blur': 7,
        'line-opacity': dark ? 0.35 : 0.18,
      },
    });
  } else {
    map.setPaintProperty(
      'links-glow',
      'line-color',
      ['case', ['==', ['get', 'status'], 'cut'], dark ? '#fb7185' : '#e11d48', '#000000'] as never,
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
        'line-color': '#000000',
        'line-width': ['interpolate', ['linear'], ['zoom'], 4, 1.2, 10, 2, 15, 3] as never,
        'line-opacity': 0.95,
      },
    });
  } else {
    map.setPaintProperty('links-base', 'line-color', '#000000');
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
        'line-color': '#67e8f9',
        'line-width': ['interpolate', ['linear'], ['zoom'], 6, 0.7, 12, 1.5] as never,
        'line-opacity': 0.85,
        'line-dasharray': [1, 5],
      },
    });
  } else {
    map.setPaintProperty('links-flow', 'line-color', '#67e8f9');
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
      },
    });
  }
}

function syncLinkData(map: maplibregl.Map, links: FibreLink[], selectedLinkId: string | null) {
  const source = map.getSource('links') as maplibregl.GeoJSONSource | undefined;
  source?.setData(linksToGeoJson(links) as never);

  const selectedSource = map.getSource('selected-link') as maplibregl.GeoJSONSource | undefined;
  const selected = links.filter((link) => link.id === selectedLinkId);
  selectedSource?.setData(linksToGeoJson(selected) as never);
}

function buildMarkerContent(tj: Tj): string {
  const isCut = tj.isCut || tj.tjType === 'cut';
  const isPon = tj.tjType === 'pon_power';
  const photo = tjPhoto(isCut ? 'cut' : tj.tjType);
  return `
    ${isCut ? '<span class="tj-marker__pulse"></span>' : ''}
    <span class="tj-marker__pin">
      <img class="tj-marker__photo" src="${photo}" alt="" loading="lazy" />
      <span class="tj-marker__ring"></span>
      ${isCut ? '<span class="tj-marker__cut-badge">!</span>' : isPon ? '<span class="tj-marker__cut-badge" style="background:#f59e0b;color:#000;font-size:8px;">⚡</span>' : ''}
    </span>
    <span class="tj-marker__chip">${escapeHtml(tj.code)}${isPon ? ' · PON' : ''}</span>
  `;
}

function buildOnuMarkerContent(onu: Onu): string {
  return `
    <span class="onu-marker__pin">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
        <circle cx="12" cy="7" r="4"/>
      </svg>
    </span>
    <span class="tj-marker__chip onu-marker__chip">${escapeHtml(onu.username || onu.fibreId || 'ONU')}</span>
  `;
}

function buildOltMarkerContent(olt: Olt): string {
  return `
    <span class="olt-marker__tile">
      <img src="${OLT_PHOTO}" alt="" loading="lazy" />
      <span class="olt-marker__badge">OLT</span>
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
}: NetworkMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const oltMarkerRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const onuMarkerRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const labelRef = useRef<maplibregl.Marker[]>([]);
  const routeMarkerRef = useRef<maplibregl.Marker[]>([]);
  const drawCursorRef = useRef<{ lng: number; lat: number } | null>(null);
  const pinnedMarkerRef = useRef<maplibregl.Marker | null>(null);
  const { resolvedTheme } = useTheme();
  const [ready, setReady] = useState(false);
  const [styleVersion, setStyleVersion] = useState(0);

  const themeRef = useRef(resolvedTheme);
  const appliedThemeRef = useRef<string | null>(null);
  const darkLayersRef = useRef(resolvedTheme !== 'light');
  const modeRef = useRef<MapMode>(mode);
  const linksRef = useRef(links);
  const selectedLinkRef = useRef(selectedLinkId);
  const drawPathRef = useRef(drawPath);
  drawPathRef.current = drawPath;

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
  const measureRenderMode: MeasureMode =
    measureMode !== 'none' ? measureMode : measureKind === 'area' ? 'area' : 'distance';
  const measureRenderModeRef = useRef<MeasureMode>(measureRenderMode);
  measureRenderModeRef.current = measureRenderMode;

  const callbacks = useRef({ onSelectTj, onSelectLink, onSelectOlt, onSelectOnu, onMapClick, onBackgroundClick });
  const drawCallbacks = useRef({ onDrawPoint, onMoveDrawPoint, onFinishDraw });
  drawCallbacks.current = { onDrawPoint, onMoveDrawPoint, onFinishDraw };
  modeRef.current = mode;
  linksRef.current = links;
  selectedLinkRef.current = selectedLinkId;
  callbacks.current = { onSelectTj, onSelectLink, onSelectOlt, onSelectOnu, onMapClick, onBackgroundClick };

  const VIEW_KEY = 'fibreAtlas.mapView';

  function loadSavedView() {
    if (typeof window === 'undefined') return null;
    try {
      const raw = localStorage.getItem(VIEW_KEY);
      if (!raw) return null;
      const v = JSON.parse(raw);
      if (v && typeof v.lng === 'number' && typeof v.lat === 'number' && typeof v.zoom === 'number') {
        return { lng: v.lng, lat: v.lat, zoom: v.zoom };
      }
    } catch {
      // ignore corrupt storage
    }
    return null;
  }

  function saveView(lng: number, lat: number, zoom: number) {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(VIEW_KEY, JSON.stringify({ lng, lat, zoom }));
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
      maxZoom: 18,
      maxBounds: [
        [84.5, 18.2],
        [96.5, 28.6],
      ],
      attributionControl: false,
      dragRotate: false,
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

    map.on('mousemove', (event) => {
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
      if (modeRef.current === 'draw-link') {
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
        modeRef.current === 'add-onu'
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
      labelRef.current = [];
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

  // Frame the selected area exactly: its own joints plus OLTs, then its recorded
  // extent, then its parent district — the country only when no area is selected.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !viewReady) return;
    if (framedRef.current?.map === map && framedRef.current.key === frameKey) return;
    framedRef.current = { map, key: frameKey };

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
      return;
    }

    if (initialView) {
      map.jumpTo({ center: [initialView.lng, initialView.lat], zoom: initialView.zoom });
      return;
    }

    map.fitBounds(
      [
        [87.9, 20.7],
        [92.8, 26.9],
      ],
      { padding: { top: 70, bottom: 110, left: 70, right: 70 }, duration: 0 },
    );
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

  // Keep fibre data in sync with server state.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    syncLinkData(map, links, selectedLinkId);
  }, [links, selectedLinkId, ready, styleVersion]);

  // Draft route being drawn in the link dialog.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const drawing = mode === 'draw-link';
    syncDraftData(map, drawing ? drawPath : [], drawing ? drawCursorRef.current : null);
  }, [drawPath, mode, ready, styleVersion]);

  // Draggable waypoint dots while drawing.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    routeMarkerRef.current.forEach((marker) => marker.remove());
    routeMarkerRef.current = [];
    if (mode !== 'draw-link') return;

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
        const element = document.createElement('button');
        element.type = 'button';
        element.className = 'tj-marker';
        element.setAttribute('aria-label', `${tj.code}${tj.name ? ` — ${tj.name}` : ''}`);
        element.innerHTML = buildMarkerContent(tj);
        element.addEventListener('click', (event) => {
          event.stopPropagation();
          if (measureModeRef.current !== 'none') {
            appendMeasureRef.current({ lat: tj.lat, lng: tj.lng });
            return;
          }
          if (modeRef.current === 'draw-link') {
            drawCallbacks.current.onDrawPoint?.({ lat: tj.lat, lng: tj.lng });
            return;
          }
          callbacks.current.onSelectTj(tj.id);
        });

        marker = new maplibregl.Marker({ element, anchor: 'center' })
          .setLngLat([tj.lng, tj.lat])
          .addTo(map);
        markerRef.current.set(tj.id, marker);
      } else {
        marker.setLngLat([tj.lng, tj.lat]);
      }

      const element = marker.getElement();
      const isCut = tj.isCut || tj.tjType === 'cut';
      const isPon = tj.tjType === 'pon_power';
      element.className = `tj-marker${isCut ? ' is-cut' : ''}${isPon ? ' is-pon' : ''}`;
      element.style.setProperty('--core-color', primaryCore(tj.cores));
      element.innerHTML = buildMarkerContent(tj);
      element.classList.toggle('is-selected', tj.id === selectedTjId);
      element.style.zIndex = tj.id === selectedTjId ? '6' : '';
    });
  }, [tjs, selectedTjId, ready, styleVersion]);

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
        const element = document.createElement('button');
        element.type = 'button';
        element.className = 'olt-marker';
        element.setAttribute('aria-label', `${olt.code} — ${olt.name}`);
        element.innerHTML = buildOltMarkerContent(olt);
        element.addEventListener('click', (event) => {
          event.stopPropagation();
          if (measureModeRef.current !== 'none') {
            appendMeasureRef.current({ lat: olt.lat!, lng: olt.lng! });
            return;
          }
          if (modeRef.current === 'draw-link') {
            drawCallbacks.current.onDrawPoint?.({ lat: olt.lat!, lng: olt.lng! });
            return;
          }
          callbacks.current.onSelectOlt(olt.id);
        });
        marker = new maplibregl.Marker({ element, anchor: 'center' })
          .setLngLat([olt.lng, olt.lat])
          .addTo(map);
        oltMarkerRef.current.set(olt.id, marker);
      } else {
        marker.setLngLat([olt.lng, olt.lat]);
      }

      const element = marker.getElement();
      element.innerHTML = buildOltMarkerContent(olt);
      element.setAttribute('aria-label', `${olt.code} — ${olt.name}`);
    });
  }, [olts, ready, styleVersion]);

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
        const element = document.createElement('button');
        element.type = 'button';
        element.className = 'onu-marker';
        element.setAttribute('aria-label', `ONU ${onu.username} — ${onu.fibreId}`);
        element.innerHTML = buildOnuMarkerContent(onu);
        element.addEventListener('click', (event) => {
          event.stopPropagation();
          if (measureModeRef.current !== 'none') {
            appendMeasureRef.current({ lat: onu.lat!, lng: onu.lng! });
            return;
          }
          if (modeRef.current === 'draw-link') {
            drawCallbacks.current.onDrawPoint?.({ lat: onu.lat!, lng: onu.lng! });
            return;
          }
          callbacks.current.onSelectOnu?.(onu.id);
        });
        marker = new maplibregl.Marker({ element, anchor: 'center' })
          .setLngLat([onu.lng, onu.lat])
          .addTo(map);
        onuMarkerRef.current.set(onu.id, marker);
      } else {
        marker.setLngLat([onu.lng, onu.lat]);
      }

      const element = marker.getElement();
      element.innerHTML = buildOnuMarkerContent(onu);
      element.setAttribute('aria-label', `ONU ${onu.username} — ${onu.fibreId}`);
    });
  }, [onus, ready, styleVersion]);

  // Mid-span fibre labels.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    labelRef.current.forEach((marker) => marker.remove());
    labelRef.current = [];

    const applyZoomVisibility = () => {
      const visible = map.getZoom() >= 8.6;
      labelRef.current.forEach((marker) => {
        marker.getElement().style.display = visible ? '' : 'none';
      });
    };

    links.forEach((link) => {
      const element = document.createElement('button');
      element.type = 'button';
      element.className = 'link-label';
      element.textContent = link.fibreId;
      element.dataset.status = link.status;
      element.setAttribute('aria-label', `Fibre link ${link.fibreId}`);
      element.addEventListener('click', (event) => {
        event.stopPropagation();
        callbacks.current.onSelectLink(link.id);
      });

      const marker = new maplibregl.Marker({ element, anchor: 'center' })
        .setLngLat(routeMidpoint(link.fromLat, link.fromLng, link.toLat, link.toLng, link.path))
        .addTo(map);
      labelRef.current.push(marker);
    });

    applyZoomVisibility();
    map.on('zoom', applyZoomVisibility);

    return () => {
      map.off('zoom', applyZoomVisibility);
    };
  }, [links, ready, styleVersion]);

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
    el.className = 'location-pin-container';
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
  }, [pinnedLocation, ready, onClearPinnedLocation, onAddTjAtPinnedLocation, onAddOltAtPinnedLocation]);

  return (
    <div className="map-frame">
      <div ref={containerRef} className="absolute inset-0" />
      {ready && mode !== 'draw-link' ? (
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
