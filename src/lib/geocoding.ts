import type { FibreLink, Olt, Onu, Tj } from '@/lib/types';

export interface SearchResultItem {
  id: string;
  type: 'place' | 'tj' | 'olt' | 'onu' | 'link' | 'district' | 'landmark';
  title: string;
  subtitle: string;
  lat: number;
  lng: number;
  tjId?: string;
  oltId?: string;
  onuId?: string;
  linkId?: string;
  subAreaId?: string | null;
  category?: string;
  /** Distance from the searched coordinate, when matched by lat/lng. */
  distanceM?: number;
  isExact?: boolean;
}

export interface SearchDevices {
  tjs?: Tj[];
  olts?: Olt[];
  onus?: Onu[];
  links?: FibreLink[];
}

export const POPULAR_BANGLADESH_HUBS: SearchResultItem[] = [
  {
    id: 'hub-gulshan-dhaka',
    type: 'place',
    title: 'Gulshan 2',
    subtitle: 'Dhaka · Commercial & Diplomatic Zone',
    lat: 23.7925,
    lng: 90.4078,
    category: 'Commercial Hub',
  },
  {
    id: 'hub-banani-dhaka',
    type: 'place',
    title: 'Banani',
    subtitle: 'Dhaka · Commercial Hub',
    lat: 23.794,
    lng: 90.4043,
    category: 'District',
  },
  {
    id: 'hub-dhanmondi-dhaka',
    type: 'place',
    title: 'Dhanmondi 27',
    subtitle: 'Dhaka · Central Metro',
    lat: 23.7533,
    lng: 90.3725,
    category: 'Metro Area',
  },
  {
    id: 'hub-motijheel-dhaka',
    type: 'place',
    title: 'Motijheel Commercial Area',
    subtitle: 'Dhaka · Financial Center',
    lat: 23.733,
    lng: 90.4172,
    category: 'Financial Hub',
  },
  {
    id: 'hub-uttara-dhaka',
    type: 'place',
    title: 'Uttara Sector 3',
    subtitle: 'Dhaka · Northern Gateway',
    lat: 23.868,
    lng: 90.398,
    category: 'Metro Area',
  },
  {
    id: 'hub-mirpur-dhaka',
    type: 'place',
    title: 'Mirpur 10 Circle',
    subtitle: 'Dhaka · High Density Distribution',
    lat: 23.8067,
    lng: 90.3687,
    category: 'Metro Area',
  },
  {
    id: 'hub-agrabad-ctg',
    type: 'place',
    title: 'Agrabad Commercial Area',
    subtitle: 'Chattogram · Port & Business Hub',
    lat: 22.3255,
    lng: 91.8133,
    category: 'Port City',
  },
  {
    id: 'hub-gEC-ctg',
    type: 'place',
    title: 'GEC Circle',
    subtitle: 'Chattogram · Central Node',
    lat: 22.3586,
    lng: 91.8214,
    category: 'Central Node',
  },
  {
    id: 'hub-zindabazar-sylhet',
    type: 'place',
    title: 'Zindabazar',
    subtitle: 'Sylhet · Northeastern Metro Hub',
    lat: 24.8967,
    lng: 91.8687,
    category: 'Metro Area',
  },
  {
    id: 'hub-shaheb-bazar-rajshahi',
    type: 'place',
    title: 'Shaheb Bazar',
    subtitle: 'Rajshahi · Silk City Metro',
    lat: 24.3636,
    lng: 88.6009,
    category: 'Metro Area',
  },
  {
    id: 'hub-shibbari-khulna',
    type: 'place',
    title: 'Shibbari More',
    subtitle: 'Khulna · Industrial & Port Node',
    lat: 22.822,
    lng: 89.5535,
    category: 'Metro Area',
  },
];

// In-memory cache for fast repeated queries
const cache = new Map<string, SearchResultItem[]>();

const EARTH_RADIUS_M = 6371000;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance between two coordinates, in metres. */
export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function formatDistance(metres: number): string {
  if (!Number.isFinite(metres)) return '';
  if (metres < 1000) return `${Math.round(metres)} m`;
  return `${(metres / 1000).toFixed(2)} km`;
}

function parseDMS(str: string): { lat: number; lng: number } | null {
  const dmsRegex = /(\d+)\s*[°ºd\s]\s*(\d+)\s*['’m\s]\s*([0-9.]+)?\s*["”s\s]*([NSEW])/gi;
  const matches = [...str.matchAll(dmsRegex)];
  if (matches.length === 2) {
    let lat: number | null = null;
    let lng: number | null = null;
    for (const m of matches) {
      const deg = parseFloat(m[1]);
      const min = parseFloat(m[2]);
      const sec = m[3] ? parseFloat(m[3]) : 0;
      const dir = m[4].toUpperCase();
      let val = deg + min / 60 + sec / 3600;
      if (dir === 'S' || dir === 'W') val = -val;
      if (dir === 'N' || dir === 'S') lat = val;
      if (dir === 'E' || dir === 'W') lng = val;
    }
    if (lat !== null && lng !== null) {
      if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng };
    }
  }
  return null;
}

/**
 * Reads a full "lat, lng" pair from the query. Accepts:
 * - Comma, space, semicolon, pipe, slash separators
 * - Optional degree symbols, quotes, brackets, and N/S/E/W suffixes or prefixes
 * - DMS formats like 23°48'24"N 90°22'07"E
 * - Labelled inputs like "lat: 23.8067, lng: 90.3687" or "latitude 23.8067 longitude 90.3687"
 * - Inverted order (recognizes Bangladesh/global latitude vs longitude bounds)
 */
export function parseLatLng(query: string): { lat: number; lng: number } | null {
  const trimmed = query.trim();
  if (!trimmed) return null;

  const dms = parseDMS(trimmed);
  if (dms) return dms;

  let cleaned = trimmed
    .replace(/[@()\[\]{}]/g, ' ')
    .replace(/(latitude|lat|longitude|long|lon|lng)[\s:=]*/gi, ' ')
    .replace(/[°º]/g, ' ')
    .trim();

  // Extract directional letters like 23.8067N or 90.3687E
  let latDir: string | null = null;
  let lngDir: string | null = null;
  cleaned = cleaned.replace(/([0-9.]+)\s*([NS])\b/gi, (_, num, dir) => {
    latDir = dir.toUpperCase();
    return num + ' ';
  });
  cleaned = cleaned.replace(/([0-9.]+)\s*([EW])\b/gi, (_, num, dir) => {
    lngDir = dir.toUpperCase();
    return num + ' ';
  });

  const parts = cleaned.split(/[\s,;/|]+/).filter(Boolean);
  if (parts.length < 2) return null;

  let a = Number(parts[0]);
  let b = Number(parts[1]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;

  if (latDir === 'S') a = -Math.abs(a);
  if (lngDir === 'W') b = -Math.abs(b);

  // Bangladesh context: latitude ~18–30, longitude ~85–95.
  const aBdLat = a >= 18 && a <= 30;
  const aBdLng = a >= 85 && a <= 95;
  const bBdLat = b >= 18 && b <= 30;
  const bBdLng = b >= 85 && b <= 95;

  let lat: number;
  let lng: number;
  if (aBdLat && bBdLng) {
    lat = a;
    lng = b;
  } else if (bBdLat && aBdLng) {
    lat = b;
    lng = a;
  } else if (Math.abs(a) <= 90 && Math.abs(b) > 90 && Math.abs(b) <= 180) {
    lat = a;
    lng = b;
  } else if (Math.abs(b) <= 90 && Math.abs(a) > 90 && Math.abs(a) <= 180) {
    lat = b;
    lng = a;
  } else if (Math.abs(a) <= 90 && Math.abs(b) <= 90) {
    lat = a;
    lng = b;
  } else {
    return null;
  }

  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

/** A lone decimal number ("22.83", "89.5") used to match coordinate prefixes. */
export function parseCoordinateFragment(query: string): string | null {
  const cleaned = query
    .replace(/(latitude|lat|longitude|long|lon|lng)[\s:=]*/gi, '')
    .replace(/[°º@()\[\]{}]/g, '')
    .replace(/[,;/|]+$/, '')
    .trim();
  return /^-?\d+(\.\d+)?$/.test(cleaned) ? cleaned : null;
}

function coordinateStrings(lat: number, lng: number): string[] {
  return [lat.toFixed(6), lng.toFixed(6), String(lat), String(lng)];
}

/** Every vertex of a span: its two endpoints plus any drawn duct waypoints. */
function linkRoutePoints(link: FibreLink): { lat: number; lng: number }[] {
  return [
    { lat: link.fromLat, lng: link.fromLng },
    ...link.path.map((point) => ({ lat: point.lat, lng: point.lng })),
    { lat: link.toLat, lng: link.toLng },
  ];
}

/**
 * Closest point on a span's route to a coordinate, with the distance in metres.
 * Projects onto each segment in a local equirectangular frame so a point beside
 * a long straight span still matches, not just one beside a vertex.
 */
function nearestPointOnLink(
  link: FibreLink,
  lat: number,
  lng: number,
): { lat: number; lng: number; distanceM: number } {
  const points = linkRoutePoints(link);
  const cosLat = Math.cos(toRad(lat));
  const project = (p: { lat: number; lng: number }) => ({
    x: toRad(p.lng) * cosLat * EARTH_RADIUS_M,
    y: toRad(p.lat) * EARTH_RADIUS_M,
  });
  const target = project({ lat, lng });
  let best = { lat: points[0].lat, lng: points[0].lng, distanceM: Infinity };
  for (let i = 0; i < points.length; i += 1) {
    const a = project(points[i]);
    const b = i + 1 < points.length ? project(points[i + 1]) : a;
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const lengthSq = abx * abx + aby * aby;
    let t = lengthSq === 0 ? 0 : ((target.x - a.x) * abx + (target.y - a.y) * aby) / lengthSq;
    t = Math.max(0, Math.min(1, t));
    const px = a.x + abx * t;
    const py = a.y + aby * t;
    const distanceM = Math.hypot(target.x - px, target.y - py);
    if (distanceM < best.distanceM) {
      best = {
        lat: points[i].lat + (points[Math.min(i + 1, points.length - 1)].lat - points[i].lat) * t,
        lng: points[i].lng + (points[Math.min(i + 1, points.length - 1)].lng - points[i].lng) * t,
        distanceM,
      };
    }
  }
  return best;
}

function tjCategory(tj: Tj): string {
  return tj.tjType === 'cut' ? 'Cut Joint' : tj.tjType === 'pon_power' ? 'PON Power' : 'Splitter TJ';
}

/**
 * Searches places and network devices matching a query string.
 * Combines local network inventory with OpenStreetMap geocoding.
 */
export async function searchLocationSuggestions(
  query: string,
  devices: SearchDevices = {},
  signal?: AbortSignal,
): Promise<SearchResultItem[]> {
  const tjs = devices.tjs ?? [];
  const olts = devices.olts ?? [];
  const onus = devices.onus ?? [];
  const links = devices.links ?? [];
  const trimmed = query.trim().toLowerCase();
  if (!trimmed || trimmed.length < 2) return [];

  const cacheKey = `${trimmed}|${tjs.length}|${olts.length}|${onus.length}|${links.length}`;
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey)!;
  }

  const coordinate = parseLatLng(trimmed);
  const fragment = coordinate ? null : parseCoordinateFragment(trimmed);

  // Coordinate queries resolve entirely against the local network — no geocoder.
  if (coordinate || fragment) {
    const results = searchByCoordinate(coordinate, fragment, { tjs, olts, onus, links });
    cache.set(cacheKey, results);
    return results;
  }

  const results: SearchResultItem[] = [];
  const matches = (values: (string | null | undefined)[]) =>
    values.some((value) => Boolean(value) && value!.toLowerCase().includes(trimmed));

  const matchCoords = (lat: number | null | undefined, lng: number | null | undefined) => {
    if (lat === null || lat === undefined || lng === null || lng === undefined) return false;
    return (
      lat.toString().includes(trimmed) ||
      lng.toString().includes(trimmed) ||
      lat.toFixed(4).includes(trimmed) ||
      lng.toFixed(4).includes(trimmed) ||
      lat.toFixed(6).includes(trimmed) ||
      lng.toFixed(6).includes(trimmed)
    );
  };

  // 1. Search local network devices in memory (instant typeahead)
  const matchingTjs = tjs.filter(
    (tj) => matches([tj.code, tj.name, tj.address, tj.fibreId]) || matchCoords(tj.lat, tj.lng),
  );

  matchingTjs.slice(0, 6).forEach((tj) => {
    results.push({
      id: `tj-${tj.id}`,
      type: 'tj',
      title: tj.code,
      subtitle: tj.name || tj.address || 'Terminal Joint Box',
      lat: tj.lat,
      lng: tj.lng,
      tjId: tj.id,
      subAreaId: tj.subAreaId,
      category: tjCategory(tj),
    });
  });

  const matchingOlts = olts.filter(
    (olt) =>
      olt.lat !== null &&
      olt.lng !== null &&
      (matches([olt.code, olt.name, olt.notes, olt.ponPort, olt.uplinkPort, olt.areaName]) ||
        matchCoords(olt.lat, olt.lng)),
  );

  matchingOlts.slice(0, 6).forEach((olt) => {
    results.push({
      id: `olt-${olt.id}`,
      type: 'olt',
      title: olt.code,
      subtitle: olt.name || olt.areaName || 'Optical Line Terminal',
      lat: olt.lat!,
      lng: olt.lng!,
      oltId: olt.id,
      subAreaId: olt.subAreaId,
      category: olt.ponPort ? `OLT · ${olt.ponPort}` : 'OLT',
    });
  });

  const matchingOnus = onus.filter(
    (onu) =>
      onu.lat !== null &&
      onu.lng !== null &&
      (matches([onu.username, onu.fibreId, onu.macAddress, onu.notes, onu.areaName]) ||
        matchCoords(onu.lat, onu.lng)),
  );

  matchingOnus.slice(0, 6).forEach((onu) => {
    results.push({
      id: `onu-${onu.id}`,
      type: 'onu',
      title: onu.username,
      subtitle: [onu.fibreId, onu.areaName].filter(Boolean).join(' · ') || 'Subscriber ONU',
      lat: onu.lat!,
      lng: onu.lng!,
      onuId: onu.id,
      subAreaId: onu.subAreaId,
      category: 'ONU',
    });
  });

  const matchingLinks = links.filter(
    (link) =>
      matches([link.fibreId, link.fromCode, link.toCode, link.cableType, link.notes, link.subAreaName]) ||
      matchCoords(link.fromLat, link.fromLng) ||
      matchCoords(link.toLat, link.toLng) ||
      link.path.some((p) => matchCoords(p.lat, p.lng)),
  );

  matchingLinks.slice(0, 6).forEach((link) => {
    const mid = nearestPointOnLink(link, (link.fromLat + link.toLat) / 2, (link.fromLng + link.toLng) / 2);
    results.push({
      id: `link-${link.id}`,
      type: 'link',
      title: link.fibreId,
      subtitle: `${link.fromCode} → ${link.toCode}`,
      lat: mid.lat,
      lng: mid.lng,
      linkId: link.id,
      subAreaId: link.subAreaId,
      category: link.cableType ? `Link · ${link.cableType}` : 'Fibre Link',
    });
  });

  // 2. Search local popular hubs in Bangladesh
  POPULAR_BANGLADESH_HUBS.forEach((hub) => {
    if (
      hub.title.toLowerCase().includes(trimmed) ||
      hub.subtitle.toLowerCase().includes(trimmed)
    ) {
      if (!results.some((r) => Math.abs(r.lat - hub.lat) < 0.005 && Math.abs(r.lng - hub.lng) < 0.005)) {
        results.push(hub);
      }
    }
  });

  // 3. Query OpenStreetMap Photon Geocoder (fast typeahead, location-biased to BD)
  try {
    const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(
      query,
    )}&lat=23.8103&lon=90.4125&limit=6`;

    const res = await fetch(photonUrl, { signal });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.features)) {
        for (const feature of data.features) {
          const coords = feature.geometry?.coordinates;
          if (!Array.isArray(coords) || coords.length < 2) continue;

          const lng = Number(coords[0]);
          const lat = Number(coords[1]);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

          // Filter for Bangladesh geographic boundaries (lat 20.0 - 27.5, lng 88.0 - 93.5)
          const isBd =
            (lat >= 20.0 && lat <= 27.5 && lng >= 87.5 && lng <= 93.5) ||
            feature.properties?.country === 'Bangladesh';
          if (!isBd) continue;

          const name = feature.properties?.name || feature.properties?.street || feature.properties?.city;
          if (!name) continue;

          const subtitleParts = [
            feature.properties?.street,
            feature.properties?.city || feature.properties?.district,
            feature.properties?.state,
            'Bangladesh',
          ].filter((p): p is string => Boolean(p) && p !== name);

          const subtitle = subtitleParts.length > 0 ? subtitleParts.join(', ') : 'Bangladesh';

          // Avoid duplicate nearby places
          const isDuplicate = results.some(
            (r) => Math.abs(r.lat - lat) < 0.003 && Math.abs(r.lng - lng) < 0.003,
          );

          if (!isDuplicate) {
            results.push({
              id: `osm-${lat.toFixed(4)}-${lng.toFixed(4)}`,
              type: 'place',
              title: name,
              subtitle,
              lat,
              lng,
              category: feature.properties?.type || 'Location',
            });
          }
        }
      }
    }
  } catch (err) {
    if (signal?.aborted) return results;
    // Photon might be throttled or network issue; fallback to Nominatim
  }

  // 4. Fallback to OpenStreetMap Nominatim if fewer than 3 results found
  if (results.length < 3) {
    try {
      const nominatimUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
        query,
      )}&format=json&countrycodes=bd&limit=5&addressdetails=1`;

      const res = await fetch(nominatimUrl, {
        headers: {
          'Accept-Language': 'en',
        },
        signal,
      });

      if (res.ok) {
        const list = await res.json();
        if (Array.isArray(list)) {
          for (const item of list) {
            const lat = parseFloat(item.lat);
            const lng = parseFloat(item.lon);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

            const name = item.name || item.display_name.split(',')[0];
            const isDuplicate = results.some(
              (r) => Math.abs(r.lat - lat) < 0.003 && Math.abs(r.lng - lng) < 0.003,
            );

            if (!isDuplicate) {
              results.push({
                id: `nom-${item.place_id || `${lat}-${lng}`}`,
                type: 'place',
                title: name,
                subtitle: item.display_name,
                lat,
                lng,
                category: item.type || 'Location',
              });
            }
          }
        }
      }
    } catch {
      // Ignore fallback failure
    }
  }

  // Cache results
  cache.set(cacheKey, results);
  return results;
}

/**
 * Resolves a lat/lng pair (or a numeric coordinate fragment) against the local
 * network. Every device and link is eligible — exact coordinate matches appear
 * first with prominent badges, followed by nearest devices and raw coordinate pin.
 */
function searchByCoordinate(
  coordinate: { lat: number; lng: number } | null,
  fragment: string | null,
  devices: Required<Pick<SearchDevices, 'tjs' | 'olts' | 'onus' | 'links'>>,
): SearchResultItem[] {
  const { tjs, olts, onus, links } = devices;
  const results: SearchResultItem[] = [];

  const coordLabel = (lat: number, lng: number) => `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

  if (coordinate) {
    const { lat, lng } = coordinate;

    type ScoredItem = {
      item: SearchResultItem;
      distanceM: number;
      isExact: boolean;
    };

    const scored: ScoredItem[] = [];

    // 1. TJs
    for (const tj of tjs) {
      const distanceM = haversineMeters(lat, lng, tj.lat, tj.lng);
      const isExact = distanceM <= 35;
      scored.push({
        distanceM,
        isExact,
        item: {
          id: `tj-${tj.id}`,
          type: 'tj',
          title: tj.code,
          subtitle: isExact
            ? `${coordLabel(tj.lat, tj.lng)} · Exact Match · ${tj.address || tj.name || 'Terminal Joint Box'}`
            : `${coordLabel(tj.lat, tj.lng)} · ${formatDistance(distanceM)} away · ${tj.address || tj.name || 'Terminal Joint Box'}`,
          lat: tj.lat,
          lng: tj.lng,
          tjId: tj.id,
          subAreaId: tj.subAreaId,
          category: tjCategory(tj),
          distanceM,
          isExact,
        },
      });
    }

    // 2. OLTs
    for (const olt of olts) {
      if (olt.lat === null || olt.lng === null) continue;
      const distanceM = haversineMeters(lat, lng, olt.lat, olt.lng);
      const isExact = distanceM <= 35;
      scored.push({
        distanceM,
        isExact,
        item: {
          id: `olt-${olt.id}`,
          type: 'olt',
          title: olt.code,
          subtitle: isExact
            ? `${coordLabel(olt.lat, olt.lng)} · Exact Match · ${olt.name || olt.areaName || 'OLT'}`
            : `${coordLabel(olt.lat, olt.lng)} · ${formatDistance(distanceM)} away · ${olt.name || olt.areaName || 'OLT'}`,
          lat: olt.lat,
          lng: olt.lng,
          oltId: olt.id,
          subAreaId: olt.subAreaId,
          category: olt.ponPort ? `OLT · ${olt.ponPort}` : 'OLT',
          distanceM,
          isExact,
        },
      });
    }

    // 3. ONUs
    for (const onu of onus) {
      if (onu.lat === null || onu.lng === null) continue;
      const distanceM = haversineMeters(lat, lng, onu.lat, onu.lng);
      const isExact = distanceM <= 35;
      scored.push({
        distanceM,
        isExact,
        item: {
          id: `onu-${onu.id}`,
          type: 'onu',
          title: onu.username,
          subtitle: isExact
            ? `${coordLabel(onu.lat, onu.lng)} · Exact Match · ${onu.areaName || onu.fibreId || 'ONU'}`
            : `${coordLabel(onu.lat, onu.lng)} · ${formatDistance(distanceM)} away · ${onu.areaName || onu.fibreId || 'ONU'}`,
          lat: onu.lat,
          lng: onu.lng,
          onuId: onu.id,
          subAreaId: onu.subAreaId,
          category: 'ONU',
          distanceM,
          isExact,
        },
      });
    }

    // 4. Fibre Links (point-to-segment distance onto route)
    for (const link of links) {
      const nearest = nearestPointOnLink(link, lat, lng);
      const isExact = nearest.distanceM <= 35;
      scored.push({
        distanceM: nearest.distanceM,
        isExact,
        item: {
          id: `link-${link.id}`,
          type: 'link',
          title: link.fibreId,
          subtitle: isExact
            ? `${coordLabel(nearest.lat, nearest.lng)} · Route passes here · ${link.fromCode} → ${link.toCode}`
            : `${coordLabel(nearest.lat, nearest.lng)} · ${formatDistance(nearest.distanceM)} from route · ${link.fromCode} → ${link.toCode}`,
          lat: nearest.lat,
          lng: nearest.lng,
          linkId: link.id,
          subAreaId: link.subAreaId,
          category: link.cableType ? `Link · ${link.cableType}` : 'Fibre Link',
          distanceM: nearest.distanceM,
          isExact,
        },
      });
    }

    scored.sort((a, b) => a.distanceM - b.distanceM);

    const exactItems = scored.filter((s) => s.isExact);
    const nonExactItems = scored.filter((s) => !s.isExact);

    const coordItem: SearchResultItem = {
      id: `coord-${lat.toFixed(5)}-${lng.toFixed(5)}`,
      type: 'place',
      title: `${lat.toFixed(6)}, ${lng.toFixed(6)}`,
      subtitle: exactItems.length > 0
        ? 'Exact searched coordinates (fly to point & drop pin)'
        : 'Fly to exact coordinates & drop pin',
      lat,
      lng,
      category: 'Coordinate',
      isExact: true,
    };

    if (exactItems.length > 0) {
      // Put exact matching devices first
      results.push(...exactItems.map((s) => s.item));
      results.push(coordItem);
      results.push(...nonExactItems.slice(0, 8).map((s) => s.item));
    } else {
      // Coordinate pin target first, followed by nearest devices
      results.push(coordItem);
      results.push(...nonExactItems.slice(0, 10).map((s) => s.item));
    }

    return results;
  }

  // Numeric fragment: match devices and spans whose coordinates contain it.
  const frag = fragment!.toLowerCase();
  const numVal = parseFloat(frag);
  const isNumber = Number.isFinite(numVal);
  const isBdLat = isNumber && numVal >= 18 && numVal <= 30;
  const isBdLng = isNumber && numVal >= 85 && numVal <= 95;

  const hit = (lat: number, lng: number) => {
    const latStr = lat.toString();
    const lngStr = lng.toString();
    const latFix4 = lat.toFixed(4);
    const lngFix4 = lng.toFixed(4);
    const latFix6 = lat.toFixed(6);
    const lngFix6 = lng.toFixed(6);
    return (
      latStr.includes(frag) ||
      lngStr.includes(frag) ||
      latFix4.includes(frag) ||
      lngFix4.includes(frag) ||
      latFix6.includes(frag) ||
      lngFix6.includes(frag)
    );
  };

  tjs.forEach((tj) => {
    if (hit(tj.lat, tj.lng)) {
      const matchLat =
        tj.lat.toString().includes(frag) ||
        tj.lat.toFixed(4).includes(frag) ||
        tj.lat.toFixed(6).includes(frag);
      results.push({
        id: `tj-${tj.id}`,
        type: 'tj',
        title: tj.code,
        subtitle: `${coordLabel(tj.lat, tj.lng)} · ${matchLat ? 'Matches Lat' : 'Matches Lng'} · ${tj.address || tj.name || 'Terminal Joint Box'}`,
        lat: tj.lat,
        lng: tj.lng,
        tjId: tj.id,
        subAreaId: tj.subAreaId,
        category: tjCategory(tj),
        isExact: true,
      });
    }
  });

  olts.forEach((olt) => {
    if (olt.lat !== null && olt.lng !== null && hit(olt.lat, olt.lng)) {
      const matchLat =
        olt.lat.toString().includes(frag) ||
        olt.lat.toFixed(4).includes(frag) ||
        olt.lat.toFixed(6).includes(frag);
      results.push({
        id: `olt-${olt.id}`,
        type: 'olt',
        title: olt.code,
        subtitle: `${coordLabel(olt.lat, olt.lng)} · ${matchLat ? 'Matches Lat' : 'Matches Lng'} · ${olt.name || olt.areaName || 'OLT'}`,
        lat: olt.lat,
        lng: olt.lng,
        oltId: olt.id,
        subAreaId: olt.subAreaId,
        category: olt.ponPort ? `OLT · ${olt.ponPort}` : 'OLT',
        isExact: true,
      });
    }
  });

  onus.forEach((onu) => {
    if (onu.lat !== null && onu.lng !== null && hit(onu.lat, onu.lng)) {
      const matchLat =
        onu.lat.toString().includes(frag) ||
        onu.lat.toFixed(4).includes(frag) ||
        onu.lat.toFixed(6).includes(frag);
      results.push({
        id: `onu-${onu.id}`,
        type: 'onu',
        title: onu.username,
        subtitle: `${coordLabel(onu.lat, onu.lng)} · ${matchLat ? 'Matches Lat' : 'Matches Lng'} · ${onu.areaName || onu.fibreId || 'ONU'}`,
        lat: onu.lat,
        lng: onu.lng,
        onuId: onu.id,
        subAreaId: onu.subAreaId,
        category: 'ONU',
        isExact: true,
      });
    }
  });

  links.forEach((link) => {
    const points = linkRoutePoints(link);
    const matchedPoint = points.find((p) => hit(p.lat, p.lng));
    if (matchedPoint) {
      results.push({
        id: `link-${link.id}`,
        type: 'link',
        title: link.fibreId,
        subtitle: `${link.fromCode} → ${link.toCode} · Route matches ${coordLabel(matchedPoint.lat, matchedPoint.lng)}`,
        lat: matchedPoint.lat,
        lng: matchedPoint.lng,
        linkId: link.id,
        subAreaId: link.subAreaId,
        category: link.cableType ? `Link · ${link.cableType}` : 'Fibre Link',
        isExact: true,
      });
    }
  });

  // If the query is numeric and falls in Bangladesh bounds, sort matches by difference
  if (isBdLat) {
    results.sort((a, b) => Math.abs(a.lat - numVal) - Math.abs(b.lat - numVal));
  } else if (isBdLng) {
    results.sort((a, b) => Math.abs(a.lng - numVal) - Math.abs(b.lng - numVal));
  }

  return results;

  return results;
}

