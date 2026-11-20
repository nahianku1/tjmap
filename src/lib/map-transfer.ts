import { api } from './api';
import { tiaCoreColor, tiaCoreLabel } from './fibre-cores';
import type { DeviceKind, FibreLink, Network, Olt, Onu, Tj } from './types';

export const MAP_TRANSFER_FORMAT = 'isp-tj-map';
export const MAP_TRANSFER_VERSION = 1;

/** A portable snapshot of everything drawn on one map. */
export interface MapTransferFile {
  format: typeof MAP_TRANSFER_FORMAT;
  version: number;
  exportedAt: string;
  areaId: string | null;
  areaName: string | null;
  /** Set when the snapshot covers one sub-area instead of the whole map. */
  subAreaId: string | null;
  subAreaName: string | null;
  olts: Olt[];
  tjs: Tj[];
  onus: Onu[];
  links: FibreLink[];
}

export interface MapImportResult {
  olts: number;
  tjs: number;
  onus: number;
  links: number;
  skippedLinks: number;
  removed: number;
  renamed: number;
}

export interface MapImportOptions {
  /** Delete every device currently on the map before recreating the snapshot. */
  replaceExisting?: boolean;
  /** Devices currently displayed on the map; removed first when replacing. */
  current?: { tjs: Tj[]; olts: Olt[]; onus?: Onu[]; links?: FibreLink[] };
  /** Sub-area receiving the snapshot; the file must belong to it. */
  targetSubAreaId?: string | null;
  /**
   * Mapping of file device ids to created ids, shared across several imports so
   * links can reach devices created by an earlier call (e.g. other KMZ layers).
   */
  sharedIdMap?: Map<string, string>;
}

/** Builds the export payload from the network already loaded on the map. */
export function createMapTransfer(
  network: Pick<Network, 'olts' | 'tjs' | 'links'> & { onus?: Onu[] },
  area?: { id: string; name: string } | null,
): MapTransferFile {
  return {
    format: MAP_TRANSFER_FORMAT,
    version: MAP_TRANSFER_VERSION,
    exportedAt: new Date().toISOString(),
    areaId: area?.id ?? null,
    areaName: area?.name ?? null,
    subAreaId: null,
    subAreaName: null,
    olts: network.olts,
    tjs: network.tjs,
    onus: network.onus ?? [],
    links: network.links,
  };
}

/** Snapshot of only the devices and links filed under one sub-area. */
export function createSubAreaTransfer(
  network: Pick<Network, 'olts' | 'tjs' | 'links'> & { onus?: Onu[] },
  area: { id: string; name: string } | null,
  subArea: { id: string; name: string },
): MapTransferFile {
  return {
    format: MAP_TRANSFER_FORMAT,
    version: MAP_TRANSFER_VERSION,
    exportedAt: new Date().toISOString(),
    areaId: area?.id ?? null,
    areaName: area?.name ?? null,
    subAreaId: subArea.id,
    subAreaName: subArea.name,
    olts: network.olts.filter((olt) => olt.subAreaId === subArea.id),
    tjs: network.tjs.filter((tj) => tj.subAreaId === subArea.id),
    onus: (network.onus ?? []).filter((onu) => onu.subAreaId === subArea.id),
    links: network.links.filter((link) => link.subAreaId === subArea.id),
  };
}

export function mapTransferFilename(
  areaName?: string | null,
  customName?: string | null,
): string {
  const custom = customName?.trim().replace(/\.json$/i, '');
  if (custom) {
    const slug = custom
      .normalize('NFKD')
      .replace(/[^A-Za-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase()
      .slice(0, 60);
    return `${slug || 'map'}.json`;
  }
  const slug = (areaName ?? 'national')
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 60);
  const stamp = new Date().toISOString().slice(0, 10);
  return `isp-tj-map-${slug || 'national'}-${stamp}.json`;
}

/** Hands the snapshot to the browser as a downloadable JSON file. */
export function downloadMapTransfer(file: MapTransferFile, filename = mapTransferFilename(file.areaName)) {
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function asRecord(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(message);
  return value as Record<string, unknown>;
}

function assertEntries(
  value: unknown,
  label: string,
  validate: (entry: Record<string, unknown>) => void,
): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new Error(`The file has no ${label} list.`);
  return value.map((item, index) => {
    const entry = asRecord(item, `The file has an invalid ${label} entry at #${index + 1}.`);
    validate(entry);
    return entry;
  });
}

/**
 * Reads an exported snapshot back. Only the shape that the import relies on is
 * validated here; the API validates every device payload as it is recreated.
 */
export function parseMapTransferFile(text: string): MapTransferFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  const file = asRecord(raw, 'That file is not a map export.');
  if (file.format !== MAP_TRANSFER_FORMAT) {
    throw new Error('That file was not exported from this map.');
  }

  const hasString = (entry: Record<string, unknown>, key: string) =>
    typeof entry[key] === 'string' && (entry[key] as string).trim().length > 0;
  const hasNumber = (entry: Record<string, unknown>, key: string) =>
    typeof entry[key] === 'number' && Number.isFinite(entry[key] as number);

  const olts = assertEntries(file.olts, 'OLT', (entry) => {
    if (!hasString(entry, 'id') || !hasString(entry, 'name')) {
      throw new Error('An OLT in this file is missing its id or name.');
    }
  }) as unknown as Olt[];

  const tjs = assertEntries(file.tjs, 'TJ', (entry) => {
    if (!hasString(entry, 'id') || !hasString(entry, 'code')) {
      throw new Error('A terminal joint in this file is missing its id or code.');
    }
    if (!hasNumber(entry, 'lat') || !hasNumber(entry, 'lng')) {
      throw new Error(`Terminal joint ${String(entry.code)} has no map position.`);
    }
  }) as unknown as Tj[];

  const onus = assertEntries(file.onus, 'ONU', (entry) => {
    if (!hasString(entry, 'id') || !hasString(entry, 'username')) {
      throw new Error('An ONU in this file is missing its id or username.');
    }
  }) as unknown as Onu[];

  const links = assertEntries(file.links, 'link', (entry) => {
    if (!hasString(entry, 'fibreId')) {
      throw new Error('A link in this file is missing its fibre ID.');
    }
  }) as unknown as FibreLink[];

  return {
    format: MAP_TRANSFER_FORMAT,
    version: typeof file.version === 'number' ? file.version : MAP_TRANSFER_VERSION,
    exportedAt: typeof file.exportedAt === 'string' ? file.exportedAt : '',
    areaId: typeof file.areaId === 'string' ? file.areaId : null,
    areaName: typeof file.areaName === 'string' ? file.areaName : null,
    subAreaId: typeof file.subAreaId === 'string' ? file.subAreaId : null,
    subAreaName: typeof file.subAreaName === 'string' ? file.subAreaName : null,
    olts,
    tjs,
    onus,
    links,
  };
}

function endpointOf(link: FibreLink, side: 'from' | 'to'): { kind: DeviceKind; id: string } | null {
  if (side === 'from') {
    if (link.fromOltId) return { kind: 'olt', id: link.fromOltId };
    if (link.fromOnuId) return { kind: 'onu', id: link.fromOnuId };
    if (link.fromTjId) return { kind: 'tj', id: link.fromTjId };
    return null;
  }
  if (link.toOltId) return { kind: 'olt', id: link.toOltId };
  if (link.toOnuId) return { kind: 'onu', id: link.toOnuId };
  if (link.toTjId) return { kind: 'tj', id: link.toTjId };
  return null;
}

function fromPayload(endpoint: { kind: DeviceKind; id: string }) {
  if (endpoint.kind === 'olt') return { fromOltId: endpoint.id };
  if (endpoint.kind === 'onu') return { fromOnuId: endpoint.id };
  return { fromTjId: endpoint.id };
}

function toPayload(endpoint: { kind: DeviceKind; id: string }) {
  if (endpoint.kind === 'olt') return { toOltId: endpoint.id };
  if (endpoint.kind === 'onu') return { toOnuId: endpoint.id };
  return { toTjId: endpoint.id };
}

/**
 * Recreates a snapshot in the area it was exported from. Importing into any
 * other area (or across the national/area boundary) is refused. Devices are
 * created first and their old ids are remapped so links and TJ→OLT assignments
 * still point at the new records. Codes and OLT names are unique network-wide,
 * so any value already in use is given a short suffix instead of stopping.
 */
export async function importMapTransfer(
  file: MapTransferFile,
  targetAreaId: string | null,
  existing: { tjs: Tj[]; olts: Olt[] },
  options: MapImportOptions = {},
  onProgress?: (message: string) => void,
): Promise<MapImportResult> {
  // A snapshot belongs to the area it was exported from; it cannot be moved
  // into a different area (or between an area and the national map).
  if ((file.areaId ?? null) !== (targetAreaId ?? null)) {
    throw new Error(
      `This file belongs to ${file.areaName ?? 'the national map'}. Open that map and import it there.`,
    );
  }

  const targetSubAreaId = options.targetSubAreaId ?? null;
  if ((file.subAreaId ?? null) !== targetSubAreaId) {
    throw new Error(
      targetSubAreaId
        ? `This file belongs to ${file.subAreaName ? `sub-area ${file.subAreaName}` : 'another sub-area'} and can only be imported there.`
        : `This file belongs to sub-area ${file.subAreaName ?? 'another sub-area'}. Open that sub-area and import it there.`,
    );
  }

  const current = options.current ?? { tjs: existing.tjs, olts: existing.olts };
  const replacing = options.replaceExisting === true;
  // In replace mode the current map's own codes are freed by the deletion below.
  const currentTjIds = new Set(current.tjs.map((tj) => tj.id));
  const currentOltIds = new Set(current.olts.map((olt) => olt.id));
  const usedTjCodes = new Set(
    existing.tjs
      .filter((tj) => !replacing || !currentTjIds.has(tj.id))
      .map((tj) => tj.code.trim().toLowerCase()),
  );
  const usedOltCodes = new Set(
    existing.olts
      .filter((olt) => !replacing || !currentOltIds.has(olt.id))
      .map((olt) => olt.code.trim().toLowerCase()),
  );
  const usedOltNames = new Set(
    existing.olts
      .filter((olt) => !replacing || !currentOltIds.has(olt.id))
      .map((olt) => olt.name.trim().toLowerCase()),
  );

  /** Keeps the code/name when free, otherwise appends 2, 3, … until it is. */
  function uniqueValue(
    base: string,
    used: Set<string>,
    style: 'code' | 'name',
    maxLength = 80,
  ): string {
    const clean = base.trim().slice(0, maxLength);
    let candidate = clean;
    let suffix = 2;
    while (used.has(candidate.toLowerCase())) {
      const marker = style === 'code' ? `-${suffix}` : ` (${suffix})`;
      candidate = `${clean.slice(0, maxLength - marker.length)}${marker}`;
      suffix += 1;
    }
    used.add(candidate.toLowerCase());
    return candidate;
  }

  let renamed = 0;

  let removed = 0;
  if (replacing) {
    onProgress?.('Removing the devices currently on this map…');
    for (const link of current.links ?? []) {
      await api.deleteLink(link.id);
    }
    for (const onu of current.onus ?? []) {
      await api.deleteOnu(onu.id);
      removed += 1;
    }
    for (const tj of current.tjs) {
      await api.deleteTj(tj.id);
      removed += 1;
    }
    for (const olt of current.olts) {
      await api.deleteOlt(olt.id);
      removed += 1;
    }
  }

  const idMap = options.sharedIdMap ?? new Map<string, string>();

  for (const olt of file.olts) {
    const code = uniqueValue(olt.code, usedOltCodes, 'code', 40);
    const name = uniqueValue(olt.name, usedOltNames, 'name', 80);
    if (code !== olt.code.trim() || name !== olt.name.trim()) renamed += 1;
    onProgress?.(`Creating OLT ${code}…`);
    const created = await api.createOlt({
      name,
      code,
      ponPort: olt.ponPort ?? undefined,
      uplinkPort: olt.uplinkPort ?? undefined,
      ponPorts: olt.ponPorts?.map((port) => ({
        label: port.label,
        name: port.name ?? null,
        outputDbm: port.outputDbm,
        vlanId: port.vlanId ?? null,
      })),
      ethernetPorts: olt.ethernetPorts?.map((port) => ({
        label: port.label,
        speed: port.speed,
        vlanId: port.vlanId ?? null,
      })),
      areaId: targetAreaId,
      subAreaId: targetSubAreaId,
      lat: olt.lat ?? undefined,
      lng: olt.lng ?? undefined,
      notes: olt.notes ?? undefined,
    });
    idMap.set(`olt:${olt.id}`, created.id);
  }

  for (const tj of file.tjs) {
    const code = uniqueValue(tj.code, usedTjCodes, 'code', 40);
    if (code !== tj.code.trim()) renamed += 1;
    onProgress?.(`Creating joint ${code}…`);
    const created = await api.createTj({
      code,
      name: tj.name ?? undefined,
      tjType: tj.tjType ?? 'box',
      lat: tj.lat,
      lng: tj.lng,
      address: tj.address ?? undefined,
      notes: tj.notes ?? undefined,
      fibreId: tj.fibreId ?? undefined,
      inputPowerDbm: tj.inputPowerDbm ?? null,
      cores: tj.cores ?? [],
      outputCores: tj.outputCores ?? [],
      splitter: {
        enabled: tj.splitter?.enabled ?? false,
        ratio: tj.splitter?.ratio ?? null,
        inputCoreLabel: tj.splitter?.inputCoreLabel ?? undefined,
        inputPowerDbm: tj.splitter?.inputPowerDbm ?? undefined,
        lossDb: tj.splitter?.lossDb ?? undefined,
        outputPowerDbm: tj.splitter?.outputPowerDbm ?? undefined,
        powerStatus: tj.splitter?.powerStatus ?? undefined,
        outputs: tj.splitter?.outputs ?? tj.outputCores ?? [],
      },
      userFibres: tj.userFibres ?? [],
      isCut: tj.isCut ?? false,
      cutReason: tj.cutReason ?? undefined,
      cutSeverity: tj.cutSeverity ?? null,
      cutData: tj.cutData ?? null,
      ponData: tj.ponData ?? null,
      areaId: targetAreaId,
      subAreaId: targetSubAreaId,
      oltId: tj.oltId ? idMap.get(`olt:${tj.oltId}`) ?? null : null,
    });
    idMap.set(`tj:${tj.id}`, created.id);
  }

  for (const onu of file.onus) {
    onProgress?.(`Creating ONU ${onu.username}…`);
    const created = await api.createOnu({
      username: onu.username,
      fibreId: onu.fibreId,
      macAddress: onu.macAddress ?? undefined,
      vlanId: onu.vlanId ?? null,
      ponType: onu.ponType,
      onuClass: onu.onuClass,
      cores: (onu.cores ?? []).map((core, index) => ({
        label: core.label || tiaCoreLabel(index + 1),
        color: core.color || tiaCoreColor(index + 1),
        status: core.status ?? 'free',
      })),
      areaId: targetAreaId,
      subAreaId: targetSubAreaId,
      lat: onu.lat ?? undefined,
      lng: onu.lng ?? undefined,
      notes: onu.notes ?? undefined,
    });
    idMap.set(`onu:${onu.id}`, created.id);
  }

  let links = 0;
  let skippedLinks = 0;
  for (const link of file.links) {
    const from = endpointOf(link, 'from');
    const to = endpointOf(link, 'to');
    const fromId = from ? idMap.get(`${from.kind}:${from.id}`) : undefined;
    const toId = to ? idMap.get(`${to.kind}:${to.id}`) : undefined;
    if (!from || !to || !fromId || !toId) {
      skippedLinks += 1;
      continue;
    }

    onProgress?.(`Creating link ${link.fibreId}…`);
    await api.createLink({
      ...fromPayload({ kind: from.kind, id: fromId }),
      ...toPayload({ kind: to.kind, id: toId }),
      fibreId: link.fibreId,
      cableType: link.cableType ?? undefined,
      fromCoreLabel: link.fromCoreLabel ?? null,
      toCoreLabel: link.toCoreLabel ?? null,
      coreCount: link.coreCount ?? link.cores?.length ?? 0,
      status: link.status ?? 'active',
      subAreaId: targetSubAreaId,
      notes: link.notes ?? undefined,
      attenuationDbPerKm: link.attenuationDbPerKm ?? 0.35,
      spliceCount: link.spliceCount ?? 2,
      connectionLossDb: link.connectionLossDb ?? 1,
      color: link.color ?? null,
      cores: (link.cores ?? []).map((core, index) => ({
        index: core.index ?? index + 1,
        label: core.label || tiaCoreLabel(index + 1),
        color: core.color || tiaCoreColor(index + 1),
        fromCoreLabel: core.fromCoreLabel ?? null,
        toCoreLabel: core.toCoreLabel ?? null,
      })),
      path: link.path ?? [],
    });
    links += 1;
  }

  return {
    olts: file.olts.length,
    tjs: file.tjs.length,
    onus: file.onus.length,
    links,
    skippedLinks,
    removed,
    renamed,
  };
}
