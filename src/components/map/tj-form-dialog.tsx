'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Box,
  Cable,
  CheckCircle2,
  Gauge,
  Layers,
  Link2,
  Loader2,
  MapPin,
  Plus,
  Radio,
  Scissors,
  Sparkles,
  Split,
  Trash2,
  TriangleAlert,
  Unlink,
  Wand2,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CoreEditor } from './core-editor';
import { api, ApiError } from '@/lib/api';
import type {
  Area,
  Core,
  CoreStatus,
  CutRepairStatus,
  CutSeverity,
  FibreLink,
  Olt,
  Tj,
  TjInput,
  TjType,
  UserFibre,
  UserFibreCore,
} from '@/lib/types';
import {
  assessOpticalPower,
  calculateOutputPower,
  getSplitterLossDb,
  SPLITTER_RATIO_PRESETS,
  SplitRatio,
} from '@/lib/optical';
import {
  findLinkedFibreId,
  findUpstreamPower,
  getTjInputCoreLabel,
} from '@/lib/core-power';
import { FibreCorePicker } from '@/components/map/fibre-core-picker';
import { cn } from '@/lib/utils';
import { tiaCoreColor, tubeCoreLabel } from '@/lib/fibre-cores';

interface TjFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: Tj | null;
  draftPoint?: { lat: number; lng: number } | null;
  draftAddress?: string | null;
  defaultAreaId?: string | null;
  createTjType?: 'box' | 'cut' | null;
  prefillCores?: Core[] | null;
  prefillFibreId?: string | null;
  /** Devices on this map, used to read upstream optical power through the links. */
  tjs: Tj[];
  olts: Olt[];
  links: FibreLink[];
  /** Called after the joint is re-patched onto another cable core. */
  onLinksChanged?: () => void | Promise<void>;
  onSaved: (tj: Tj, mode: 'create' | 'update') => void;
}

const RATIO_OPTIONS: SplitRatio[] = [
  '1:2',
  '1:4',
  '1:8',
  '1:16',
  '1:32',
  '1:64',
  '50:50',
  '80:20',
  '70:30',
  '90:10',
];

function generateUserFibreCores(count: number): UserFibreCore[] {
  const safeCount = Math.min(48, Math.max(1, count));
  return Array.from({ length: safeCount }, (_, i) => ({
    coreIndex: i + 1,
    label: tubeCoreLabel(i + 1),
    color: tiaCoreColor(i + 1),
    status: 'free' as CoreStatus,
    connectedToOutputCore: false,
  }));
}

/**
 * A splitter joint has one input strand per splitter, never a pool of input
 * cores: this rebuilds the input list from the splitters' feed cores.
 */
/** True while a cable link owns this strand, which is what keeps it in use. */
function coreOwnedByLink(core: Core): boolean {
  return Boolean(core.connectedLinkId);
}

function inputCoresForFeeds(cores: Core[], feeds: string[]): Core[] {
  const unique = feeds.filter((label, index) => feeds.indexOf(label) === index);
  return unique.map((label, index) => {
    const found = cores.find((core) => core.label === label);
    // The splitter's input strand stays free so the incoming cable can be
    // patched to it; only a cable owns it, and only then is it in use.
    const status = found && coreOwnedByLink(found) ? ('in_use' as const) : ('free' as const);
    return found
      ? { ...found, count: 1, status }
      : {
          label: label || tubeCoreLabel(index + 1),
          color: tiaCoreColor(index + 1),
          count: 1,
          status,
        };
  });
}

/** Next unused input-core label, matching the joint's existing numbering style. */
function nextInputCoreLabel(cores: Core[]): string {
  const used = new Set(cores.map((core) => core.label.trim()));
  // Joints label strands either `Core 01` or `T1-01`; follow whichever the joint uses.
  const plain = cores.length === 0 || /^Core \d+$/i.test(cores[0].label.trim());
  const labelAt = (index: number) =>
    plain ? `Core ${String(index).padStart(2, '0')}` : tubeCoreLabel(index);
  let candidate = cores.length + 1;
  while (used.has(labelAt(candidate))) candidate += 1;
  return labelAt(candidate);
}

/** Next free feed label in the joint's numbering style. */
function nextFeedLabel(usedLabels: string[]): string {
  return nextInputCoreLabel(
    usedLabels.map((label) => ({ label, color: tiaCoreColor(1), count: 1 })),
  );
}

/**
 * Inline feed-name field. Edits stay local until blur so clearing the field
 * cannot blank the splitter's feed label mid-rename.
 */
function FeedLabelField({
  value,
  onRename,
  ariaLabel,
  placeholder,
  className,
}: {
  value: string;
  onRename: (label: string) => void;
  ariaLabel: string;
  placeholder?: string;
  className?: string;
}) {
  const [draft, setDraft] = useState(value);
  const editing = useRef(false);

  useEffect(() => {
    if (!editing.current) setDraft(value);
  }, [value]);

  return (
    <input
      value={draft}
      aria-label={ariaLabel}
      placeholder={placeholder}
      onChange={(event) => setDraft(event.target.value)}
      onFocus={() => {
        editing.current = true;
      }}
      onBlur={() => {
        editing.current = false;
        const next = draft.trim();
        if (!next) {
          setDraft(value);
          return;
        }
        if (next !== value) onRename(next);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
      className={className}
    />
  );
}

/** An additional splitter in the same joint: one feed core, one ratio, many outputs. */
interface ExtraSplitter {
  id: string;
  inputCoreLabel: string;
  ratio: SplitRatio;
  outputs: Core[];
}

interface FormState {
  code: string;
  name: string;
  tjType: TjType;
  address: string;
  fibreId: string;
  lat: string;
  lng: string;
  notes: string;
  cores: Core[];
  outputCores: Core[];
  userFibres: UserFibre[];
  splitterEnabled: boolean;
  ratio: SplitRatio;
  inputCoreLabel: string;
  /** Extra splitters fitted alongside the primary one. */
  extraSplitters: ExtraSplitter[];
  // Fibre cut details
  isCut: boolean;
  cutReason: string;
  cutSeverity: CutSeverity;
  faultDistanceMeters: string;
  damagedCores: string;
  restoredCores: string;
  repairStatus: CutRepairStatus;
  restorationNotes: string;
  // PON power details
  oltId: string;
  ponPort: string;
  wavelength: string;
  areaId: string;
}

const EMPTY_FORM: FormState = {
  code: '',
  name: '',
  tjType: 'box',
  address: '',
  fibreId: '',
  lat: '',
  lng: '',
  notes: '',
  cores: [{ label: tubeCoreLabel(1), color: tiaCoreColor(1), count: 1, status: 'free' }],
  outputCores: [],
  userFibres: [],
  splitterEnabled: false,
  ratio: '1:8',
  inputCoreLabel: tubeCoreLabel(1),
  extraSplitters: [],
  isCut: false,
  cutReason: '',
  cutSeverity: 'major',
  faultDistanceMeters: '1250',
  damagedCores: '12',
  restoredCores: '0',
  repairStatus: 'cut_unresolved',
  restorationNotes: '',
  oltId: 'none',
  ponPort: '',
  wavelength: '1490nm (GPON Downstream)',
  areaId: 'none',
};

export function TjFormDialog({
  open,
  onOpenChange,
  initial,
  draftPoint,
  draftAddress,
  defaultAreaId,
  createTjType,
  prefillCores,
  prefillFibreId,
  tjs,
  olts,
  links,
  onLinksChanged,
  onSaved,
}: TjFormDialogProps) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [areas, setAreas] = useState<Area[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [splitterError, setSplitterError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    api
      .areas()
      .then((list) => {
        if (!cancelled) setAreas(list);
      })
      .catch(() => {
        if (!cancelled) setAreas([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setSplitterError(null);
    if (initial) {
      const tjType = initial.tjType ?? (initial.isCut ? 'cut' : 'box');
      const splitterEnabled = initial.splitter?.enabled ?? false;
      const baseCores =
        initial.cores?.length > 0
          ? initial.cores.map((c) => ({ ...c, count: 1, status: c.status ?? 'free' }))
          : EMPTY_FORM.cores;
      const primaryRatio = (initial.splitter?.ratio as SplitRatio) ?? '1:8';

      // Every splitter gets exactly one input core. Older rows can repeat the
      // feed (or omit it), so allocate a free label whenever it collides.
      const feeds: string[] = [];
      const primaryFeed = splitterEnabled
        ? initial.splitter?.inputCoreLabel ?? baseCores[0]?.label ?? tubeCoreLabel(1)
        : null;
      if (primaryFeed) feeds.push(primaryFeed);

      const extraSplitters = (initial.splitters ?? []).slice(1).map((extra, index) => {
        const ratio = (extra.ratio as SplitRatio) ?? '1:8';
        const wanted = extra.inputCoreLabel ?? '';
        const inputCoreLabel =
          wanted && !feeds.includes(wanted) ? wanted : nextFeedLabel(feeds);
        feeds.push(inputCoreLabel);
        const stored = (extra.outputs ?? []).map((core) => ({ ...core, count: 1 }));
        return {
          id: `splitter-${index + 2}`,
          inputCoreLabel,
          ratio,
          // A splitter always exposes its branches: regenerate missing legs.
          outputs: stored.length > 0 ? stored : makeExtraOutputs(ratio, null, index + 2),
        };
      });

      const storedOutputs = (
        initial.outputCores && initial.outputCores.length > 0
          ? initial.outputCores
          : initial.splitter?.outputs ?? []
      ).map((core) => ({ ...core, count: 1, status: core.status ?? 'free' }));
      const outputCores =
        storedOutputs.length > 0
          ? storedOutputs
          : splitterEnabled
            ? generateSplitterOutputs(primaryRatio, null)
            : [];
      setForm({
        code: initial.code,
        name: initial.name ?? '',
        tjType,
        address: initial.address ?? '',
        fibreId: initial.fibreId ?? '',
        lat: initial.lat.toFixed(6),
        lng: initial.lng.toFixed(6),
        notes: initial.notes ?? '',
        cores: splitterEnabled ? inputCoresForFeeds(baseCores, feeds) : baseCores,
        outputCores,
        userFibres: initial.userFibres ?? [],
        splitterEnabled,
        ratio: primaryRatio,
        inputCoreLabel: primaryFeed ?? feeds[0] ?? tubeCoreLabel(1),
        extraSplitters,
        isCut: initial.isCut ?? tjType === 'cut',
        cutReason: initial.cutReason ?? '',
        cutSeverity: initial.cutSeverity ?? 'major',
        faultDistanceMeters: initial.cutData?.faultDistanceMeters
          ? String(initial.cutData.faultDistanceMeters)
          : '1250',
        damagedCores: initial.cutData?.damagedCores ? String(initial.cutData.damagedCores) : '12',
        restoredCores: initial.cutData?.restoredCores ? String(initial.cutData.restoredCores) : '0',
        repairStatus: initial.cutData?.repairStatus ?? 'cut_unresolved',
        restorationNotes: initial.cutData?.restorationNotes ?? '',
        oltId: initial.oltId ?? 'none',
        ponPort: initial.ponData?.ponPort ?? '',
        wavelength: initial.ponData?.wavelength ?? '1490nm (GPON Downstream)',
        areaId: initial.areaId ?? 'none',
      });
    } else {
      const tjType: TjType = createTjType === 'cut' ? 'cut' : 'box';
      const prefill = prefillCores && prefillCores.length > 0 ? prefillCores : null;
      const damaged = prefill ? prefill.filter((c) => (c.status ?? 'damaged') === 'damaged').length : (tjType === 'cut' ? 12 : 0);
      const restored = prefill ? prefill.filter((c) => c.status === 'spliced' || c.status === 'in_use').length : 0;
      setForm({
        ...EMPTY_FORM,
        tjType,
        isCut: tjType === 'cut',
        lat: draftPoint ? draftPoint.lat.toFixed(6) : '',
        lng: draftPoint ? draftPoint.lng.toFixed(6) : '',
        address: draftAddress || '',
        name: draftAddress ? draftAddress.split(',')[0] : '',
        fibreId: prefillFibreId || '',
        cores: prefill ? inputCoresForFeeds(prefill, [prefill[0].label]) : EMPTY_FORM.cores,
        damagedCores: String(damaged),
        restoredCores: String(restored),
        areaId: defaultAreaId ?? 'none',
      });
    }
  }, [open, initial, draftPoint, draftAddress, defaultAreaId, createTjType, prefillCores, prefillFibreId]);

  function patch(values: Partial<FormState>) {
    setForm((current) => ({ ...current, ...values }));
  }

  // Feed power is no longer entered per core. It is read from the upstream device
  // (OLT PON port or upstream splitter leg) through the link patched to the feed core.
  const linkedFeed = initial ? getTjInputCoreLabel(initial, links) : null;
  const powerCoreLabel = form.splitterEnabled
    ? form.inputCoreLabel || linkedFeed
    : linkedFeed;
  const upstreamPower = initial
    ? findUpstreamPower(initial.id, powerCoreLabel, tjs, olts, links)
    : null;
  const inputPowerNum = upstreamPower?.powerDbm ?? null;
  // The input cable is whatever links into the feed core; its fibre ID follows the link.
  const inputFibreId = initial
    ? findLinkedFibreId(initial.id, powerCoreLabel, links)
    : null;

  useEffect(() => {
    if (!inputFibreId) return;
    setForm((current) =>
      current.fibreId === inputFibreId ? current : { ...current, fibreId: inputFibreId },
    );
  }, [inputFibreId]);

  function upstreamPowerDbm(coreLabel: string | null): number | null {
    if (!initial || !coreLabel) return null;
    return findUpstreamPower(initial.id, coreLabel, tjs, olts, links)?.powerDbm ?? null;
  }

  const splitterLossDb = getSplitterLossDb(form.ratio, 0.2);
  const outputPowerDbm =
    inputPowerNum !== null
      ? calculateOutputPower(inputPowerNum, form.ratio, 0.2)
      : null;
  const powerAssessment = assessOpticalPower(outputPowerDbm);
  const primaryFeedColor =
    form.cores.find((core) => core.label === form.inputCoreLabel)?.color ?? tiaCoreColor(1);

  // Keep every splitter leg's stored power in step with the auto-derived output.
  useEffect(() => {
    if (!form.splitterEnabled) return;
    setForm((current) => {
      const unchanged = current.outputCores.every(
        (core) => (core.powerDbm ?? null) === outputPowerDbm,
      );
      if (unchanged) return current;
      return {
        ...current,
        outputCores: current.outputCores.map((core) => ({ ...core, powerDbm: outputPowerDbm })),
      };
    });
  }, [form.splitterEnabled, outputPowerDbm]);

  // Helper to generate optical output cores based on split ratio
  function generateSplitterOutputs(ratio: SplitRatio, power: number | null): Core[] {
    const preset = SPLITTER_RATIO_PRESETS[ratio];
    const count = preset ? preset.outputsCount : 8;
    const outputs: Core[] = [];
    const colors = [
      '#22d3ee',
      '#34d399',
      '#a78bfa',
      '#fbbf24',
      '#fb7185',
      '#60a5fa',
      '#a3e635',
      '#fb923c',
      '#f472b6',
      '#facc15',
      '#94a3b8',
      '#818cf8',
    ];

    for (let i = 1; i <= Math.min(count, 32); i++) {
      outputs.push({
        label: `Leg ${String(i).padStart(2, '0')}`,
        color: colors[(i - 1) % colors.length],
        count: 1,
        status: 'free',
        powerDbm: power,
      });
    }
    return outputs;
  }

  // Auto-generate splitter output cores based on current ratio
  function autoPopulateSplitterOutputs(ratioToUse?: SplitRatio) {
    const ratio = ratioToUse ?? form.ratio;
    const outputs = generateSplitterOutputs(ratio, outputPowerDbm);
    patch({ outputCores: outputs });
    toast.success(`Generated ${outputs.length} output cores for ${ratio} split.`);
    return outputs;
  }

  // Handle adding or removing optical splitter:
  // - Enabling: gives it one feed core that stays available for its link.
  // - Disabling: drops that feed core from the input list again.
  function handleToggleSplitter(enabled: boolean) {
    if (enabled) {
      // Every splitter owns one feed strand. Reuse a free core that no other
      // splitter is feeding from, or allocate a fresh input core for this one.
      const taken = new Set(form.extraSplitters.map((item) => item.inputCoreLabel));
      const usable = form.cores.filter(
        (core) => (core.status ?? 'free') === 'free' && !taken.has(core.label),
      );
      const preferred = usable.find((core) => core.label === form.inputCoreLabel);
      const feedLabel =
        (preferred ?? usable[0])?.label ??
        nextFeedLabel([...new Set(form.cores.map((core) => core.label))]);

      // A splitter joint keeps exactly one input strand per splitter; the feed
      // core stays free until the incoming cable is patched to it.
      const updatedCores = inputCoresForFeeds(form.cores, [feedLabel, ...taken]);

      // Derive initial output power from the power arriving on that core's link
      const feedPower = upstreamPowerDbm(feedLabel);
      const initialOutPower =
        feedPower !== null ? calculateOutputPower(feedPower, form.ratio, 0.2) : null;

      const outputs =
        form.outputCores.length > 0
          ? form.outputCores.map((o) => ({ ...o, powerDbm: initialOutPower }))
          : generateSplitterOutputs(form.ratio, initialOutPower);

      setSplitterError(null);
      patch({
        splitterEnabled: true,
        inputCoreLabel: feedLabel,
        cores: updatedCores,
        outputCores: outputs,
      });

      toast.success(`Splitter enabled: input core ${feedLabel} is ready for its link.`);
    } else {
      // Keep only the extra splitters' feed strands; the removed splitter's feed
      // stays as a free input core.
      const activeLabel = form.inputCoreLabel;
      const extraFeeds = form.extraSplitters.map((item) => item.inputCoreLabel);
      const updatedCores =
        extraFeeds.length > 0
          ? inputCoresForFeeds(form.cores, extraFeeds)
          : form.cores.map((core) =>
              core.label === activeLabel ? { ...core, status: 'free' as const } : core,
            );

      setSplitterError(null);
      patch({
        splitterEnabled: false,
        cores: updatedCores,
      });

      toast.info(`Splitter removed: core ${activeLabel} is free again.`);
    }
  }

  // Handle cores list update from CoreEditor: recalculate the splitter outputs
  // whenever the feeding core (or its upstream link) changes.
  function handleCoresChange(newCores: Core[]) {
    let err = splitterError;

    // The feed rows are editable, so a rename must follow through to the
    // splitter that owns the strand (primary and extras alike).
    const renames = new Map<string, string>();
    form.cores.forEach((core, index) => {
      const nextLabel = newCores[index]?.label;
      if (nextLabel !== undefined && nextLabel !== core.label) {
        renames.set(core.label, nextLabel);
      }
    });
    const renameOf = (label: string) => renames.get(label) ?? label;
    const inputCoreLabel = renameOf(form.inputCoreLabel);
    const extraSplitters = form.extraSplitters.map((extra) =>
      renames.has(extra.inputCoreLabel)
        ? { ...extra, inputCoreLabel: renameOf(extra.inputCoreLabel) }
        : extra,
    );

    const feedCore = newCores.find((c) => c.label === inputCoreLabel);

    if (form.splitterEnabled) {
      if (!feedCore) {
        err = `Splitter feeding core "${inputCoreLabel}" was removed. Select a free core.`;
      } else if (feedCore.status === 'damaged') {
        err = `Splitter feeding core "${feedCore.label}" is marked as cut/damaged. Splitters require an intact free core.`;
      } else {
        err = null;
      }
    }

    // Automatically calculate new output power from the feed core's upstream link
    const feedPower = upstreamPowerDbm(inputCoreLabel);

    const calculatedOutPower =
      feedPower !== null ? calculateOutputPower(feedPower, form.ratio, 0.2) : null;

    const updatedOutputs = form.outputCores.map((out) => ({
      ...out,
      powerDbm: calculatedOutPower,
    }));

    setSplitterError(err);
    patch({
      cores: newCores,
      inputCoreLabel,
      extraSplitters,
      outputCores: updatedOutputs,
    });
  }

  /** Renames a splitter feed strand in the joint's core inventory. */
  function renameFeed(oldLabel: string, newLabel: string) {
    if (!oldLabel) return;
    setForm((current) => ({
      ...current,
      cores: current.cores.map((core) =>
        core.label === oldLabel ? { ...core, label: newLabel } : core,
      ),
      inputCoreLabel: current.inputCoreLabel === oldLabel ? newLabel : current.inputCoreLabel,
      extraSplitters: current.extraSplitters.map((item) =>
        item.inputCoreLabel === oldLabel ? { ...item, inputCoreLabel: newLabel } : item,
      ),
    }));
  }

  /** Recolours a splitter feed strand in the joint's core inventory. */
  function recolourFeed(label: string, color: string) {
    if (!label) return;
    setForm((current) => ({
      ...current,
      cores: current.cores.map((core) => (core.label === label ? { ...core, color } : core)),
    }));
  }

  function handleAddOutputCore() {
    const nextNum = form.outputCores.length + 1;
    const newCore: Core = {
      label: `Leg ${String(nextNum).padStart(2, '0')}`,
      color: tiaCoreColor(nextNum),
      count: 1,
      status: 'free',
      powerDbm: outputPowerDbm,
    };
    patch({
      outputCores: [...form.outputCores, newCore],
    });
    toast.success(`Added output core ${newCore.label}`);
  }

  function handleUpdateOutputCore(index: number, patchVal: Partial<Core>) {
    const oldCore = form.outputCores[index];
    if (!oldCore) return;

    const updatedOutputs = form.outputCores.map((c, i) => (i === index ? { ...c, ...patchVal } : c));
    let updatedFibres = form.userFibres;

    if (patchVal.label && patchVal.label !== oldCore.label) {
      updatedFibres = form.userFibres.map((uf) =>
        uf.outputCoreLabel === oldCore.label ? { ...uf, outputCoreLabel: patchVal.label! } : uf,
      );
    }

    patch({
      outputCores: updatedOutputs,
      userFibres: updatedFibres,
    });
  }

  function handleRemoveOutputCore(index: number) {
    const removedCore = form.outputCores[index];
    if (!removedCore) return;

    const newOutputs = form.outputCores.filter((_, i) => i !== index);
    const newFibres = form.userFibres.filter((uf) => uf.outputCoreLabel !== removedCore.label);

    patch({
      outputCores: newOutputs,
      userFibres: newFibres,
    });
    toast.info(`Removed output core ${removedCore.label}`);
  }

  function handleToggleOutputCoreStatus(index: number) {
    const core = form.outputCores[index];
    if (!core) return;
    const current = core.status ?? 'free';
    const next: CoreStatus = current === 'free' ? 'in_use' : 'free';
    handleUpdateOutputCore(index, { status: next });
  }

  function handleAddUserFibre(outputCoreLabel: string) {
    const newId = `uf-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const existing = form.userFibres.filter((uf) => uf.outputCoreLabel === outputCoreLabel);
    const fibreIndex = existing.length + 1;
    const label =
      existing.length === 0 ? `UF-${outputCoreLabel}` : `UF-${outputCoreLabel}-${fibreIndex}`;

    const defaultCoreCount = 1;
    const newFibre: UserFibre = {
      id: newId,
      outputCoreLabel,
      label,
      color: '#0284c7',
      coreCount: defaultCoreCount,
      connectedCoreIndex: null,
      cores: generateUserFibreCores(defaultCoreCount),
    };

    patch({
      userFibres: [...form.userFibres, newFibre],
    });
    toast.success(`Added User Fibre for output core "${outputCoreLabel}"`);
  }

  function handleRemoveUserFibre(userFibreId: string) {
    const targetFibre = form.userFibres.find((uf) => uf.id === userFibreId);
    if (!targetFibre) return;

    const outputCoreLabel = targetFibre.outputCoreLabel;
    const remainingFibres = form.userFibres.filter((uf) => uf.id !== userFibreId);

    const anyOtherConnected = remainingFibres.some(
      (uf) => uf.outputCoreLabel === outputCoreLabel && uf.cores.some((c) => c.connectedToOutputCore),
    );

    const updatedOutputCores = form.outputCores.map((oc) => {
      if (oc.label === outputCoreLabel && !anyOtherConnected) {
        return {
          ...oc,
          status: 'free' as CoreStatus,
          connectedUserFibreId: null,
          connectedUserCoreLabel: null,
        };
      }
      return oc;
    });

    patch({
      userFibres: remainingFibres,
      outputCores: updatedOutputCores,
    });

    toast.info(`Removed User Fibre "${targetFibre.label}"`);
  }

  function handleUpdateUserFibre(userFibreId: string, patchVal: Partial<UserFibre>) {
    const updatedFibres = form.userFibres.map((uf) =>
      uf.id === userFibreId ? { ...uf, ...patchVal } : uf,
    );
    patch({ userFibres: updatedFibres });
  }

  function handleUpdateUserFibreCoreCount(userFibreId: string, newCount: number) {
    const clamped = Math.min(48, Math.max(1, newCount));
    const updatedFibres = form.userFibres.map((uf) => {
      if (uf.id !== userFibreId) return uf;
      const existing = uf.cores;
      let newCores: UserFibreCore[];
      if (clamped > existing.length) {
        const additional = Array.from({ length: clamped - existing.length }, (_, i) => {
          const idx = existing.length + i + 1;
          return {
            coreIndex: idx,
            label: tubeCoreLabel(idx),
            color: tiaCoreColor(idx),
            status: 'free' as CoreStatus,
            connectedToOutputCore: false,
          };
        });
        newCores = [...existing, ...additional];
      } else {
        newCores = existing.slice(0, clamped);
      }
      return {
        ...uf,
        coreCount: clamped,
        cores: newCores,
      };
    });

    patch({ userFibres: updatedFibres });
  }

  function handleUpdateUserCore(
    userFibreId: string,
    coreIndex: number,
    patchVal: Partial<UserFibreCore>,
  ) {
    const targetFibre = form.userFibres.find((uf) => uf.id === userFibreId);
    const outputCoreLabel = targetFibre?.outputCoreLabel;

    const updatedUserFibres = form.userFibres.map((uf) => {
      if (uf.id !== userFibreId) return uf;
      const updatedCores = uf.cores.map((c) => {
        if (c.coreIndex === coreIndex) {
          return { ...c, ...patchVal };
        }
        return c;
      });
      return {
        ...uf,
        cores: updatedCores,
      };
    });

    let updatedOutputCores = form.outputCores;
    if (patchVal.label && outputCoreLabel) {
      const isThisCoreConnected = targetFibre?.cores.find(
        (c) => c.coreIndex === coreIndex,
      )?.connectedToOutputCore;
      if (isThisCoreConnected) {
        updatedOutputCores = form.outputCores.map((oc) =>
          oc.label === outputCoreLabel ? { ...oc, connectedUserCoreLabel: patchVal.label } : oc,
        );
      }
    }

    patch({
      userFibres: updatedUserFibres,
      outputCores: updatedOutputCores,
    });
  }

  function handleConnectUserCore(userFibreId: string, coreIndex: number) {
    const targetFibre = form.userFibres.find((uf) => uf.id === userFibreId);
    if (!targetFibre) return;

    const outputCoreLabel = targetFibre.outputCoreLabel;

    const updatedUserFibres = form.userFibres.map((uf) => {
      if (uf.id !== userFibreId) return uf;
      const updatedCores = uf.cores.map((c) => {
        if (c.coreIndex === coreIndex) {
          return { ...c, connectedToOutputCore: true, status: 'in_use' as CoreStatus };
        }
        if (c.connectedToOutputCore) {
          return { ...c, connectedToOutputCore: false, status: 'free' as CoreStatus };
        }
        return c;
      });
      return {
        ...uf,
        connectedCoreIndex: coreIndex,
        cores: updatedCores,
      };
    });

    const targetUserCore = targetFibre.cores.find((c) => c.coreIndex === coreIndex);
    const coreLabel = targetUserCore?.label ?? `Core ${coreIndex}`;

    const updatedOutputCores = form.outputCores.map((oc) => {
      if (oc.label === outputCoreLabel) {
        return {
          ...oc,
          status: 'in_use' as CoreStatus,
          connectedUserFibreId: userFibreId,
          connectedUserCoreLabel: coreLabel,
        };
      }
      return oc;
    });

    patch({
      userFibres: updatedUserFibres,
      outputCores: updatedOutputCores,
    });

    toast.success(`Joined ${coreLabel} with ${outputCoreLabel}`, {
      description: `Both ${outputCoreLabel} and ${coreLabel} status automatically changed to In Use.`,
    });
  }

  function handleDisconnectUserCore(userFibreId: string, coreIndex: number) {
    const targetFibre = form.userFibres.find((uf) => uf.id === userFibreId);
    if (!targetFibre) return;

    const outputCoreLabel = targetFibre.outputCoreLabel;

    const updatedUserFibres = form.userFibres.map((uf) => {
      if (uf.id !== userFibreId) return uf;
      const updatedCores = uf.cores.map((c) => {
        if (c.coreIndex === coreIndex) {
          return { ...c, connectedToOutputCore: false, status: 'free' as CoreStatus };
        }
        return c;
      });
      return {
        ...uf,
        connectedCoreIndex: null,
        cores: updatedCores,
      };
    });

    const anyOtherConnected = updatedUserFibres.some(
      (uf) => uf.outputCoreLabel === outputCoreLabel && uf.cores.some((c) => c.connectedToOutputCore),
    );

    const updatedOutputCores = form.outputCores.map((oc) => {
      if (oc.label === outputCoreLabel) {
        return {
          ...oc,
          status: anyOtherConnected ? ('in_use' as CoreStatus) : ('free' as CoreStatus),
          connectedUserFibreId: anyOtherConnected ? oc.connectedUserFibreId : null,
          connectedUserCoreLabel: anyOtherConnected ? oc.connectedUserCoreLabel : null,
        };
      }
      return oc;
    });

    patch({
      userFibres: updatedUserFibres,
      outputCores: updatedOutputCores,
    });

    toast.info(`Disconnected from ${outputCoreLabel}`, {
      description: `Core reverted to Free. ${!anyOtherConnected ? `${outputCoreLabel} reverted to Free.` : ''}`,
    });
  }

  /** Output cores of an extra splitter, labelled per splitter and coloured TIA. */
  function makeExtraOutputs(ratio: SplitRatio, power: number | null, ordinal: number): Core[] {
    const preset = SPLITTER_RATIO_PRESETS[ratio];
    const count = Math.min(preset ? preset.outputsCount : 8, 32);
    return Array.from({ length: count }, (_value, index) => ({
      label: `S${ordinal}-L${String(index + 1).padStart(2, '0')}`,
      color: tiaCoreColor(index + 1),
      count: 1,
      status: 'free' as const,
      powerDbm: power,
    }));
  }

  function extraOutputPower(splitter: ExtraSplitter): number | null {
    const feed = upstreamPowerDbm(splitter.inputCoreLabel);
    return feed !== null ? calculateOutputPower(feed, splitter.ratio, 0.2) : null;
  }

  /** Adds a splitter with its own feed core, ratio and auto-generated outputs. */
  function addExtraSplitter() {
    const ordinal = form.extraSplitters.length + 2;
    const ratio: SplitRatio = '1:8';
    const feedLabel = nextInputCoreLabel(form.cores);
    const feed = upstreamPowerDbm(feedLabel);
    const power = feed !== null ? calculateOutputPower(feed, ratio, 0.2) : null;
    setForm((current) => ({
      ...current,
      // Adding a splitter adds its single input strand to the joint.
      cores: inputCoresForFeeds(current.cores, [
        ...(current.splitterEnabled ? [current.inputCoreLabel] : []),
        ...current.extraSplitters.map((item) => item.inputCoreLabel),
        feedLabel,
      ]),
      extraSplitters: [
        ...current.extraSplitters,
        {
          id: `splitter-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          inputCoreLabel: feedLabel,
          ratio,
          outputs: makeExtraOutputs(ratio, power, ordinal),
        },
      ],
    }));
  }

  function updateExtraSplitter(index: number, patchVal: Partial<ExtraSplitter>) {
    setForm((current) => ({
      ...current,
      extraSplitters: current.extraSplitters.map((item, position) =>
        position === index ? { ...item, ...patchVal } : item,
      ),
    }));
  }

  function removeExtraSplitter(index: number) {
    setForm((current) => {
      const feedLabel = current.extraSplitters[index]?.inputCoreLabel;
      const remaining = current.extraSplitters.filter((_item, position) => position !== index);
      // The removed splitter takes its input strand with it.
      const feeds = [
        ...(current.splitterEnabled ? [current.inputCoreLabel] : []),
        ...remaining.map((item) => item.inputCoreLabel),
      ].filter((label): label is string => Boolean(label));
      return {
        ...current,
        cores: current.splitterEnabled
          ? inputCoresForFeeds(current.cores, feeds)
          : current.cores.filter((core) => core.label !== feedLabel),
        extraSplitters: remaining,
      };
    });
  }

  /** Rebuilds one splitter's outputs from its ratio, dropping hand edits. */
  function autoGenerateExtraOutputs(index: number) {
    setForm((current) => {
      const splitter = current.extraSplitters[index];
      if (!splitter) return current;
      const feed = upstreamPowerDbm(splitter.inputCoreLabel);
      const power = feed !== null ? calculateOutputPower(feed, splitter.ratio, 0.2) : null;
      return {
        ...current,
        extraSplitters: current.extraSplitters.map((item, position) =>
          position === index
            ? { ...item, outputs: makeExtraOutputs(item.ratio, power, index + 2) }
            : item,
        ),
      };
    });
  }

  function updateExtraOutput(splitterIndex: number, outputIndex: number, patchVal: Partial<Core>) {
    setForm((current) => ({
      ...current,
      extraSplitters: current.extraSplitters.map((item, position) =>
        position === splitterIndex
          ? {
              ...item,
              outputs: item.outputs.map((core, oi) =>
                oi === outputIndex ? { ...core, ...patchVal } : core,
              ),
            }
          : item,
      ),
    }));
  }

  function addExtraOutput(splitterIndex: number) {
    setForm((current) => ({
      ...current,
      extraSplitters: current.extraSplitters.map((item, position) => {
        if (position !== splitterIndex) return item;
        const next = item.outputs.length + 1;
        return {
          ...item,
          outputs: [
            ...item.outputs,
            {
              label: `S${splitterIndex + 2}-L${String(next).padStart(2, '0')}`,
              color: tiaCoreColor(next),
              count: 1,
              status: 'free' as const,
              powerDbm: extraOutputPower(item),
            },
          ],
        };
      }),
    }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const lat = Number(form.lat);
    const lng = Number(form.lng);

    if (!form.code.trim()) return setError('Give this terminal joint a code, e.g. TJ-DHK-009.');
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return setError('Latitude and longitude are required.');
    }
    if (lat < 20.3 || lat > 27.1 || lng < 87.6 || lng > 93.2) {
      return setError('This point sits outside Bangladesh. Pick a coordinate inside the country.');
    }
    if (form.cores.length === 0) return setError('Add at least one input core to this joint.');

    if (form.splitterEnabled) {
      if (splitterError) {
        return setError(splitterError);
      }
      const feedingCore = form.cores.find((c) => c.label === form.inputCoreLabel);
      if (!feedingCore) {
        return setError(`Splitter input core "${form.inputCoreLabel}" does not exist in input cores.`);
      }
      if (feedingCore.status === 'damaged') {
        return setError(`Cannot save: Splitter input core "${feedingCore.label}" is marked as cut/damaged.`);
      }
    }

    // One input core per splitter: no core may feed two splitters at once.
    const splitterFeeds = [
      ...(form.splitterEnabled ? [form.inputCoreLabel] : []),
      ...form.extraSplitters.map((extra) => extra.inputCoreLabel),
    ].filter((label): label is string => Boolean(label));
    const sharedFeed = splitterFeeds.find(
      (label, index) => splitterFeeds.indexOf(label) !== index,
    );
    if (sharedFeed) {
      return setError(
        `Core "${sharedFeed}" feeds more than one splitter. Each splitter needs its own input core.`,
      );
    }

    const isCut = form.tjType === 'cut' || form.isCut;

    const primarySplitter = {
      enabled: form.splitterEnabled,
      ratio: form.splitterEnabled ? form.ratio : null,
      inputCoreLabel: form.splitterEnabled ? form.inputCoreLabel : null,
      inputPowerDbm:
        form.splitterEnabled && inputPowerNum !== null && Number.isFinite(inputPowerNum)
          ? inputPowerNum
          : null,
      lossDb: form.splitterEnabled ? splitterLossDb : null,
      outputPowerDbm: form.splitterEnabled ? outputPowerDbm : null,
      powerStatus: form.splitterEnabled ? powerAssessment?.status ?? null : null,
      outputs: form.splitterEnabled
        ? form.outputCores.map((core) => ({
            ...core,
            count: 1,
            status: core.status ?? 'free',
            powerDbm: outputPowerDbm,
          }))
        : [],
    };

    const payload: TjInput = {
      code: form.code.trim().toUpperCase(),
      name: form.name.trim() || undefined,
      tjType: form.tjType,
      lat,
      lng,
      address: form.address.trim() || undefined,
      notes: form.notes.trim() || undefined,
      fibreId: form.fibreId.trim() || undefined,
      inputPowerDbm: inputPowerNum !== null && Number.isFinite(inputPowerNum) ? inputPowerNum : null,
      // A splitter joint carries one input strand per splitter and nothing else;
      // a plain joint keeps its own core list.
      cores: (form.splitterEnabled
        ? inputCoresForFeeds(form.cores, splitterFeeds)
        : form.cores
      ).map((core) => ({
        ...core,
        count: 1,
        status: core.status ?? 'free',
        // Input power is derived from the linked upstream device, never stored here.
        powerDbm: null,
      })),
      outputCores: form.outputCores.map((core) => ({
        ...core,
        count: 1,
        status: core.status ?? 'free',
        powerDbm: outputPowerDbm,
      })),
      splitter: primarySplitter,
      splitters: [
        primarySplitter,
        ...form.extraSplitters.map((extra) => {
          const feedPower = upstreamPowerDbm(extra.inputCoreLabel);
          const outPower = extraOutputPower(extra);
          return {
            enabled: true,
            ratio: extra.ratio,
            inputCoreLabel: extra.inputCoreLabel || null,
            inputPowerDbm: feedPower,
            lossDb: getSplitterLossDb(extra.ratio, 0.2),
            outputPowerDbm: outPower,
            powerStatus: assessOpticalPower(outPower)?.status ?? null,
            outputs: extra.outputs.map((core, index) => ({
              ...core,
              label: core.label.trim() || `S${index + 2}-L${String(index + 1).padStart(2, '0')}`,
              count: 1,
              status: core.status ?? 'free',
              powerDbm: outPower,
            })),
          };
        }),
      ],
      userFibres: form.userFibres,
      isCut,
      cutReason: isCut ? form.cutReason.trim() || undefined : undefined,
      cutSeverity: isCut ? form.cutSeverity : null,
      cutData:
        form.tjType === 'cut' || isCut
          ? {
              faultDistanceMeters: Number(form.faultDistanceMeters) || null,
              cutTime: new Date().toISOString(),
              damagedCores: Number(form.damagedCores) || null,
              restoredCores: Number(form.restoredCores) || null,
              repairStatus: form.repairStatus,
              restorationNotes: form.restorationNotes.trim() || undefined,
            }
          : null,
      ponData:
        form.tjType === 'pon_power'
          ? {
              oltName: olts.find((olt) => olt.id === form.oltId)?.name ?? undefined,
              ponPort: form.ponPort.trim() || undefined,
              wavelength: form.wavelength,
              inputPowerDbm: inputPowerNum !== null && Number.isFinite(inputPowerNum) ? inputPowerNum : null,
              calculatedOutputDbm: outputPowerDbm,
              powerStatus: powerAssessment?.status ?? 'optimal',
              budgetMarginDb:
                inputPowerNum !== null && Number.isFinite(inputPowerNum)
                  ? Number((inputPowerNum - -27.0).toFixed(2))
                  : null,
            }
          : null,
      areaId: form.areaId === 'none' ? null : form.areaId,
      oltId: form.oltId === 'none' ? null : form.oltId,
    };

    setSaving(true);
    setError(null);
    try {
      const saved = initial ? await api.updateTj(initial.id, payload) : await api.createTj(payload);
      toast.success(initial ? `${saved.code} updated` : `${saved.code} added to the map`, {
        description:
          form.tjType === 'cut'
            ? 'Fibre cut repair joint logged.'
            : form.tjType === 'pon_power'
              ? 'PON power telemetry & optical budget saved.'
              : 'Joint details, cores and splitter saved.',
      });
      onSaved(saved, initial ? 'update' : 'create');
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save this terminal joint.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {form.tjType === 'cut'
              ? initial
                ? `Edit cut ${initial.code}`
                : 'New fibre cut joint'
              : initial
                ? `Edit ${initial.code}`
                : 'New terminal joint'}
          </DialogTitle>
          <DialogDescription>
            {form.tjType === 'cut'
              ? 'A fibre cut joint records the incident, the damaged cores and the splicing progress — no splitter, OLT or core groups.'
              : 'A splitter joint carries the fibre cores, splitters and power budget for its site.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* BASIC JOINT INFO */}
          <section className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="tj-code">Joint code</Label>
              <Input
                id="tj-code"
                required
                placeholder="TJ-DHK-009"
                value={form.code}
                onChange={(event) => patch({ code: event.target.value.toUpperCase() })}
                className="font-mono text-[12px] tracking-wide"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tj-name">Site name / description</Label>
              <Input
                id="tj-name"
                placeholder="Gulshan 2 distribution box"
                value={form.name}
                onChange={(event) => patch({ name: event.target.value })}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="tj-address">Address / landmark</Label>
              <Input
                id="tj-address"
                placeholder="Road 113, Gulshan 2, Dhaka 1212"
                value={form.address}
                onChange={(event) => patch({ address: event.target.value })}
              />
            </div>
          </section>

          {/* COORDINATES & AREA */}
          <section className="grid gap-3 rounded-2xl border border-white/60 bg-white/40 p-3 sm:grid-cols-3 dark:border-white/10 dark:bg-white/[0.03]">
            <div className="space-y-1.5">
              <Label htmlFor="tj-lat">Latitude</Label>
              <Input
                id="tj-lat"
                required
                inputMode="decimal"
                placeholder="23.7808"
                value={form.lat}
                onChange={(event) => patch({ lat: event.target.value })}
                className="font-mono text-[12px]"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tj-lng">Longitude</Label>
              <Input
                id="tj-lng"
                required
                inputMode="decimal"
                placeholder="90.4160"
                value={form.lng}
                onChange={(event) => patch({ lng: event.target.value })}
                className="font-mono text-[12px]"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tj-fibre">Input Fibre ID</Label>
              <Input
                id="tj-fibre"
                placeholder="F-DHK-GL-09"
                value={form.fibreId}
                onChange={(event) => patch({ fibreId: event.target.value })}
                readOnly={Boolean(inputFibreId)}
                className={cn(
                  'font-mono text-[12px]',
                  inputFibreId && 'bg-muted/40 text-muted-foreground',
                )}
              />
              <p className="text-[9.5px] text-muted-foreground">
                {inputFibreId
                  ? 'Assigned automatically from the cable linked into this joint.'
                  : 'Set manually, or connect a link to this joint.'}
              </p>
            </div>
            <div className="space-y-1.5 sm:col-span-3">
              <Label htmlFor="tj-area" className="flex items-center gap-1.5">
                <Layers className="size-3.5 text-primary" />
                Service area
              </Label>
              <Select value={form.areaId} onValueChange={(value) => patch({ areaId: value })}>
                <SelectTrigger id="tj-area" className="h-10">
                  <SelectValue placeholder="Assign to an area" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="none">Unassigned</SelectItem>
                  {areas.map((area) => (
                    <SelectItem key={area.id} value={area.id}>
                      {area.districtName} · {area.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </section>

          {form.tjType !== 'cut' ? (
            <>
          {/* INPUT FIBRE & CORES */}
          <section className="space-y-3 rounded-2xl border border-white/60 bg-white/40 p-3 dark:border-white/10 dark:bg-white/[0.03]">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1.5 text-[12px] font-semibold">
                <Radio className="size-3.5 text-teal-500" />
                Input Fibre & Cores
              </Label>
              <span className="text-[10px] text-muted-foreground">
                Power read from the linked upstream device
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              Every splitter in this joint owns exactly one input core — its feed strand — so this
              list has one row per splitter. The input core stays available so the incoming cable
              can be connected to it. Every branch leaving a splitter is an output core below.
              Cable tubes are defined in the link editor, not here. Input power is read
              automatically from the upstream device on the feed core.
            </p>

            <CoreEditor
              value={form.cores}
              onChange={handleCoresChange}
              addLabel="Add input core"
              emptyLabel="No input core"
              splitterCoreLabel={form.inputCoreLabel}
              canAdd={false}
              canRemove={false}
              canChangeStatus={false}
            />
          </section>

          {/* OPTICAL SPLITTER & POWER CALCULATION */}
          <section className="rounded-2xl border border-white/60 bg-white/40 p-3 dark:border-white/10 dark:bg-white/[0.03]">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-start gap-2">
                <span className="mt-0.5 grid size-7 place-items-center rounded-lg bg-violet-500/10 text-violet-500">
                  <Split className="size-3.5" />
                </span>
                <div>
                  <p className="text-[12px] font-semibold">Optical Splitter 1</p>
                  <p className="text-[10px] text-muted-foreground">
                    One input core and one split ratio; its output legs are generated below and
                    priced from the feed power.
                  </p>
                </div>
              </div>
              <Switch
                checked={form.splitterEnabled}
                onCheckedChange={handleToggleSplitter}
              />
            </div>

            {form.splitterEnabled ? (
              <div className="mt-3 space-y-3 pt-2 border-t border-border/50">
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {/* Connect Input Core */}
                  <div className="space-y-1.5">
                    <Label className="text-[11px]">Splitter input core</Label>
                    <div
                      className={cn(
                        'flex h-9 items-center gap-2 rounded-lg border border-violet-500/30 bg-violet-500/[0.06] px-2',
                        splitterError && 'border-destructive bg-destructive/5',
                      )}
                    >
                      <label
                        className="relative size-4 shrink-0 cursor-pointer rounded-full border border-white/70 shadow-inner transition hover:scale-110 dark:border-white/20"
                        style={{ backgroundColor: primaryFeedColor }}
                        title="Input core colour"
                      >
                        <input
                          type="color"
                          value={primaryFeedColor}
                          onChange={(event) =>
                            recolourFeed(form.inputCoreLabel, event.target.value)
                          }
                          className="absolute inset-0 size-full cursor-pointer opacity-0"
                          aria-label="Splitter input core colour"
                        />
                      </label>
                      <FeedLabelField
                        value={form.inputCoreLabel}
                        onRename={(label) => renameFeed(form.inputCoreLabel, label)}
                        placeholder="Input core"
                        ariaLabel="Splitter input core"
                        className="h-7 min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-0.5 font-mono text-[11.5px] font-semibold outline-none transition focus:border-primary/30 focus:bg-white/70 dark:focus:bg-white/[0.06]"
                      />
                      <span className="ml-auto shrink-0 text-[9.5px] text-muted-foreground">
                        One input per splitter
                      </span>
                    </div>
                    {splitterError ? (
                      <div className="anim-rise mt-2 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-2 text-[11px] text-destructive">
                        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                        <span className="leading-snug">{splitterError}</span>
                      </div>
                    ) : null}
                  </div>

                  {/* Split Ratio */}
                  <div className="space-y-1.5">
                    <Label htmlFor="splitter-ratio" className="text-[11px]">
                      Split Ratio
                    </Label>
                    <Select
                      value={form.ratio}
                      onValueChange={(ratio) => {
                        const newRatio = ratio as SplitRatio;
                        const newOutputPower =
                          inputPowerNum !== null
                            ? calculateOutputPower(inputPowerNum, newRatio, 0.2)
                            : null;
                        const outputs = generateSplitterOutputs(newRatio, newOutputPower);
                        patch({
                          ratio: newRatio,
                          outputCores: outputs,
                        });
                        toast.info(`Updated to ${newRatio} split. Outputs & power recalculated.`);
                      }}
                    >
                      <SelectTrigger id="splitter-ratio" className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1:2">1:2 PLC (~3.6 dB loss)</SelectItem>
                        <SelectItem value="1:4">1:4 PLC (~7.2 dB loss)</SelectItem>
                        <SelectItem value="1:8">1:8 PLC (~10.5 dB loss)</SelectItem>
                        <SelectItem value="1:16">1:16 PLC (~13.8 dB loss)</SelectItem>
                        <SelectItem value="1:32">1:32 PLC (~17.1 dB loss)</SelectItem>
                        <SelectItem value="1:64">1:64 PLC (~20.5 dB loss)</SelectItem>
                        <SelectItem value="50:50">50:50 Coupler (~3.5 dB)</SelectItem>
                        <SelectItem value="80:20">80:20 Coupler (Drop: 7.5 dB)</SelectItem>
                        <SelectItem value="70:30">70:30 Coupler (Drop: 5.8 dB)</SelectItem>
                        <SelectItem value="90:10">90:10 Coupler (Drop: 10.6 dB)</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => autoPopulateSplitterOutputs()}
                      className="h-7 w-full gap-1 border-primary/30 text-[10.5px] text-primary hover:bg-primary/10"
                    >
                      <Sparkles className="size-3" />
                      Auto-generate {form.ratio} outputs
                    </Button>
                  </div>
                </div>

                {/* AUTOMATIC POWER CALCULATION CARD */}
                <div
                  className={cn(
                    'rounded-xl border p-3 transition-colors',
                    powerAssessment
                      ? `${powerAssessment.bgTone} ${powerAssessment.borderTone}`
                      : 'border-white/60 bg-white/50 dark:border-white/10 dark:bg-white/[0.04]',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <Gauge className="size-4 text-violet-500" />
                      <span className="text-[11.5px] font-semibold">Automatic Optical Power Budget</span>
                    </div>
                    {powerAssessment ? (
                      <span
                        className={cn(
                          'rounded-md border px-2 py-0.5 text-[10px] font-semibold',
                          powerAssessment.badgeTone,
                        )}
                      >
                        {powerAssessment.label}
                      </span>
                    ) : null}
                  </div>

                  {upstreamPower ? (
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      Feed read from {upstreamPower.sourceKind.toUpperCase()} {upstreamPower.sourceCode}
                      {upstreamPower.sourceCore ? ` · ${upstreamPower.sourceCore}` : ''} via{' '}
                      {upstreamPower.fibreId}
                    </p>
                  ) : null}

                  <div className="mt-2.5 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg border border-white/60 bg-white/70 p-1.5 dark:border-white/10 dark:bg-white/[0.05]">
                      <p className="text-[9px] uppercase tracking-wider text-muted-foreground">
                        Feed Core ({form.inputCoreLabel})
                      </p>
                      <p className="mt-0.5 font-mono text-[12px] font-semibold">
                        {inputPowerNum !== null
                          ? `${inputPowerNum > 0 ? `+${inputPowerNum}` : inputPowerNum} dBm`
                          : 'Not set'}
                      </p>
                    </div>
                    <div className="rounded-lg border border-white/60 bg-white/70 p-1.5 dark:border-white/10 dark:bg-white/[0.05]">
                      <p className="text-[9px] uppercase tracking-wider text-muted-foreground">
                        Split Loss ({form.ratio})
                      </p>
                      <p className="mt-0.5 font-mono text-[12px] font-semibold text-rose-500">
                        -{splitterLossDb.toFixed(1)} dB
                      </p>
                    </div>
                    <div className="rounded-lg border border-white/60 bg-white/70 p-1.5 dark:border-white/10 dark:bg-white/[0.05]">
                      <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Output Power</p>
                      <p className="mt-0.5 font-mono text-[12.5px] font-bold text-primary">
                        {outputPowerDbm !== null ? `${outputPowerDbm} dBm` : '—'}
                      </p>
                    </div>
                  </div>

                  {inputPowerNum === null ? (
                    <p className="mt-2 text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                      💡 Link the feed core &quot;{form.inputCoreLabel}&quot; to an upstream OLT or splitter leg to read the input power automatically.
                    </p>
                  ) : powerAssessment ? (
                    <p className="mt-2 text-[10px] text-muted-foreground leading-relaxed">
                      {powerAssessment.description}
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}
          </section>

          {/* OUTPUT FIBRE CORES & USER DROP FIBRES */}
          <section className="space-y-3 rounded-2xl border border-white/60 bg-white/40 p-3 dark:border-white/10 dark:bg-white/[0.03]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="grid size-7 place-items-center rounded-lg bg-sky-500/10 text-sky-500">
                  <Cable className="size-3.5" />
                </span>
                <div>
                  <p className="text-[12px] font-semibold">
                    {form.splitterEnabled
                      ? `Splitter 1 (${form.ratio}) Outputs & User Drop Cables`
                      : 'Output Fibre Cores & User Drop Cables'}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {form.splitterEnabled
                      ? `Optical Splitter Branches (${form.ratio}) · Auto-calculated ${outputPowerDbm !== null ? `${outputPowerDbm} dBm` : 'dBm'}`
                      : 'Output distribution cores. Attach user drop cables and join specific cores.'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {form.splitterEnabled ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => autoPopulateSplitterOutputs()}
                    className="h-7 text-[10.5px] gap-1 px-2 border-primary/30 text-primary hover:bg-primary/10"
                  >
                    <Sparkles className="size-3" />
                    Auto-generate {form.ratio} outputs
                  </Button>
                ) : null}

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddOutputCore}
                  className="h-7 text-[10.5px] gap-1 px-2"
                >
                  <Plus className="size-3" />
                  Add output core
                </Button>
              </div>
            </div>

            {/* Quick summary stats */}
            {form.outputCores.length > 0 ? (
              <div className="flex items-center justify-between text-[10.5px] text-muted-foreground px-0.5 border-b border-border/40 pb-1.5">
                <span>
                  {form.outputCores.length} {form.outputCores.length === 1 ? 'output core' : 'output cores'}
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                    {form.outputCores.filter((c) => (c.status ?? 'free') === 'free').length} Free
                  </span>
                  <span>·</span>
                  <span className="text-sky-600 dark:text-sky-400 font-medium">
                    {form.outputCores.filter((c) => c.status === 'in_use').length} In Use
                  </span>
                  <span>·</span>
                  <span className="text-violet-600 dark:text-violet-400 font-medium">
                    {form.userFibres.length} User {form.userFibres.length === 1 ? 'Fibre' : 'Fibres'}
                  </span>
                </span>
              </div>
            ) : null}

            {form.outputCores.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border px-3 py-4 text-center text-[11px] text-muted-foreground">
                <p>No output cores added yet.</p>
                {form.splitterEnabled ? (
                  <p className="mt-1">
                    Click{' '}
                    <button
                      type="button"
                      onClick={() => autoPopulateSplitterOutputs()}
                      className="text-primary font-semibold hover:underline"
                    >
                      &quot;Auto-generate {form.ratio} outputs&quot;
                    </button>{' '}
                    or &quot;Add output core&quot; above.
                  </p>
                ) : (
                  <p className="mt-1">
                    Click{' '}
                    <button
                      type="button"
                      onClick={handleAddOutputCore}
                      className="text-primary font-semibold hover:underline"
                    >
                      &quot;Add output core&quot;
                    </button>{' '}
                    to add distribution cores.
                  </p>
                )}
              </div>
            ) : null}

            {/* Output Cores Cards List */}
            <div className="space-y-3">
              {form.outputCores.map((core, coreIndex) => {
                const isOutputInUse = core.status === 'in_use';
                const attachedFibres = form.userFibres.filter((uf) => uf.outputCoreLabel === core.label);
                const hasSpliced = attachedFibres.some((uf) =>
                  uf.cores.some((c) => c.connectedToOutputCore),
                );

                return (
                  <div
                    key={`${core.label}-${coreIndex}`}
                    className={cn(
                      'rounded-2xl border p-3 space-y-3 transition-colors',
                      isOutputInUse
                        ? 'border-sky-500/40 bg-sky-500/[0.04] dark:border-sky-500/25 dark:bg-sky-500/[0.03]'
                        : 'border-emerald-500/30 bg-emerald-500/[0.02] dark:border-emerald-500/20 dark:bg-emerald-500/[0.02]',
                    )}
                  >
                    {/* Output Core Top Bar */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                        <label
                          className="relative size-7 shrink-0 cursor-pointer rounded-lg border border-white/70 shadow-inner transition hover:scale-105 dark:border-white/20"
                          style={{ backgroundColor: core.color }}
                          title="Output core colour"
                        >
                          <input
                            type="color"
                            value={core.color}
                            onChange={(e) =>
                              handleUpdateOutputCore(coreIndex, { color: e.target.value })
                            }
                            className="absolute inset-0 size-full cursor-pointer opacity-0"
                          />
                        </label>

                        <input
                          value={core.label}
                          onChange={(e) =>
                            handleUpdateOutputCore(coreIndex, { label: e.target.value })
                          }
                          placeholder="Output core label"
                          className="h-8 min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 text-[12px] font-semibold outline-none transition focus:border-primary/30 focus:bg-white/70 dark:focus:bg-white/[0.06]"
                        />

                        {core.powerDbm !== null && core.powerDbm !== undefined ? (
                          <span className="shrink-0 font-mono text-[11px] font-semibold text-primary px-1.5 py-0.5 rounded bg-primary/10">
                            {core.powerDbm} dBm
                          </span>
                        ) : null}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {/* Status Toggle Button */}
                        <button
                          type="button"
                          onClick={() => handleToggleOutputCoreStatus(coreIndex)}
                          title="Click to toggle status: Free or In Use"
                          className={cn(
                            'inline-flex h-7 items-center gap-1 rounded-lg px-2 text-[10.5px] font-semibold transition active:scale-95',
                            isOutputInUse
                              ? 'border border-sky-500/40 bg-sky-500/15 text-sky-700 dark:text-sky-300 hover:bg-sky-500/25'
                              : 'border border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/25',
                          )}
                        >
                          <span
                            className={cn(
                              'size-1.5 rounded-full',
                              isOutputInUse ? 'bg-sky-500' : 'bg-emerald-500',
                            )}
                          />
                          {isOutputInUse ? (
                            <span>In Use{hasSpliced ? ' · Spliced' : ''}</span>
                          ) : (
                            <span>Free (Available)</span>
                          )}
                        </button>

                        {/* Add User Fibre Button */}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleAddUserFibre(core.label)}
                          className="h-7 text-[10.5px] gap-1 px-2 border-dashed border-sky-500/40 text-sky-600 dark:text-sky-400 hover:bg-sky-500/10"
                        >
                          <Cable className="size-3" />
                          + User Fibre
                        </Button>

                        {/* Delete output core */}
                        <button
                          type="button"
                          onClick={() => handleRemoveOutputCore(coreIndex)}
                          className="grid size-7 place-items-center rounded-lg text-muted-foreground/70 transition hover:bg-destructive/10 hover:text-destructive active:scale-90"
                          title="Remove output core"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* ATTACHED USER FIBRES */}
                    {attachedFibres.length > 0 ? (
                      <div className="space-y-2.5 pt-1 border-t border-border/40">
                        <div className="flex items-center justify-between text-[10.5px]">
                          <span className="font-semibold text-muted-foreground flex items-center gap-1.5">
                            <Cable className="size-3 text-sky-500" />
                            Attached User Fibre ({attachedFibres.length})
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            Join a user core below to auto-change both core statuses to In Use
                          </span>
                        </div>

                        {attachedFibres.map((uf) => {
                          const splicedCore = uf.cores.find((c) => c.connectedToOutputCore);
                          const freeCoresCount = uf.cores.filter(
                            (c) => !c.connectedToOutputCore,
                          ).length;

                          return (
                            <div
                              key={uf.id}
                              className="rounded-xl border border-white/60 bg-white/70 p-2.5 space-y-2.5 dark:border-white/10 dark:bg-white/[0.03]"
                            >
                              {/* User Fibre Header */}
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-2 flex-1 min-w-[180px]">
                                  <div className="grid size-7 place-items-center rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400 shrink-0">
                                    <Cable className="size-3.5" />
                                  </div>

                                  <div className="flex items-center gap-1.5 flex-1">
                                    <input
                                      value={uf.label}
                                      onChange={(e) =>
                                        handleUpdateUserFibre(uf.id, { label: e.target.value })
                                      }
                                      placeholder="Drop Cable ID / Customer Name"
                                      className="h-7 w-full rounded-md border border-border/60 bg-background/50 px-2 text-[11.5px] font-semibold outline-none focus:border-primary"
                                    />
                                  </div>
                                </div>

                                {/* Core Count Configurator */}
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <span className="text-[10.5px] font-medium text-muted-foreground">
                                    Core count:
                                  </span>
                                  <div className="flex items-center rounded-lg border border-border bg-background/60 p-0.5">
                                    <button
                                      type="button"
                                      disabled={uf.coreCount <= 1}
                                      onClick={() =>
                                        handleUpdateUserFibreCoreCount(uf.id, uf.coreCount - 1)
                                      }
                                      className="size-5 rounded flex items-center justify-center text-[11px] font-bold hover:bg-muted disabled:opacity-40"
                                    >
                                      -
                                    </button>
                                    <input
                                      type="number"
                                      min={1}
                                      max={48}
                                      value={uf.coreCount}
                                      onChange={(e) =>
                                        handleUpdateUserFibreCoreCount(
                                          uf.id,
                                          Number(e.target.value),
                                        )
                                      }
                                      className="w-8 text-center bg-transparent font-mono text-[11px] font-semibold outline-none"
                                    />
                                    <button
                                      type="button"
                                      disabled={uf.coreCount >= 48}
                                      onClick={() =>
                                        handleUpdateUserFibreCoreCount(uf.id, uf.coreCount + 1)
                                      }
                                      className="size-5 rounded flex items-center justify-center text-[11px] font-bold hover:bg-muted disabled:opacity-40"
                                    >
                                      +
                                    </button>
                                  </div>

                                  {splicedCore ? (
                                    <span className="rounded-md bg-sky-500/15 border border-sky-500/30 px-1.5 py-0.5 text-[9.5px] font-semibold text-sky-700 dark:text-sky-300">
                                      ⚡ {splicedCore.label} Spliced
                                    </span>
                                  ) : (
                                    <span className="rounded-md bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.5 text-[9.5px] font-semibold text-emerald-700 dark:text-emerald-300">
                                      {freeCoresCount} Cores Free
                                    </span>
                                  )}

                                  <button
                                    type="button"
                                    onClick={() => handleRemoveUserFibre(uf.id)}
                                    className="grid size-6 place-items-center rounded-md text-muted-foreground/70 transition hover:bg-destructive/10 hover:text-destructive"
                                    title="Remove this user fibre"
                                  >
                                    <Trash2 className="size-3" />
                                  </button>
                                </div>
                              </div>

                              {/* User Fibre Cores Grid */}
                              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                                {uf.cores.map((uCore) => {
                                  const isConnected = Boolean(uCore.connectedToOutputCore);

                                  return (
                                    <div
                                      key={`${uf.id}-${uCore.coreIndex}`}
                                      className={cn(
                                        'flex items-center justify-between gap-2 min-w-0 rounded-lg border p-1.5 transition-colors',
                                        isConnected
                                          ? 'border-sky-500/50 bg-sky-500/10 dark:border-sky-500/40 dark:bg-sky-500/15'
                                          : 'border-border/60 bg-background/50 hover:bg-background/80',
                                      )}
                                    >
                                      <div className="flex items-start gap-2 min-w-0 flex-1">
                                        {/* Edit Core Color with Picker */}
                                        <label
                                          className="relative size-6 shrink-0 cursor-pointer rounded-lg border border-white/80 shadow-sm transition hover:scale-105 active:scale-95 dark:border-white/30"
                                          style={{ backgroundColor: uCore.color }}
                                          title={`Click to edit colour for ${uCore.label}`}
                                        >
                                          <input
                                            type="color"
                                            value={uCore.color}
                                            onChange={(e) =>
                                              handleUpdateUserCore(uf.id, uCore.coreIndex, {
                                                color: e.target.value,
                                              })
                                            }
                                            className="absolute inset-0 size-full cursor-pointer opacity-0"
                                            aria-label={`Colour for ${uCore.label}`}
                                          />
                                        </label>

                                        <div className="flex flex-col min-w-0 gap-0.5">
                                          <input
                                            value={uCore.label}
                                            onChange={(e) =>
                                              handleUpdateUserCore(uf.id, uCore.coreIndex, {
                                                label: e.target.value,
                                              })
                                            }
                                            placeholder="Core name"
                                            className="h-6 w-full rounded border border-transparent bg-transparent px-1 font-mono text-[11px] font-semibold outline-none transition focus:border-primary/40 focus:bg-background"
                                            title="Click to rename core"
                                          />

                                          <span
                                            className={cn(
                                              'text-[9px] font-semibold rounded px-1 py-0.2',
                                              isConnected
                                                ? 'text-sky-600 dark:text-sky-400 bg-sky-500/15'
                                                : 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/15',
                                            )}
                                          >
                                            {isConnected ? 'In Use' : 'Free'}
                                          </span>
                                        </div>
                                      </div>

                                      {isConnected ? (
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant="outline"
                                          onClick={() =>
                                            handleDisconnectUserCore(uf.id, uCore.coreIndex)
                                          }
                                          className="h-6 text-[10px] font-semibold px-2 border-rose-500/30 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 shrink-0"
                                        >
                                          <Unlink className="size-2.5 mr-1" />
                                          Disconnect
                                        </Button>
                                      ) : (
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant="outline"
                                          onClick={() =>
                                            handleConnectUserCore(uf.id, uCore.coreIndex)
                                          }
                                          className="h-6 text-[10px] font-semibold px-2 border-sky-500/40 text-sky-600 dark:text-sky-400 hover:bg-sky-500/15 shrink-0"
                                        >
                                          <Link2 className="size-2.5 mr-1" />
                                          Join with {core.label}
                                        </Button>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="flex items-center justify-between rounded-xl border border-dashed border-border/70 bg-muted/20 px-3 py-2 text-[11px]">
                        <span className="text-muted-foreground text-[10.5px]">
                          No user fibre connected to this output core.
                        </span>
                        <button
                          type="button"
                          onClick={() => handleAddUserFibre(core.label)}
                          className="inline-flex items-center gap-1 font-semibold text-primary hover:underline text-[11px]"
                        >
                          <Cable className="size-3" />
                          + Attach User Fibre
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* ADDITIONAL SPLITTERS — each with its own feed core, ratio and outputs */}
          <section className="space-y-2 rounded-2xl border border-white/60 bg-white/40 p-3 dark:border-white/10 dark:bg-white/[0.03]">
            <div className="flex items-center justify-between">
              <p className="text-[12px] font-semibold">More splitters in this joint</p>
              <button
                type="button"
                onClick={addExtraSplitter}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
              >
                + Add splitter
              </button>
            </div>
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              Splitter 1 is configured above. Every splitter added here has one feed core and its own
              split ratio — outputs are generated from the ratio, so regenerate them any time, or
              rename and add legs by hand.
            </p>
            {form.extraSplitters.length === 0 ? (
              <p className="text-[10.5px] text-muted-foreground">No extra splitters fitted.</p>
            ) : null}
            {form.extraSplitters.map((extra, index) => {
              const ordinal = index + 2;
              const feedPower = upstreamPowerDbm(extra.inputCoreLabel);
              const outPower = extraOutputPower(extra);
              const loss = getSplitterLossDb(extra.ratio, 0.2);
              const feedColor =
                form.cores.find((core) => core.label === extra.inputCoreLabel)?.color ??
                tiaCoreColor(ordinal);
              return (
                <div
                  key={extra.id}
                  className="space-y-2 rounded-xl border border-white/60 bg-white/50 p-2.5 dark:border-white/10 dark:bg-white/[0.03]"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700 dark:text-violet-300">
                      Splitter {ordinal}
                    </span>
                    <span className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-violet-500/30 bg-violet-500/[0.08] px-2">
                      <label
                        className="relative size-4 shrink-0 cursor-pointer rounded-full border border-white/70 shadow-inner transition hover:scale-110 dark:border-white/20"
                        style={{ backgroundColor: feedColor }}
                        title="Input core colour"
                      >
                        <input
                          type="color"
                          value={feedColor}
                          onChange={(event) =>
                            recolourFeed(extra.inputCoreLabel, event.target.value)
                          }
                          className="absolute inset-0 size-full cursor-pointer opacity-0"
                          aria-label={`Splitter ${ordinal} input core colour`}
                        />
                      </label>
                      <FeedLabelField
                        ariaLabel={`Splitter ${ordinal} input core`}
                        value={extra.inputCoreLabel}
                        onRename={(label) => renameFeed(extra.inputCoreLabel, label)}
                        placeholder="Input core"
                        className="h-6 w-[104px] rounded-md border border-transparent bg-transparent px-0.5 font-mono text-[11px] font-semibold outline-none transition focus:border-primary/40 focus:bg-background"
                      />
                    </span>
                    <Select
                      value={extra.ratio}
                      onValueChange={(value) => {
                        const ratio = value as SplitRatio;
                        const feed = upstreamPowerDbm(extra.inputCoreLabel);
                        const power = feed !== null ? calculateOutputPower(feed, ratio, 0.2) : null;
                        updateExtraSplitter(index, {
                          ratio,
                          outputs: makeExtraOutputs(ratio, power, ordinal),
                        });
                      }}
                    >
                      <SelectTrigger
                        aria-label={`Splitter ${ordinal} ratio`}
                        className="h-8 w-[104px] font-mono text-[11px]"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {RATIO_OPTIONS.map((option) => (
                          <SelectItem key={`s${ordinal}-${option}`} value={option}>
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => autoGenerateExtraOutputs(index)}
                      className="h-8 gap-1 px-2 text-[10.5px]"
                    >
                      <Wand2 className="size-3" />
                      Auto generate
                    </Button>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      -{loss.toFixed(1)} dB ·{' '}
                      {feedPower !== null ? `${feedPower} dBm in` : 'no feed power'} ·{' '}
                      {outPower !== null ? `${outPower} dBm out` : '—'}
                    </span>
                    <button
                      type="button"
                      aria-label={`Remove splitter ${ordinal}`}
                      onClick={() => removeExtraSplitter(index)}
                      className="ml-auto text-[11px] text-muted-foreground hover:text-destructive"
                    >
                      Remove
                    </button>
                  </div>

                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {extra.outputs.map((out, outIndex) => (
                      <div key={`${extra.id}-out-${outIndex}`} className="flex items-center gap-1.5">
                        <label
                          className="relative size-6 shrink-0 cursor-pointer rounded-lg border border-white/70 shadow-inner transition hover:scale-105 active:scale-95 dark:border-white/20"
                          style={{ backgroundColor: out.color }}
                          title="Output core colour"
                        >
                          <input
                            type="color"
                            value={out.color}
                            onChange={(event) =>
                              updateExtraOutput(index, outIndex, { color: event.target.value })
                            }
                            className="absolute inset-0 size-full cursor-pointer opacity-0"
                            aria-label={`Splitter ${ordinal} output ${outIndex + 1} colour`}
                          />
                        </label>
                        <Input
                          aria-label={`Splitter ${ordinal} output ${outIndex + 1}`}
                          value={out.label}
                          onChange={(event) =>
                            updateExtraOutput(index, outIndex, { label: event.target.value })
                          }
                          className="h-7 font-mono text-[10.5px]"
                        />
                        <button
                          type="button"
                          aria-label={`Remove splitter ${ordinal} output ${outIndex + 1}`}
                          onClick={() =>
                            updateExtraSplitter(index, {
                              outputs: extra.outputs.filter((_core, oi) => oi !== outIndex),
                            })
                          }
                          className="text-[11px] text-muted-foreground hover:text-destructive"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => addExtraOutput(index)}
                      className="text-[10.5px] font-semibold text-primary hover:underline"
                    >
                      + Add output
                    </button>
                    <span className="text-[10px] text-muted-foreground">
                      {extra.outputs.length} output{extra.outputs.length === 1 ? '' : 's'} on{' '}
                      {extra.ratio}
                    </span>
                  </div>
                </div>
              );
            })}
          </section>

            {initial ? (
              <FibreCorePicker
                kind="tj"
                deviceId={initial.id}
                links={links}
                onPatched={onLinksChanged}
              />
            ) : null}
            </>
          ) : null}

          {/* FIBRE CUT REPAIR DETAILS (shown if Fibre Cut TJ or isCut toggle) */}
          {form.tjType === 'cut' || form.isCut ? (
            <section className="space-y-3 rounded-2xl border border-rose-500/30 bg-rose-500/[0.06] p-3">
              <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
                <Scissors className="size-4" />
                <span className="text-[12px] font-semibold uppercase tracking-[0.1em]">
                  Fibre Cut Incident & Splicing Status
                </span>
              </div>

              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                <div className="space-y-1">
                  <Label htmlFor="cut-severity" className="text-[10.5px]">
                    Severity
                  </Label>
                  <Select
                    value={form.cutSeverity}
                    onValueChange={(value) => patch({ cutSeverity: value as CutSeverity })}
                  >
                    <SelectTrigger id="cut-severity" className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="minor">Minor · partial core loss</SelectItem>
                      <SelectItem value="major">Major · distribution link down</SelectItem>
                      <SelectItem value="outage">Outage · full trunk down</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="cut-repair-status" className="text-[10.5px]">
                    Repair Status
                  </Label>
                  <Select
                    value={form.repairStatus}
                    onValueChange={(val) => patch({ repairStatus: val as CutRepairStatus })}
                  >
                    <SelectTrigger id="cut-repair-status" className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cut_unresolved">🔴 Active Cut / Unresolved</SelectItem>
                      <SelectItem value="splicing_in_progress">🟡 Splicing In Progress</SelectItem>
                      <SelectItem value="restored">🟢 Spliced & Restored</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="otdr-distance" className="text-[10.5px]">
                    OTDR Fault Distance (m)
                  </Label>
                  <Input
                    id="otdr-distance"
                    type="number"
                    placeholder="1250"
                    value={form.faultDistanceMeters}
                    onChange={(e) => patch({ faultDistanceMeters: e.target.value })}
                    className="h-9 font-mono text-[11px]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <Label htmlFor="damaged-cores" className="text-[10.5px]">
                    Damaged Cores
                  </Label>
                  <Input
                    id="damaged-cores"
                    type="number"
                    placeholder="0"
                    value={form.damagedCores}
                    readOnly
                    disabled={Boolean(prefillCores && prefillCores.length > 0)}
                    onChange={(e) => patch({ damagedCores: e.target.value })}
                    className="h-9 font-mono text-[11px]"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="restored-cores" className="text-[10.5px]">
                    Restored Cores
                  </Label>
                  <Input
                    id="restored-cores"
                    type="number"
                    placeholder="0"
                    value={form.restoredCores}
                    readOnly
                    onChange={(e) => patch({ restoredCores: e.target.value })}
                    className="h-9 font-mono text-[11px]"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="cut-reason" className="text-[10.5px]">
                  Root Cause / Incident Description
                </Label>
                <Textarea
                  id="cut-reason"
                  placeholder="Road excavation severed the 24F aerial cable near the bridge pillar."
                  value={form.cutReason}
                  onChange={(event) => patch({ cutReason: event.target.value })}
                  className="min-h-[56px] text-[11.5px]"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="restoration-notes" className="text-[10.5px]">
                  Restoration / Joint Box Closure Notes
                </Label>
                <Input
                  id="restoration-notes"
                  placeholder="Tray #2 re-spliced with heat shrink tubes; joint sealed with silica gel."
                  value={form.restorationNotes}
                  onChange={(e) => patch({ restorationNotes: e.target.value })}
                  className="h-9 text-[11.5px]"
                />
              </div>

              <div className="space-y-2 rounded-xl border border-rose-500/20 bg-white/50 p-2.5 dark:border-white/10 dark:bg-white/[0.03]">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <Label className="text-[10.5px] font-semibold">Fibre cores — join/splice each core</Label>
                    {form.fibreId ? (
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        Fibre: <span className="font-mono font-semibold text-foreground">{form.fibreId}</span>
                      </p>
                    ) : null}
                  </div>
                  <span className="text-[10px] text-muted-foreground">Edit name & color, then join</span>
                </div>
                {form.cores.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border px-3 py-3 text-center text-[11px] text-muted-foreground">
                    No cores for this fibre.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {form.cores.map((core, index) => {
                      const status = core.status ?? 'free';
                      const isJoined = status === 'spliced' || status === 'in_use';
                      return (
                        <div
                          key={`${core.label}-${index}`}
                          className={cn(
                            'flex items-center gap-2 rounded-xl border p-2',
                            isJoined
                              ? 'border-emerald-500/35 bg-emerald-500/[0.06]'
                              : status === 'damaged'
                                ? 'border-rose-500/35 bg-rose-500/[0.05]'
                                : 'border-white/60 bg-white/60 dark:border-white/10 dark:bg-white/[0.03]',
                          )}
                        >
                          <label
                            className="relative size-8 shrink-0 cursor-pointer rounded-lg border border-white/70 shadow-inner transition hover:scale-105 dark:border-white/20"
                            style={{ backgroundColor: core.color }}
                            title="Core colour"
                          >
                            <input
                              type="color"
                              value={core.color}
                              onChange={(e) => handleCoresChange(form.cores.map((c, i) => (i === index ? { ...c, color: e.target.value } : c)))}
                              className="absolute inset-0 size-full cursor-pointer opacity-0"
                              aria-label={`Colour for ${core.label || `core ${index + 1}`}`}
                            />
                          </label>
                          <Input
                            value={core.label}
                            onChange={(e) => handleCoresChange(form.cores.map((c, i) => (i === index ? { ...c, label: e.target.value } : c)))}
                            placeholder="Core name"
                            className="h-8 min-w-0 flex-1 text-[12px]"
                            aria-label="Core name"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const nextStatus: CoreStatus = isJoined ? 'damaged' : 'spliced';
                              const nextCores = form.cores.map((c, i) => (i === index ? { ...c, status: nextStatus } : c));
                              const restored = nextCores.filter((c) => c.status === 'spliced' || c.status === 'in_use').length;
                              const damaged = nextCores.filter((c) => c.status === 'damaged').length;
                              patch({
                                cores: nextCores,
                                restoredCores: String(restored),
                                damagedCores: String(damaged),
                                repairStatus:
                                  restored >= nextCores.length && nextCores.length > 0
                                    ? 'restored'
                                    : restored > 0
                                      ? 'splicing_in_progress'
                                      : form.repairStatus,
                              });
                            }}
                            className={cn(
                              'inline-flex h-8 shrink-0 items-center gap-1 rounded-lg px-2.5 text-[10.5px] font-semibold transition',
                              isJoined
                                ? 'border border-emerald-500/40 bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/25 dark:text-emerald-300'
                                : 'border border-sky-500/30 bg-sky-500/10 text-sky-700 hover:bg-sky-500/20 dark:text-sky-300',
                            )}
                            title={isJoined ? 'Mark as not joined' : 'Join/splice this core'}
                          >
                            <Link2 className="size-3" />
                            {isJoined ? 'Joined' : 'Join core'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>
          ) : null}

          {/* PON POWER TELEMETRY DETAILS (shown if PON Power TJ) */}
          {form.tjType === 'pon_power' ? (
            <section className="space-y-3 rounded-2xl border border-amber-500/30 bg-amber-500/[0.06] p-3">
              <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                <Zap className="size-4" />
                <span className="text-[12px] font-semibold uppercase tracking-[0.1em]">
                  PON Optical Power & OLT Telemetry
                </span>
              </div>

              <div className="grid grid-cols-1 gap-2.5">
                <div className="space-y-1">
                  <Label htmlFor="wavelength" className="text-[10.5px]">
                    Wavelength
                  </Label>
                  <Select
                    value={form.wavelength}
                    onValueChange={(val) => patch({ wavelength: val })}
                  >
                    <SelectTrigger id="wavelength" className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1490nm (GPON Downstream)">1490 nm (GPON Downstream)</SelectItem>
                      <SelectItem value="1310nm (GPON Upstream)">1310 nm (GPON Upstream)</SelectItem>
                      <SelectItem value="1577nm (XGS-PON Downstream)">1577 nm (XGS-PON 10G)</SelectItem>
                      <SelectItem value="1270nm (XGS-PON Upstream)">1270 nm (XGS-PON Upstream)</SelectItem>
                      <SelectItem value="1550nm (CATV / RF Overlay)">1550 nm (CATV Overlay)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-2.5 text-[11px] leading-relaxed text-amber-900 dark:text-amber-200">
                <p>
                  <strong>Optical Power Budget:</strong> Input core {form.inputCoreLabel} power ({inputPowerNum !== null ? `${inputPowerNum > 0 ? `+${inputPowerNum}` : inputPowerNum} dBm` : 'not set'}) minus{' '}
                  {form.splitterEnabled ? `${splitterLossDb.toFixed(1)} dB splitter loss` : '0 dB loss'} gives{' '}
                  <span className="font-bold font-mono">
                    {outputPowerDbm !== null ? `${outputPowerDbm} dBm` : '—'}
                  </span>{' '}
                  at subscriber drops.
                </p>
              </div>
            </section>
          ) : null}

          {/* GENERAL FIELD NOTES */}
          <section className="space-y-1.5">
            <Label htmlFor="tj-notes">Field notes & splice tray details</Label>
            <Textarea
              id="tj-notes"
              placeholder="Splice tray allocation, enclosure pole mount ID, technician contact…"
              value={form.notes}
              onChange={(event) => patch({ notes: event.target.value })}
              className="min-h-[56px] text-[12px]"
            />
          </section>

          {error ? (
            <div className="flex items-start gap-2 rounded-xl border border-destructive/25 bg-destructive/10 px-3 py-2.5 text-[12px] text-destructive">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              {initial ? 'Save changes' : 'Add terminal joint'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
