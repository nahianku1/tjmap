import type { DeviceKind, FibreLink, Olt, Onu, Splitter, Tj } from './types';
import {
  getOnuClassInfo,
  getSplitterLossDb,
  type OnuClassInfo,
  type SplitRatio,
} from './optical';

/** Loss of one fusion splice, in dB. */
export const SPLICE_LOSS_DB = 0.1;
/** Fallback fibre attenuation (dB/km) when a span has no value recorded. */
export const DEFAULT_ATTENUATION_DB_PER_KM = 0.5;
/** Fallback connector / patch-panel loss for a span. */
export const DEFAULT_CONNECTION_LOSS_DB = 0.2;
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
  /** Cable strand this span uses, when the device is patched to a core. */
  coreLabel: string | null;
  /** Operational status of the span; anything but active blocks the light. */
  status: FibreLink['status'];
  /** Extra loss recorded on that strand (a repaired or degraded core). */
  extraLossDb: number;
  totalLossDb: number;
}

export interface BudgetSplitter {
  tjId: string;
  tjCode: string;
  ratio: string;
  lossDb: number;
  /** The splitter's input strand, and whether the incoming span lands on it. */
  feedCore: string | null;
  fed: boolean;
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
  /** Cores on the route that are marked damaged or cut, so no light reaches the ONU. */
  coreFaults: string[];
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

/** The cable strands a link terminates on, when it touches this device. */
function linkLocalCores(link: FibreLink, deviceId: string): string[] {
  const atFrom = link.fromTjId === deviceId;
  const atTo = link.toTjId === deviceId;
  if (!atFrom && !atTo) return [];
  return (link.cores ?? [])
    .map((core) => (atFrom ? core.fromCoreLabel : core.toCoreLabel))
    .filter((label): label is string => Boolean(label?.trim()));
}

/** Shortest physical route from the ONU back to an OLT, ignoring link health. */
function findOnuRoute(
  onu: Onu,
  links: FibreLink[],
): { nodes: NodeKey[]; linksDesc: FibreLink[] } | null {
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

  return { nodes, linksDesc };
}

/**
 * The splitter a route passes through at one joint, plus whether its input core
 * is actually fed by the incoming span. Only a fed splitter can hand light on.
 */
function splitterOnRoute(
  tj: Tj,
  incoming: FibreLink | undefined,
  outgoing: FibreLink | undefined,
): { splitter: Splitter & { ratio: SplitRatio }; feedCore: string | null; fed: boolean } | null {
  const fitted = (tj.splitters?.length ? tj.splitters : tj.splitter ? [tj.splitter] : []).filter(
    (item): item is Splitter & { ratio: SplitRatio } => Boolean(item?.enabled && item.ratio),
  );
  if (fitted.length === 0) return null;

  const outgoingCores = outgoing ? linkLocalCores(outgoing, tj.id) : [];
  const splitter =
    fitted.find((item) =>
      (item.outputs ?? []).some((core) => outgoingCores.includes(core.label)),
    ) ?? fitted[0];
  if (!splitter.ratio) return null;

  const feedCore = splitter.inputCoreLabel?.trim() || null;
  const incomingCores = incoming ? linkLocalCores(incoming, tj.id) : [];
  const normalisedFeed = feedCore?.toLowerCase() ?? null;
  // Links saved without per-core rows still count as patched; a labelled span
  // must actually terminate on the splitter's input core.
  const fed =
    Boolean(normalisedFeed) &&
    (incomingCores.length === 0 ||
      incomingCores.some((label) => label.trim().toLowerCase() === normalisedFeed));
  return { splitter, feedCore, fed };
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
  const path = findOnuRoute(onu, links);
  if (!path) return null;
  const { nodes, linksDesc } = path;

  const olt = olts.find((item) => item.id === nodes[0]?.split(':')[1]);
  if (!olt) return null;

  const firstSpan = linksDesc[0];
  if (!firstSpan) return null;
  const port = oltPonPort(firstSpan, olt);
  const txAssumed = port?.outputDbm === null || port?.outputDbm === undefined;
  const txPowerDbm = txAssumed ? DEFAULT_OLT_TX_DBM : Number(port!.outputDbm);

  const coreFaults: string[] = [];

  /** The cable strand a device terminates on, and whether that core is broken. */
  const strandFor = (key: NodeKey | undefined, link: FibreLink) => {
    if (!key)
      return {
        label: null as string | null,
        localCore: null as string | null,
        extraLossDb: 0,
        fault: null as string | null,
      };
    const [kind, id] = key.split(':');
    const atFrom =
      (kind === 'tj' && link.fromTjId === id) ||
      (kind === 'olt' && link.fromOltId === id) ||
      (kind === 'onu' && link.fromOnuId === id);
    const row = (link.cores ?? []).find((core) =>
      Boolean(atFrom ? core.fromCoreLabel : core.toCoreLabel),
    );
    if (!row)
      return {
        label: null as string | null,
        localCore: null as string | null,
        extraLossDb: 0,
        fault: null as string | null,
      };
    const localCore = (atFrom ? row.fromCoreLabel : row.toCoreLabel) ?? null;
    let fault: string | null = null;
    if (kind === 'tj') {
      const tj = tjs.find((item) => item.id === id);
      const core = tj?.cores?.find((item) => item.label === localCore);
      if (core?.status === 'damaged') fault = `${tj?.code ?? 'TJ'} ${localCore ?? 'core'} damaged`;
    } else if (kind === 'onu') {
      const onu = onus.find((item) => item.id === id);
      const core = onu?.cores?.find((item) => item.label === localCore);
      if (core?.status === 'damaged') {
        fault = `${onu?.username ?? 'ONU'} ${localCore ?? 'core'} damaged`;
      }
    }
    return {
      label: row.label,
      localCore,
      extraLossDb: round2(Number(row.lossDb ?? 0)),
      fault,
    };
  };

  const spans: BudgetSpan[] = linksDesc.map((link, index) => {
    const fromKey = nodes[index];
    const toKey = nodes[index + 1];
    const strand = strandFor(fromKey, link);
    if (strand.fault) coreFaults.push(`${link.fibreId} · ${strand.fault}`);
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
      coreLabel: strand.label,
      status: link.status,
      extraLossDb: strand.extraLossDb,
      totalLossDb: round2(fibreLossDb + spliceLossDb + connectionLossDb + strand.extraLossDb),
    };
  });

  const splitters: BudgetSplitter[] = [];
  for (let index = 1; index < nodes.length - 1; index += 1) {
    const key = nodes[index];
    if (!key || !key.startsWith('tj:')) continue;
    const tj = tjs.find((item) => item.id === key.split(':')[1]);
    if (!tj) continue;
    // A joint may carry several splitters; only the one the route leaves through
    // is in this path.
    const found = splitterOnRoute(tj, linksDesc[index - 1], linksDesc[index]);
    if (!found) continue;
    // Light reaches a splitter's legs only through its input core. A splitter
    // without a feed, or with the incoming span patched to another core, cannot
    // power an ONU below it, so no budget applies.
    if (!found.fed) return null;
    splitters.push({
      tjId: tj.id,
      tjCode: tj.code,
      ratio: found.splitter.ratio,
      lossDb: getSplitterLossDb(found.splitter.ratio, 0.2),
      feedCore: found.feedCore,
      fed: found.fed,
    });
  }

  const fibreLossDb = round2(spans.reduce((sum, span) => sum + span.fibreLossDb, 0));
  const spliceLossDb = round2(spans.reduce((sum, span) => sum + span.spliceLossDb, 0));
  const connectionLossDb = round2(spans.reduce((sum, span) => sum + span.connectionLossDb, 0));
  const splittingLossDb = round2(splitters.reduce((sum, splitter) => sum + splitter.lossDb, 0));
  const coreExtraLossDb = round2(spans.reduce((sum, span) => sum + span.extraLossDb, 0));
  const totalLossDb = round2(
    fibreLossDb + spliceLossDb + connectionLossDb + splittingLossDb + coreExtraLossDb,
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
    coreFaults,
  };
}

export type OnuChainStatus = 'ok' | 'cut' | 'unfed' | 'open';

export interface OnuChainSpan {
  linkId: string;
  fibreId: string;
  fromCode: string;
  toCode: string;
  status: FibreLink['status'];
  lengthM: number | null;
  coreLabel: string | null;
}

export interface OnuChainSplitter {
  tjId: string;
  tjCode: string;
  ratio: string;
  feedCore: string | null;
  fed: boolean;
}

export interface OnuChainDiagnosis {
  status: OnuChainStatus;
  title: string;
  detail: string;
  route: PowerBudget['route'];
  spans: OnuChainSpan[];
  splitters: OnuChainSplitter[];
  faults: string[];
}

/**
 * Physical state of the ONU's chain back to the OLT, independent of whether an
 * optical budget can be calculated. It names each span's health, each splitter's
 * feed state and the exact break, so the panel stays informative while the link
 * is down or a fibre is cut.
 */
export function diagnoseOnuChain(
  onu: Onu,
  tjs: Tj[],
  olts: Olt[],
  links: FibreLink[],
  onus: Onu[] = [onu],
): OnuChainDiagnosis {
  const route = findOnuRoute(onu, links);

  if (!route) {
    const directSpans: OnuChainSpan[] = links
      .filter((link) => link.fromOnuId === onu.id || link.toOnuId === onu.id)
      .map((link) => ({
        linkId: link.id,
        fibreId: link.fibreId,
        fromCode: link.fromCode,
        toCode: link.toCode,
        status: link.status,
        lengthM: link.lengthM ?? null,
        coreLabel: null,
      }));
    const downSpans = directSpans.filter((span) => span.status !== 'active');
    return {
      status: 'open',
      title: downSpans.length > 0 ? 'Drop cable cut' : 'No path to OLT',
      detail:
        downSpans.length > 0
          ? `${downSpans.map((span) => span.fibreId).join(', ')} is down, so no light reaches this ONU.`
          : 'No fibre path from this ONU back to an OLT. Check the drop cable and the upstream links.',
      route: [],
      spans: directSpans,
      splitters: [],
      faults: downSpans.map((span) => `${span.fibreId} is ${span.status}`),
    };
  }

  const { nodes, linksDesc } = route;
  const info = nodes.map((key) => nodeInfo(key, tjs, olts, onus));
  const routeNodes = info.filter(
    (item): item is NonNullable<typeof item> => item !== null,
  );

  const spans: OnuChainSpan[] = linksDesc.map((link, index) => {
    const fromKey = nodes[index];
    const toKey = nodes[index + 1];
    const localCores = fromKey?.startsWith('tj:')
      ? linkLocalCores(link, fromKey.split(':')[1])
      : [];
    return {
      linkId: link.id,
      fibreId: link.fibreId,
      fromCode: info[index]?.code ?? link.fromCode,
      toCode: info[index + 1]?.code ?? link.toCode,
      status: link.status,
      lengthM: link.lengthM ?? null,
      coreLabel: localCores[0] ?? null,
    };
  });

  const splitters: OnuChainSplitter[] = [];
  const faults: string[] = [];
  for (let index = 1; index < nodes.length - 1; index += 1) {
    const key = nodes[index];
    if (!key?.startsWith('tj:')) continue;
    const tj = tjs.find((item) => item.id === key.split(':')[1]);
    if (!tj) continue;
    const found = splitterOnRoute(tj, linksDesc[index - 1], linksDesc[index]);
    if (!found) continue;
    splitters.push({
      tjId: tj.id,
      tjCode: tj.code,
      ratio: found.splitter.ratio,
      feedCore: found.feedCore,
      fed: found.fed,
    });
    if (!found.fed) {
      faults.push(
        `${tj.code} splitter ${found.splitter.ratio}${
          found.feedCore ? ` (feed ${found.feedCore})` : ''
        } has no input cable`,
      );
    }
  }

  const downSpans = spans.filter((span) => span.status !== 'active');
  downSpans.forEach((span) => faults.push(`${span.fibreId} is ${span.status}`));
  const unfedSplitter = splitters.some((splitter) => !splitter.fed);

  if (downSpans.length > 0) {
    return {
      status: 'cut',
      title: `${downSpans.length} span${downSpans.length > 1 ? 's' : ''} down`,
      detail: `${downSpans.map((span) => span.fibreId).join(', ')} ${
        downSpans.length > 1 ? 'are' : 'is'
      } not carrying light. Any power figures below describe the intact path.`,
      route: routeNodes,
      spans,
      splitters,
      faults,
    };
  }

  if (unfedSplitter) {
    return {
      status: 'unfed',
      title: 'Splitter unfed',
      detail:
        'A splitter on this chain has no input cable on its feed core, so no optical power reaches its legs.',
      route: routeNodes,
      spans,
      splitters,
      faults,
    };
  }

  return {
    status: 'ok',
    title: 'Chain intact',
    detail: `${spans.length} span${spans.length === 1 ? '' : 's'} · ${
      splitters.length
    } splitter${splitters.length === 1 ? '' : 's'} · no faults detected`,
    route: routeNodes,
    spans,
    splitters,
    faults,
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
export function computeSpanLoss(
  link: Pick<FibreLink, 'lengthM' | 'attenuationDbPerKm' | 'spliceCount' | 'connectionLossDb'>,
) {
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
