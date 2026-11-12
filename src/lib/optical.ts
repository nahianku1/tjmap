export type SplitRatio =
  | '1:2'
  | '1:4'
  | '1:8'
  | '1:16'
  | '1:32'
  | '1:64'
  | '50:50'
  | '80:20'
  | '70:30'
  | '90:10';

export interface RatioLossInfo {
  ratio: SplitRatio;
  label: string;
  type: 'PLC' | 'FBT';
  theoreticalLossDb: number;
  typicalInsertionLossDb: number; // Including connector/internal loss
  outputsCount: number;
  description: string;
}

export const SPLITTER_RATIO_PRESETS: Record<SplitRatio, RatioLossInfo> = {
  '1:2': {
    ratio: '1:2',
    label: '1:2 PLC Splitter',
    type: 'PLC',
    theoreticalLossDb: 3.01,
    typicalInsertionLossDb: 3.6,
    outputsCount: 2,
    description: 'Symmetric 2-way split (~3.6 dB loss per leg)',
  },
  '1:4': {
    ratio: '1:4',
    label: '1:4 PLC Splitter',
    type: 'PLC',
    theoreticalLossDb: 6.02,
    typicalInsertionLossDb: 7.2,
    outputsCount: 4,
    description: 'Symmetric 4-way split (~7.2 dB loss per leg)',
  },
  '1:8': {
    ratio: '1:8',
    label: '1:8 PLC Splitter',
    type: 'PLC',
    theoreticalLossDb: 9.03,
    typicalInsertionLossDb: 10.5,
    outputsCount: 8,
    description: 'Standard FTTH distribution split (~10.5 dB loss)',
  },
  '1:16': {
    ratio: '1:16',
    label: '1:16 PLC Splitter',
    type: 'PLC',
    theoreticalLossDb: 12.04,
    typicalInsertionLossDb: 13.8,
    outputsCount: 16,
    description: 'High-density distribution split (~13.8 dB loss)',
  },
  '1:32': {
    ratio: '1:32',
    label: '1:32 PLC Splitter',
    type: 'PLC',
    theoreticalLossDb: 15.05,
    typicalInsertionLossDb: 17.1,
    outputsCount: 32,
    description: 'Centralized GPON split (~17.1 dB loss)',
  },
  '1:64': {
    ratio: '1:64',
    label: '1:64 PLC Splitter',
    type: 'PLC',
    theoreticalLossDb: 18.06,
    typicalInsertionLossDb: 20.5,
    outputsCount: 64,
    description: 'Maximum standard GPON split (~20.5 dB loss)',
  },
  '50:50': {
    ratio: '50:50',
    label: '50:50 FBT Coupler',
    type: 'FBT',
    theoreticalLossDb: 3.01,
    typicalInsertionLossDb: 3.5,
    outputsCount: 2,
    description: 'Equal power splitter coupler (~3.5 dB each leg)',
  },
  '80:20': {
    ratio: '80:20',
    label: '80:20 FBT Coupler',
    type: 'FBT',
    theoreticalLossDb: 6.99,
    typicalInsertionLossDb: 7.5,
    outputsCount: 2,
    description: 'Through leg ~1.2 dB loss; Drop/Tap leg ~7.5 dB loss',
  },
  '70:30': {
    ratio: '70:30',
    label: '70:30 FBT Coupler',
    type: 'FBT',
    theoreticalLossDb: 5.23,
    typicalInsertionLossDb: 5.8,
    outputsCount: 2,
    description: 'Through leg ~1.8 dB loss; Drop/Tap leg ~5.8 dB loss',
  },
  '90:10': {
    ratio: '90:10',
    label: '90:10 FBT Coupler',
    type: 'FBT',
    theoreticalLossDb: 10.0,
    typicalInsertionLossDb: 10.6,
    outputsCount: 2,
    description: 'Through leg ~0.6 dB loss; Drop/Tap leg ~10.6 dB loss',
  },
};

export type OpticalPowerQuality = 'optimal' | 'marginal' | 'critical' | 'overload';

export interface PowerAssessment {
  status: OpticalPowerQuality;
  label: string;
  badgeTone: string;
  bgTone: string;
  borderTone: string;
  textTone: string;
  description: string;
}

/**
 * Calculates optical splitter insertion loss for a given ratio.
 * Splice margin default is 0.2 dB per fusion splice.
 */
export function getSplitterLossDb(ratio: string | null | undefined, spliceMarginDb = 0.2): number {
  if (!ratio) return 0;
  const preset = SPLITTER_RATIO_PRESETS[ratio as SplitRatio];
  if (preset) {
    return Number((preset.typicalInsertionLossDb + spliceMarginDb).toFixed(2));
  }
  // Fallback for custom 1:N ratios: 10 * log10(N) + 0.5dB internal + spliceMargin
  const match = ratio.match(/1:(\d+)/);
  if (match) {
    const outputs = parseInt(match[1], 10);
    if (outputs > 0) {
      const theo = 10 * Math.log10(outputs);
      return Number((theo + 0.5 + spliceMarginDb).toFixed(2));
    }
  }
  return 0;
}

/**
 * Calculates output optical power in dBm given input power and splitter ratio.
 * P_out (dBm) = P_in (dBm) - Loss (dB)
 */
export function calculateOutputPower(
  inputPowerDbm: number | null | undefined,
  ratio: string | null | undefined,
  spliceMarginDb = 0.2,
): number | null {
  if (inputPowerDbm === null || inputPowerDbm === undefined || !Number.isFinite(inputPowerDbm)) {
    return null;
  }
  const loss = getSplitterLossDb(ratio, spliceMarginDb);
  return Number((inputPowerDbm - loss).toFixed(2));
}

/**
 * Assesses optical power level according to standard ITU-T G.984 (GPON) & IEEE 802.3ah (EPON)
 * receiver dynamic range recommendations:
 * - Optimal range for ONT: -15.0 dBm to -24.0 dBm
 * - Marginal range: -24.1 dBm to -27.0 dBm (risk of intermittent packet drops)
 * - Critical range: < -27.0 dBm (LOS - Loss of Signal)
 * - Overload: > -8.0 dBm (Risk of receiver photodiode saturation)
 */
export function assessOpticalPower(powerDbm: number | null | undefined): PowerAssessment | null {
  if (powerDbm === null || powerDbm === undefined || !Number.isFinite(powerDbm)) {
    return null;
  }

  if (powerDbm > -8.0) {
    return {
      status: 'overload',
      label: 'High Power / Overload',
      badgeTone: 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400',
      bgTone: 'bg-amber-500/[0.08]',
      borderTone: 'border-amber-500/30',
      textTone: 'text-amber-500',
      description: 'Signal > -8 dBm: Risk of photodiode receiver overload / saturation.',
    };
  }

  if (powerDbm >= -24.0) {
    return {
      status: 'optimal',
      label: 'Optimal (-15 to -24 dBm)',
      badgeTone: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
      bgTone: 'bg-emerald-500/[0.08]',
      borderTone: 'border-emerald-500/30',
      textTone: 'text-emerald-500',
      description: 'Healthy operating window for GPON/EPON ONUs with full throughput.',
    };
  }

  if (powerDbm >= -27.0) {
    return {
      status: 'marginal',
      label: 'Marginal (-24.1 to -27 dBm)',
      badgeTone: 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400',
      bgTone: 'bg-amber-500/[0.08]',
      borderTone: 'border-amber-500/30',
      textTone: 'text-amber-500',
      description: 'Near receiver sensitivity threshold. Bends or dirty connectors may cause packet loss.',
    };
  }

  return {
    status: 'critical',
    label: 'Critical Loss (< -27 dBm)',
    badgeTone: 'border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-400',
    bgTone: 'bg-rose-500/[0.08]',
    borderTone: 'border-rose-500/30',
    textTone: 'text-rose-500',
    description: 'Below minimum ONT receiver sensitivity. Link flapping or total outage imminent.',
  };
}

