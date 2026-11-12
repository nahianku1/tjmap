'use client';

import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import type { StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useTheme } from 'next-themes';
import { Loader2 } from 'lucide-react';
import type { FibreLink, Tj } from '@/lib/types';
import { primaryCore } from '@/lib/utils';

export type MapMode = 'idle' | 'add-tj' | 'link';

interface NetworkMapProps {
  tjs: Tj[];
  links: FibreLink[];
  mode: MapMode;
  selectedTjId: string | null;
  selectedLinkId: string | null;
  linkSourceId: string | null;
  focus: { lng: number; lat: number; zoom?: number; nonce: number } | null;
  /** Area camera. When omitted the map frames the whole country. */
  initialView?: { lat: number; lng: number; zoom: number } | null;
  pinnedLocation?: {
    lat: number;
    lng: number;
    title: string;
    subtitle?: string;
  } | null;
  onSelectTj: (id: string) => void;
  onSelectLink: (id: string) => void;
  onMapClick: (point: { lng: number; lat: number }) => void;
  onBackgroundClick: () => void;
  onClearPinnedLocation?: () => void;
  onAddTjAtPinnedLocation?: (point: { lat: number; lng: number; address: string }) => void;
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
        coordinates: [
          [link.fromLng, link.fromLat],
          [link.toLng, link.toLat],
        ],
      },
    })),
  };
}

function addNetworkLayers(map: maplibregl.Map) {
  if (!map.getSource('links')) {
    map.addSource('links', { type: 'geojson', data: EMPTY as never });
  }
  if (!map.getSource('selected-link')) {
    map.addSource('selected-link', { type: 'geojson', data: EMPTY as never });
  }

  if (!map.getLayer('links-glow')) {
    map.addLayer({
      id: 'links-glow',
      type: 'line',
      source: 'links',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ['case', ['==', ['get', 'status'], 'cut'], '#fb7185', '#22d3ee'] as never,
        'line-width': ['interpolate', ['linear'], ['zoom'], 4, 5, 10, 8, 15, 11] as never,
        'line-blur': 7,
        'line-opacity': 0.4,
      },
    });
  }

  if (!map.getLayer('links-base')) {
    map.addLayer({
      id: 'links-base',
      type: 'line',
      source: 'links',
      filter: ['==', ['get', 'status'], 'active'],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#2dd4bf',
        'line-width': ['interpolate', ['linear'], ['zoom'], 4, 1.2, 10, 2, 15, 3] as never,
        'line-opacity': 0.95,
      },
    });
  }

  if (!map.getLayer('links-cut')) {
    map.addLayer({
      id: 'links-cut',
      type: 'line',
      source: 'links',
      filter: ['==', ['get', 'status'], 'cut'],
      layout: { 'line-cap': 'butt', 'line-join': 'round' },
      paint: {
        'line-color': '#fb7185',
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
        'line-color': '#ecfeff',
        'line-width': ['interpolate', ['linear'], ['zoom'], 6, 0.7, 12, 1.5] as never,
        'line-opacity': 0.7,
        'line-dasharray': [1, 5],
      },
    });
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
  return `
    ${isCut ? '<span class="tj-marker__pulse"></span>' : ''}
    <span class="tj-marker__pin">
      <span class="tj-marker__ring"></span>
      <span class="tj-marker__dot"></span>
      ${isCut ? '<span class="tj-marker__cut-badge">!</span>' : isPon ? '<span class="tj-marker__cut-badge" style="background:#f59e0b;color:#000;font-size:8px;">⚡</span>' : ''}
    </span>
    <span class="tj-marker__chip">${escapeHtml(tj.code)}${isPon ? ' · PON' : ''}</span>
  `;
}

export function NetworkMap({
  tjs,
  links,
  mode,
  selectedTjId,
  selectedLinkId,
  linkSourceId,
  focus,
  initialView,
  pinnedLocation,
  onSelectTj,
  onSelectLink,
  onMapClick,
  onBackgroundClick,
  onClearPinnedLocation,
  onAddTjAtPinnedLocation,
}: NetworkMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const labelRef = useRef<maplibregl.Marker[]>([]);
  const pinnedMarkerRef = useRef<maplibregl.Marker | null>(null);
  const { resolvedTheme } = useTheme();
  const [ready, setReady] = useState(false);
  const [styleVersion, setStyleVersion] = useState(0);

  const themeRef = useRef(resolvedTheme);
  const appliedThemeRef = useRef<string | null>(null);
  const modeRef = useRef<MapMode>(mode);
  const linksRef = useRef(links);
  const selectedLinkRef = useRef(selectedLinkId);

  const callbacks = useRef({ onSelectTj, onSelectLink, onMapClick, onBackgroundClick });
  modeRef.current = mode;
  linksRef.current = links;
  selectedLinkRef.current = selectedLinkId;
  callbacks.current = { onSelectTj, onSelectLink, onMapClick, onBackgroundClick };

  useEffect(() => {
    if (!containerRef.current) return;

    let disposed = false;
    const initialDark = themeRef.current !== 'light';
    appliedThemeRef.current = initialDark ? 'dark' : 'light';

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: getOsmStyle(initialDark),
      center: [90.28, 23.75],
      zoom: 6.3,
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
        addNetworkLayers(map);
        syncLinkData(map, linksRef.current, selectedLinkRef.current);
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
        addNetworkLayers(map);
        syncLinkData(map, linksRef.current, selectedLinkRef.current);
      } catch (error) {
        console.warn('[FibreAtlas] overlay layers failed to attach', error);
      }
      setReady(true);
    });

    map.on('error', (event) => {
      if (!disposed) console.warn('[FibreAtlas] map warning', event.error?.message ?? event);
    });

    map.on('click', (event) => {
      if (modeRef.current === 'add-tj') {
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

    map.on('mousemove', (event) => {
      if (modeRef.current === 'add-tj') {
        map.getCanvas().style.cursor = 'crosshair';
        return;
      }
      const layers = map.getLayer('links-hit') ? ['links-hit'] : [];
      const hits = layers.length > 0 ? map.queryRenderedFeatures(event.point, { layers }) : [];
      map.getCanvas().style.cursor =
        hits.length > 0 ? 'pointer' : modeRef.current === 'link' ? 'crosshair' : '';
    });

    const observer = new ResizeObserver(() => map.resize());
    observer.observe(containerRef.current);

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resizeMap);
      observer.disconnect();
      markerRef.current.forEach((marker) => marker.remove());
      markerRef.current.clear();
      labelRef.current.forEach((marker) => marker.remove());
      labelRef.current = [];
      mapRef.current = null;
      try {
        map.remove();
      } catch {
        // Map already torn down.
      }
      setReady(false);
    };
  }, []);

  // Frame the area when one is given, otherwise fit the whole country.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

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
  }, [ready, initialView?.lat, initialView?.lng, initialView?.zoom, initialView]);

  // Theme switching swaps OpenStreetMap basemaps without losing markers.
  useEffect(() => {
    const map = mapRef.current;
    const nextTheme = resolvedTheme === 'light' ? 'light' : 'dark';
    if (!map || !ready || appliedThemeRef.current === nextTheme) return;
    appliedThemeRef.current = nextTheme;

    map.setStyle(getOsmStyle(nextTheme === 'dark'));
  }, [resolvedTheme, ready]);

  // Keep fibre data in sync with server state.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    syncLinkData(map, links, selectedLinkId);
  }, [links, selectedLinkId, ready, styleVersion]);

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
      element.classList.toggle('is-link-source', tj.id === linkSourceId);
      element.style.zIndex = tj.id === selectedTjId || tj.id === linkSourceId ? '6' : '';
    });
  }, [tjs, selectedTjId, linkSourceId, ready, styleVersion]);

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
      element.setAttribute('aria-label', `Fibre span ${link.fibreId}`);
      element.addEventListener('click', (event) => {
        event.stopPropagation();
        callbacks.current.onSelectLink(link.id);
      });

      const marker = new maplibregl.Marker({ element, anchor: 'center' })
        .setLngLat([(link.fromLng + link.toLng) / 2, (link.fromLat + link.toLat) / 2])
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
    map.getCanvas().style.cursor = mode === 'add-tj' ? 'crosshair' : '';
  }, [mode, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !focus) return;
    map.flyTo({
      center: [focus.lng, focus.lat],
      zoom: focus.zoom ?? 13.4,
      speed: 1.35,
      curve: 1.42,
      essential: true,
    });
  }, [focus, ready]);

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
          <button type="button" class="location-pin-card__btn-add">
            + Add TJ Here
          </button>
        </div>
      </div>
    `;

    const closeBtn = el.querySelector('.location-pin-card__close');
    closeBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      onClearPinnedLocation?.();
    });

    const addBtn = el.querySelector('.location-pin-card__btn-add');
    addBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      onAddTjAtPinnedLocation?.({
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
  }, [pinnedLocation, ready, onClearPinnedLocation, onAddTjAtPinnedLocation]);

  return (
    <div className="map-frame">
      <div ref={containerRef} className="absolute inset-0" />
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
