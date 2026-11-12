import { MapPinned, Network, ShieldCheck } from 'lucide-react';
import { Brand, BrandMark } from '@/components/brand';
import { ThemeToggle } from '@/components/theme-toggle';

const DIVISIONS = ['Dhaka', 'Chattogram', 'Sylhet', 'Khulna', 'Rajshahi', 'Barishal', 'Rangpur', 'Mymensingh'];

const FEATURES = [
  {
    icon: MapPinned,
    title: 'Geospatial truth',
    body: 'Every joint plotted on a live national map with PostGIS precision.',
  },
  {
    icon: Network,
    title: 'Span-level control',
    body: 'Cores, splitters, fibre IDs and cuts tracked end to end.',
  },
  {
    icon: ShieldCheck,
    title: 'Role-aware access',
    body: 'Viewers stay read-only; admins own the network changes.',
  },
];

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-canvas grain relative min-h-screen p-3 sm:p-5 lg:p-6">
      <div className="relative mx-auto grid min-h-[calc(100vh-1.5rem)] max-w-[1180px] overflow-hidden rounded-[30px] app-shell lg:min-h-[calc(100vh-3rem)] lg:grid-cols-[1.04fr_0.96fr] lg:rounded-[36px]">
        <aside className="relative hidden flex-col justify-between overflow-hidden border-r border-white/40 p-10 lg:flex dark:border-white/5">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -left-16 -top-24 size-[420px] rounded-full bg-teal-400/25 blur-3xl anim-drift dark:bg-teal-400/15" />
            <div className="absolute -right-10 top-1/3 size-[360px] rounded-full bg-violet-500/20 blur-3xl anim-drift [animation-delay:-6s] dark:bg-violet-500/20" />
            <div className="absolute bottom-0 left-1/3 size-[320px] rounded-full bg-emerald-400/15 blur-3xl anim-drift [animation-delay:-11s]" />
          </div>

          <div className="relative z-10">
            <Brand />
            <div className="mt-10 inline-flex items-center gap-2 rounded-full border border-teal-500/20 bg-teal-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-teal-700 dark:text-teal-300">
              <span className="relative flex size-1.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-teal-400 opacity-75" />
                <span className="relative inline-flex size-1.5 rounded-full bg-teal-500" />
              </span>
              Divisional FTTH operations
            </div>
            <h1 className="mt-5 font-display text-[34px] font-semibold leading-[1.12] tracking-tight text-balance">
              Every terminal joint,
              <br />
              on one <span className="text-gradient">living map.</span>
            </h1>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground">
              Survey, document and protect your FTTH footprint across Bangladesh — cores, splitters,
              fibre spans and cable cuts in a single operational view.
            </p>
          </div>

          <div className="relative z-10 my-8">
            <div className="relative overflow-hidden rounded-3xl border border-white/60 bg-white/50 p-4 shadow-[0_30px_60px_-40px_rgba(15,23,42,0.6)] backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.04]">
              <div className="flex items-center justify-between px-1 text-[9px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                <span>Live backbone · Dhaka ⇄ Chattogram</span>
                <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                  <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
                  synced
                </span>
              </div>

              <div className="relative mt-2">
                <div className="absolute inset-0 rounded-2xl bg-grid opacity-70" />
                <svg viewBox="0 0 380 190" className="relative w-full" aria-hidden="true">
                  <defs>
                    <linearGradient id="auth-line" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="#2dd4bf" />
                      <stop offset="55%" stopColor="#60a5fa" />
                      <stop offset="100%" stopColor="#a78bfa" />
                    </linearGradient>
                    <radialGradient id="auth-glow" cx="50%" cy="50%" r="50%">
                      <stop offset="0%" stopColor="#2dd4bf" stopOpacity="0.55" />
                      <stop offset="100%" stopColor="#2dd4bf" stopOpacity="0" />
                    </radialGradient>
                  </defs>

                  <circle cx="188" cy="92" r="88" fill="url(#auth-glow)" opacity="0.5" />

                  <g fill="none" stroke="url(#auth-line)" strokeWidth="1.4" opacity="0.85">
                    <path className="anim-dash" strokeDasharray="5 9" d="M44 150 L118 82 L206 128 L288 58 L344 112" />
                    <path className="anim-dash-fast" strokeDasharray="4 10" d="M118 82 L206 128 M44 150 L206 128 M288 58 L206 128" opacity="0.55" />
                  </g>
                  <path d="M206 128 L344 112" fill="none" stroke="#fb7185" strokeWidth="1.4" strokeDasharray="3 6" opacity="0.85" />

                  {[
                    { x: 44, y: 150, c: '#22d3ee', label: 'DHK' },
                    { x: 118, y: 82, c: '#34d399', label: 'GL' },
                    { x: 206, y: 128, c: '#a78bfa', label: 'MH' },
                    { x: 288, y: 58, c: '#fbbf24', label: 'SYL' },
                    { x: 344, y: 112, c: '#60a5fa', label: 'CTG' },
                  ].map((node) => (
                    <g key={node.label}>
                      <circle cx={node.x} cy={node.y} r="12" fill={node.c} opacity="0.14" />
                      <circle cx={node.x} cy={node.y} r="5" fill={node.c} stroke="#ffffff" strokeOpacity="0.65" strokeWidth="1.2" />
                      <text
                        x={node.x}
                        y={node.y - 13}
                        textAnchor="middle"
                        fontSize="7"
                        fontWeight="600"
                        letterSpacing="1"
                        fill="currentColor"
                        className="text-muted-foreground"
                      >
                        {node.label}
                      </text>
                    </g>
                  ))}

                  <g>
                    <circle cx="344" cy="112" r="14" fill="none" stroke="#fb7185" strokeWidth="1" opacity="0.7">
                      <animate attributeName="r" values="10;20;10" dur="3.2s" repeatCount="indefinite" />
                      <animate attributeName="opacity" values="0.7;0;0.7" dur="3.2s" repeatCount="indefinite" />
                    </circle>
                    <circle cx="344" cy="112" r="9" fill="none" stroke="#fb7185" strokeWidth="1.4" />
                    <path d="M340 108 L348 116 M348 108 L340 116" stroke="#fb7185" strokeWidth="1.4" strokeLinecap="round" />
                  </g>
                </svg>
              </div>

              <div className="mt-1 grid grid-cols-3 gap-2 border-t border-white/50 pt-3 dark:border-white/10">
                {[
                  { value: '21', label: 'Terminal joints' },
                  { value: '24', label: 'Fibre spans' },
                  { value: '2', label: 'Active cuts' },
                ].map((stat) => (
                  <div key={stat.label} className="px-1">
                    <p className="font-display text-lg font-semibold tracking-tight">{stat.value}</p>
                    <p className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground">{stat.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="relative z-10 space-y-4">
            <div className="grid gap-2.5">
              {FEATURES.map(({ icon: Icon, title, body }) => (
                <div key={title} className="flex items-start gap-2.5">
                  <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg border border-white/60 bg-white/60 text-primary dark:border-white/10 dark:bg-white/5">
                    <Icon className="size-3.5" />
                  </span>
                  <div>
                    <p className="text-[12px] font-semibold text-foreground">{title}</p>
                    <p className="text-[11px] leading-snug text-muted-foreground">{body}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-1.5 pt-1">
              {DIVISIONS.map((division) => (
                <span
                  key={division}
                  className="rounded-full border border-white/60 bg-white/50 px-2 py-0.5 text-[9px] font-medium uppercase tracking-wider text-muted-foreground dark:border-white/10 dark:bg-white/5"
                >
                  {division}
                </span>
              ))}
            </div>
          </div>
        </aside>

        <main className="relative flex flex-col bg-gradient-to-b from-white/35 via-transparent to-transparent p-5 sm:p-8 lg:p-10 dark:from-white/[0.02]">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 lg:hidden">
              <BrandMark className="size-8" />
              <span className="font-display text-sm font-semibold">Fibre Atlas</span>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <span className="hidden items-center gap-1.5 rounded-full border border-white/60 bg-white/50 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground sm:inline-flex dark:border-white/10 dark:bg-white/5">
                <ShieldCheck className="size-3 text-emerald-500" />
                JWT · Argon2
              </span>
              <ThemeToggle />
            </div>
          </div>

          <div className="flex flex-1 items-center justify-center py-8">
            <div className="w-full max-w-[400px]">{children}</div>
          </div>
        </main>
      </div>
    </div>
  );
}
