'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { Loader2, Plus, RefreshCw, WifiOff } from 'lucide-react';
import { toast } from 'sonner';
import { Topbar } from '@/components/dashboard/topbar';
import { Sidebar, type TjFilter } from '@/components/dashboard/sidebar';
import { MapOverlay } from '@/components/dashboard/map-overlay';
import { TjDetailPanel } from '@/components/map/tj-detail-panel';
import { TjFormDialog } from '@/components/map/tj-form-dialog';
import { LinkDialog } from '@/components/map/link-dialog';
import { CutDialog } from '@/components/map/cut-dialog';
import { ConfirmDialog } from '@/components/map/confirm-dialog';
import { LocationSearch } from '@/components/map/location-search';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { BrandMark } from '@/components/brand';
import { api, ApiError, fetcher } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type { Area, FibreLink, Network, Tj } from '@/lib/types';
import type { MapMode } from '@/components/map/network-map';
import type { SearchResultItem } from '@/lib/geocoding';

const NetworkMap = dynamic(
  () => import('@/components/map/network-map').then((module) => ({ default: module.NetworkMap })),
  { ssr: false, loading: () => <MapSkeleton /> },
);

const fetchNetwork = (path: string) => fetcher<Network>(path);

interface LinkDialogState {
  from: Tj | null;
  to: Tj | null;
  link: FibreLink | null;
}

/**
 * The FTTH map workspace. Without `areaId` it renders the national network;
 * with one it scopes the data and camera to a single service area.
 */
export function MapWorkspace({ areaId }: { areaId?: string }) {
  const router = useRouter();
  const { status, isAdmin } = useAuth();

  const { data: area } = useSWR<Area>(
    status === 'authenticated' && areaId ? `/areas/${areaId}` : null,
    fetcher,
    { revalidateOnFocus: false, shouldRetryOnError: false },
  );

  const { data, error, isLoading, mutate } = useSWR<Network>(
    status === 'authenticated' ? (areaId ? `/areas/${areaId}/network` : '/tjs/network') : null,
    fetchNetwork,
    { revalidateOnFocus: false, shouldRetryOnError: false },
  );

  const tjs = useMemo(() => data?.tjs ?? [], [data]);
  const links = useMemo(() => data?.links ?? [], [data]);
  const cutCount = useMemo(() => tjs.filter((tj) => tj.isCut).length, [tjs]);

  const [mode, setMode] = useState<MapMode>('idle');
  const [selectedTjId, setSelectedTjId] = useState<string | null>(null);
  const [selectedLinkId, setSelectedLinkId] = useState<string | null>(null);
  const [linkSourceId, setLinkSourceId] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ lng: number; lat: number; zoom?: number; nonce: number } | null>(null);

  const [filter, setFilter] = useState<TjFilter>('all');
  const [search, setSearch] = useState('');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const [tjFormOpen, setTjFormOpen] = useState(false);
  const [editingTj, setEditingTj] = useState<Tj | null>(null);
  const [draftPoint, setDraftPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [draftAddress, setDraftAddress] = useState<string | null>(null);
  const [pinnedLocation, setPinnedLocation] = useState<{
    lat: number;
    lng: number;
    title: string;
    subtitle?: string;
  } | null>(null);
  const [linkDialog, setLinkDialog] = useState<LinkDialogState | null>(null);
  const [cutTarget, setCutTarget] = useState<Tj | null>(null);
  const [tjToDelete, setTjToDelete] = useState<Tj | null>(null);
  const [linkToDelete, setLinkToDelete] = useState<FibreLink | null>(null);
  const [deleting, setDeleting] = useState(false);

  const selectedTj = useMemo(
    () => tjs.find((tj) => tj.id === selectedTjId) ?? null,
    [tjs, selectedTjId],
  );
  const linkSource = useMemo(
    () => tjs.find((tj) => tj.id === linkSourceId) ?? null,
    [tjs, linkSourceId],
  );

  const initialView = useMemo(() => {
    if (!areaId || !area) return null;
    if (area.lat !== null && area.lng !== null) {
      return { lat: area.lat, lng: area.lng, zoom: area.zoom ?? 12 };
    }
    const district = area.district;
    if (district && district.lat !== null && district.lng !== null) {
      return { lat: district.lat, lng: district.lng, zoom: district.zoom ?? 10 };
    }
    return null;
  }, [areaId, area]);

  useEffect(() => {
    if (status === 'anonymous') router.replace('/login');
  }, [status, router]);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      if (mode !== 'idle') {
        setMode('idle');
        setLinkSourceId(null);
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [mode]);

  const focusOn = useCallback((tj: Tj) => {
    setFocus({ lng: tj.lng, lat: tj.lat, zoom: 13.4, nonce: Date.now() });
  }, []);

  const handleSelectTj = useCallback(
    (id: string) => {
      const tj = tjs.find((item) => item.id === id);
      if (!tj) return;

      if (mode === 'link') {
        if (!linkSourceId) {
          setLinkSourceId(id);
          toast.info(`${tj.code} selected`, { description: 'Now pick the second joint to link.' });
          return;
        }
        if (linkSourceId === id) {
          setLinkSourceId(null);
          setMode('idle');
          return;
        }
        const from = tjs.find((item) => item.id === linkSourceId);
        if (!from) return;
        setLinkDialog({ from, to: tj, link: null });
        setMode('idle');
        setLinkSourceId(null);
        return;
      }

      setSelectedTjId(id);
      setSelectedLinkId(null);
      focusOn(tj);
    },
    [mode, linkSourceId, tjs, focusOn],
  );

  const handleSelectLink = useCallback(
    (id: string) => {
      const link = links.find((item) => item.id === id);
      if (!link) return;
      setSelectedLinkId(id);
      setLinkDialog({ from: null, to: null, link });
    },
    [links],
  );

  const handleMapClick = useCallback(
    (point: { lng: number; lat: number }) => {
      if (!isAdmin) {
        toast.error('Viewer seat', { description: 'Only admins can add terminal joints.' });
        setMode('idle');
        return;
      }
      setDraftPoint({ lat: point.lat, lng: point.lng });
      setEditingTj(null);
      setTjFormOpen(true);
      setMode('idle');
    },
    [isAdmin],
  );

  const handleBackgroundClick = useCallback(() => {
    if (mode === 'idle') {
      setSelectedLinkId(null);
      setPinnedLocation(null);
    }
  }, [mode]);

  const startAddMode = useCallback(() => {
    if (!isAdmin) return;
    setMobileSidebarOpen(false);
    setSelectedTjId(null);
    setMode('add-tj');
    toast.info('Add joint mode', {
      description: area
        ? `Click the map inside ${area.name} to place it.`
        : 'Click the map inside Bangladesh to place it.',
    });
  }, [isAdmin, area]);

  const startLinkMode = useCallback(() => {
    if (!isAdmin) return;
    setMobileSidebarOpen(false);
    setMode('link');
    setLinkSourceId((current) => current ?? selectedTjId);
    setSelectedTjId(null);
    toast.info('Link mode active', {
      description: selectedTjId ? 'Pick the second joint.' : 'Select the first joint on the map.',
    });
  }, [isAdmin, selectedTjId]);

  const cancelMode = useCallback(() => {
    setMode('idle');
    setLinkSourceId(null);
  }, []);

  const handleLocationSelect = useCallback(
    (item: SearchResultItem) => {
      setPinnedLocation({ lat: item.lat, lng: item.lng, title: item.title, subtitle: item.subtitle });
      setFocus({ lat: item.lat, lng: item.lng, zoom: item.type === 'tj' ? 14 : 13, nonce: Date.now() });
      if (item.type === 'tj' && item.tjId) {
        setSelectedTjId(item.tjId);
        setSelectedLinkId(null);
      }
    },
    [],
  );

  const handleClearPinnedLocation = useCallback(() => {
    setPinnedLocation(null);
    setDraftAddress(null);
  }, []);

  const handleAddTjAtPinnedLocation = useCallback(
    (point: { lat: number; lng: number; address: string }) => {
      setDraftPoint({ lat: point.lat, lng: point.lng });
      setDraftAddress(point.address);
      setEditingTj(null);
      setTjFormOpen(true);
      setPinnedLocation(null);
    },
    [],
  );

  const handleTjSaved = useCallback(
    async (saved: Tj) => {
      setSelectedTjId(saved.id);
      setEditingTj(null);
      setDraftPoint(null);
      focusOn(saved);
      await mutate();
    },
    [mutate, focusOn],
  );

  const handleLinkSaved = useCallback(
    async (saved: FibreLink) => {
      setSelectedLinkId(saved.id);
      await mutate();
    },
    [mutate],
  );

  const handleCutSaved = useCallback(async () => {
    await mutate();
  }, [mutate]);

  const handleLinkFrom = useCallback(
    (tj: Tj) => {
      setMode('link');
      setLinkSourceId(tj.id);
      setSelectedTjId(null);
      toast.info(`${tj.code} selected`, { description: 'Pick the second joint to create the span.' });
    },
    [],
  );

  async function confirmDeleteTj() {
    if (!tjToDelete) return;
    setDeleting(true);
    try {
      await api.deleteTj(tjToDelete.id);
      toast.success(`${tjToDelete.code} deleted`, { description: 'Connected spans were removed too.' });
      if (selectedTjId === tjToDelete.id) setSelectedTjId(null);
      setTjToDelete(null);
      await mutate();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not delete this joint');
    } finally {
      setDeleting(false);
    }
  }

  async function confirmDeleteLink() {
    if (!linkToDelete) return;
    setDeleting(true);
    try {
      await api.deleteLink(linkToDelete.id);
      toast.success(`Span ${linkToDelete.fibreId} deleted`);
      if (selectedLinkId === linkToDelete.id) setSelectedLinkId(null);
      setLinkToDelete(null);
      await mutate();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not delete this span');
    } finally {
      setDeleting(false);
    }
  }

  if (status === 'loading') {
    return (
      <div className="app-canvas grain grid h-[100dvh] place-items-center">
        <div className="flex flex-col items-center gap-4">
          <BrandMark className="size-12" />
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            Restoring session
          </p>
        </div>
      </div>
    );
  }

  if (status === 'anonymous') {
    return <div className="app-canvas h-[100dvh]" />;
  }

  return (
    <div className="app-canvas grain relative h-[100dvh] w-full overflow-hidden">
      <div className="relative flex h-full w-full flex-col overflow-hidden app-shell">
        <Topbar
          tjCount={tjs.length}
          linkCount={links.length}
          cutCount={cutCount}
          onOpenSidebar={() => setMobileSidebarOpen(true)}
          contextLabel={area ? `${area.districtName} · ${area.name}` : undefined}
          back={
            areaId
              ? { href: area ? `/districts/${area.districtId}` : '/', label: area ? area.districtName : 'Districts' }
              : undefined
          }
        />

        <div className="flex min-h-0 flex-1">
          <aside className="hidden w-[330px] shrink-0 border-r border-white/40 lg:block dark:border-white/[0.06]">
            <Sidebar
              tjs={tjs}
              links={links}
              loading={isLoading}
              selectedId={selectedTjId}
              filter={filter}
              search={search}
              mode={mode}
              isAdmin={isAdmin}
              onSearchChange={setSearch}
              onFilterChange={setFilter}
              onSelect={(tj) => handleSelectTj(tj.id)}
              onAdd={startAddMode}
              onStartLink={startLinkMode}
            />
          </aside>

          <main className="relative min-h-0 min-w-0 flex-1">
            <NetworkMap
              tjs={tjs}
              links={links}
              mode={mode}
              selectedTjId={selectedTjId}
              selectedLinkId={selectedLinkId}
              linkSourceId={linkSourceId}
              focus={focus}
              initialView={initialView}
              onSelectTj={handleSelectTj}
              onSelectLink={handleSelectLink}
              onMapClick={handleMapClick}
              onBackgroundClick={handleBackgroundClick}
              pinnedLocation={pinnedLocation}
              onClearPinnedLocation={handleClearPinnedLocation}
              onAddTjAtPinnedLocation={handleAddTjAtPinnedLocation}
            />

            <LocationSearch
              tjs={tjs}
              onSelectLocation={handleLocationSelect}
              onClearPinned={handleClearPinnedLocation}
              activePinned={pinnedLocation ? { title: pinnedLocation.title } : null}
            />

            <MapOverlay
              mode={mode}
              linkSourceCode={linkSource?.code ?? null}
              tjs={tjs}
              links={links}
              onCancelMode={cancelMode}
            />

            {error ? (
              <div className="absolute left-1/2 top-4 z-20 flex w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 items-center gap-2.5 rounded-2xl border border-destructive/25 bg-destructive/10 px-3 py-2.5 backdrop-blur">
                <WifiOff className="size-4 shrink-0 text-destructive" />
                <p className="min-w-0 flex-1 text-[11px] font-medium text-destructive">
                  {error instanceof Error ? error.message : 'Could not load the network.'}
                </p>
                <Button size="sm" variant="ghost" onClick={() => mutate()} className="h-7 px-2 text-destructive">
                  <RefreshCw className="size-3" />
                  Retry
                </Button>
              </div>
            ) : null}

            <Button
              onClick={startAddMode}
              className="absolute bottom-4 right-16 z-10 h-11 w-11 rounded-full shadow-lg lg:hidden"
              size="icon"
              aria-label="Add terminal joint"
            >
              <Plus className="size-5" />
            </Button>
          </main>
        </div>
      </div>

      <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
        <SheetContent className="w-[92vw] p-0 sm:w-[360px]" showClose={false}>
          <Sidebar
            tjs={tjs}
            links={links}
            loading={isLoading}
            selectedId={selectedTjId}
            filter={filter}
            search={search}
            mode={mode}
            isAdmin={isAdmin}
            onSearchChange={setSearch}
            onFilterChange={setFilter}
            onSelect={(tj) => {
              handleSelectTj(tj.id);
              setMobileSidebarOpen(false);
            }}
            onAdd={startAddMode}
            onStartLink={startLinkMode}
            onClose={() => setMobileSidebarOpen(false)}
          />
        </SheetContent>
      </Sheet>

      <TjDetailPanel
        tj={selectedTj}
        links={links}
        isAdmin={isAdmin}
        onClose={() => setSelectedTjId(null)}
        onEdit={(tj) => {
          setEditingTj(tj);
          setTjFormOpen(true);
        }}
        onDelete={(tj) => setTjToDelete(tj)}
        onLinkFrom={handleLinkFrom}
        onManageCut={(tj) => setCutTarget(tj)}
        onSelectLink={(link) => handleSelectLink(link.id)}
      />

      <TjFormDialog
        open={tjFormOpen}
        onOpenChange={(open) => {
          setTjFormOpen(open);
          if (!open) {
            setEditingTj(null);
            setDraftPoint(null);
            setDraftAddress(null);
          }
        }}
        initial={editingTj}
        draftPoint={draftPoint}
        draftAddress={draftAddress}
        defaultAreaId={areaId ?? null}
        onSaved={handleTjSaved}
      />

      <LinkDialog
        open={Boolean(linkDialog)}
        onOpenChange={(open) => {
          if (!open) setLinkDialog(null);
        }}
        from={linkDialog?.from ?? null}
        to={linkDialog?.to ?? null}
        link={linkDialog?.link ?? null}
        onSaved={handleLinkSaved}
        onRequestDelete={(link) => {
          setLinkDialog(null);
          setLinkToDelete(link);
        }}
      />

      <CutDialog
        tj={cutTarget}
        open={Boolean(cutTarget)}
        onOpenChange={(open) => {
          if (!open) setCutTarget(null);
        }}
        onSaved={handleCutSaved}
      />

      <ConfirmDialog
        open={Boolean(tjToDelete)}
        onOpenChange={(open) => {
          if (!open) setTjToDelete(null);
        }}
        title={`Delete ${tjToDelete?.code ?? 'joint'}?`}
        description="This removes the terminal joint and every fibre span attached to it. This cannot be undone."
        confirmLabel="Delete joint"
        loading={deleting}
        onConfirm={confirmDeleteTj}
      />

      <ConfirmDialog
        open={Boolean(linkToDelete)}
        onOpenChange={(open) => {
          if (!open) setLinkToDelete(null);
        }}
        title={`Delete span ${linkToDelete?.fibreId ?? ''}?`}
        description="The fibre span between these two joints will be removed from the map."
        confirmLabel="Delete span"
        loading={deleting}
        onConfirm={confirmDeleteLink}
      />
    </div>
  );
}

function MapSkeleton() {
  return (
    <div className="map-frame grid place-items-center bg-gradient-to-br from-slate-100 to-slate-200 dark:from-[#070b14] dark:to-[#0b1220]">
      <div className="absolute inset-0 bg-grid opacity-40" />
      <div className="relative flex flex-col items-center gap-3 text-muted-foreground">
        <BrandMark className="size-11 anim-float" />
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em]">Loading map engine</p>
      </div>
    </div>
  );
}
