'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Compass,
  Crosshair,
  History,
  Loader2,
  MapPin,
  Navigation,
  Radio,
  Route,
  Router,
  Search,
  Server,
  Sparkles,
  Waypoints,
  X,
  Zap,
} from 'lucide-react';
import {
  POPULAR_BANGLADESH_HUBS,
  formatDistance,
  searchLocationSuggestions,
  type SearchResultItem,
} from '@/lib/geocoding';
import type { FibreLink, Olt, Onu, Tj } from '@/lib/types';
import { cn } from '@/lib/utils';

interface LocationSearchProps {
  tjs: Tj[];
  olts: Olt[];
  onus: Onu[];
  links: FibreLink[];
  onSelectLocation: (item: SearchResultItem) => void;
  onClearPinned?: () => void;
  activePinned?: { title: string } | null;
  className?: string;
}

export function LocationSearch({
  tjs,
  olts,
  onus,
  links,
  onSelectLocation,
  onClearPinned,
  activePinned,
  className,
}: LocationSearchProps) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<SearchResultItem[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Sync pinned location title if set from outside
  useEffect(() => {
    if (activePinned) {
      setQuery(activePinned.title);
    }
  }, [activePinned]);

  // Click outside to close dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Global hotkey: press "/" to focus search
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (
        event.key === '/' &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA'
      ) {
        event.preventDefault();
        inputRef.current?.focus();
        setIsOpen(true);
      }
      if (event.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Debounced geocoding search
  useEffect(() => {
    const trimmed = query.trim();

    if (!trimmed || trimmed.length < 2) {
      setSuggestions([]);
      setLoading(false);
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const results = await searchLocationSuggestions(
          trimmed,
          { tjs, olts, onus, links },
          controller.signal,
        );
        if (!controller.signal.aborted) {
          setSuggestions(results);
          setActiveIndex(-1);
          setLoading(false);
        }
      } catch {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }, 280);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, tjs, olts, onus, links]);

  function handleSelect(item: SearchResultItem) {
    setQuery(item.title);
    setIsOpen(false);
    onSelectLocation(item);
  }

  function handleClear() {
    setQuery('');
    setSuggestions([]);
    setIsOpen(false);
    onClearPinned?.();
    inputRef.current?.focus();
  }

  const showQuickHubs = isOpen && query.trim().length < 2;
  const showResults = isOpen && query.trim().length >= 2;

  const exactResults = useMemo(
    () => suggestions.filter((s) => s.isExact && s.type !== 'place'),
    [suggestions],
  );
  const coordResults = useMemo(
    () => suggestions.filter((s) => s.category === 'Coordinate'),
    [suggestions],
  );
  const tjResults = useMemo(
    () => suggestions.filter((s) => !s.isExact && s.type === 'tj'),
    [suggestions],
  );
  const oltResults = useMemo(
    () => suggestions.filter((s) => !s.isExact && s.type === 'olt'),
    [suggestions],
  );
  const onuResults = useMemo(
    () => suggestions.filter((s) => !s.isExact && s.type === 'onu'),
    [suggestions],
  );
  const linkResults = useMemo(
    () => suggestions.filter((s) => !s.isExact && s.type === 'link'),
    [suggestions],
  );
  const placeResults = useMemo(
    () =>
      suggestions.filter(
        (s) =>
          !s.isExact &&
          s.category !== 'Coordinate' &&
          s.type !== 'tj' &&
          s.type !== 'olt' &&
          s.type !== 'onu' &&
          s.type !== 'link',
      ),
    [suggestions],
  );

  const displayedItems = useMemo(
    () => [
      ...exactResults,
      ...coordResults,
      ...tjResults,
      ...oltResults,
      ...onuResults,
      ...linkResults,
      ...placeResults,
    ],
    [exactResults, coordResults, tjResults, oltResults, onuResults, linkResults, placeResults],
  );

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!isOpen) {
      if (e.key === 'ArrowDown') {
        setIsOpen(true);
      }
      return;
    }

    const total = query.trim().length >= 2 ? displayedItems.length : POPULAR_BANGLADESH_HUBS.length;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => (prev + 1 < total ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => (prev - 1 >= 0 ? prev - 1 : total - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0) {
        const item =
          query.trim().length >= 2
            ? displayedItems[activeIndex]
            : POPULAR_BANGLADESH_HUBS[activeIndex];
        if (item) handleSelect(item);
      } else if (displayedItems.length > 0) {
        handleSelect(displayedItems[0]);
      }
    }
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        'pointer-events-auto absolute left-3 top-3 z-20 w-[calc(100%-1.5rem)] max-w-sm sm:left-4 sm:top-4 sm:w-[380px]',
        className,
      )}
    >
      {/* GOOGLE MAPS SEARCH INPUT BOX */}
      <div
        className={cn(
          'relative flex h-11 items-center gap-2.5 rounded-2xl border px-3 transition-all duration-200',
          'bg-white/95 backdrop-blur-xl shadow-md dark:bg-slate-900/95',
          isOpen
            ? 'border-primary ring-2 ring-primary/20 shadow-xl'
            : 'border-white/70 hover:border-white/90 dark:border-white/10 dark:hover:border-white/20',
        )}
      >
        <span className="grid size-6 shrink-0 place-items-center text-muted-foreground">
          {activePinned ? (
            <MapPin className="size-4 text-rose-500 animate-bounce" />
          ) : (
            <Search className="size-4" />
          )}
        </span>

        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search place, device, link, or lat, lng..."
          className="h-full min-w-0 flex-1 bg-transparent text-[12.5px] font-medium outline-none placeholder:text-muted-foreground/70"
          aria-label="Search map location"
        />

        {/* Clear or loading indicator */}
        <div className="flex shrink-0 items-center gap-1">
          {loading ? (
            <Loader2 className="size-4 animate-spin text-primary" />
          ) : query ? (
            <button
              type="button"
              onClick={handleClear}
              className="grid size-6 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition active:scale-90"
              title="Clear search"
              aria-label="Clear search"
            >
              <X className="size-3.5" />
            </button>
          ) : (
            <kbd className="hidden sm:inline-flex h-5 items-center gap-0.5 rounded border border-border/80 bg-muted/60 px-1.5 font-mono text-[9px] font-semibold text-muted-foreground">
              /
            </kbd>
          )}
        </div>
      </div>

      {/* AUTO-SUGGESTIONS DROPDOWN */}
      {isOpen ? (
        <div className="anim-rise mt-2 max-h-[380px] w-full overflow-hidden overflow-y-auto rounded-2xl border border-white/70 bg-white/95 p-1.5 shadow-2xl backdrop-blur-2xl dark:border-white/10 dark:bg-slate-900/95">
          {/* QUICK / POPULAR BANGLADESH HUBS (when empty) */}
          {showQuickHubs ? (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                <Sparkles className="size-3 text-amber-500" />
                Popular FTTH Hubs
              </div>
              {POPULAR_BANGLADESH_HUBS.map((hub, index) => (
                <button
                  key={hub.id}
                  type="button"
                  onClick={() => handleSelect(hub)}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition',
                    activeIndex === index
                      ? 'bg-primary/10 text-primary'
                      : 'hover:bg-muted/70 text-foreground',
                  )}
                >
                  <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                    <MapPin className="size-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-semibold leading-tight">{hub.title}</p>
                    <p className="mt-0.5 truncate text-[10.5px] text-muted-foreground">
                      {hub.subtitle}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
                    {hub.category}
                  </span>
                </button>
              ))}
            </div>
          ) : null}

          {/* ACTIVE AUTO-SUGGESTION RESULTS */}
          {showResults ? (
            <>
              {loading && suggestions.length === 0 ? (
                <div className="flex items-center justify-center gap-2 p-5 text-[12px] text-muted-foreground">
                  <Loader2 className="size-4 animate-spin text-primary" />
                  <span>Searching OpenStreetMap & network...</span>
                </div>
              ) : null}

              {!loading && suggestions.length === 0 ? (
                <div className="p-4 text-center text-[11.5px] text-muted-foreground">
                  <p className="font-semibold text-foreground/80">No locations found</p>
                  <p className="mt-0.5 text-[10.5px]">
                    Try a place, joint / OLT / ONU code, link fibre ID, or coordinates
                    (e.g. &quot;Gulshan&quot;, &quot;TJ-DHK-001&quot;, &quot;22.8347, 89.5612&quot;).
                  </p>
                </div>
              ) : null}

              {/* EXACT MATCHES SECTION */}
              {exactResults.length > 0 ? (
                <div className="mb-1 space-y-0.5">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-emerald-600 dark:text-emerald-400">
                    <Zap className="size-3" />
                    Exact Device Match ({exactResults.length})
                  </div>
                  {exactResults.map((item) => {
                    const isFocused = activeIndex === displayedItems.indexOf(item);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleSelect(item)}
                        className={cn(
                          'flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition',
                          isFocused
                            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-500/30'
                            : 'hover:bg-muted/70 text-foreground',
                        )}
                      >
                        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                          {item.type === 'tj' ? (
                            <Radio className="size-3.5" />
                          ) : item.type === 'olt' ? (
                            <Server className="size-3.5" />
                          ) : item.type === 'onu' ? (
                            <Router className="size-3.5" />
                          ) : (
                            <Route className="size-3.5" />
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="text-[12px] font-bold font-mono text-primary">
                              {item.title}
                            </p>
                            <span className="rounded bg-emerald-500/15 px-1 py-0.2 text-[9px] font-semibold text-emerald-700 dark:text-emerald-300">
                              Exact Match
                            </span>
                            <span className="rounded bg-primary/10 px-1 py-0.2 text-[9px] font-semibold text-primary">
                              {item.category}
                            </span>
                          </div>
                          <p className="mt-0.5 truncate text-[10.5px] text-muted-foreground">
                            {item.subtitle}
                          </p>
                        </div>
                        <span className="shrink-0 font-mono text-[9px] text-muted-foreground/75">
                          {item.lat.toFixed(4)}, {item.lng.toFixed(4)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : null}

              {/* COORDINATES PIN TARGET OPTION */}
              {coordResults.length > 0 ? (
                <div className="mb-1 space-y-0.5">
                  {coordResults.map((item) => {
                    const isFocused = activeIndex === displayedItems.indexOf(item);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleSelect(item)}
                        className={cn(
                          'flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition border border-rose-500/20 bg-rose-500/5',
                          isFocused
                            ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300 ring-1 ring-rose-500/30'
                            : 'hover:bg-rose-500/10 text-foreground',
                        )}
                      >
                        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-rose-500/15 text-rose-600 dark:text-rose-400">
                          <Crosshair className="size-3.5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <p className="text-[12px] font-bold font-mono text-foreground">
                              {item.title}
                            </p>
                            <span className="rounded bg-rose-500/15 px-1 py-0.2 text-[9px] font-semibold text-rose-700 dark:text-rose-300">
                              Coordinates
                            </span>
                          </div>
                          <p className="mt-0.5 truncate text-[10.5px] text-muted-foreground">
                            {item.subtitle}
                          </p>
                        </div>
                        <span className="shrink-0 font-mono text-[9.5px] font-semibold text-rose-600 dark:text-rose-400">
                          Fly to Point
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : null}

              {/* NETWORK JOINTS SECTION */}
              {tjResults.length > 0 ? (
                <div className="mb-1 space-y-0.5">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-teal-600 dark:text-teal-400">
                    <Waypoints className="size-3" />
                    Network Joint Boxes ({tjResults.length})
                  </div>
                  {tjResults.map((item) => {
                    const isFocused = activeIndex === displayedItems.indexOf(item);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleSelect(item)}
                        className={cn(
                          'flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition',
                          isFocused
                            ? 'bg-teal-500/15 text-teal-700 dark:text-teal-300 ring-1 ring-teal-500/30'
                            : 'hover:bg-muted/70 text-foreground',
                        )}
                      >
                        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-teal-500/15 text-teal-600 dark:text-teal-400">
                          <Radio className="size-3.5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="text-[12px] font-bold font-mono text-primary">
                              {item.title}
                            </p>
                            <span className="rounded bg-primary/10 px-1 py-0.2 text-[9px] font-semibold text-primary">
                              {item.category}
                            </span>
                            {item.distanceM !== undefined ? (
                              <span className="rounded bg-muted px-1.5 py-0.2 text-[8.5px] font-medium text-muted-foreground">
                                {formatDistance(item.distanceM)}
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-0.5 truncate text-[10.5px] text-muted-foreground">
                            {item.subtitle}
                          </p>
                        </div>
                        <span className="shrink-0 font-mono text-[9px] text-muted-foreground/75">
                          {item.lat.toFixed(4)}, {item.lng.toFixed(4)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : null}

              {/* NETWORK OLTs SECTION */}
              {oltResults.length > 0 ? (
                <div className="mb-1 space-y-0.5">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-amber-600 dark:text-amber-400">
                    <Server className="size-3" />
                    Network OLTs ({oltResults.length})
                  </div>
                  {oltResults.map((item) => {
                    const isFocused = activeIndex === displayedItems.indexOf(item);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleSelect(item)}
                        className={cn(
                          'flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition',
                          isFocused
                            ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 ring-1 ring-amber-500/30'
                            : 'hover:bg-muted/70 text-foreground',
                        )}
                      >
                        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400">
                          <Server className="size-3.5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="text-[12px] font-bold font-mono text-primary">
                              {item.title}
                            </p>
                            <span className="rounded bg-amber-500/15 px-1 py-0.2 text-[9px] font-semibold text-amber-700 dark:text-amber-300">
                              {item.category}
                            </span>
                            {item.distanceM !== undefined ? (
                              <span className="rounded bg-muted px-1.5 py-0.2 text-[8.5px] font-medium text-muted-foreground">
                                {formatDistance(item.distanceM)}
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-0.5 truncate text-[10.5px] text-muted-foreground">
                            {item.subtitle}
                          </p>
                        </div>
                        <span className="shrink-0 font-mono text-[9px] text-muted-foreground/75">
                          {item.lat.toFixed(4)}, {item.lng.toFixed(4)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : null}

              {/* NETWORK ONUs SECTION */}
              {onuResults.length > 0 ? (
                <div className="mb-1 space-y-0.5">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-sky-600 dark:text-sky-400">
                    <Router className="size-3" />
                    Network ONUs ({onuResults.length})
                  </div>
                  {onuResults.map((item) => {
                    const isFocused = activeIndex === displayedItems.indexOf(item);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleSelect(item)}
                        className={cn(
                          'flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition',
                          isFocused
                            ? 'bg-sky-500/15 text-sky-700 dark:text-sky-300 ring-1 ring-sky-500/30'
                            : 'hover:bg-muted/70 text-foreground',
                        )}
                      >
                        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-sky-500/15 text-sky-600 dark:text-sky-400">
                          <Router className="size-3.5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="text-[12px] font-bold font-mono text-primary">
                              {item.title}
                            </p>
                            <span className="rounded bg-sky-500/15 px-1 py-0.2 text-[9px] font-semibold text-sky-700 dark:text-sky-300">
                              {item.category}
                            </span>
                            {item.distanceM !== undefined ? (
                              <span className="rounded bg-muted px-1.5 py-0.2 text-[8.5px] font-medium text-muted-foreground">
                                {formatDistance(item.distanceM)}
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-0.5 truncate text-[10.5px] text-muted-foreground">
                            {item.subtitle}
                          </p>
                        </div>
                        <span className="shrink-0 font-mono text-[9px] text-muted-foreground/75">
                          {item.lat.toFixed(4)}, {item.lng.toFixed(4)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : null}

              {/* NETWORK FIBRE LINKS SECTION */}
              {linkResults.length > 0 ? (
                <div className="mb-1 space-y-0.5">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-fuchsia-600 dark:text-fuchsia-400">
                    <Route className="size-3" />
                    Fibre Links ({linkResults.length})
                  </div>
                  {linkResults.map((item) => {
                    const isFocused = activeIndex === displayedItems.indexOf(item);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleSelect(item)}
                        className={cn(
                          'flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition',
                          isFocused
                            ? 'bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300 ring-1 ring-fuchsia-500/30'
                            : 'hover:bg-muted/70 text-foreground',
                        )}
                      >
                        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-400">
                          <Route className="size-3.5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="text-[12px] font-bold font-mono text-primary">
                              {item.title}
                            </p>
                            <span className="rounded bg-fuchsia-500/15 px-1 py-0.2 text-[9px] font-semibold text-fuchsia-700 dark:text-fuchsia-300">
                              {item.category}
                            </span>
                            {item.distanceM !== undefined ? (
                              <span className="rounded bg-muted px-1.5 py-0.2 text-[8.5px] font-medium text-muted-foreground">
                                {formatDistance(item.distanceM)}
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-0.5 truncate text-[10.5px] text-muted-foreground">
                            {item.subtitle}
                          </p>
                        </div>
                        <span className="shrink-0 font-mono text-[9px] text-muted-foreground/75">
                          {item.lat.toFixed(4)}, {item.lng.toFixed(4)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : null}

              {/* OPENSTREETMAP PLACES & ADDRESSES */}
              {placeResults.length > 0 ? (
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    <Navigation className="size-3 text-sky-500" />
                    OpenStreetMap Locations ({placeResults.length})
                  </div>
                  {placeResults.map((item) => {
                    const isFocused = activeIndex === displayedItems.indexOf(item);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleSelect(item)}
                        className={cn(
                          'flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition',
                          isFocused
                            ? 'bg-primary/10 text-primary ring-1 ring-primary/30'
                            : 'hover:bg-muted/70 text-foreground',
                        )}
                      >
                        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-rose-500/10 text-rose-500">
                          <MapPin className="size-3.5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[12px] font-semibold leading-tight">{item.title}</p>
                          <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                            {item.subtitle}
                          </p>
                        </div>
                        <span className="font-mono text-[9px] text-muted-foreground/75 shrink-0">
                          {item.lat.toFixed(3)}, {item.lng.toFixed(3)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

