import type { DeviceKind, FibreLink, Olt, Onu, Tj } from './types';
import { getOnuClassInfo, getSplitterLossDb, type OnuClassInfo } from './optical';

/** Loss of one fusion splice, in dB. */
export const SPLICE_LOSS_DB = 0.1;
/** Fallback fibre attenuation (dB/km) when a span has no value recorded. */
export const DEFAULT_ATTENUATION_DB_PER_KM = 0.35;
/** Fallback connector / patch-panel loss for a span. */
export const DEFAULT_CONNECTION_LOSS_DB = 1;
/** OLT launch power used only when the PON port has no measured output. */
export const DEFAULT_OLT_TX_DBM = 3;
/** Below this remaining margin the link is flagged as marginal. */
const MARGINAL_MARGIN_DB = 3;

type NodeKey = string;

export interface BudgetSpan {
  linkId: string;
  fibreId: string;
  fromCode: string;
  toCode: string;
  lengthM: number | null;
  attenuationDbPerKm: number;
  spliceCount: number;
  fibreLossDb: number;
  spliceLossDb: number;
  connectionLossDb: number;
  totalLossDb: number;
}

export interface BudgetSplitter {
  tjId: string;
  tjCode: string;
  ratio: string;
  lossDb: number;
}

export type BudgetStatus = 'ok' | 'marginal' | 'over' | 'overload';

export interface PowerBudget {
  onuId: string;
  onuCode: string;
  oltId: string;
  oltCode: string;
  oltName: string | null;
  ponPort: string | null;
  txPowerDbm: number;
  /** True when no PON port output power was recorded, so the default TX was assumed. */
  txAssumed: boolean;
  route: { kind: DeviceKind; id: string; code: string; name: string | null }[];
  spans: BudgetSpan[];
  splitters: BudgetSplitter[];
  distanceM: number;
  fibreLossDb: number;
  spliceLossDb: number;
  connectionLossDb: number;
  splittingLossDb: number;
  totalLossDb: number;
  rxPowerDbm: number;
  classInfo: OnuClassInfo;
  /** Remaining ODN loss budget (class max loss − total loss). */
  marginDb: number;
  /** Receive power above the ONU sensitivity floor. */
  sensitivityMarginDb: number;
  /** Share of the class loss window already used, 0–100+. */
  budgetUsedPercent: number;
  status: BudgetStatus;
  hasCut: boolean;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function endpointKey(link: FibreLink, side: 'from' | 'to'): NodeKey | null {
  if (side === 'from') {
    if (link.fromOltId) return `olt:${link.fromOltId}`;
    if (link.fromOnuId) return `onu:${link.fromOnuId}`;
    if (link.fromTjId) return `tj:${link.fromTjId}`;
    return null;
  }
  if (link.toOltId) return `olt:${link.toOltId}`;
  if (link.toOnuId) return `onu:${link.toOnuId}`;
  if (link.toTjId) return `tj:${link.toTjId}`;
  return null;
}

function nodeInfo(
  key: NodeKey,
  tjs: Tj[],
  olts: Olt[],
  onus: Onu[],
): { kind: DeviceKind; id: string; code: string; name: string | null } | null {
  const [kind, id] = key.split(':');
  if (!id) return null;
  if (kind === 'onu') {
    const onu = onus.find((item) => item.id === id);
    return onu ? { kind: 'onu', id, code: onu.username, name: onu.fibreId } : null;
  }
  if (kind === 'olt') {
    const olt = olts.find((item) => item.id === id);
    return olt ? { kind: 'olt', id, code: olt.code, name: olt.name } : null;
  }
  const tj = tjs.find((item) => item.id === id);
  return tj ? { kind: 'tj', id, code: tj.code, name: tj.name } : null;
}

function oltPonPort(link: FibreLink, olt: Olt) {
  const coreLabel =
    link.fromOltId === olt.id
      ? link.fromCoreLabel
      : link.toOltId === olt.id
        ? link.toCoreLabel
        : null;
  const ports = olt.ponPorts ?? [];
  const label = coreLabel?.trim().toLowerCase();
  const direct = label ? ports.find((port) => port.label.trim().toLowerCase() === label) : undefined;
  if (direct) return direct;
  const primary = olt.ponPort
    ? ports.find((port) => port.label.trim().toLowerCase() === olt.ponPort!.trim().toLowerCase())
    : undefined;
  if (primary) return primary;
  return ports.find((port) => port.outputDbm !== null) ?? ports[0];
}

/**
 * Walks the graph from an ONU back to its serving OLT and accumulates every loss a
 * downstream signal meets: fibre attenuation over each span, fusion splices and
 * connectors on each span, and the insertion loss of each splitter the route passes
 * through. The shortest route wins, which is the physical tree path in practice.
 */
export function computeOnuPowerBudget(
  onu: Onu,
  tjs: Tj[],
  olts: Olt[],
  links: FibreLink[],
  onus: Onu[] = [onu],
): PowerBudget | null {
  const startKey: NodeKey = `onu:${onu.id}`;
  const adjacency = new Map<NodeKey, { link: FibreLink; other: NodeKey }[]>();

  const push = (from: NodeKey, to: NodeKey, link: FibreLink) => {
    const list = adjacency.get(from) ?? [];
    list.push({ link, other: to });
    adjacency.set(from, list);
  };

  for (const link of links) {
    const from = endpointKey(link, 'from');
    const to = endpointKey(link, 'to');
    if (!from || !to || from === to) continue;
    push(from, to, link);
    push(to, from, link);
  }

  const queue: NodeKey[] = [startKey];
  const visited = new Set<NodeKey>([startKey]);
  const parent = new Map<NodeKey, { prev: NodeKey; link: FibreLink }>();
  let oltKey: NodeKey | null = null;

  while (queue.length > 0 && !oltKey) {
    const current = queue.shift()!;
    for (const edge of adjacency.get(current) ?? []) {
      if (visited.has(edge.other)) continue;
      // Another subscriber ONU is a leaf, never a transit node.
      if (edge.other.startsWith('onu:')) continue;
      visited.add(edge.other);
      parent.set(edge.other, { prev: current, link: edge.link });
      if (edge.other.startsWith('olt:')) {
        oltKey = edge.other;
        break;
      }
      queue.push(edge.other);
    }
  }

  if (!oltKey) return null;

  // Climb from the OLT back to the ONU. `nodes` is OLT → … → ONU and `linksDesc[i]`
  // is the span between nodes[i] and nodes[i + 1].
  const nodes: NodeKey[] = [oltKey];
  const linksDesc: FibreLink[] = [];
  let cursor: NodeKey = oltKey;
  while (cursor !== startKey) {
    const step = parent.get(cursor);
    if (!step) return null;
    linksDesc.push(step.link);
    cursor = step.prev;
    nodes.push(cursor);
  }

  const olt = olts.find((item) => item.id === oltKey!.split(':')[1]);
  if (!olt) return null;

  const firstSpan = linksDesc[0];
  if (!firstSpan) return null;
  const port = oltPonPort(firstSpan, olt);
  const txAssumed = port?.outputDbm === null || port?.outputDbm === undefined;
  const txPowerDbm = txAssumed ? DEFAULT_OLT_TX_DBM : Number(port!.outputDbm);

  const spans: BudgetSpan[] = linksDesc.map((link, index) => {
    const fromKey = nodes[index];
    const toKey = nodes[index + 1];
    const fromCode = (fromKey ? nodeInfo(fromKey, tjs, olts, onus)?.code : null) ?? link.fromCode;
    const toCode = (toKey ? nodeInfo(toKey, tjs, olts, onus)?.code : null) ?? link.toCode;
    const lengthM = link.lengthM ?? null;
    const attenuationDbPerKm = link.attenuationDbPerKm ?? DEFAULT_ATTENUATION_DB_PER_KM;
    const spliceCount = link.spliceCount ?? 2;
    const fibreLossDb = round2(((lengthM ?? 0) / 1000) * attenuationDbPerKm);
    const spliceLossDb = round2(spliceCount * SPLICE_LOSS_DB);
    const connectionLossDb = round2(link.connectionLossDb ?? DEFAULT_CONNECTION_LOSS_DB);
    return {
      linkId: link.id,
      fibreId: link.fibreId,
      fromCode,
      toCode,
      lengthM,
      attenuationDbPerKm,
      spliceCount,
      fibreLossDb,
      spliceLossDb,
      connectionLossDb,
      totalLossDb: round2(fibreLossDb + spliceLossDb + connectionLossDb),
    };
  });

  const splitters: BudgetSplitter[] = [];
  for (let index = 1; index < nodes.length - 1; index += 1) {
    const key = nodes[index];
    if (!key || !key.startsWith('tj:')) continue;
    const tj = tjs.find((item) => item.id === key.split(':')[1]);
    if (!tj?.splitter?.enabled || !tj.splitter.ratio) continue;
    splitters.push({
      tjId: tj.id,
      tjCode: tj.code,
      ratio: tj.splitter.ratio,
      lossDb: getSplitterLossDb(tj.splitter.ratio, 0.2),
    });
  }

  const fibreLossDb = round2(spans.reduce((sum, span) => sum + span.fibreLossDb, 0));
  const spliceLossDb = round2(spans.reduce((sum, span) => sum + span.spliceLossDb, 0));
  const connectionLossDb = round2(spans.reduce((sum, span) => sum + span.connectionLossDb, 0));
  const splittingLossDb = round2(splitters.reduce((sum, splitter) => sum + splitter.lossDb, 0));
  const totalLossDb = round2(
    fibreLossDb + spliceLossDb + connectionLossDb + splittingLossDb,
  );
  const rxPowerDbm = round2(txPowerDbm - totalLossDb);
  const distanceM = Math.round(
    spans.reduce((sum, span) => sum + (span.lengthM ?? 0), 0),
  );

  const classInfo = getOnuClassInfo(onu.ponType, onu.onuClass);
  const marginDb = round2(classInfo.maxLossDb - totalLossDb);
  const sensitivityMarginDb = round2(rxPowerDbm - classInfo.sensitivityDbm);
  const budgetUsedPercent = Math.round((totalLossDb / classInfo.maxLossDb) * 100);

  let status: BudgetStatus = 'ok';
  if (rxPowerDbm > classInfo.overloadDbm) status = 'overload';
  else if (totalLossDb > classInfo.maxLossDb || rxPowerDbm < classInfo.sensitivityDbm) {
    status = 'over';
  } else if (marginDb < MARGINAL_MARGIN_DB) status = 'marginal';

  const route: PowerBudget['route'] = [];
  for (const key of nodes) {
    const info = nodeInfo(key, tjs, olts, onus);
    if (info) route.push(info);
  }

  return {
    onuId: onu.id,
    onuCode: onu.username,
    oltId: olt.id,
    oltCode: olt.code,
    oltName: olt.name,
    ponPort: port?.label ?? null,
    txPowerDbm,
    txAssumed,
    route,
    spans,
    splitters,
    distanceM,
    fibreLossDb,
    spliceLossDb,
    connectionLossDb,
    splittingLossDb,
    totalLossDb,
    rxPowerDbm,
    classInfo,
    marginDb,
    sensitivityMarginDb,
    budgetUsedPercent,
    status,
    hasCut: linksDesc.some((link) => link.status === 'cut'),
  };
}

/** Power budget for every ONU that has a complete route back to an OLT. */
export function computePowerBudgets(
  tjs: Tj[],
  olts: Olt[],
  onus: Onu[],
  links: FibreLink[],
): Map<string, PowerBudget> {
  const result = new Map<string, PowerBudget>();
  for (const onu of onus) {
    const budget = computeOnuPowerBudget(onu, tjs, olts, links, onus);
    if (budget) result.set(onu.id, budget);
  }
  return result;
}

/** Single-span loss (fibre + splice + connectors) for the link detail panel. */
export function computeSpanLoss(link: FibreLink) {
  const attenuationDbPerKm = link.attenuationDbPerKm ?? DEFAULT_ATTENUATION_DB_PER_KM;
  const spliceCount = link.spliceCount ?? 2;
  const fibreLossDb = round2(((link.lengthM ?? 0) / 1000) * attenuationDbPerKm);
  const spliceLossDb = round2(spliceCount * SPLICE_LOSS_DB);
  const connectionLossDb = round2(link.connectionLossDb ?? DEFAULT_CONNECTION_LOSS_DB);
  return {
    attenuationDbPerKm,
    spliceCount,
    fibreLossDb,
    spliceLossDb,
    connectionLossDb,
    totalLossDb: round2(fibreLossDb + spliceLossDb + connectionLossDb),
  };
}
