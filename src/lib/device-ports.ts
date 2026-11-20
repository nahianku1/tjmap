import type { Core, DeviceKind, Olt, Onu, Tj } from './types';
import { displayCoreLabel } from './fibre-cores';

/** One selectable port/core of a device in the map connection tool. */
export interface DevicePort {
  label: string;
  /** Display name; legacy `T1-01`/`Leg 01` labels render as their TIA colour. */
  name?: string;
  hint: string;
  used: boolean;
  color: string | null;
  /** Section heading, so each splitter lists its own feed and branches apart. */
  group?: string;
}

interface DeviceLookup {
  tjs: Tj[];
  olts: Olt[];
  onus: Onu[];
}

/** Feed cores of every enabled splitter — each splitter's single input port. */
export function splitterFeedLabels(tj: Tj): Set<string> {
  const splitters = tj.splitters?.length ? tj.splitters : tj.splitter ? [tj.splitter] : [];
  return new Set(
    splitters
      .filter((splitter) => splitter?.enabled && splitter.inputCoreLabel)
      .map((splitter) => splitter.inputCoreLabel as string),
  );
}

/** Splitter input strands are addressed by splitter order: S1, S2, S3 … */
export function splitterFeedName(
  tj: Pick<Tj, 'splitter' | 'splitters'>,
  label: string | null | undefined,
): string | null {
  if (!label) return null;
  const splitters = tj.splitters?.length ? tj.splitters : tj.splitter ? [tj.splitter] : [];
  const index = splitters.findIndex(
    (splitter) => splitter?.enabled && splitter.inputCoreLabel === label,
  );
  return index >= 0 ? `S${index + 1}` : null;
}

/**
 * A splitter's feed core is a link port: it stays free until a cable is actually
 * patched to it. Older rows marked it In Use just by enabling the splitter, so
 * only a real link owner or a cut strand makes it unavailable.
 */
export function tjCoreUnavailable(core: Core, feeds: Set<string>): boolean {
  const status = core.status ?? 'free';
  if (feeds.has(core.label)) return status === 'damaged' || Boolean(core.connectedLinkId);
  return status !== 'free';
}

/**
 * Every port a device can be cabled from, free and occupied alike: a joint's
 * input cores and splitter legs, an OLT's PON ports, or an ONU's drop cores.
 * `used` only marks what already carries a service; the connection tool shows
 * those greyed out so an occupied port is never re-used by accident.
 */
export function devicePorts(
  kind: DeviceKind,
  id: string,
  { tjs, olts, onus }: DeviceLookup,
): DevicePort[] {
  if (kind === 'tj') {
    const tj = tjs.find((item) => item.id === id);
    if (!tj) return [];
    const ports: DevicePort[] = [];
    const push = (
      label: string,
      hint: string,
      used: boolean,
      color: string | null,
      group: string,
      name?: string | null,
    ) => {
      // Splitters repeat the TIA colour names (Blue, Orange …) in their own
      // sections, so every splitter port is listed even when labels repeat.
      if (!label) return;
      ports.push({
        label,
        name: name ?? displayCoreLabel(label, ports.length + 1),
        hint,
        used,
        color,
        group,
      });
    };

    const feeds = splitterFeedLabels(tj);
    const splitters = tj.splitters?.length ? tj.splitters : tj.splitter ? [tj.splitter] : [];
    const coreByLabel = new Map((tj.cores ?? []).map((core) => [core.label, core]));
    const grouped = new Set<string>();

    // Every splitter gets two sections in the port picker: its single feed core
    // and its branches, so input and output strands never mix.
    splitters.forEach((splitter, index) => {
      if (!splitter?.enabled) return;
      const inputGroup = `Splitter ${index + 1} · input core`;
      const outputGroup = `Splitter ${index + 1} · output cores`;
      const feed = splitter.inputCoreLabel;
      if (feed) {
        const core = coreByLabel.get(feed);
        push(
          feed,
          'input core',
          core ? tjCoreUnavailable(core, feeds) : false,
          null,
          inputGroup,
          `S${index + 1}`,
        );
        grouped.add(feed);
      }
      (splitter.outputs ?? []).forEach((core) => {
        push(core.label, 'output core', (core.status ?? 'free') !== 'free', core.color ?? null, outputGroup);
        grouped.add(core.label);
      });
    });

    // Cores that belong to no enabled splitter still need a pickable row.
    (tj.cores ?? []).forEach((core) => {
      if (grouped.has(core.label)) return;
      push(core.label, 'input core', tjCoreUnavailable(core, feeds), core.color ?? null, 'Input cores');
    });
    // Older rows may record a splitter feed without a matching core entry; it is
    // still that splitter's one input port, so it must stay connectable.
    feeds.forEach((label) => {
      if (grouped.has(label)) return;
      push(label, 'input core', false, null, 'Input cores', splitterFeedName(tj, label));
    });
    (tj.outputCores ?? []).forEach((core) => {
      if (grouped.has(core.label)) return;
      push(
        core.label,
        'output core',
        (core.status ?? 'free') !== 'free',
        core.color ?? null,
        'Output cores',
      );
    });

    return ports;
  }

  if (kind === 'olt') {
    const olt = olts.find((item) => item.id === id);
    if (!olt) return [];
    return (olt.ponPorts ?? []).map((port) => ({
      label: port.label,
      hint: [port.outputDbm === null ? 'PON port' : `PON · +${port.outputDbm} dBm`, port.name]
        .filter(Boolean)
        .join(' · '),
      used: port.status === 'in_use',
      color: null,
    }));
  }

  const onu = onus.find((item) => item.id === id);
  if (!onu) return [];
  return (onu.cores ?? []).map((core, index) => ({
    label: core.label,
    name: displayCoreLabel(core.label, index + 1),
    hint: 'drop core',
    used: (core.status ?? 'free') !== 'free',
    color: core.color ?? null,
  }));
}
