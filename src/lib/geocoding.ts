import type { Olt, Onu, Tj } from '@/lib/types';

export interface SearchResultItem {
  id: string;
  type: 'place' | 'tj' | 'olt' | 'onu' | 'district' | 'landmark';
  title: string;
  subtitle: string;
  lat: number;
  lng: number;
  tjId?: string;
  oltId?: string;
  onuId?: string;
  category?: string;
}

export interface SearchDevices {
  tjs?: Tj[];
  olts?: Olt[];
  onus?: Onu[];
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
  const trimmed = query.trim().toLowerCase();
  if (!trimmed || trimmed.length < 2) return [];

  const cacheKey = `${trimmed}|${tjs.length}|${olts.length}|${onus.length}`;
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey)!;
  }

  const results: SearchResultItem[] = [];
  const matches = (values: (string | null | undefined)[]) =>
    values.some((value) => Boolean(value) && value!.toLowerCase().includes(trimmed));

  // 1. Search local network devices in memory (instant typeahead)
  const matchingTjs = tjs.filter((tj) =>
    matches([tj.code, tj.name, tj.address, tj.fibreId]),
  );

  matchingTjs.slice(0, 4).forEach((tj) => {
    results.push({
      id: `tj-${tj.id}`,
      type: 'tj',
      title: tj.code,
      subtitle: tj.name || tj.address || 'Terminal Joint Box',
      lat: tj.lat,
      lng: tj.lng,
      tjId: tj.id,
      category: tj.tjType === 'cut' ? 'Cut Joint' : tj.tjType === 'pon_power' ? 'PON Power' : 'Splitter TJ',
    });
  });

  const matchingOlts = olts.filter(
    (olt) =>
      olt.lat !== null &&
      olt.lng !== null &&
      matches([olt.code, olt.name, olt.notes, olt.ponPort, olt.uplinkPort, olt.areaName]),
  );

  matchingOlts.slice(0, 4).forEach((olt) => {
    results.push({
      id: `olt-${olt.id}`,
      type: 'olt',
      title: olt.code,
      subtitle: olt.name || olt.areaName || 'Optical Line Terminal',
      lat: olt.lat!,
      lng: olt.lng!,
      oltId: olt.id,
      category: olt.ponPort ? `OLT · ${olt.ponPort}` : 'OLT',
    });
  });

  const matchingOnus = onus.filter(
    (onu) =>
      onu.lat !== null &&
      onu.lng !== null &&
      matches([onu.username, onu.fibreId, onu.macAddress, onu.notes, onu.areaName]),
  );

  matchingOnus.slice(0, 4).forEach((onu) => {
    results.push({
      id: `onu-${onu.id}`,
      type: 'onu',
      title: onu.username,
      subtitle: [onu.fibreId, onu.areaName].filter(Boolean).join(' · ') || 'Subscriber ONU',
      lat: onu.lat!,
      lng: onu.lng!,
      onuId: onu.id,
      category: 'ONU',
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

