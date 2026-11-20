import type { FibreLink, Olt, Splitter, Tj } from './types';
import { calculateOutputPower, type SplitRatio } from './optical';
import { computeSpanLoss } from './power-budget';

export interface UpstreamPower {
  powerDbm: number;
  sourceKind: 'olt' | 'tj';
  sourceCode: string;
  sourceCore: string | null;
  fibreId: string;
  linkId: string;
}

function norm(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Power arriving at the near end of a span, i.e. the far-end power minus the
 * fibre attenuation, splices and connectors recorded on that link.
 */
function minusSpanLoss(powerDbm: number, link: FibreLink): number {
  return round2(powerDbm - computeSpanLoss(link).totalLossDb);
}

/**
 * Every far-end core patched to `coreLabel` on this link. The link's top-level
 * labels only describe one row, so the per-core rows are the source of truth.
 */
function farCoresFor(
  link: FibreLink,
  atFrom: boolean,
  coreLabel: string,
): (string | null)[] {
  const farCores: (string | null)[] = [];
  const add = (far: string | null | undefined) => {
    const value = far ?? null;
    if (!farCores.some((item) => norm(item) === norm(value) && (item === null) === (value === null))) {
      farCores.push(value);
    }
  };

  if (norm(atFrom ? link.fromCoreLabel : link.toCoreLabel) === norm(coreLabel)) {
    add(atFrom ? link.toCoreLabel : link.fromCoreLabel);
  }
  for (const core of link.cores ?? []) {
    if (norm(atFrom ? core.fromCoreLabel : core.toCoreLabel) === norm(coreLabel)) {
      add(atFrom ? core.toCoreLabel : core.fromCoreLabel);
    }
  }

  // Prefer a row that actually names the far core over one that leaves it blank.
  return farCores.sort((a, b) => (a === null ? 1 : 0) - (b === null ? 1 : 0));
}

/** The cable connected to a TJ core, whether or not the far device reports power. */
export function findLinkedFibreId(
  tjId: string,
  coreLabel: string | null,
  links: FibreLink[],
): string | null {
  let fallback: string | null = null;
  for (const link of links) {
    if (link.status !== 'active') continue;
    const atFrom = link.fromTjId === tjId;
    const atTo = link.toTjId === tjId;
    if (!atFrom && !atTo) continue;
    if (coreLabel && farCoresFor(link, atFrom, coreLabel).length > 0) return link.fibreId;
    // A link saved without core labels still feeds this joint; use it as the input.
    if (!fallback) fallback = link.fibreId;
  }
  return fallback;
}

/** Every working splitter in a joint; it may carry several parallel ones. */
function enabledSplitters(tj: Tj): (Splitter & { ratio: SplitRatio })[] {
  const fitted = tj.splitters?.length ? tj.splitters : tj.splitter ? [tj.splitter] : [];
  return fitted.filter(
    (splitter): splitter is Splitter & { ratio: SplitRatio } =>
      Boolean(splitter?.enabled && splitter.ratio),
  );
}

function oltPortPower(olt: Olt, coreLabel: string | null): number | null {
  const ports = olt.ponPorts ?? [];
  const label = coreLabel?.trim().toLowerCase();
  const direct = label
    ? ports.find((port) => port.label.trim().toLowerCase() === label)
    : undefined;
  const primary = olt.ponPort
    ? ports.find((port) => port.label.trim().toLowerCase() === olt.ponPort!.trim().toLowerCase())
    : undefined;
  // A named port without a dBm value should not hide another port that has one.
  const port = [direct, primary, ...ports].find(
    (item) => item && item.outputDbm !== null && item.outputDbm !== undefined,
  );
  if (!port || port.outputDbm === null || port.outputDbm === undefined) return null;
  return Number(port.outputDbm);
}

function storedCorePower(tj: Tj, coreLabel: string | null): number | null {
  if (!coreLabel) return null;
  const cores = [
    ...(tj.cores ?? []),
    ...(tj.outputCores ?? []),
    ...(tj.splitter?.outputs ?? []),
    ...enabledSplitters(tj).flatMap((splitter) => splitter.outputs ?? []),
  ];
  const core = cores.find((item) => item.label === coreLabel);
  return core && core.powerDbm !== null && core.powerDbm !== undefined
    ? Number(core.powerDbm)
    : null;
}

/**
 * Power available at one of a TJ's cores. A splitter output core is calculated
 * from the TJ's feed core minus the splitter loss; anything else is whatever
 * arrives on its upstream link.
 */
function tjCorePower(
  tj: Tj,
  coreLabel: string | null,
  tjs: Tj[],
  olts: Olt[],
  links: FibreLink[],
  visited: Set<string>,
): number | null {
  if (!coreLabel) return null;
  const key = `${tj.id}:${coreLabel}`;
  if (visited.has(key)) return null;
  visited.add(key);

  // A joint can carry several splitters, so the core decides which one feeds it:
  // its own output core wins, otherwise the first splitter whose leg matches.
  const splitters = enabledSplitters(tj);
  const splitter =
    splitters.find((item) => (item.outputs ?? []).some((core) => core.label === coreLabel)) ??
    splitters[0] ??
    null;
  const isOutputCore =
    Boolean(splitter) &&
    ((tj.outputCores ?? []).some((core) => core.label === coreLabel) ||
      (splitter?.outputs ?? []).some((core) => core.label === coreLabel));

  if (isOutputCore && splitter?.ratio) {
    const inputLabel = splitter.inputCoreLabel ?? null;
    const inputPower = findUpstreamPower(
      tj.id,
      inputLabel,
      tjs,
      olts,
      links,
      visited,
    )?.powerDbm;
    if (inputPower !== null && inputPower !== undefined) {
      return calculateOutputPower(inputPower, splitter.ratio, 0.2);
    }
    return storedCorePower(tj, coreLabel);
  }

  const upstream = findUpstreamPower(tj.id, coreLabel, tjs, olts, links, visited);
  if (upstream) return upstream.powerDbm;
  return storedCorePower(tj, coreLabel);
}

/** Best available power for a TJ when the exact core is not named on the link. */
function tjAnyPower(
  tj: Tj,
  tjs: Tj[],
  olts: Olt[],
  links: FibreLink[],
  visited: Set<string>,
): number | null {
  const feed = getTjInputCoreLabel(tj, links);
  if (feed) {
    const input = tjCorePower(tj, feed, tjs, olts, links, visited);
    if (input !== null) {
      const feedPower: number = input;
      // Parallel splitters do not stack: the best fed leg wins rather than the sum.
      const splitters = enabledSplitters(tj);
      if (splitters.length === 0) return feedPower;
      const legs = splitters
        .map((splitter) => calculateOutputPower(feedPower, splitter.ratio, 0.2))
        .filter((power): power is number => power !== null);
      return legs.length > 0 ? Math.max(...legs) : feedPower;
    }
  }
  const storedLeg = [...(tj.outputCores ?? []), ...(tj.splitter?.outputs ?? [])].find(
    (core) => core.powerDbm !== null && core.powerDbm !== undefined,
  );
  return storedLeg ? Number(storedLeg.powerDbm) : null;
}

/**
 * Follows the fibre link patched to `coreLabel` on `tjId` and returns the power
 * that arrives at this joint, i.e. the far device's output (OLT PON port or an
 * upstream TJ splitter leg) minus that span's fibre attenuation, splice and
 * connector losses. Returns null when the core has no active link or the far
 * device does not carry a power value.
 */
export function findUpstreamPower(
  tjId: string,
  coreLabel: string | null,
  tjs: Tj[],
  olts: Olt[],
  links: FibreLink[],
  visited: Set<string> = new Set(),
): UpstreamPower | null {
  const exactCore = coreLabel?.trim() ? coreLabel : null;

  for (const link of links) {
    if (!exactCore || link.status !== 'active') continue;
    const atFrom = link.fromTjId === tjId;
    const atTo = link.toTjId === tjId;
    if (!atFrom && !atTo) continue;

    for (const farCore of farCoresFor(link, atFrom, exactCore)) {
      if (atFrom ? link.toOltId : link.fromOltId) {
        const oltId = atFrom ? link.toOltId : link.fromOltId;
        const olt = olts.find((item) => item.id === oltId);
        if (!olt) continue;
        const power = oltPortPower(olt, farCore);
        if (power === null) continue;
        return {
          powerDbm: minusSpanLoss(power, link),
          sourceKind: 'olt',
          sourceCode: olt.code,
          sourceCore: farCore,
          fibreId: link.fibreId,
          linkId: link.id,
        };
      }

      const farTjId = atFrom ? link.toTjId : link.fromTjId;
      if (!farTjId) continue;
      const farTj = tjs.find((item) => item.id === farTjId);
      if (!farTj) continue;
      const power = tjCorePower(farTj, farCore, tjs, olts, links, visited);
      if (power === null) continue;
      return {
        powerDbm: minusSpanLoss(power, link),
        sourceKind: 'tj',
        sourceCode: farTj.code,
        sourceCore: farCore,
        fibreId: link.fibreId,
        linkId: link.id,
      };
    }
  }

  // Links saved without per-core labels still carry the far device's power.
  const fallbackKey = `${tjId}:*`;
  if (visited.has(fallbackKey)) return null;
  visited.add(fallbackKey);

  for (const link of links) {
    if (link.status !== 'active') continue;
    const atFrom = link.fromTjId === tjId;
    const atTo = link.toTjId === tjId;
    if (!atFrom && !atTo) continue;

    const oltId = atFrom ? link.toOltId : link.fromOltId;
    if (oltId) {
      const olt = olts.find((item) => item.id === oltId);
      if (!olt) continue;
      const power = oltPortPower(olt, null);
      if (power === null) continue;
      return {
        powerDbm: minusSpanLoss(power, link),
        sourceKind: 'olt',
        sourceCode: olt.code,
        sourceCore: null,
        fibreId: link.fibreId,
        linkId: link.id,
      };
    }

    const farTjId = atFrom ? link.toTjId : link.fromTjId;
    if (!farTjId) continue;
    const farTj = tjs.find((item) => item.id === farTjId);
    if (!farTj) continue;
    const power = tjAnyPower(farTj, tjs, olts, links, visited);
    if (power === null) continue;
    return {
      powerDbm: minusSpanLoss(power, link),
      sourceKind: 'tj',
      sourceCode: farTj.code,
      sourceCore: null,
      fibreId: link.fibreId,
      linkId: link.id,
    };
  }

  // A TJ assigned to an OLT PON port in its PON telemetry section also gets that
  // port's launch power, even when no separate fibre-link row was drawn.
  const assignedTj = tjs.find((item) => item.id === tjId);
  if (assignedTj?.oltId) {
    const olt = olts.find((item) => item.id === assignedTj.oltId);
    if (olt) {
      const portLabel = assignedTj.ponData?.ponPort?.trim() || olt.ponPort;
      const power = oltPortPower(olt, portLabel ?? null);
      if (power !== null) {
        return {
          powerDbm: power,
          sourceKind: 'olt',
          sourceCode: olt.code,
          sourceCore: portLabel ?? null,
          fibreId: assignedTj.fibreId ?? 'OLT feed',
          linkId: '',
        };
      }
    }
  }

  return null;
}

/** The core a TJ receives its feed on: the splitter feed core, else its first patched core. */
export function getTjInputCoreLabel(tj: Tj, links: FibreLink[]): string | null {
  const feed = enabledSplitters(tj).find((splitter) => splitter.inputCoreLabel);
  if (feed?.inputCoreLabel) return feed.inputCoreLabel;
  for (const link of links) {
    if (link.status !== 'active') continue;
    for (const core of link.cores ?? []) {
      if (link.fromTjId === tj.id && core.fromCoreLabel) return core.fromCoreLabel;
      if (link.toTjId === tj.id && core.toCoreLabel) return core.toCoreLabel;
    }
    if (link.fromTjId === tj.id && link.fromCoreLabel) return link.fromCoreLabel;
    if (link.toTjId === tj.id && link.toCoreLabel) return link.toCoreLabel;
  }
  return null;
}
