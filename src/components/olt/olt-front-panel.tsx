'use client';

import { useId } from 'react';
import type { FibreLink, PonPort } from '@/lib/types';

const PORTS_PER_ROW = 8;
const MAX_VISIBLE_PORTS = 16;
const FIBRE_COLORS = ['#22d3ee', '#fbbf24', '#a78bfa', '#34d399'];
const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

const GRID_X = 32;
const GRID_TOP = 106;
const PITCH = 73;
const ROW_PITCH = 86;
const TILE_W = 66;
const CAGE_H = 30;

function portNumber(label: string, fallback: number): string {
  const match = label.trim().match(/(\d+)$/);
  return match ? match[1] : String(fallback);
}

interface OltFrontPanelProps {
  /** PON ports as currently edited; `status` marks server-known connected ports. */
  ports: PonPort[];
  /** Area links; spans touching this OLT drive the uplink LEDs. */
  links?: FibreLink[];
  oltId?: string | null;
  code?: string | null;
  className?: string;
}

/**
 * Drawn front view of a GPON OLT: PON cages, SFP uplinks and fibre patch
 * cords. A port with an active link blinks its green LED and carries a lit
 * fibre; idle ports stay dark.
 */
export function OltFrontPanel({ ports, links = [], oltId, code, className }: OltFrontPanelProps) {
  const uid = useId().replace(/:/g, '');
  const oltLinks = oltId
    ? links.filter((link) => link.fromOltId === oltId || link.toOltId === oltId)
    : [];
  const upLinks = oltLinks.filter((link) => link.status === 'active').length;
  const cutLinks = oltLinks.filter((link) => link.status === 'cut').length;
  const connected = ports.filter((port) => port.status === 'in_use').length;

  const visible = ports.slice(0, MAX_VISIBLE_PORTS);
  const hidden = ports.length - visible.length;
  const slots = visible.length + (hidden > 0 ? 1 : 0);
  const rows = Math.max(1, Math.ceil(slots / PORTS_PER_ROW));
  const height = GRID_TOP + (rows - 1) * ROW_PITCH + 68 + 18;
  const earY = Math.round((height - 16) / 2) - 37;
  const unitCode = (code ?? '').trim().toUpperCase().slice(0, 10);

  const tiles = visible.map((port, index) => {
    const x = GRID_X + (index % PORTS_PER_ROW) * PITCH;
    const y = GRID_TOP + Math.floor(index / PORTS_PER_ROW) * ROW_PITCH;
    const live = port.status === 'in_use';
    const fibre = FIBRE_COLORS[index % FIBRE_COLORS.length];
    const cord = `M ${x + 20} ${y + 48} c -3 9 -1 14 7 21`;
    const begin = `${((index % PORTS_PER_ROW) * 0.14).toFixed(2)}s`;

    return (
      <g key={`${port.label}-${index}`}>
        <title>
          {port.label}
          {port.name ? ` · ${port.name}` : ''} ·{' '}
          {live ? `connected${port.joints ? ` (${port.joints} joints)` : ''}` : 'disconnected'}
        </title>
        {live ? (
          <g>
            <circle cx={x + 11} cy={y + 11} r={5.2} fill="#22c55e" opacity={0.3}>
              <animate
                attributeName="opacity"
                values="0.32;0.06;0.32"
                dur="1.6s"
                begin={begin}
                repeatCount="indefinite"
              />
            </circle>
            <g>
              <circle cx={x + 11} cy={y + 11} r={3.2} fill="#4ade80" />
              <animate
                attributeName="opacity"
                values="1;0.18;1"
                dur="1.6s"
                begin={begin}
                repeatCount="indefinite"
              />
            </g>
          </g>
        ) : (
          <circle cx={x + 11} cy={y + 11} r={3.2} fill="#0c1725" stroke="#26384c" strokeWidth={1} />
        )}
        <text
          x={x + TILE_W - 4}
          y={y + 14}
          textAnchor="end"
          fontFamily={MONO}
          fontSize={10}
          fill="#8fa5bc"
        >
          {portNumber(port.label, index + 1)}
        </text>
        <rect
          x={x}
          y={y + 18}
          width={TILE_W}
          height={CAGE_H}
          rx={3}
          fill="#0a1421"
          stroke="#2c415a"
          strokeWidth={1.2}
        />
        {live ? (
          <>
            <rect
              x={x + 2.5}
              y={y + 20.5}
              width={TILE_W - 5}
              height={CAGE_H - 5}
              rx={2}
              fill="#16283c"
              stroke="#3b5874"
              strokeWidth={1}
            />
            <rect x={x + TILE_W - 14} y={y + 24} width={9} height={CAGE_H - 12} rx={1.5} fill="#8a6a2f" opacity={0.85} />
            <path d={cord} fill="none" stroke={fibre} strokeWidth={2.6} strokeLinecap="round" opacity={0.9} />
            <path
              d={cord}
              fill="none"
              stroke="#e8fbff"
              strokeWidth={1.1}
              strokeLinecap="round"
              strokeDasharray="2 7"
              opacity={0.85}
            >
              <animate attributeName="stroke-dashoffset" values="18;0" dur="1.3s" begin={begin} repeatCount="indefinite" />
            </path>
          </>
        ) : (
          <rect x={x + 5} y={y + 24} width={TILE_W - 10} height={CAGE_H - 12} rx={1.5} fill="#050b13" />
        )}
      </g>
    );
  });

  if (hidden > 0) {
    const index = visible.length;
    const x = GRID_X + (index % PORTS_PER_ROW) * PITCH;
    const y = GRID_TOP + Math.floor(index / PORTS_PER_ROW) * ROW_PITCH;
    tiles.push(
      <g key="overflow">
        <rect
          x={x}
          y={y + 18}
          width={TILE_W}
          height={CAGE_H}
          rx={3}
          fill="#0a1421"
          stroke="#2c415a"
          strokeDasharray="4 3"
        />
        <text x={x + TILE_W / 2} y={y + 37} textAnchor="middle" fontFamily={MONO} fontSize={10} fill="#7f95ad">
          +{hidden}
        </text>
      </g>,
    );
  }

  const uplinks = [0, 1].map((slot) => {
    const x = 396 + slot * 60;
    const live = upLinks > slot;
    const fibre = slot === 0 ? '#22d3ee' : '#fbbf24';
    const cord = `M ${x + 27} 30 c 0 -8 8 -9 14 -12`;
    return (
      <g key={`uplink-${slot}`}>
        <circle cx={x + 9} cy={25} r={2.8} fill={live ? '#4ade80' : '#0c1725'} stroke={live ? 'none' : '#26384c'} strokeWidth={1}>
          {live ? (
            <animate
              attributeName="opacity"
              values="1;0.18;1"
              dur="1.6s"
              begin={`${slot * 0.3}s`}
              repeatCount="indefinite"
            />
          ) : null}
        </circle>
        <rect x={x} y={30} width={54} height={22} rx={2.5} fill="#0a1421" stroke="#2c415a" strokeWidth={1.2} />
        {live ? (
          <>
            <rect x={x + 2} y={32} width={50} height={18} rx={1.5} fill="#152638" stroke="#3b5874" />
            <rect x={x + 40} y={35} width={8} height={12} rx={1.2} fill="#8a6a2f" opacity={0.85} />
            <path d={cord} fill="none" stroke={fibre} strokeWidth={2.2} strokeLinecap="round" opacity={0.9} />
          </>
        ) : (
          <rect x={x + 4} y={35} width={46} height={12} rx={1.5} fill="#050b13" />
        )}
        <text x={x + 27} y={66} textAnchor="middle" fontFamily={MONO} fontSize={7.5} fill="#6f8399" letterSpacing={0.8}>
          {`UPLINK ${slot + 1}`}
        </text>
      </g>
    );
  });

  return (
    <svg
      role="img"
      aria-label={`OLT front panel: ${connected} of ${ports.length} PON ports connected`}
      viewBox={`0 0 640 ${height}`}
      className={className}
    >
      <defs>
        <linearGradient id={`${uid}-panel`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#233245" />
          <stop offset="0.45" stopColor="#16202e" />
          <stop offset="1" stopColor="#0b1320" />
        </linearGradient>
        <linearGradient id={`${uid}-rail`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#38bdf8" />
          <stop offset="0.6" stopColor="#0d9488" />
          <stop offset="1" stopColor="#a3e635" />
        </linearGradient>
      </defs>

      <rect
        x={0}
        y={earY}
        width={16}
        height={74}
        rx={4}
        fill="#1a2635"
        stroke="#2f4257"
        strokeWidth={1.2}
      />
      <rect
        x={624}
        y={earY}
        width={16}
        height={74}
        rx={4}
        fill="#1a2635"
        stroke="#2f4257"
        strokeWidth={1.2}
      />
      {[12, 62].map((offset) => (
        <g key={`ear-${offset}`}>
          <circle cx={8} cy={earY + offset} r={2.2} fill="#4b5f75" />
          <circle cx={632} cy={earY + offset} r={2.2} fill="#4b5f75" />
        </g>
      ))}

      <rect
        x={8}
        y={8}
        width={624}
        height={height - 16}
        rx={14}
        fill={`url(#${uid}-panel)`}
        stroke="#31445c"
        strokeWidth={1.5}
      />
      <rect x={8} y={8} width={624} height={7} rx={3.5} fill={`url(#${uid}-rail)`} opacity={0.9} />

      <text x={36} y={40} fontFamily={MONO} fontSize={15} fontWeight={700} fill="#e2ecf7" letterSpacing={2.4}>
        FIBRE ATLAS
      </text>
      <text x={36} y={57} fontFamily={MONO} fontSize={8} fill="#7b8ea4" letterSpacing={1.1}>
        GPON OLT · MODEL FA-5800
      </text>

      {[
        { label: 'PWR', x: 286, on: true, colour: '#4ade80', blink: false },
        { label: 'SYS', x: 320, on: true, colour: '#38bdf8', blink: true },
        { label: 'ALM', x: 354, on: cutLinks > 0, colour: '#f87171', blink: cutLinks > 0 },
      ].map((led) => (
        <g key={led.label}>
          <circle
            cx={led.x}
            cy={36}
            r={3.4}
            fill={led.on ? led.colour : '#0c1725'}
            stroke={led.on ? 'none' : '#26384c'}
            strokeWidth={1}
          >
            {led.on && led.blink ? (
              <animate
                attributeName="opacity"
                values="1;0.2;1"
                dur="2.6s"
                repeatCount="indefinite"
              />
            ) : null}
          </circle>
          <text x={led.x} y={50} textAnchor="middle" fontFamily={MONO} fontSize={7} fill="#6f8399" letterSpacing={0.6}>
            {led.label}
          </text>
        </g>
      ))}

      {uplinks}

      <rect x={536} y={28} width={72} height={28} rx={5} fill="#0b1522" stroke="#2c415a" strokeWidth={1.2} />
      <text x={572} y={46} textAnchor="middle" fontFamily={MONO} fontSize={10} fill="#a9bed4" letterSpacing={0.8}>
        {unitCode || 'OLT'}
      </text>

      <line x1={28} y1={80} x2={612} y2={80} stroke="#2b3d53" strokeWidth={1} />
      <line x1={28} y1={81} x2={612} y2={81} stroke="#0d1622" strokeWidth={1} />

      <text x={GRID_X} y={96} fontFamily={MONO} fontSize={9.5} fontWeight={700} fill="#8fa6bd" letterSpacing={1.8}>
        PON PORTS
      </text>
      <text
        x={610}
        y={96}
        textAnchor="end"
        fontFamily={MONO}
        fontSize={9.5}
        fill={connected > 0 ? '#4ade80' : '#5c7088'}
      >
        {ports.length ? `${connected}/${ports.length} LINKED` : 'NO PORTS'}
      </text>

      {slots === 0 ? (
        <text x={320} y={140} textAnchor="middle" fontFamily={MONO} fontSize={10} fill="#5c7088">
          NO PON PORTS DEFINED
        </text>
      ) : (
        tiles
      )}
    </svg>
  );
}
