import { strFromU8, unzipSync } from 'fflate';
import {
  MAP_TRANSFER_FORMAT,
  MAP_TRANSFER_VERSION,
  type MapTransferFile,
} from './map-transfer';
import type {
  DeviceKind,
  FibreLink,
  LinkCore,
  LinkPathPoint,
  Olt,
  Onu,
  Tj,
} from './types';

/** How far a route line may sit from its device marker to still count as joined. */
const MAX_ENDPOINT_DISTANCE_M = 300;
const MAX_DEVICES = 500;
const MAX_LINKS = 500;
const MAX_CODE = 40;
const MAX_NAME = 80;
const MAX_FIBRE_ID = 80;
const CORE_LABEL = 'Core 01';
const CORE_COLOR = '#22d3ee';

export interface KmzDeviceCounts {
  tjs: number;
  olts: number;
  onus: number;
  links: number;
  skippedLines: number;
}

/** One KML folder, turned into its own sub-area when imported into an area. */
export interface KmzLayer {
  name: string;
  file: MapTransferFile;
}

/** What the import dialog hands over: the whole snapshot plus optional layers. */
export interface KmzImportPayload {
  file: MapTransferFile;
  /** One entry per KML layer when Google Earth data lands in an area. */
  layers: KmzLayer[] | null;
}

export interface KmzConversion {
  file: MapTransferFile;
  layers: KmzLayer[];
  counts: KmzDeviceCounts;
  warnings: string[];
}

export interface KmzContext {
  area: { id: string; name: string } | null;
  subArea: { id: string; name: string } | null;
}

interface KmzDevice {
  kind: DeviceKind;
  id: string;
  label: string;
  layer: string;
  lat: number;
  lng: number;
  notes: string | null;
}

interface KmzLine {
  name: string;
  layer: string;
  points: LinkPathPoint[];
}

function localName(element: Element): string {
  return (element.localName ?? element.tagName).toLowerCase();
}

function directChild(element: Element, name: string): Element | null {
  for (const child of Array.from(element.children)) {
    if (localName(child) === name) return child;
  }
  return null;
}

function directText(element: Element, name: string): string | null {
  const value = directChild(element, name)?.textContent?.trim();
  return value ? value : null;
}

function stripHtml(value: string): string {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** Folder names above a placemark, outermost first (e.g. “Network / OLT cabinets”). */
function folderPath(placemark: Element): string {
  const parts: string[] = [];
  let parent = placemark.parentElement;
  while (parent) {
    if (localName(parent) === 'folder') {
      const name = directText(parent, 'name');
      if (name) parts.unshift(name);
    }
    parent = parent.parentElement;
  }
  return parts.join(' / ');
}

/**
 * The Google Earth layer a placemark belongs to: the outermost folder under the
 * document. Placemarks outside any folder fall back to the document name.
 */
function layerName(placemark: Element, fallback: string): string {
  let name: string | null = null;
  let parent = placemark.parentElement;
  while (parent) {
    if (localName(parent) === 'folder') {
      const folderName = directText(parent, 'name');
      if (folderName) name = folderName;
    }
    parent = parent.parentElement;
  }
  return name?.trim() || fallback;
}

/** Values from ExtendedData that usually carry the device category. */
function typeHints(placemark: Element): string {
  const values: string[] = [];
  for (const element of Array.from(placemark.querySelectorAll('SimpleData, Data'))) {
    const key = (element.getAttribute('name') ?? '').toLowerCase();
    if (!/type|kind|category|class|device/.test(key)) continue;
    const value =
      localName(element) === 'data'
        ? (element.querySelector('value')?.textContent ?? '')
        : (element.textContent ?? '');
    if (value.trim()) values.push(value.trim());
  }
  return values.join(' ');
}

function classify(name: string, hints: string, path: string): DeviceKind {
  const haystack = `${path} ${hints} ${name}`.toLowerCase();
  const startsWith = (prefix: string) => name.trim().toLowerCase().startsWith(prefix);
  if (startsWith('olt') || /\bolts?\b/.test(haystack)) return 'olt';
  if (startsWith('onu') || /\bonus?\b/.test(haystack)) return 'onu';
  return 'tj';
}

/** Parses KML “lng,lat[,alt]” tuples separated by whitespace. */
function parseCoordinateList(text: string | null | undefined): { lat: number; lng: number }[] {
  if (!text) return [];
  const points: { lat: number; lng: number }[] = [];
  for (const tuple of text.trim().split(/\s+/)) {
    const [lngRaw, latRaw] = tuple.split(',');
    const lng = Number(lngRaw);
    const lat = Number(latRaw);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) continue;
    points.push({ lat, lng });
  }
  return points;
}

function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function nearestDevice(
  point: { lat: number; lng: number },
  devices: KmzDevice[],
): { device: KmzDevice; distance: number } | null {
  let best: { device: KmzDevice; distance: number } | null = null;
  for (const device of devices) {
    const distance = haversineMeters(point, device);
    if (!best || distance < best.distance) best = { device, distance };
  }
  return best;
}

function deviceCores() {
  return [{ label: CORE_LABEL, color: CORE_COLOR, count: 1, status: 'free' as const }];
}

function now(): string {
  return new Date().toISOString();
}

function toTj(device: KmzDevice): Tj {
  return {
    id: device.id,
    code: device.label.slice(0, MAX_CODE),
    name: null,
    tjType: 'box',
    lat: device.lat,
    lng: device.lng,
    address: null,
    notes: device.notes,
    fibreId: null,
    inputPowerDbm: null,
    cores: deviceCores(),
    outputCores: [],
    splitter: { enabled: false, outputs: [] },
    userFibres: [],
    isCut: false,
    cutReason: null,
    cutSeverity: null,
    cutData: null,
    ponData: null,
    areaId: null,
    areaName: null,
    districtId: null,
    districtName: null,
    oltId: null,
    olt: null,
    createdAt: now(),
    updatedAt: now(),
  };
}

function toOlt(device: KmzDevice): Olt {
  return {
    id: device.id,
    code: device.label.slice(0, MAX_CODE),
    name: device.label.slice(0, MAX_NAME),
    ponPort: null,
    uplinkPort: null,
    ponPorts: [],
    ethernetPorts: [],
    fibreId: null,
    notes: device.notes,
    areaId: null,
    areaName: null,
    subAreaId: null,
    subAreaName: null,
    districtId: null,
    districtName: null,
    lat: device.lat,
    lng: device.lng,
    tjCount: 0,
    createdAt: now(),
    updatedAt: now(),
  };
}

function toOnu(device: KmzDevice, index: number): Onu {
  return {
    id: device.id,
    username: device.label.slice(0, MAX_NAME),
    macAddress: null,
    vlanId: null,
    fibreId: `KMZ-ONU-${index + 1}`,
    ponType: 'gpon',
    onuClass: 'B+',
    cores: deviceCores().map((core) => ({
      label: core.label,
      color: core.color,
      status: core.status,
    })),
    notes: device.notes,
    lat: device.lat,
    lng: device.lng,
    areaId: null,
    areaName: null,
    subAreaId: null,
    subAreaName: null,
    districtId: null,
    districtName: null,
    createdAt: now(),
    updatedAt: now(),
  };
}

function toLink(
  id: string,
  fibreId: string,
  from: KmzDevice,
  to: KmzDevice,
  path: LinkPathPoint[],
  notes: string | null,
): FibreLink {
  const cores: LinkCore[] = [
    {
      index: 1,
      label: CORE_LABEL,
      color: CORE_COLOR,
      status: 'connected',
      fromCoreLabel: CORE_LABEL,
      toCoreLabel: CORE_LABEL,
    },
  ];
  return {
    id,
    fromKind: from.kind,
    toKind: to.kind,
    fromTjId: from.kind === 'tj' ? from.id : null,
    fromOltId: from.kind === 'olt' ? from.id : null,
    fromOnuId: from.kind === 'onu' ? from.id : null,
    toTjId: to.kind === 'tj' ? to.id : null,
    toOltId: to.kind === 'olt' ? to.id : null,
    toOnuId: to.kind === 'onu' ? to.id : null,
    fromCode: from.label,
    toCode: to.label,
    fromName: null,
    toName: null,
    fromLat: from.lat,
    fromLng: from.lng,
    toLat: to.lat,
    toLng: to.lng,
    fibreId,
    cableType: null,
    coreCount: 1,
    fromCoreLabel: CORE_LABEL,
    toCoreLabel: CORE_LABEL,
    cores,
    path,
    subAreaId: null,
    subAreaName: null,
    status: 'active',
    lengthM: null,
    attenuationDbPerKm: 0.35,
    spliceCount: 0,
    connectionLossDb: 1,
    color: null,
    notes,
    createdAt: now(),
    updatedAt: now(),
  };
}

interface ParsedKml {
  devices: KmzDevice[];
  links: FibreLink[];
  /** Layer names in document order. */
  layers: string[];
  linksByLayer: Map<string, FibreLink[]>;
  skippedLines: number;
  warnings: string[];
}

/** Converts KML placemarks: points become devices, lines become fibre links. */
export function parseKml(kml: string): ParsedKml {
  const doc = new DOMParser().parseFromString(kml, 'application/xml');
  if (doc.querySelector('parsererror')) {
    throw new Error('That KML file could not be read. Export it again from Google Earth or My Maps.');
  }

  const placemarks = Array.from(doc.querySelectorAll('Placemark'));
  if (placemarks.length === 0) {
    throw new Error('No placemarks were found in this file.');
  }

  const documentElement = Array.from(doc.getElementsByTagName('Document'))[0] ?? null;
  const defaultLayer =
    (documentElement ? directText(documentElement, 'name') : null)?.trim() || 'KMZ import';

  const devices: KmzDevice[] = [];
  const lines: KmzLine[] = [];
  const layerOrder: string[] = [];
  const warnings: string[] = [];
  let truncatedDevices = false;
  let truncatedLines = false;

  const rememberLayer = (layer: string) => {
    if (!layerOrder.includes(layer)) layerOrder.push(layer);
  };

  for (const placemark of placemarks) {
    const name = directText(placemark, 'name') ?? '';
    const description = directText(placemark, 'description');
    const notes = description ? stripHtml(description).slice(0, 400) || null : null;
    const path = folderPath(placemark);
    const hints = typeHints(placemark);
    const layer = layerName(placemark, defaultLayer);

    for (const point of Array.from(placemark.getElementsByTagName('Point'))) {
      const coords = parseCoordinateList(point.getElementsByTagName('coordinates')[0]?.textContent);
      for (const coordinate of coords) {
        if (devices.length >= MAX_DEVICES) {
          truncatedDevices = true;
          break;
        }
        const kind = classify(name, hints, path);
        const fallback = `KMZ-${kind.toUpperCase()}-${devices.length + 1}`;
        const trimmed = name.trim();
        rememberLayer(layer);
        devices.push({
          kind,
          id: `kmz-device-${devices.length + 1}`,
          label: trimmed.length >= 2 ? trimmed.slice(0, MAX_NAME) : fallback,
          layer,
          lat: coordinate.lat,
          lng: coordinate.lng,
          notes,
        });
      }
    }

    for (const line of Array.from(placemark.getElementsByTagName('LineString'))) {
      const coords = parseCoordinateList(line.getElementsByTagName('coordinates')[0]?.textContent);
      if (coords.length < 2) continue;
      if (lines.length >= MAX_LINKS) {
        truncatedLines = true;
        continue;
      }
      lines.push({ name: name.trim(), layer, points: coords });
    }
  }

  if (truncatedDevices) {
    warnings.push(`Only the first ${MAX_DEVICES} device markers were converted.`);
  }
  if (truncatedLines) {
    warnings.push(`Only the first ${MAX_LINKS} route lines were converted.`);
  }
  if (devices.length === 0) {
    warnings.push('The file has no point placemarks, so no devices were created.');
  }

  const links: FibreLink[] = [];
  const linksByLayer = new Map<string, FibreLink[]>();
  let skippedLines = 0;
  for (const [index, line] of lines.entries()) {
    const first = line.points[0];
    const last = line.points[line.points.length - 1];
    const from = nearestDevice(first, devices);
    const to = nearestDevice(last, devices);
    if (
      !from ||
      !to ||
      from.distance > MAX_ENDPOINT_DISTANCE_M ||
      to.distance > MAX_ENDPOINT_DISTANCE_M ||
      from.device.id === to.device.id
    ) {
      skippedLines += 1;
      continue;
    }
    const fibreId =
      line.name.length >= 2 ? line.name.slice(0, MAX_FIBRE_ID) : `KMZ-LINK-${index + 1}`;
    const path = line.points.slice(1, -1).map((point) => ({ lat: point.lat, lng: point.lng }));
    const link = toLink(
      `kmz-link-${links.length + 1}`,
      fibreId,
      from.device,
      to.device,
      path,
      null,
    );
    links.push(link);
    rememberLayer(line.layer);
    const bucket = linksByLayer.get(line.layer);
    if (bucket) bucket.push(link);
    else linksByLayer.set(line.layer, [link]);
  }
  if (skippedLines > 0) {
    warnings.push(
      `${skippedLines} route line${skippedLines === 1 ? '' : 's'} had no device marker within ${MAX_ENDPOINT_DISTANCE_M} m of the ends and ${skippedLines === 1 ? 'was' : 'were'} skipped.`,
    );
  }

  return { devices, links, layers: layerOrder, linksByLayer, skippedLines, warnings };
}

/** Builds the app's import snapshot from converted KML content. */
export function kmlToMapTransfer(kml: string, context: KmzContext): KmzConversion {
  const parsed = parseKml(kml);

  function buildFile(devices: KmzDevice[], links: FibreLink[]): MapTransferFile {
    const tjs: Tj[] = [];
    const olts: Olt[] = [];
    const onus: Onu[] = [];
    let onuIndex = 0;
    for (const device of devices) {
      if (device.kind === 'olt') olts.push(toOlt(device));
      else if (device.kind === 'onu') onus.push(toOnu(device, onuIndex++));
      else tjs.push(toTj(device));
    }
    return {
      format: MAP_TRANSFER_FORMAT,
      version: MAP_TRANSFER_VERSION,
      exportedAt: new Date().toISOString(),
      areaId: context.area?.id ?? null,
      areaName: context.area?.name ?? null,
      subAreaId: context.subArea?.id ?? null,
      subAreaName: context.subArea?.name ?? null,
      olts,
      tjs,
      onus,
      links,
    };
  }

  const file = buildFile(parsed.devices, parsed.links);
  const layers = parsed.layers.map((name) => ({
    name,
    file: buildFile(
      parsed.devices.filter((device) => device.layer === name),
      parsed.linksByLayer.get(name) ?? [],
    ),
  }));

  return {
    file,
    layers,
    counts: {
      tjs: file.tjs.length,
      olts: file.olts.length,
      onus: file.onus.length,
      links: file.links.length,
      skippedLines: parsed.skippedLines,
    },
    warnings: parsed.warnings,
  };
}

/** Reads a .kmz archive (or a plain .kml file) and converts it to the map format. */
export async function convertKmzFile(file: File, context: KmzContext): Promise<KmzConversion> {
  const buffer = new Uint8Array(await file.arrayBuffer());
  const isZip = buffer.length >= 2 && buffer[0] === 0x50 && buffer[1] === 0x4b;
  const name = file.name.toLowerCase();

  let kml: string;
  if (isZip) {
    let entries: Record<string, Uint8Array>;
    try {
      entries = unzipSync(buffer);
    } catch {
      throw new Error('That KMZ archive could not be opened.');
    }
    const kmlName =
      Object.keys(entries).find((entry) => entry.toLowerCase() === 'doc.kml') ??
      Object.keys(entries).find((entry) => entry.toLowerCase().endsWith('.kml'));
    if (!kmlName) throw new Error('The KMZ archive has no KML document inside.');
    kml = strFromU8(entries[kmlName]);
  } else if (name.endsWith('.kml')) {
    kml = new TextDecoder().decode(buffer);
  } else {
    throw new Error('Choose a Google Earth export (.kmz or .kml) or a map snapshot (.json).');
  }

  if (!/<kml[\s>]/i.test(kml) && !/<Placemark[\s>]/i.test(kml)) {
    throw new Error('That file does not contain KML placemarks.');
  }
  return kmlToMapTransfer(kml, context);
}
