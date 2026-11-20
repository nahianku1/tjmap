import type { DeviceKind, FibreLink, Olt, Onu, Tj } from './types';
import { haversineMeters, routeLengthMeters } from './route';
import { computeSpanLoss } from './power-budget';
import { getSplitterLossDb } from './optical';

export type RouteNodeKey = string;

export interface RouteNode {
  key: RouteNodeKey;
  kind: DeviceKind;
  id: string;
  code: string;
  name: string | null;
  lat: number | null;
  lng: number | null;
}

export interface RouteHop {
  link: FibreLink;
  lengthM: number;
  cableLossDb: number;
  /** Insertion loss of the splitter the route passes at this hop's start joint. */
  splitterLossDb: number;
}

export interface ShortestRoute {
  /** Devices in travel order, start first. */
  nodes: RouteNode[];
  /** Links between nodes[i] and nodes[i + 1]. */
  hops: RouteHop[];
  distanceM: number;
  cableLossDb: number;
  splitterLossDb: number;
  lossDb: number;
  /** True when the only usable path crosses spans marked as cut. */
  crossesCut: boolean;
}

export function routeKey(kind: DeviceKind, id: string): RouteNodeKey {
  return `${kind}:${id}`;
}

/** Every device that has a position, as a node the route graph can reference. */
export function buildRouteNodes(tjs: Tj[], olts: Olt[], onus: Onu[]): RouteNode[] {
  const nodes: RouteNode[] = [];
  olts.forEach((olt) => {
    if (olt.lat === null || olt.lng === null) return;
    nodes.push({ key: routeKey('olt', olt.id), kind: 'olt', id: olt.id, code: olt.code, name: olt.name, lat: olt.lat, lng: olt.lng });
  });
  tjs.forEach((tj) => {
    nodes.push({ key: routeKey('tj', tj.id), kind: 'tj', id: tj.id, code: tj.code, name: tj.name, lat: tj.lat, lng: tj.lng });
  });
  (onus ?? []).forEach((onu) => {
    nodes.push({ key: routeKey('onu', onu.id), kind: 'onu', id: onu.id, code: onu.username, name: onu.fibreId, lat: onu.lat ?? null, lng: onu.lng ?? null });
  });
  return nodes;
}

function endpointKey(link: FibreLink, side: 'from' | 'to'): RouteNodeKey | null {
  if (side === 'from') {
    if (link.fromOltId) return routeKey('olt', link.fromOltId);
    if (link.fromOnuId) return routeKey('onu', link.fromOnuId);
    if (link.fromTjId) return routeKey('tj', link.fromTjId);
    return null;
  }
  if (link.toOltId) return routeKey('olt', link.toOltId);
  if (link.toOnuId) return routeKey('onu', link.toOnuId);
  if (link.toTjId) return routeKey('tj', link.toTjId);
  return null;
}

/** Cable length of a span: its recorded length, else the drawn route. */
export function spanLengthM(link: FibreLink): number {
  if (link.lengthM != null && Number.isFinite(link.lengthM)) return link.lengthM;
  return routeLengthMeters(link.fromLat, link.fromLng, link.toLat, link.toLng, link.path);
}

function splitterLossAt(tj: Tj, outgoing: FibreLink): number {
  const fitted = (tj.splitters?.length ? tj.splitters : tj.splitter ? [tj.splitter] : []).filter(
    (splitter) => splitter?.enabled && splitter.ratio,
  );
  if (fitted.length === 0) return 0;

  const atFrom = outgoing.fromTjId === tj.id;
  const atTo = outgoing.toTjId === tj.id;
  let localCore: string | null = null;
  if (atFrom || atTo) {
    const row = (outgoing.cores ?? []).find((core) =>
      Boolean(atFrom ? core.fromCoreLabel : core.toCoreLabel),
    );
    localCore = row ? (atFrom ? row.fromCoreLabel : row.toCoreLabel) : null;
  }
  // Only a drop leg leaving a splitter output carries its insertion loss; a
  // feed core (route heading upstream to the OLT) does not pass the splitter.
  const splitter = fitted.find((item) =>
    (item.outputs ?? []).some((core) => core.label === localCore),
  );
  return splitter?.ratio ? getSplitterLossDb(splitter.ratio, 0.2) : 0;
}

interface Edge {
  link: FibreLink;
  other: RouteNodeKey;
  lengthM: number;
}

function buildAdjacency(links: FibreLink[], allowCut: boolean) {
  const adjacency = new Map<RouteNodeKey, Edge[]>();
  const push = (from: RouteNodeKey, to: RouteNodeKey, link: FibreLink, lengthM: number) => {
    const list = adjacency.get(from) ?? [];
    list.push({ link, other: to, lengthM });
    adjacency.set(from, list);
  };
  for (const link of links) {
    if (!allowCut && link.status === 'cut') continue;
    const from = endpointKey(link, 'from');
    const to = endpointKey(link, 'to');
    if (!from || !to || from === to) continue;
    const lengthM = spanLengthM(link);
    push(from, to, link, lengthM);
    push(to, from, link, lengthM);
  }
  return adjacency;
}

export interface ShortestRouteOptions {
  /** Allow spans marked as cut. Used as a fallback when no active path exists. */
  allowCut?: boolean;
}

/**
 * Dijkstra over the device graph, weighted by real cable length (including the
 * drawn duct waypoints). Returns null when the two devices are not connected.
 */
export function findShortestRoute(
  startKey: RouteNodeKey,
  endKey: RouteNodeKey,
  nodes: RouteNode[],
  tjs: Tj[],
  links: FibreLink[],
  options: ShortestRouteOptions = {},
): ShortestRoute | null {
  const nodeByKey = new Map(nodes.map((node) => [node.key, node]));
  const start = nodeByKey.get(startKey);
  const end = nodeByKey.get(endKey);
  if (!start || !end) return null;

  const adjacency = buildAdjacency(links, options.allowCut ?? false);
  const distances = new Map<RouteNodeKey, number>([[startKey, 0]]);
  const parent = new Map<RouteNodeKey, { prev: RouteNodeKey; link: FibreLink; lengthM: number }>();
  const settled = new Set<RouteNodeKey>();

  while (settled.size < adjacency.size + 1) {
    let current: RouteNodeKey | null = null;
    let best = Infinity;
    distances.forEach((value, key) => {
      if (!settled.has(key) && value < best) {
        best = value;
        current = key;
      }
    });
    if (current === null) break;
    if (current === endKey) break;
    settled.add(current);

    for (const edge of adjacency.get(current) ?? []) {
      if (settled.has(edge.other)) continue;
      const next = best + edge.lengthM;
      if (next < (distances.get(edge.other) ?? Infinity)) {
        distances.set(edge.other, next);
        parent.set(edge.other, { prev: current, link: edge.link, lengthM: edge.lengthM });
      }
    }
  }

  if (!distances.has(endKey)) return null;

  const keys: RouteNodeKey[] = [endKey];
  let cursor = endKey;
  while (cursor !== startKey) {
    const step = parent.get(cursor);
    if (!step) return null;
    keys.unshift(step.prev);
    cursor = step.prev;
  }

  const routeNodes = keys.map((key) => nodeByKey.get(key)!);
  const hops: RouteHop[] = [];
  let cableLossDb = 0;
  let splitterLossDb = 0;
  let crossesCut = false;

  for (let index = 0; index < keys.length - 1; index += 1) {
    const step = parent.get(keys[index + 1]);
    if (!step) return null;
    const link = step.link;
    if (link.status === 'cut') crossesCut = true;
    const span = computeSpanLoss(link);
    const fromNode = routeNodes[index];
    let splitter = 0;
    if (fromNode.kind === 'tj') {
      const tj = tjs.find((item) => item.id === fromNode.id);
      if (tj) splitter = splitterLossAt(tj, link);
    }
    cableLossDb += span.totalLossDb;
    splitterLossDb += splitter;
    hops.push({
      link,
      lengthM: step.lengthM,
      cableLossDb: span.totalLossDb,
      splitterLossDb: splitter,
    });
  }

  const round2 = (value: number) => Math.round(value * 100) / 100;
  const distanceM = hops.reduce((sum, hop) => sum + hop.lengthM, 0);
  return {
    nodes: routeNodes,
    hops,
    distanceM: Math.round(distanceM),
    cableLossDb: round2(cableLossDb),
    splitterLossDb: round2(splitterLossDb),
    lossDb: round2(cableLossDb + splitterLossDb),
    crossesCut,
  };
}

/** Move a free coordinate onto the closest device that exists in the cable graph. */
export function nearestRouteNode(
  lat: number,
  lng: number,
  nodes: RouteNode[],
): { node: RouteNode; distanceM: number } | null {
  let best: { node: RouteNode; distanceM: number } | null = null;
  for (const node of nodes) {
    if (node.lat === null || node.lng === null) continue;
    const distanceM = haversineMeters(lat, lng, node.lat, node.lng);
    if (!best || distanceM < best.distanceM) best = { node, distanceM };
  }
  return best;
}

/** Accepts "23.8103, 90.4125" and whitespace-separated variants. */
export function parseCoordinates(text: string): { lat: number; lng: number } | null {
  const parts = text.trim().split(/[\s,;]+/).filter(Boolean);
  if (parts.length !== 2) return null;
  const lat = Number(parts[0]);
  const lng = Number(parts[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}
