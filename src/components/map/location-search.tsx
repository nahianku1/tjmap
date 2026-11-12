'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Compass,
  History,
  Loader2,
  MapPin,
  Navigation,
  Radio,
  Search,
  Sparkles,
  Waypoints,
  X,
  Zap,
} from 'lucide-react';
import {
  POPULAR_BANGLADESH_HUBS,
  searchLocationSuggestions,
  type SearchResultItem,
} from '@/lib/geocoding';
import type { Tj } from '@/lib/types';
import { cn } from '@/lib/utils';

interface LocationSearchProps {
  tjs: Tj[];
  onSelectLocation: (item: SearchResultItem) => void;
  onClearPinned?: () => void;
  activePinned?: { title: string } | null;
  className?: string;
}

export function LocationSearch({
  tjs,
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
        const results = await searchLocationSuggestions(trimmed, tjs, controller.signal);
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
  }, [query, tjs]);

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

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!isOpen) {
      if (e.key === 'ArrowDown') {
        setIsOpen(true);
      }
      return;
    }

    const total = query.trim().length >= 2 ? suggestions.length : POPULAR_BANGLADESH_HUBS.length;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => (prev + 1 < total ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => (prev - 1 >= 0 ? prev - 1 : total - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0) {
        const item = query.trim().length >= 2 ? suggestions[activeIndex] : POPULAR_BANGLADESH_HUBS[activeIndex];
        if (item) handleSelect(item);
      } else if (suggestions.length > 0) {
        handleSelect(suggestions[0]);
      }
    }
  }

  const showQuickHubs = isOpen && query.trim().length < 2;
  const showResults = isOpen && query.trim().length >= 2;

  const tjResults = suggestions.filter((s) => s.type === 'tj');
  const placeResults = suggestions.filter((s) => s.type !== 'tj');

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
          placeholder="Search location, street, area, or joint..."
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
                    Try searching an area, landmark, or joint code (e.g. &quot;Gulshan&quot;, &quot;Agrabad&quot;, &quot;TJ-DHK-001&quot;).
                  </p>
                </div>
              ) : null}

              {/* NETWORK JOINTS SECTION */}
              {tjResults.length > 0 ? (
                <div className="mb-1 space-y-0.5">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-teal-600 dark:text-teal-400">
                    <Waypoints className="size-3" />
                    Network Joint Boxes ({tjResults.length})
                  </div>
                  {tjResults.map((item, i) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelect(item)}
                      className={cn(
                        'flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition',
                        activeIndex === i
                          ? 'bg-teal-500/15 text-teal-700 dark:text-teal-300'
                          : 'hover:bg-muted/70 text-foreground',
                      )}
                    >
                      <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-teal-500/15 text-teal-600 dark:text-teal-400">
                        <Radio className="size-3.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="text-[12px] font-bold font-mono text-primary">
                            {item.title}
                          </p>
                          <span className="rounded bg-primary/10 px-1 py-0.2 text-[9px] font-semibold text-primary">
                            {item.category}
                          </span>
                        </div>
                        <p className="mt-0.5 truncate text-[10.5px] text-muted-foreground">
                          {item.subtitle}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              ) : null}

              {/* OPENSTREETMAP PLACES & ADDRESSES */}
              {placeResults.length > 0 ? (
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    <Navigation className="size-3 text-sky-500" />
                    OpenStreetMap Locations ({placeResults.length})
                  </div>
                  {placeResults.map((item, i) => {
                    const globalIdx = tjResults.length + i;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleSelect(item)}
                        className={cn(
                          'flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition',
                          activeIndex === globalIdx
                            ? 'bg-primary/10 text-primary'
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

