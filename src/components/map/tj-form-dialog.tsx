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
import { cn } from '@/lib/utils';

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
  onSaved: (tj: Tj, mode: 'create' | 'update') => void;
}

const FIBRE_COLOR_PALETTE = [
  '#2563eb', // 1: Blue
  '#ea580c', // 2: Orange
  '#16a34a', // 3: Green
  '#854d0e', // 4: Brown
  '#64748b', // 5: Slate
  '#e2e8f0', // 6: White
  '#dc2626', // 7: Red
  '#1e293b', // 8: Black
  '#ca8a04', // 9: Yellow
  '#9333ea', // 10: Violet
  '#e11d48', // 11: Rose
  '#0891b2', // 12: Aqua
];

function generateUserFibreCores(count: number): UserFibreCore[] {
  const safeCount = Math.min(48, Math.max(1, count));
  return Array.from({ length: safeCount }, (_, i) => ({
    coreIndex: i + 1,
    label: `Core ${String(i + 1).padStart(2, '0')}`,
    color: FIBRE_COLOR_PALETTE[i % FIBRE_COLOR_PALETTE.length],
    status: 'free' as CoreStatus,
    connectedToOutputCore: false,
  }));
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
  cores: [
    { label: 'Core 01', color: '#22d3ee', count: 1, status: 'free' },
    { label: 'Core 02', color: '#34d399', count: 1, status: 'free' },
    { label: 'Core 03', color: '#a78bfa', count: 1, status: 'free' },
    { label: 'Core 04', color: '#fbbf24', count: 1, status: 'free' },
  ],
  outputCores: [],
  userFibres: [],
  splitterEnabled: false,
  ratio: '1:8',
  inputCoreLabel: 'Core 01',
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
      setForm({
        code: initial.code,
        name: initial.name ?? '',
        tjType,
        address: initial.address ?? '',
        fibreId: initial.fibreId ?? '',
        lat: initial.lat.toFixed(6),
        lng: initial.lng.toFixed(6),
        notes: initial.notes ?? '',
        cores:
          initial.cores?.length > 0
            ? initial.cores.map((c) => ({
                ...c,
                count: 1,
                status: c.status ?? 'free',
              }))
            : EMPTY_FORM.cores,
        outputCores:
          initial.outputCores && initial.outputCores.length > 0
            ? initial.outputCores.map((c) => ({
                ...c,
                count: 1,
                status: c.status ?? 'free',
              }))
            : initial.splitter?.outputs?.map((c) => ({
                ...c,
                count: 1,
                status: c.status ?? 'free',
              })) ?? [],
        userFibres: initial.userFibres ?? [],
        splitterEnabled: initial.splitter?.enabled ?? false,
        ratio: (initial.splitter?.ratio as SplitRatio) ?? '1:8',
        inputCoreLabel: initial.splitter?.inputCoreLabel ?? initial.cores?.[0]?.label ?? 'Core 01',
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
        cores: prefill ?? EMPTY_FORM.cores,
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
  // - Enabling: automatically connects to a free input core and marks it In Use.
  // - Disabling: automatically releases that connected core back to Free.
  function handleToggleSplitter(enabled: boolean) {
    if (enabled) {
      const preferred = form.cores.find(
        (c) => c.label === form.inputCoreLabel && (c.status ?? 'free') === 'free',
      );
      const freeCore = preferred ?? form.cores.find((c) => (c.status ?? 'free') === 'free');

      if (!freeCore) {
        const errorMsg =
          'Cannot add splitter: All input cores are currently in use or cut. A splitter requires a free input core.';
        setSplitterError(errorMsg);
        toast.error('No Free Core Available', {
          description: errorMsg,
        });
        return;
      }

      // Automatically update the connected input core to 'in_use'
      const updatedCores = form.cores.map((c) =>
        c.label === freeCore.label ? { ...c, status: 'in_use' as const } : c,
      );

      // Derive initial output power from the power arriving on that core's link
      const feedPower = upstreamPowerDbm(freeCore.label);
      const initialOutPower =
        feedPower !== null ? calculateOutputPower(feedPower, form.ratio, 0.2) : null;

      const outputs =
        form.outputCores.length > 0
          ? form.outputCores.map((o) => ({ ...o, powerDbm: initialOutPower }))
          : generateSplitterOutputs(form.ratio, initialOutPower);

      setSplitterError(null);
      patch({
        splitterEnabled: true,
        inputCoreLabel: freeCore.label,
        cores: updatedCores,
        outputCores: outputs,
      });

      toast.success(
        `Splitter enabled: connected to free core ${freeCore.label} (now marked In Use).`,
      );
    } else {
      // Revert the connected input core back to 'free'
      const activeLabel = form.inputCoreLabel;
      const updatedCores = form.cores.map((c) =>
        c.label === activeLabel ? { ...c, status: 'free' as const } : c,
      );

      setSplitterError(null);
      patch({
        splitterEnabled: false,
        cores: updatedCores,
      });

      toast.info(`Splitter removed: ${activeLabel} is now marked as Free.`);
    }
  }

  // Handle selecting a splitter feed core:
  // - If core is in use or damaged: show an explicit error message & toast!
  // - If free: release old core to Free and set new core to In Use, and recalculate output power from new core's power.
  function handleSelectSplitterCore(selectedLabel: string) {
    const target = form.cores.find((c) => c.label === selectedLabel);
    if (!target) return;

    const currentStatus = target.status ?? 'free';

    // If it's already the active feeding core and in_use
    if (selectedLabel === form.inputCoreLabel && currentStatus === 'in_use' && !splitterError) {
      return;
    }

    // Check if the target core is in use or cut
    if (currentStatus !== 'free') {
      const reason =
        currentStatus === 'damaged'
          ? 'cut / damaged'
          : 'already in use (occupied)';
      const errorMsg = `Cannot connect splitter to "${target.label}": This core is ${reason}. Splitters can only be connected to a free core.`;

      setSplitterError(errorMsg);
      patch({ inputCoreLabel: selectedLabel });
      toast.error('Cannot connect to used core', {
        description: errorMsg,
      });
      return;
    }

    // Target core is Free!
    const prevLabel = form.inputCoreLabel;
    const updatedCores = form.cores.map((c) => {
      if (c.label === prevLabel && c.label !== selectedLabel) {
        return { ...c, status: 'free' as const };
      }
      if (c.label === selectedLabel) {
        return { ...c, status: 'in_use' as const };
      }
      return c;
    });

    // Recalculate output power from the new feeding core's upstream link
    const targetPower = upstreamPowerDbm(selectedLabel);
    const newOutPower =
      targetPower !== null ? calculateOutputPower(targetPower, form.ratio, 0.2) : null;

    const updatedOutputs = form.outputCores.map((out) => ({
      ...out,
      powerDbm: newOutPower,
    }));

    setSplitterError(null);
    patch({
      inputCoreLabel: selectedLabel,
      cores: updatedCores,
      outputCores: updatedOutputs,
    });

    toast.success(
      `Splitter connected to ${selectedLabel}. (${prevLabel} restored to Free)`,
    );
  }

  // Handle cores list update from CoreEditor: recalculate the splitter outputs
  // whenever the feeding core (or its upstream link) changes.
  function handleCoresChange(newCores: Core[]) {
    let err = splitterError;
    const feedCore = newCores.find((c) => c.label === form.inputCoreLabel);

    if (form.splitterEnabled) {
      if (!feedCore) {
        err = `Splitter feeding core "${form.inputCoreLabel}" was removed. Select a free core.`;
      } else if (feedCore.status === 'damaged') {
        err = `Splitter feeding core "${feedCore.label}" is marked as cut/damaged. Splitters require an intact free core.`;
      } else {
        err = null;
      }
    }

    // Automatically calculate new output power from the feed core's upstream link
    const feedPower = upstreamPowerDbm(form.inputCoreLabel);

    const calculatedOutPower =
      feedPower !== null ? calculateOutputPower(feedPower, form.ratio, 0.2) : null;

    const updatedOutputs = form.outputCores.map((out) => ({
      ...out,
      powerDbm: calculatedOutPower,
    }));

    setSplitterError(err);
    patch({
      cores: newCores,
      outputCores: updatedOutputs,
    });
  }

  function handleAddOutputCore() {
    const nextNum = form.outputCores.length + 1;
    const newCore: Core = {
      label: `Leg ${String(nextNum).padStart(2, '0')}`,
      color: FIBRE_COLOR_PALETTE[(nextNum - 1) % FIBRE_COLOR_PALETTE.length],
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
            label: `Core ${String(idx).padStart(2, '0')}`,
            color: FIBRE_COLOR_PALETTE[(idx - 1) % FIBRE_COLOR_PALETTE.length],
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

    const isCut = form.tjType === 'cut' || form.isCut;

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
      cores: form.cores.map((core) => ({
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
      splitter: {
        enabled: form.splitterEnabled,
        ratio: form.splitterEnabled ? form.ratio : null,
        inputCoreLabel: form.splitterEnabled ? form.inputCoreLabel : null,
        inputPowerDbm: form.splitterEnabled && inputPowerNum !== null && Number.isFinite(inputPowerNum) ? inputPowerNum : null,
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
      },
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
              Define incoming fiber tubes. Input power is filled automatically from the upstream device's output core when this joint is linked — no manual dBm entry. Click the status button to toggle between{' '}
              <strong className="text-emerald-600 dark:text-emerald-400">Free (Spare)</strong>,{' '}
              <strong className="text-sky-600 dark:text-sky-400">In Use</strong>, or{' '}
              <strong className="text-rose-600 dark:text-rose-400">Cut</strong>.
            </p>

            <CoreEditor
              value={form.cores}
              onChange={handleCoresChange}
              addLabel="Add input core"
              emptyLabel="Add at least one input core"
              splitterCoreLabel={form.splitterEnabled ? form.inputCoreLabel : undefined}
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
                  <p className="text-[12px] font-semibold">Optical Splitter</p>
                  <p className="text-[10px] text-muted-foreground">
                    Connect an input core to a splitter and calculate output power automatically.
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
                    <Label htmlFor="splitter-feed-core" className="text-[11px]">
                      Connect Input Core
                    </Label>
                    <Select
                      value={form.inputCoreLabel}
                      onValueChange={handleSelectSplitterCore}
                    >
                      <SelectTrigger
                        id="splitter-feed-core"
                        className={cn('h-9', splitterError && 'border-destructive focus:ring-destructive')}
                      >
                        <SelectValue placeholder="Select feeding core" />
                      </SelectTrigger>
                      <SelectContent>
                        {form.cores.map((core, i) => {
                          const status = core.status ?? 'free';
                          const isFeeding =
                            form.splitterEnabled &&
                            core.label === form.inputCoreLabel &&
                            !splitterError;
                          const isDamaged = status === 'damaged';
                          const isFree = status === 'free';

                          return (
                            <SelectItem key={`${core.label}-${i}`} value={core.label}>
                              <div className="flex items-center justify-between gap-3 w-full">
                                <div className="flex items-center gap-2">
                                  <span
                                    className="size-2 rounded-full shrink-0"
                                    style={{ backgroundColor: core.color }}
                                  />
                                  <span className="font-medium">{core.label}</span>
                                </div>
                                <span
                                  className={cn(
                                    'rounded px-1.5 py-0.5 text-[9.5px] font-semibold',
                                    isFeeding
                                      ? 'bg-violet-500/15 text-violet-600 dark:text-violet-400'
                                      : isFree
                                        ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                                        : isDamaged
                                          ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                                          : 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
                                  )}
                                >
                                  {isFeeding
                                    ? '⚡ Splitter Feed'
                                    : isFree
                                      ? '🟢 Free'
                                      : isDamaged
                                        ? '🔴 Cut'
                                        : '🔵 In Use (Occupied)'}
                                </span>
                              </div>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
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
                  <p className="text-[12px] font-semibold">Output Fibre Cores & User Drop Cables</p>
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
