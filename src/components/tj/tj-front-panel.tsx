'use client';

import { useId, useState } from 'react';
import type { Core, CutRepairStatus, TjType, UserFibre } from '@/lib/types';
import { displayCoreLabel } from '@/lib/fibre-cores';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';
const MAX_VISIBLE = 16;

const FEED_PITCH = 36;
const FEED_TOP = 138;
const SPLITTER_X = 196;
const SPLITTER_Y = 138;
const SPLITTER_W = 136;
const SPLITTER_H = 126;
const SPLITTER_CARD_H = 58;
const SPLITTER_CARD_GAP = 8;
const LEGS_X = 352;
const LEGS_TOP = 146;
const LEG_PITCH = 68;
const LEG_ROW_PITCH = 48;
const LEG_W = 58;
const LEGS_PER_ROW = 4;

const CORES_X = 38;
const CORES_TOP = 138;
const CORE_PITCH = 70;
const CORE_ROW_PITCH = 50;
const CORE_W = 64;
const CORES_PER_ROW = 8;

const TYPE_TITLE: Record<TjType, string> = {
  box: 'TERMINAL JOINT · TJ-48 CLOSURE',
  cut: 'FIBRE CUT · REPAIR CLOSURE',
  pon_power: 'PON POWER · OPTICAL TEST POINT',
};

function shortLabel(label: string, max = 9): string {
  const trimmed = label.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed || '—';
}

function fmtDbm(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return `${value > 0 ? '+' : ''}${value} dBm`;
}

function isLive(core: Core): boolean {
  return core.status === 'in_use' || core.status === 'spliced';
}

function liveLed(cx: number, cy: number, begin: string, colour = '#4ade80') {
  return (
    <g>
      <circle cx={cx} cy={cy} r={5.2} fill={colour} opacity={0.3}>
        <animate
          attributeName="opacity"
          values="0.32;0.06;0.32"
          dur="1.6s"
          begin={begin}
          repeatCount="indefinite"
        />
      </circle>
      <g>
        <circle cx={cx} cy={cy} r={3.2} fill={colour} />
        <animate
          attributeName="opacity"
          values="1;0.18;1"
          dur="1.6s"
          begin={begin}
          repeatCount="indefinite"
        />
      </g>
    </g>
  );
}

function offLed(cx: number, cy: number) {
  return <circle cx={cx} cy={cy} r={3.2} fill="#0c1725" stroke="#26384c" strokeWidth={1} />;
}

interface SplitterView {
  ratio: string;
  inputCoreLabel: string;
  outputs: Core[];
  inputPowerDbm?: number | null;
  outputPowerDbm?: number | null;
}

interface TjFrontPanelProps {
  code?: string | null;
  tjType: TjType;
  splitterEnabled: boolean;
  ratio: string;
  inputCoreLabel: string;
  /** Input/fibre cores as currently edited in the form. */
  cores: Core[];
  outputCores: Core[];
  userFibres?: UserFibre[];
  extraSplitters?: SplitterView[];
  inputPowerDbm?: number | null;
  outputPowerDbm?: number | null;
  damagedCores?: number;
  restoredCores?: number;
  repairStatus?: CutRepairStatus;
  className?: string;
}

/**
 * Drawn front view of an inline terminal joint closure: gel-sealed shell,
 * splice tray, feed cores, PLC splitter modules and output legs. A strand
 * carrying traffic blinks its green LED and shows a lit fibre; idle strands
 * stay dark. With several splitters fitted, every PLC module is clickable and
 * the tray below shows the selected splitter's legs.
 */
export function TjFrontPanel({
  code,
  tjType,
  splitterEnabled,
  ratio,
  inputCoreLabel,
  cores,
  outputCores,
  userFibres = [],
  extraSplitters = [],
  inputPowerDbm = null,
  outputPowerDbm = null,
  damagedCores = 0,
  restoredCores = 0,
  repairStatus = 'cut_unresolved',
  className,
}: TjFrontPanelProps) {
  const uid = useId().replace(/:/g, '');
  const [selected, setSelected] = useState(0);

  const isCut = tjType === 'cut';
  const splitters: SplitterView[] = isCut
    ? []
    : [
        ...(splitterEnabled
          ? [{ ratio, inputCoreLabel, outputs: outputCores, inputPowerDbm, outputPowerDbm }]
          : []),
        ...extraSplitters,
      ];
  const splitterLayout = splitters.length > 0;
  const multipleSplitters = splitters.length > 1;
  // Splitter input strands carry no colour and are addressed by splitter order.
  const feedNames = new Map(
    splitters.map((splitter, index) => [splitter.inputCoreLabel, `S${index + 1}`]),
  );
  const activeIndex = splitterLayout ? Math.min(selected, splitters.length - 1) : 0;
  const activeSplitter = splitterLayout ? splitters[activeIndex] : null;

  const liveFeeds = cores.filter(isLive).length;
  const activeLegs = activeSplitter?.outputs ?? [];
  const liveLegs = activeLegs.filter((core) => core.status === 'in_use').length;
  const damagedFromCores = cores.filter((core) => core.status === 'damaged').length;
  const damaged = Math.max(damagedCores, damagedFromCores);
  const joined = Math.max(restoredCores, liveFeeds);
  const liveTotal = splitterLayout ? liveLegs : liveFeeds;
  const strandTotal = splitterLayout ? activeLegs.length : cores.length;

  const shownPower = splitterLayout ? activeSplitter?.outputPowerDbm ?? null : outputPowerDbm;
  const lowPower = shownPower !== null && shownPower < -30;
  const midPower = shownPower !== null && shownPower >= -30 && shownPower < -27;
  const powerTone =
    shownPower === null ? '#5c7088' : lowPower ? '#f87171' : midPower ? '#fbbf24' : '#4ade80';

  const typeIndex = tjType === 'cut' ? 0 : tjType === 'pon_power' ? 2 : 1;
  const rail = [
    ['#fb7185', '#e11d48', '#f59e0b'],
    ['#38bdf8', '#0d9488', '#34d399'],
    ['#fbbf24', '#f59e0b', '#34d399'],
  ][typeIndex];

  const alarm = isCut
    ? repairStatus === 'restored'
      ? { on: true, colour: '#4ade80', blink: false }
      : repairStatus === 'splicing_in_progress'
        ? { on: true, colour: '#fbbf24', blink: true }
        : { on: true, colour: '#f87171', blink: true }
    : damaged > 0 || lowPower
      ? { on: true, colour: '#f87171', blink: true }
      : midPower
        ? { on: true, colour: '#fbbf24', blink: false }
        : { on: false, colour: '#f87171', blink: false };

  const legSlots = splitterLayout ? Math.min(activeLegs.length, MAX_VISIBLE) : 0;
  const hiddenLegs = splitterLayout ? activeLegs.length - legSlots : 0;
  const legRows = Math.max(1, Math.ceil((legSlots + (hiddenLegs > 0 ? 1 : 0)) / LEGS_PER_ROW));

  const coreSlots = splitterLayout ? 0 : Math.min(cores.length, MAX_VISIBLE);
  const hiddenCores = splitterLayout ? 0 : cores.length - coreSlots;
  const coreRows = Math.max(1, Math.ceil((coreSlots + (hiddenCores > 0 ? 1 : 0)) / CORES_PER_ROW));

  const feedsVisible = Math.min(cores.length, 4);
  const feedsBottom =
    FEED_TOP + (Math.max(1, feedsVisible) - 1) * FEED_PITCH + 28 + (cores.length > feedsVisible ? 16 : 0);
  const stackBottom = multipleSplitters
    ? SPLITTER_Y + splitters.length * SPLITTER_CARD_H + (splitters.length - 1) * SPLITTER_CARD_GAP
    : SPLITTER_Y + SPLITTER_H;

  const height = splitterLayout
    ? Math.max(
        296,
        LEGS_TOP + (legRows - 1) * LEG_ROW_PITCH + 72,
        stackBottom + 30,
        feedsBottom + 26,
      )
    : Math.max(240, CORES_TOP + (coreRows - 1) * CORE_ROW_PITCH + 70);

  const unitCode = (code ?? '').trim().toUpperCase().slice(0, 12);
  const trunkTop = LEGS_TOP + 9;
  const trunkBottom = LEGS_TOP + (legRows - 1) * LEG_ROW_PITCH + 9;
  const splitterTapY = multipleSplitters
    ? SPLITTER_Y + activeIndex * (SPLITTER_CARD_H + SPLITTER_CARD_GAP) + SPLITTER_CARD_H / 2
    : SPLITTER_Y + 63;
  const trunkA = Math.min(trunkTop, splitterTapY);
  const trunkB = Math.max(trunkBottom, splitterTapY);

  const summary = isCut
    ? `${damaged} DAMAGED · ${joined} JOINED`
    : splitterLayout
      ? `${multipleSplitters ? `PLC ${activeIndex + 1} · ` : ''}${liveLegs}/${activeLegs.length} LEGS LIVE${shownPower !== null ? ` · OUT ${shownPower} dBm` : ''}`
      : `${liveFeeds}/${cores.length} CORES LIVE${shownPower !== null && tjType === 'pon_power' ? ` · OUT ${shownPower} dBm` : ''}`;

  const summaryTone = isCut
    ? damaged > 0
      ? '#f87171'
      : joined > 0
        ? '#4ade80'
        : '#5c7088'
    : liveTotal > 0
      ? splitterLayout
        ? powerTone
        : '#4ade80'
      : '#5c7088';

  const feedRows = cores.slice(0, feedsVisible).map((core, index) => ({
    core,
    y: FEED_TOP + index * FEED_PITCH,
    live: isLive(core),
  }));
  const hiddenFeeds = cores.length - feedRows.length;

  function selectSplitter(index: number) {
    setSelected(index);
  }

  return (
    <svg
      role="img"
      aria-label={`${TYPE_TITLE[tjType]}: ${liveTotal} of ${strandTotal} strands live${
        multipleSplitters ? ` (splitter ${activeIndex + 1} of ${splitters.length})` : ''
      }`}
      viewBox={`0 0 640 ${height}`}
      className={className}
    >
      <defs>
        <linearGradient id={`${uid}-shell`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2b3746" />
          <stop offset="0.45" stopColor="#18222f" />
          <stop offset="1" stopColor="#0c1420" />
        </linearGradient>
        <linearGradient id={`${uid}-tray`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0b1623" />
          <stop offset="1" stopColor="#060c14" />
        </linearGradient>
        <linearGradient id={`${uid}-rail`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={rail[0]} />
          <stop offset="0.6" stopColor={rail[1]} />
          <stop offset="1" stopColor={rail[2]} />
        </linearGradient>
        <linearGradient id={`${uid}-plc`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#241537" />
          <stop offset="1" stopColor="#130b21" />
        </linearGradient>
      </defs>

      {/* Gel-sealed closure shell */}
      <rect
        x={0}
        y={0}
        width={640}
        height={height}
        rx={22}
        fill={`url(#${uid}-shell)`}
        stroke="#3a4a5c"
        strokeWidth={1.5}
      />
      <rect
        x={10}
        y={10}
        width={620}
        height={height - 20}
        rx={17}
        fill="none"
        stroke="#0a1119"
        strokeWidth={1.4}
      />
      <rect x={250} y={0} width={28} height={7} rx={3} fill="#1f2b39" stroke="#33465a" strokeWidth={1} />
      <rect x={362} y={0} width={28} height={7} rx={3} fill="#1f2b39" stroke="#33465a" strokeWidth={1} />

      {[
        [20, 20],
        [620, 20],
        [20, height - 20],
        [620, height - 20],
      ].map(([cx, cy]) => (
        <g key={`bolt-${cx}-${cy}`}>
          <circle cx={cx} cy={cy} r={4.2} fill="#253243" stroke="#41546a" strokeWidth={1} />
          <line x1={cx - 2.2} y1={cy} x2={cx + 2.2} y2={cy} stroke="#6b7f95" strokeWidth={1.1} />
        </g>
      ))}

      {/* Side latches */}
      {[0, 626].map((x) => (
        <g key={`latch-${x}`}>
          <rect
            x={x}
            y={height / 2 - 27}
            width={14}
            height={54}
            rx={4}
            fill="#1c2836"
            stroke="#35475c"
            strokeWidth={1}
          />
          <circle cx={x + 7} cy={height / 2} r={2.6} fill="#6b7f95" />
        </g>
      ))}

      {/* Tray window */}
      <rect
        x={26}
        y={84}
        width={588}
        height={height - 110}
        rx={10}
        fill={`url(#${uid}-tray)`}
        stroke="#243648"
        strokeWidth={1.2}
      />
      <rect x={26} y={84} width={588} height={5} rx={2.5} fill={`url(#${uid}-rail)`} opacity={0.9} />

      <text x={42} y={40} fontFamily={MONO} fontSize={15} fontWeight={700} fill="#e2ecf7" letterSpacing={2.4}>
        FIBRE ATLAS
      </text>
      <text x={42} y={57} fontFamily={MONO} fontSize={8} fill="#7b8ea4" letterSpacing={1.1}>
        {TYPE_TITLE[tjType]}
      </text>

      {[
        { label: 'PWR', on: true, colour: '#4ade80', blink: false },
        { label: 'LNK', on: liveTotal > 0, colour: '#38bdf8', blink: liveTotal > 0 },
        { label: 'ALM', on: alarm.on, colour: alarm.colour, blink: alarm.blink },
      ].map((led) => (
        <g key={led.label}>
          <circle
            cx={302 + ['PWR', 'LNK', 'ALM'].indexOf(led.label) * 34}
            cy={36}
            r={3.4}
            fill={led.on ? led.colour : '#0c1725'}
            stroke={led.on ? 'none' : '#26384c'}
            strokeWidth={1}
          >
            {led.on && led.blink ? (
              <animate attributeName="opacity" values="1;0.2;1" dur="2.4s" repeatCount="indefinite" />
            ) : null}
          </circle>
          <text
            x={302 + ['PWR', 'LNK', 'ALM'].indexOf(led.label) * 34}
            y={50}
            textAnchor="middle"
            fontFamily={MONO}
            fontSize={7}
            fill="#6f8399"
            letterSpacing={0.6}
          >
            {led.label}
          </text>
        </g>
      ))}

      <rect x={516} y={24} width={88} height={32} rx={5} fill="#0b1522" stroke="#2c415a" strokeWidth={1.2} />
      <text x={560} y={44} textAnchor="middle" fontFamily={MONO} fontSize={9.5} fill="#a9bed4" letterSpacing={0.8}>
        {unitCode || 'TJ'}
      </text>

      <line x1={28} y1={76} x2={612} y2={76} stroke="#2b3d53" strokeWidth={1} />
      <line x1={28} y1={77} x2={612} y2={77} stroke="#0d1622" strokeWidth={1} />

      <text x={38} y={106} fontFamily={MONO} fontSize={9} fontWeight={700} fill="#8fa6bd" letterSpacing={1.6}>
        SPLICE TRAY
      </text>
      <text x={602} y={106} textAnchor="end" fontFamily={MONO} fontSize={8.5} fill={summaryTone}>
        {summary}
      </text>

      {splitterLayout ? (
        <>
          <text x={38} y={126} fontFamily={MONO} fontSize={7.5} fill="#6f8399" letterSpacing={1.2}>
            FEED CORES
          </text>

          {feedRows.map(({ core, y, live }, index) => {
            const begin = `${(index * 0.22).toFixed(2)}s`;
            const isSelectedFeed = core.label === activeSplitter?.inputCoreLabel;
            return (
              <g key={`feed-${core.label}-${index}`}>
                <title>
                  {displayCoreLabel(core.label, index + 1)} · {live ? 'feed live' : 'feed idle'}
                </title>
                <rect
                  x={38}
                  y={y}
                  width={136}
                  height={28}
                  rx={5}
                  fill="#08111b"
                  stroke={isSelectedFeed ? '#7c3aed' : '#24364a'}
                  strokeWidth={isSelectedFeed ? 1.5 : 1}
                />
                {live ? liveLed(50, y + 14, begin) : offLed(50, y + 14)}
                <text x={62} y={y + 18} fontFamily={MONO} fontSize={9} fill={live ? '#d7e4f2' : '#7b8ea4'}>
                  {shortLabel(
                    feedNames.get(core.label) ?? displayCoreLabel(core.label, index + 1),
                    13,
                  )}
                </text>
                {live ? (
                  <>
                    <path d={`M 26 ${y + 14} H 38`} stroke={core.color || '#22d3ee'} strokeWidth={2.4} strokeLinecap="round" />
                    <path
                      d={`M 26 ${y + 14} H 38`}
                      stroke="#e8fbff"
                      strokeWidth={1}
                      strokeLinecap="round"
                      strokeDasharray="2 6"
                      opacity={0.85}
                    >
                      <animate attributeName="stroke-dashoffset" values="16;0" dur="1.2s" begin={begin} repeatCount="indefinite" />
                    </path>
                    <path d={`M 174 ${y + 14} H ${SPLITTER_X}`} stroke={core.color || '#22d3ee'} strokeWidth={2.2} strokeLinecap="round" opacity={0.9} />
                  </>
                ) : (
                  <path d={`M 174 ${y + 14} H ${SPLITTER_X}`} stroke="#1e3040" strokeWidth={1.6} strokeDasharray="3 4" />
                )}
              </g>
            );
          })}

          {hiddenFeeds > 0 ? (
            <text
              x={106}
              y={FEED_TOP + feedsVisible * FEED_PITCH + 8}
              textAnchor="middle"
              fontFamily={MONO}
              fontSize={8}
              fill="#5c7088"
            >
              +{hiddenFeeds} more feeds
            </text>
          ) : null}

          {/* PLC splitter modules — every module selects the legs shown on the right */}
          {multipleSplitters ? (
            splitters.map((splitter, index) => {
              const y = SPLITTER_Y + index * (SPLITTER_CARD_H + SPLITTER_CARD_GAP);
              const isSelected = index === activeIndex;
              const splitterLive = splitter.outputs.filter((core) => core.status === 'in_use').length;
              return (
                <g
                  key={`splitter-card-${index}`}
                  role="button"
                  tabIndex={0}
                  aria-label={`Splitter ${index + 1} · ${splitter.ratio}`}
                  aria-pressed={isSelected}
                  className="cursor-pointer"
                  onClick={() => selectSplitter(index)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      selectSplitter(index);
                    }
                  }}
                >
                  <title>{`Splitter ${index + 1} · ${splitter.ratio} · S${index + 1} — click to view its legs`}</title>
                  <rect
                    x={SPLITTER_X}
                    y={y}
                    width={SPLITTER_W}
                    height={SPLITTER_CARD_H}
                    rx={7}
                    fill={isSelected ? '#1a1029' : '#0d0a16'}
                    stroke={isSelected ? '#a78bfa' : '#3b2a52'}
                    strokeWidth={isSelected ? 1.6 : 1}
                  />
                  {isSelected ? (
                    <rect x={SPLITTER_X + 1} y={y + 10} width={3} height={SPLITTER_CARD_H - 20} rx={1.5} fill="#a78bfa" />
                  ) : null}
                  <text x={SPLITTER_X + 10} y={y + 15} fontFamily={MONO} fontSize={7.5} fill={isSelected ? '#c4b5fd' : '#7f6fa0'} letterSpacing={0.8}>
                    PLC {index + 1}
                  </text>
                  <text
                    x={SPLITTER_X + SPLITTER_W - 10}
                    y={y + 15}
                    textAnchor="end"
                    fontFamily={MONO}
                    fontSize={7}
                    fill={splitterLive > 0 ? '#4ade80' : '#6f8399'}
                  >
                    {splitterLive}/{splitter.outputs.length} LEG
                  </text>
                  <text x={SPLITTER_X + 10} y={y + 34} fontFamily={MONO} fontSize={14} fontWeight={700} fill={isSelected ? '#f3e8ff' : '#a495c0'}>
                    {splitter.ratio}
                  </text>
                  <text
                    x={SPLITTER_X + SPLITTER_W - 10}
                    y={y + 34}
                    textAnchor="end"
                    fontFamily={MONO}
                    fontSize={8}
                    fill={splitter.outputPowerDbm === null || splitter.outputPowerDbm === undefined ? '#5c7088' : powerTone}
                  >
                    {fmtDbm(splitter.outputPowerDbm)}
                  </text>
                  <text x={SPLITTER_X + 10} y={y + 49} fontFamily={MONO} fontSize={8} fill={isSelected ? '#c4b5fd' : '#8b9bb0'}>
                    {shortLabel(`S${index + 1}`, 15)}
                  </text>
                </g>
              );
            })
          ) : (
            <>
              <rect
                x={SPLITTER_X}
                y={SPLITTER_Y}
                width={SPLITTER_W}
                height={SPLITTER_H}
                rx={8}
                fill={`url(#${uid}-plc)`}
                stroke="#7c3aed"
                strokeOpacity={0.45}
                strokeWidth={1.2}
              />
              <rect x={SPLITTER_X + 8} y={SPLITTER_Y + 8} width={SPLITTER_W - 16} height={SPLITTER_H - 16} rx={5} fill="none" stroke="#4c1d95" strokeOpacity={0.55} />
              <text x={SPLITTER_X + SPLITTER_W / 2} y={SPLITTER_Y + 20} textAnchor="middle" fontFamily={MONO} fontSize={7.5} fill="#a78bfa" letterSpacing={1.1}>
                PLC SPLITTER 1
              </text>
              <text x={SPLITTER_X + SPLITTER_W / 2} y={SPLITTER_Y + 46} textAnchor="middle" fontFamily={MONO} fontSize={20} fontWeight={700} fill="#e9d5ff">
                {activeSplitter?.ratio}
              </text>
              <text x={SPLITTER_X + SPLITTER_W / 2} y={SPLITTER_Y + 62} textAnchor="middle" fontFamily={MONO} fontSize={7.5} fill="#8b9bb0">
                {activeLegs.length} LEGS · {userFibres.length} DROP CABLES
              </text>
              <rect
                x={SPLITTER_X + 12}
                y={SPLITTER_Y + 72}
                width={SPLITTER_W - 24}
                height={19}
                rx={4}
                fill="#0b1522"
                stroke="#3a2a5c"
                strokeWidth={1}
              />
              <text x={SPLITTER_X + SPLITTER_W / 2} y={SPLITTER_Y + 85} textAnchor="middle" fontFamily={MONO} fontSize={8.5} fill="#c4b5fd">
                {shortLabel(
                  (activeSplitter && feedNames.get(activeSplitter.inputCoreLabel)) ||
                    displayCoreLabel(activeSplitter?.inputCoreLabel ?? inputCoreLabel),
                  14,
                )}
              </text>
              <text x={SPLITTER_X + SPLITTER_W / 2} y={SPLITTER_Y + 106} textAnchor="middle" fontFamily={MONO} fontSize={8} fill={powerTone}>
                {activeSplitter?.outputPowerDbm !== null && activeSplitter?.outputPowerDbm !== undefined
                  ? `OUT ${fmtDbm(activeSplitter.outputPowerDbm)}`
                  : activeSplitter?.inputPowerDbm !== null && activeSplitter?.inputPowerDbm !== undefined
                    ? `IN ${fmtDbm(activeSplitter.inputPowerDbm)}`
                    : 'AWAITING FEED'}
              </text>
            </>
          )}

          {/* Output legs and their lit fibres */}
          <path
            d={`M ${SPLITTER_X + SPLITTER_W} ${splitterTapY} H 344`}
            stroke={liveLegs > 0 ? '#1f4f66' : '#1e3040'}
            strokeWidth={2.2}
          />
          <path d={`M 344 ${trunkA} V ${trunkB}`} stroke={liveLegs > 0 ? '#1f4f66' : '#1e3040'} strokeWidth={2.2} />

          {activeLegs.slice(0, legSlots).map((core, index) => {
            const x = LEGS_X + (index % LEGS_PER_ROW) * LEG_PITCH;
            const y = LEGS_TOP + Math.floor(index / LEGS_PER_ROW) * LEG_ROW_PITCH;
            const live = core.status === 'in_use';
            const begin = `${((index % LEGS_PER_ROW) * 0.16).toFixed(2)}s`;
            return (
              <g key={`leg-${core.label}-${index}`}>
                <title>
                  {displayCoreLabel(core.label, index + 1)} · {live ? 'leg live' : 'leg idle'}
                </title>
                {live ? (
                  <>
                    <path d={`M 344 ${y + 9} H ${x + 2}`} stroke={core.color || '#22d3ee'} strokeWidth={2.2} strokeLinecap="round" />
                    <path
                      d={`M 344 ${y + 9} H ${x + 2}`}
                      stroke="#e8fbff"
                      strokeWidth={1}
                      strokeLinecap="round"
                      strokeDasharray="2 6"
                      opacity={0.85}
                    >
                      <animate attributeName="stroke-dashoffset" values="16;0" dur="1.2s" begin={begin} repeatCount="indefinite" />
                    </path>
                    {liveLed(x + 9, y + 9, begin)}
                  </>
                ) : (
                  offLed(x + 9, y + 9)
                )}
                <text x={x + LEG_W - 4} y={y + 12} textAnchor="end" fontFamily={MONO} fontSize={9} fill="#8fa5bc">
                  {String(index + 1).padStart(2, '0')}
                </text>
                <rect x={x} y={y + 15} width={LEG_W} height={22} rx={3} fill="#0a1421" stroke={live ? '#3b5874' : '#2c415a'} strokeWidth={1.2} />
                {live ? (
                  <>
                    <rect x={x + 2.5} y={y + 17.5} width={LEG_W - 5} height={17} rx={2} fill="#16283c" stroke="#3b5874" strokeWidth={1} />
                    <rect x={x + LEG_W - 12} y={y + 20} width={8} height={12} rx={1.5} fill="#8a6a2f" opacity={0.85} />
                  </>
                ) : (
                  <rect x={x + 5} y={y + 20} width={LEG_W - 10} height={12} rx={1.5} fill="#050b13" />
                )}
              </g>
            );
          })}

          {hiddenLegs > 0 ? (
            <g>
              <rect
                x={LEGS_X + (legSlots % LEGS_PER_ROW) * LEG_PITCH}
                y={LEGS_TOP + Math.floor(legSlots / LEGS_PER_ROW) * LEG_ROW_PITCH + 15}
                width={LEG_W}
                height={22}
                rx={3}
                fill="#0a1421"
                stroke="#2c415a"
                strokeDasharray="4 3"
              />
              <text
                x={LEGS_X + (legSlots % LEGS_PER_ROW) * LEG_PITCH + LEG_W / 2}
                y={LEGS_TOP + Math.floor(legSlots / LEGS_PER_ROW) * LEG_ROW_PITCH + 30}
                textAnchor="middle"
                fontFamily={MONO}
                fontSize={9}
                fill="#7f95ad"
              >
                +{hiddenLegs}
              </text>
            </g>
          ) : null}
        </>
      ) : (
        <>
          <text x={38} y={126} fontFamily={MONO} fontSize={7.5} fill="#6f8399" letterSpacing={1.2}>
            FIBRE CORES
          </text>

          {cores.slice(0, coreSlots).map((core, index) => {
            const x = CORES_X + (index % CORES_PER_ROW) * CORE_PITCH;
            const y = CORES_TOP + Math.floor(index / CORES_PER_ROW) * CORE_ROW_PITCH;
            const live = isLive(core);
            const broken = core.status === 'damaged';
            const begin = `${((index % CORES_PER_ROW) * 0.14).toFixed(2)}s`;
            const stroke = broken ? '#7f1d1d' : live ? '#14532d' : '#2c415a';
            return (
              <g key={`core-${core.label}-${index}`}>
                <title>
                  {displayCoreLabel(core.label, index + 1)} ·{' '}
                  {broken ? 'cut / damaged' : live ? 'joined' : 'free'}
                </title>
                {live ? (
                  liveLed(x + 10, y + 10, begin)
                ) : broken ? (
                  <g>
                    <circle cx={x + 10} cy={y + 10} r={3.2} fill="#f87171">
                      <animate attributeName="opacity" values="1;0.25;1" dur="1.4s" begin={begin} repeatCount="indefinite" />
                    </circle>
                    <path d={`M ${x + 7} ${y + 7} L ${x + 13} ${y + 13} M ${x + 13} ${y + 7} L ${x + 7} ${y + 13}`} stroke="#450a0a" strokeWidth={1.2} />
                  </g>
                ) : (
                  offLed(x + 10, y + 10)
                )}
                <text x={x + 19} y={y + 13} fontFamily={MONO} fontSize={8.5} fill={broken ? '#fca5a5' : live ? '#d7e4f2' : '#7b8ea4'}>
                  {shortLabel(displayCoreLabel(core.label, index + 1), 7)}
                </text>
                <rect x={x} y={y + 18} width={CORE_W} height={24} rx={3} fill="#0a1421" stroke={stroke} strokeWidth={1.2} />
                {live ? (
                  <>
                    <rect x={x + 2.5} y={y + 20.5} width={CORE_W - 5} height={19} rx={2} fill="#16283c" stroke="#3b5874" strokeWidth={1} />
                    <path
                      d={`M ${x + 6} ${y + 30} H ${x + CORE_W - 6}`}
                      stroke={core.color || '#22d3ee'}
                      strokeWidth={2}
                      strokeLinecap="round"
                    />
                    <path
                      d={`M ${x + 6} ${y + 30} H ${x + CORE_W - 6}`}
                      stroke="#e8fbff"
                      strokeWidth={1}
                      strokeLinecap="round"
                      strokeDasharray="2 6"
                      opacity={0.85}
                    >
                      <animate attributeName="stroke-dashoffset" values="16;0" dur="1.2s" begin={begin} repeatCount="indefinite" />
                    </path>
                  </>
                ) : broken ? (
                  <path
                    d={`M ${x + 5} ${y + 36} L ${x + CORE_W - 5} ${y + 24}`}
                    stroke="#ef4444"
                    strokeWidth={1.4}
                    strokeLinecap="round"
                    opacity={0.8}
                  />
                ) : (
                  <rect x={x + 5} y={y + 23} width={CORE_W - 10} height={14} rx={1.5} fill="#050b13" />
                )}
              </g>
            );
          })}

          {hiddenCores > 0 ? (
            <g>
              <rect
                x={CORES_X + (coreSlots % CORES_PER_ROW) * CORE_PITCH}
                y={CORES_TOP + Math.floor(coreSlots / CORES_PER_ROW) * CORE_ROW_PITCH + 18}
                width={CORE_W}
                height={24}
                rx={3}
                fill="#0a1421"
                stroke="#2c415a"
                strokeDasharray="4 3"
              />
              <text
                x={CORES_X + (coreSlots % CORES_PER_ROW) * CORE_PITCH + CORE_W / 2}
                y={CORES_TOP + Math.floor(coreSlots / CORES_PER_ROW) * CORE_ROW_PITCH + 34}
                textAnchor="middle"
                fontFamily={MONO}
                fontSize={9}
                fill="#7f95ad"
              >
                +{hiddenCores}
              </text>
            </g>
          ) : null}
        </>
      )}

      <text x={602} y={height - 33} textAnchor="end" fontFamily={MONO} fontSize={7.5} fill="#5c7088" letterSpacing={0.6}>
        IP68 · GEL SEALED · {cores.length} FEED · {activeLegs.length || outputCores.length} LEG · {userFibres.length} DROP
      </text>
    </svg>
  );
}
