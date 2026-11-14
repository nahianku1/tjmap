'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { Check, Loader2, RefreshCw, Route, Trash2, Undo2, WifiOff, X } from 'lucide-react';
import { toast } from 'sonner';
import { Topbar } from '@/components/dashboard/topbar';
import { Sidebar, type DeviceFilter } from '@/components/dashboard/sidebar';
import { MapFab } from '@/components/map/map-fab';
import { MapOverlay } from '@/components/dashboard/map-overlay';
import { OnuDialog } from '@/components/onu/onu-dialog';
import { TjDetailPanel } from '@/components/map/tj-detail-panel';
import { OltDetailPanel } from '@/components/olt/olt-detail-panel';
import { OnuDetailPanel } from '@/components/onu/onu-detail-panel';
import { OltDialog } from '@/components/olt/olt-dialog';
import { TjFormDialog } from '@/components/map/tj-form-dialog';
import { LinkDialog } from '@/components/map/link-dialog';
import { LinkDetailPanel } from '@/components/map/link-detail-panel';
import { ConfirmDialog } from '@/components/map/confirm-dialog';
import { LocationSearch } from '@/components/map/location-search';
import { MapTransferDialog } from '@/components/map/map-transfer-dialog';
import { MapExportDialog } from '@/components/map/map-export-dialog';

import { Button } from '@/components/ui/button';
import { BrandMark } from '@/components/brand';
import { api, ApiError, fetcher } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type {
  Area,
  FibreLink,
  LinkDeviceRef,
  LinkPathPoint,
  Network,
  Olt,
  Onu,
  Tj,
} from '@/lib/types';
import type { MapMode } from '@/components/map/network-map';
import type { SearchResultItem } from '@/lib/geocoding';
import {
  createMapTransfer,
  downloadMapTransfer,
  importMapTransfer,
  mapTransferFilename,
  type MapTransferFile,
} from '@/lib/map-transfer';
import { cn, formatDistance } from '@/lib/utils';

const NetworkMap = dynamic(
  () => import('@/components/map/network-map').then((module) => ({ default: module.NetworkMap })),
  { ssr: false, loading: () => <MapSkeleton /> },
);

const fetchNetwork = (path: string) => fetcher<Network>(path);

interface LinkDialogState {
  from: LinkDeviceRef | null;
  to: LinkDeviceRef | null;
  link: FibreLink | null;
}

function tjToRef(tj: Tj): LinkDeviceRef {
  return { kind: 'tj', id: tj.id, code: tj.code, name: tj.name, lat: tj.lat, lng: tj.lng };
}

function oltToRef(olt: Olt): LinkDeviceRef {
  return {
    kind: 'olt',
    id: olt.id,
    code: olt.code,
    name: olt.name,
    lat: olt.lat ?? undefined,
    lng: olt.lng ?? undefined,
  };
}

function onuToRef(onu: Onu): LinkDeviceRef {
  return {
    kind: 'onu',
    id: onu.id,
    code: onu.fibreId,
    name: onu.username,
    lat: onu.lat ?? undefined,
    lng: onu.lng ?? undefined,
  };
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
  const olts = useMemo(() => data?.olts ?? [], [data]);
  const onus = useMemo(() => data?.onus ?? [], [data]);
  const cutCount = useMemo(() => tjs.filter((tj) => tj.isCut).length, [tjs]);

  const [mode, setMode] = useState<MapMode>('idle');
  const [selectedTjId, setSelectedTjId] = useState<string | null>(null);
  const [selectedLinkId, setSelectedLinkId] = useState<string | null>(null);
  const [selectedOltId, setSelectedOltId] = useState<string | null>(null);
  const [selectedOnuId, setSelectedOnuId] = useState<string | null>(null);
  const [oltForm, setOltForm] = useState<{
    olt: Olt | null;
    point: { lat: number; lng: number } | null;
  } | null>(null);
  const [oltToDelete, setOltToDelete] = useState<Olt | null>(null);
  const [focus, setFocus] = useState<{ lng: number; lat: number; zoom?: number; nonce: number } | null>(null);

  const [filter, setFilter] = useState<DeviceFilter>('all');
  const [search, setSearch] = useState('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const [tjFormOpen, setTjFormOpen] = useState(false);
  const [editingTj, setEditingTj] = useState<Tj | null>(null);
  const [draftPoint, setDraftPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [draftAddress, setDraftAddress] = useState<string | null>(null);
  const [createTjType, setCreateTjType] = useState<'box' | 'cut' | null>(null);
  const [prefillTjCores, setPrefillTjCores] = useState<import('@/lib/types').Core[] | null>(null);
  const [prefillTjFibreId, setPrefillTjFibreId] = useState<string | null>(null);
  const [joinRestoreLink, setJoinRestoreLink] = useState<FibreLink | null>(null);
  const [onuForm, setOnuForm] = useState<{
    onu: Onu | null;
    point: { lat: number; lng: number } | null;
  } | null>(null);
  const [onuToDelete, setOnuToDelete] = useState<Onu | null>(null);
  const [pinnedLocation, setPinnedLocation] = useState<{
    lat: number;
    lng: number;
    title: string;
    subtitle?: string;
  } | null>(null);
  const [linkDialog, setLinkDialog] = useState<LinkDialogState | null>(null);
  const [drawingLink, setDrawingLink] = useState(false);
  const [linkPath, setLinkPath] = useState<LinkPathPoint[]>([]);
  const drawSnapshotRef = useRef<LinkPathPoint[]>([]);
  const [tjToDelete, setTjToDelete] = useState<Tj | null>(null);
  const [linkToDelete, setLinkToDelete] = useState<FibreLink | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  const selectedTj = useMemo(
    () => tjs.find((tj) => tj.id === selectedTjId) ?? null,
    [tjs, selectedTjId],
  );
  const selectedOlt = useMemo(
    () => olts.find((olt) => olt.id === selectedOltId) ?? null,
    [olts, selectedOltId],
  );
  const selectedOnu = useMemo(
    () => onus.find((onu) => onu.id === selectedOnuId) ?? null,
    [onus, selectedOnuId],
  );
  const selectedLink = useMemo(
    () => links.find((link) => link.id === selectedLinkId) ?? null,
    [links, selectedLinkId],
  );

  // Camera for the selected area. It is built from the area's own joints, OLTs and ONUs
  // (the network payload is already filtered by area on the server), so opening an
  // area always frames that area — never the national map and never another
  // district. `bounds` is preferred so the whole area fits; a centre/zoom is only
  // used when the area has no mapped assets yet.
  const initialCamera = useMemo<{
    bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number } | null;
    view: { lat: number; lng: number; zoom: number } | null;
  }>(() => {
    if (!areaId) return { bounds: null, view: null };

    const points: { lat: number; lng: number }[] = [];
    for (const tj of tjs) points.push({ lat: tj.lat, lng: tj.lng });
    for (const olt of olts) {
      if (olt.lat !== null && olt.lng !== null) points.push({ lat: olt.lat, lng: olt.lng });
    }
    for (const onu of onus) {
      if (onu.lat !== null && onu.lng !== null) points.push({ lat: onu.lat, lng: onu.lng });
    }

    if (points.length > 0) {
      const lats = points.map((point) => point.lat);
      const lngs = points.map((point) => point.lng);
      const minLat = Math.min(...lats);
      const maxLat = Math.max(...lats);
      const minLng = Math.min(...lngs);
      const maxLng = Math.max(...lngs);
      // Breathing room so markers are not glued to the edge, and so a single
      // joint still resolves to a sensible street-level zoom.
      const padLat = Math.max((maxLat - minLat) * 0.12, 0.0035);
      const padLng = Math.max((maxLng - minLng) * 0.12, 0.0035);
      return {
        bounds: {
          minLat: minLat - padLat,
          maxLat: maxLat + padLat,
          minLng: minLng - padLng,
          maxLng: maxLng + padLng,
        },
        view: null,
      };
    }

    // No joints or OLTs in this area yet: fall back to the area record itself,
    // then to its own parent district (never another district, never the country).
    if (area?.bounds) return { bounds: area.bounds, view: null };
    if (area && area.lat !== null && area.lng !== null) {
      return { bounds: null, view: { lat: area.lat, lng: area.lng, zoom: area.zoom ?? 13 } };
    }

    const parent = area?.district ?? null;
    if (parent?.bounds) return { bounds: parent.bounds, view: null };
    if (parent && parent.lat !== null && parent.lng !== null) {
      return { bounds: null, view: { lat: parent.lat, lng: parent.lng, zoom: parent.zoom ?? 10 } };
    }

    return { bounds: null, view: null };
  }, [areaId, area, tjs, olts]);

  useEffect(() => {
    if (status === 'anonymous') router.replace('/login');
  }, [status, router]);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      if (drawingLink) {
        setLinkPath(drawSnapshotRef.current);
        setDrawingLink(false);
        return;
      }
      if (mode !== 'idle') {
        setMode('idle');
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [mode, drawingLink]);

  useEffect(() => {
    function handleSidebarKey(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key === 'b') {
        event.preventDefault();
        setSidebarCollapsed((c) => !c);
      }
    }
    window.addEventListener('keydown', handleSidebarKey);
    return () => window.removeEventListener('keydown', handleSidebarKey);
  }, []);

  const focusOn = useCallback((tj: Tj) => {
    setFocus({ lng: tj.lng, lat: tj.lat, zoom: 13.4, nonce: Date.now() });
  }, []);

  const handleSelectTj = useCallback((id: string) => {
    setSelectedTjId(id);
    setSelectedLinkId(null);
    setSelectedOltId(null);
    setSelectedOnuId(null);
  }, []);

  const handleSelectLink = useCallback(
    (id: string) => {
      if (!links.some((item) => item.id === id)) return;
      setSelectedTjId(null);
      setSelectedOltId(null);
      setSelectedOnuId(null);
      setSelectedLinkId(id);
    },
    [links],
  );

  const handleSelectOlt = useCallback((id: string) => {
    setSelectedOltId(id);
    setSelectedTjId(null);
    setSelectedLinkId(null);
    setSelectedOnuId(null);
  }, []);

  const handleSelectOnu = useCallback((id: string) => {
    setSelectedOnuId(id);
    setSelectedTjId(null);
    setSelectedOltId(null);
    setSelectedLinkId(null);
  }, []);

  const handleMapClick = useCallback(
    (point: { lng: number; lat: number }) => {
      if (!isAdmin) {
        toast.error('Viewer seat', { description: 'Only admins can add terminal joints.' });
        setMode('idle');
        return;
      }
      if (mode === 'add-olt') {
        setOltForm({ olt: null, point: { lat: point.lat, lng: point.lng } });
        setSelectedOltId(null);
        setMode('idle');
        return;
      }
      if (mode === 'add-tj') {
        setDraftPoint({ lat: point.lat, lng: point.lng });
        setEditingTj(null);
        setCreateTjType('box');
        setTjFormOpen(true);
        setMode('idle');
        return;
      }
      if (mode === 'add-cut-tj') {
        setDraftPoint({ lat: point.lat, lng: point.lng });
        setEditingTj(null);
        setCreateTjType('cut');
        setTjFormOpen(true);
        setMode('idle');
        return;
      }
      if (mode === 'add-onu') {
        setSelectedOnuId(null);
        setOnuForm({ onu: null, point: { lat: point.lat, lng: point.lng } });
        setMode('idle');
        return;
      }
    },
    [isAdmin, mode],
  );

  const handleBackgroundClick = useCallback(() => {
    if (mode === 'idle') {
      setSelectedLinkId(null);
      setSelectedOltId(null);
      setSelectedOnuId(null);
      setPinnedLocation(null);
    }
  }, [mode]);

  const startAddSplitterTjMode = useCallback(() => {
    if (!isAdmin) return;
    setSelectedTjId(null);
    setMode('add-tj');
    toast.info('Add Splitter TJ', {
      description: area
        ? `Click the map inside ${area.name} to place it.`
        : 'Click the map inside Bangladesh to place it.',
    });
  }, [isAdmin, area]);

  const startAddCutTjMode = useCallback(() => {
    if (!isAdmin) return;
    setSelectedTjId(null);
    setMode('add-cut-tj');
    toast.info('Add Fibre Cut TJ', {
      description: area
        ? `Click the map inside ${area.name} to place the cut joint.`
        : 'Click the map inside Bangladesh to place the cut joint.',
    });
  }, [isAdmin, area]);

  const startAddOltMode = useCallback(() => {
    if (!isAdmin) return;
    setSelectedTjId(null);
    setSelectedOltId(null);
    setMode('add-olt');
    toast.info('Add OLT mode', {
      description: area
        ? `Click where the cabinet sits inside ${area.name}.`
        : 'Click where the OLT cabinet sits on the map.',
    });
  }, [isAdmin, area]);

  const startAddOnuMode = useCallback(() => {
    if (!isAdmin) return;
    setSelectedTjId(null);
    setSelectedOltId(null);
    setSelectedOnuId(null);
    setMode('add-onu');
    toast.info('Add ONU', {
      description: area
        ? `Click the map inside ${area.name} to place the ONU.`
        : 'Click the map inside Bangladesh to place the ONU.',
    });
  }, [isAdmin, area]);

  const startLinkMode = useCallback(() => {
    if (!isAdmin) return;
    const fromRef = selectedOlt ? oltToRef(selectedOlt) : selectedTj ? tjToRef(selectedTj) : null;
    setLinkDialog({ from: fromRef, to: null, link: null });
    setMode('idle');
  }, [isAdmin, selectedOlt, selectedTj]);

  const cancelMode = useCallback(() => {
    setMode('idle');
  }, []);

  const openExport = useCallback(() => {
    if (!data) {
      toast.error('The map is still loading', { description: 'Try exporting again in a moment.' });
      return;
    }
    setExportOpen(true);
  }, [data]);

  const exportMap = useCallback(
    (fileName: string) => {
      if (!data) return;
      const snapshot = createMapTransfer(
        { olts, tjs, links, onus },
        area ? { id: area.id, name: `${area.districtName} · ${area.name}` } : null,
      );
      downloadMapTransfer(snapshot, mapTransferFilename(area?.name ?? null, fileName));
      toast.success('Map exported', {
        description: `${snapshot.olts.length} OLT · ${snapshot.tjs.length} TJ · ${snapshot.onus.length} ONU · ${snapshot.links.length} links`,
      });
    },
    [data, olts, tjs, links, onus, area],
  );

  const importMap = useCallback(
    async (file: MapTransferFile, options: { replace: boolean }) => {
      // Codes are unique across the whole network, so load the full inventory and
      // suffix any imported code/name that is already in use.
      const scope = await api.network();
      const result = await importMapTransfer(
        file,
        areaId ?? null,
        { tjs: scope.tjs, olts: scope.olts },
        {
          replaceExisting: options.replace,
          current: { tjs, olts, onus, links },
        },
      ).catch(async (error: unknown) => {
        // A replace can fail midway; refresh so a retry starts from the real state.
        await mutate();
        throw error;
      });
      await mutate();
      toast.success(options.replace ? 'Map replaced' : 'Map imported', {
        description: `${result.olts} OLT · ${result.tjs} TJ · ${result.onus} ONU · ${result.links} links${result.removed > 0 ? ` · ${result.removed} old device${result.removed === 1 ? '' : 's'} removed` : ''}${result.renamed > 0 ? ` · ${result.renamed} code${result.renamed === 1 ? '' : 's'} adjusted` : ''}${result.skippedLinks > 0 ? ` · ${result.skippedLinks} link${result.skippedLinks === 1 ? '' : 's'} skipped` : ''}`,
      });
    },
    [areaId, tjs, olts, onus, links, mutate],
  );

  // Draw the cable route on the map. The dialog stays mounted (hidden) so the
  // half-filled link form survives the trip to the map and back.
  const startLinkDraw = useCallback(() => {
    drawSnapshotRef.current = linkPath;
    setLinkPath([]);
    setDrawingLink(true);
    toast.info('Draw cable route', {
      description: 'Click the map to add bends, drag a point to adjust it, double-click to finish.',
    });
  }, [linkPath]);

  const cancelLinkDraw = useCallback(() => {
    setLinkPath(drawSnapshotRef.current);
    setDrawingLink(false);
  }, []);

  const finishLinkDraw = useCallback(() => {
    setDrawingLink(false);
    toast.success('Route captured', {
      description:
        linkPath.length > 0
          ? `${linkPath.length} bend${linkPath.length === 1 ? '' : 's'} on this link.`
          : 'No bends drawn — the link will render as a straight line.',
    });
  }, [linkPath.length]);

  const handleDrawPoint = useCallback((point: { lat: number; lng: number }) => {
    setLinkPath((current) => {
      // A double-click produces two clicks at the same spot; keep one bend.
      const last = current[current.length - 1];
      if (last && Math.abs(last.lat - point.lat) < 1e-5 && Math.abs(last.lng - point.lng) < 1e-5) {
        return current;
      }
      return [...current, point];
    });
  }, []);

  const handleMoveDrawPoint = useCallback(
    (index: number, point: { lat: number; lng: number }) => {
      setLinkPath((current) => current.map((item, i) => (i === index ? point : item)));
    },
    [],
  );

  const handleLocationSelect = useCallback(
    (item: SearchResultItem) => {
      setPinnedLocation({ lat: item.lat, lng: item.lng, title: item.title, subtitle: item.subtitle });
      setFocus({
        lng: item.lng,
        lat: item.lat,
        zoom: item.type === 'tj' ? 15 : 14,
        nonce: Date.now(),
      });
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
      setCreateTjType('box');
      setTjFormOpen(true);
      setPinnedLocation(null);
    },
    [],
  );

  const handleAddOltAtPinnedLocation = useCallback(
    (point: { lat: number; lng: number; address: string }) => {
      setOltForm({ olt: null, point: { lat: point.lat, lng: point.lng } });
      setPinnedLocation(null);
    },
    [],
  );

  const handleTjSaved = useCallback(
    async (saved: Tj) => {
      setSelectedTjId(saved.id);
      setEditingTj(null);
      setDraftPoint(null);
      setPrefillTjCores(null);
      setPrefillTjFibreId(null);

      const linkToRestore = joinRestoreLink;
      setJoinRestoreLink(null);
      if (linkToRestore) {
        try {
          const updated = await api.updateLink(linkToRestore.id, { status: 'active' });
          toast.success(`Link ${updated.fibreId} restored`, {
            description: 'Cores joined and the link is back in service.',
          });
          setSelectedLinkId(updated.id);
        } catch (err) {
          toast.error(err instanceof ApiError ? err.message : 'Cores saved, but could not auto-restore the link.');
        }
      }

      await mutate();
    },
    [mutate, joinRestoreLink],
  );

  const handleDeviceMove = useCallback(
    async (move: { kind: 'tj' | 'olt' | 'onu'; id: string; lat: number; lng: number }) => {
      const deviceCode =
        move.kind === 'tj'
          ? tjs.find((item) => item.id === move.id)?.code
          : move.kind === 'olt'
            ? olts.find((item) => item.id === move.id)?.code
            : onus.find((item) => item.id === move.id)?.username;
      try {
        if (move.kind === 'tj') {
          await api.updateTj(move.id, { lat: move.lat, lng: move.lng });
        } else if (move.kind === 'olt') {
          await api.updateOlt(move.id, { lat: move.lat, lng: move.lng });
        } else {
          await api.updateOnu(move.id, { lat: move.lat, lng: move.lng });
        }

        // Lengths are stored on the link; touching each attached span recomputes
        // it against the device's new coordinates on the server.
        const attached = links.filter(
          (link) =>
            (move.kind === 'tj' &&
              (link.fromTjId === move.id || link.toTjId === move.id)) ||
            (move.kind === 'olt' &&
              (link.fromOltId === move.id || link.toOltId === move.id)) ||
            (move.kind === 'onu' &&
              (link.fromOnuId === move.id || link.toOnuId === move.id)),
        );
        await Promise.all(attached.map((link) => api.updateLink(link.id, { path: link.path })));

        await mutate();
        toast.success(`${deviceCode ?? 'Device'} moved`, {
          description: 'Coordinates and fibre lengths updated.',
        });
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : 'Could not move this device');
        await mutate();
      }
    },
    [tjs, olts, onus, links, mutate],
  );

  const handleMoveLinkPath = useCallback(
    async (id: string, path: { lat: number; lng: number }[]) => {
      try {
        const updated = await api.updateLink(id, { path });
        await mutate();
        toast.success(`Link ${updated.fibreId} rerouted`, {
          description: `${formatDistance(updated.lengthM)} of fibre.`,
        });
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : 'Could not move this link');
        await mutate();
      }
    },
    [mutate],
  );

  const handleLinkSaved = useCallback(
    async (saved: FibreLink) => {
      // A link into a TJ's feed core is that joint's input cable, so carry its
      // fibre ID onto the joint without making the user retype it.
      const sides = [
        { tjId: saved.fromTjId, side: 'from' as const },
        { tjId: saved.toTjId, side: 'to' as const },
      ];
      for (const { tjId, side } of sides) {
        if (!tjId) continue;
        const tj = tjs.find((item) => item.id === tjId);
        if (!tj || tj.fibreId === saved.fibreId) continue;
        const localCores = (saved.cores ?? [])
          .map((core) => (side === 'from' ? core.fromCoreLabel : core.toCoreLabel))
          .filter((label): label is string => Boolean(label));
        const direct = side === 'from' ? saved.fromCoreLabel : saved.toCoreLabel;
        if (direct && !localCores.includes(direct)) localCores.push(direct);
        const feed = tj.splitter?.enabled ? tj.splitter.inputCoreLabel : null;
        // With no core labels on the link there is nothing to compare, so the
        // cable attached to the joint is still taken as its input fibre.
        const shouldAssign = feed
          ? localCores.length === 0 || localCores.includes(feed)
          : !tj.fibreId || localCores.length === 0;
        if (!shouldAssign) continue;
        try {
          await api.updateTj(tj.id, { fibreId: saved.fibreId });
        } catch {
          // The link itself is saved; failing to sync the label must not undo it.
        }
      }
      setSelectedLinkId(saved.id);
      await mutate();
    },
    [mutate, tjs],
  );

  const handleLinkFrom = useCallback((tj: Tj) => {
    setLinkDialog({ from: tjToRef(tj), to: null, link: null });
  }, []);

  const handleLinkFromOlt = useCallback((olt: Olt) => {
    setLinkDialog({ from: oltToRef(olt), to: null, link: null });
  }, []);

  const handleLinkFromOnu = useCallback((onu: Onu) => {
    setLinkDialog({ from: onuToRef(onu), to: null, link: null });
  }, []);

  async function confirmDeleteTj() {
    if (!tjToDelete) return;
    setDeleting(true);
    try {
      await api.deleteTj(tjToDelete.id);
      toast.success(`${tjToDelete.code} deleted`, { description: 'Its links were removed too.' });
      if (selectedTjId === tjToDelete.id) setSelectedTjId(null);
      setTjToDelete(null);
      await mutate();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not delete this joint');
    } finally {
      setDeleting(false);
    }
  }

  async function confirmDeleteOnu() {
    if (!onuToDelete) return;
    setDeleting(true);
    try {
      await api.deleteOnu(onuToDelete.id);
      toast.success(`${onuToDelete.username} deleted`);
      if (selectedOnuId === onuToDelete.id) setSelectedOnuId(null);
      setOnuToDelete(null);
      await mutate();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not delete this ONU');
    } finally {
      setDeleting(false);
    }
  }

  async function confirmDeleteLink() {
    if (!linkToDelete) return;
    setDeleting(true);
    try {
      await api.deleteLink(linkToDelete.id);
      toast.success(`Link ${linkToDelete.fibreId} deleted`, {
        description: 'Its cores are free again on both devices.',
      });
      if (selectedLinkId === linkToDelete.id) setSelectedLinkId(null);
      setLinkToDelete(null);
      await mutate();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not delete this link');
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
          contextLabel={area ? `${area.districtName} · ${area.name}` : undefined}
          sidebarOpen={!sidebarCollapsed}
          onToggleSidebar={() => setSidebarCollapsed((c) => !c)}
          onExportMap={openExport}
          onImportMap={isAdmin ? () => setTransferOpen(true) : undefined}
          back={
            areaId
              ? { href: area ? `/districts/${area.districtId}` : '/', label: area ? area.districtName : 'Districts' }
              : undefined
          }
        />

        <div className="flex min-h-0 flex-1">
          <aside
            className={cn(
              'hidden shrink-0 border-r border-white/40 lg:flex lg:flex-col overflow-hidden transition-all duration-300 ease-in-out dark:border-white/[0.06]',
              sidebarCollapsed ? 'lg:w-0 lg:border-r-0' : 'lg:w-[330px]',
            )}
          >
            <Sidebar
              tjs={tjs}
              olts={olts}
              onus={onus}
              links={links}
              loading={isLoading}
              selectedId={selectedTjId}
              selectedLinkId={selectedLinkId}
              selectedOltId={selectedOltId}
              selectedOnuId={selectedOnuId}
              filter={filter}
              search={search}
              onSearchChange={setSearch}
              onFilterChange={setFilter}
              onSelect={(tj) => handleSelectTj(tj.id)}
              onSelectOlt={(olt) => handleSelectOlt(olt.id)}
              onSelectOnu={(onu) => handleSelectOnu(onu.id)}
              onSelectLink={(link) => handleSelectLink(link.id)}
            />
          </aside>

          <main className="relative min-h-0 min-w-0 flex-1">
            <NetworkMap
              tjs={tjs}
              links={links}
              olts={olts}
              onus={onus}
              onSelectOlt={handleSelectOlt}
              onSelectOnu={handleSelectOnu}
              mode={drawingLink ? 'draw-link' : mode}
              drawPath={drawingLink ? linkPath : []}
              onDrawPoint={handleDrawPoint}
              onMoveDrawPoint={handleMoveDrawPoint}
              onFinishDraw={finishLinkDraw}
              selectedTjId={selectedTjId}
              selectedLinkId={selectedLinkId}
              focus={focus}
              viewReady={!areaId || Boolean(area) || Boolean(data) || Boolean(error)}
              initialView={initialCamera.view}
              initialBounds={initialCamera.bounds}
              cameraScope={areaId ?? 'national'}
              onSelectTj={handleSelectTj}
              onSelectLink={handleSelectLink}
              onMapClick={handleMapClick}
              onBackgroundClick={handleBackgroundClick}
              pinnedLocation={pinnedLocation}
              onClearPinnedLocation={handleClearPinnedLocation}
              onAddTjAtPinnedLocation={handleAddTjAtPinnedLocation}
              onAddOltAtPinnedLocation={handleAddOltAtPinnedLocation}
              canMoveDevices={isAdmin}
              onMoveDevice={handleDeviceMove}
              onMoveLinkPath={handleMoveLinkPath}
            />

            <LocationSearch
              tjs={tjs}
              onSelectLocation={handleLocationSelect}
              onClearPinned={handleClearPinnedLocation}
              activePinned={pinnedLocation ? { title: pinnedLocation.title } : null}
            />



            <MapOverlay
              mode={mode}
              tjs={tjs}
              links={links}
              onCancelMode={cancelMode}
            />

            {drawingLink ? (
              <div className="pointer-events-none absolute inset-x-0 top-4 z-30 flex justify-center px-4">
                <div className="pointer-events-auto flex w-full max-w-2xl flex-wrap items-center gap-2 rounded-2xl border border-white/60 bg-background/95 p-2.5 shadow-xl backdrop-blur dark:border-white/10">
                  <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                    <Route className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">
                      Drawing cable route
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {linkPath.length} bend{linkPath.length === 1 ? '' : 's'} · click the map to add · drag a
                      point to adjust · double-click to finish
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={linkPath.length === 0}
                      onClick={() => setLinkPath((current) => current.slice(0, -1))}
                    >
                      <Undo2 className="size-3.5" />
                      Undo
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={linkPath.length === 0}
                      onClick={() => setLinkPath([])}
                    >
                      <Trash2 className="size-3.5" />
                      Clear
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={cancelLinkDraw}>
                      <X className="size-3.5" />
                      Cancel
                    </Button>
                    <Button type="button" size="sm" onClick={finishLinkDraw}>
                      <Check className="size-3.5" />
                      Done
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}

            {drawingLink ? null : (
              <MapFab
                isAdmin={isAdmin}
                mode={mode}
                onAddSplitterTj={startAddSplitterTjMode}
                onAddCutTj={startAddCutTjMode}
                onAddOlt={startAddOltMode}
                onAddLink={startLinkMode}
                onAddOnu={startAddOnuMode}
              />
            )}

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


          </main>
        </div>
      </div>



      <LinkDetailPanel
        link={selectedLink}
        isAdmin={isAdmin}
        onClose={() => setSelectedLinkId(null)}
        onEdit={(link) => {
          setSelectedLinkId(null);
          setLinkDialog({ from: null, to: null, link });
        }}
        onCut={async (link) => {
          try {
            const updated = await api.updateLink(link.id, { status: 'cut' });
            toast.success(`Link ${updated.fibreId} marked as cut`, {
              description: 'Use Join to open the fibre cut modal, join cores, and restore it.',
            });
            await mutate();
          } catch (err) {
            toast.error(err instanceof ApiError ? err.message : 'Could not mark this link as cut');
          }
        }}
        onJoin={(link) => {
          const points = [
            { lat: link.fromLat, lng: link.fromLng },
            ...(link.path ?? []),
            { lat: link.toLat, lng: link.toLng },
          ];
          let midLat = (link.fromLat + link.toLat) / 2;
          let midLng = (link.fromLng + link.toLng) / 2;
          if (points.length >= 2) {
            const segs: number[] = [];
            let total = 0;
            for (let i = 0; i < points.length - 1; i++) {
              const dLat = points[i + 1].lat - points[i].lat;
              const midLatRad = ((points[i].lat + points[i + 1].lat) / 2) * (Math.PI / 180);
              const dLng = (points[i + 1].lng - points[i].lng) * Math.cos(midLatRad);
              const d = Math.sqrt(dLat * dLat + dLng * dLng);
              segs.push(d);
              total += d;
            }
            if (total > 0) {
              let target = total / 2;
              for (let i = 0; i < segs.length; i++) {
                if (target <= segs[i] || i === segs.length - 1) {
                  const t = segs[i] === 0 ? 0 : target / segs[i];
                  midLat = points[i].lat + (points[i + 1].lat - points[i].lat) * t;
                  midLng = points[i].lng + (points[i + 1].lng - points[i].lng) * t;
                  break;
                }
                target -= segs[i];
              }
            }
          }

          const palette = ['#22d3ee','#34d399','#a78bfa','#fbbf24','#fb7185','#60a5fa','#a3e635','#fb923c'];
          const cores = (link.cores?.length ? link.cores : Array.from({ length: link.coreCount || 0 }, (_, i) => ({ label: `Core ${i + 1}`, color: palette[i % palette.length] }))).map((c, i) => ({
            label: c.label || `Core ${i + 1}`,
            color: c.color || palette[i % palette.length],
            count: 1,
            status: 'damaged' as const,
          }));
          setJoinRestoreLink(link);
          setSelectedLinkId(null);
          setDraftPoint({ lat: midLat, lng: midLng });
          setDraftAddress(`Cut repair · ${link.fibreId} (${link.fromCode} → ${link.toCode})`);
          setEditingTj(null);
          setCreateTjType('cut');
          setPrefillTjCores(cores);
          setPrefillTjFibreId(link.fibreId);
          setTjFormOpen(true);
        }}
        onDelete={(link) => {
          setSelectedLinkId(null);
          setLinkToDelete(link);
        }}
      />

      <OltDetailPanel
        olt={selectedOlt}
        links={links}
        isAdmin={isAdmin}
        onClose={() => setSelectedOltId(null)}
        onEdit={(olt) => setOltForm({ olt, point: null })}
        onLinkFrom={handleLinkFromOlt}
        onSelectLink={(link) => handleSelectLink(link.id)}
        onDelete={(olt) => setOltToDelete(olt)}
      />

      <OltDialog
        open={Boolean(oltForm)}
        onOpenChange={(open) => {
          if (!open) setOltForm(null);
        }}
        olt={oltForm?.olt ?? null}
        draftPoint={oltForm?.point ?? null}
        defaultAreaId={areaId ?? null}
        onSaved={async (saved) => {
          setOltForm(null);
          setSelectedOltId(saved.id);
          await mutate();
        }}
      />

      <MapExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        defaultFileName={mapTransferFilename(area?.name ?? null)}
        counts={{ olts: olts.length, tjs: tjs.length, onus: onus.length, links: links.length }}
        onExport={exportMap}
      />

      <MapTransferDialog
        open={transferOpen}
        onOpenChange={setTransferOpen}
        targetLabel={area ? `${area.districtName} · ${area.name}` : null}
        targetAreaId={areaId ?? null}
        currentCounts={{
          olts: olts.length,
          tjs: tjs.length,
          onus: onus.length,
          links: links.length,
        }}
        onImport={importMap}
      />

      <OnuDetailPanel
        onu={selectedOnu}
        tjs={tjs}
        olts={olts}
        links={links}
        isAdmin={isAdmin}
        onClose={() => setSelectedOnuId(null)}
        onEdit={(onu) => setOnuForm({ onu, point: null })}
        onLinkFrom={handleLinkFromOnu}
        onSelectLink={(link) => handleSelectLink(link.id)}
        onDelete={(onu) => setOnuToDelete(onu)}
      />

      <TjDetailPanel
        tj={selectedTj}
        tjs={tjs}
        olts={olts}
        links={links}
        isAdmin={isAdmin}
        onClose={() => setSelectedTjId(null)}
        onEdit={(tj) => {
          setEditingTj(tj);
          setTjFormOpen(true);
        }}
        onDelete={(tj) => setTjToDelete(tj)}
        onLinkFrom={handleLinkFrom}
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
            setCreateTjType(null);
            setPrefillTjCores(null);
            setPrefillTjFibreId(null);
            setJoinRestoreLink(null);
          }
        }}
        initial={editingTj}
        draftPoint={draftPoint}
        draftAddress={draftAddress}
        defaultAreaId={areaId ?? null}
        createTjType={createTjType}
        prefillCores={prefillTjCores}
        prefillFibreId={prefillTjFibreId}
        tjs={tjs}
        olts={olts}
        links={links}
        onSaved={handleTjSaved}
      />

      <LinkDialog
        open={Boolean(linkDialog)}
        onOpenChange={(open) => {
          if (!open) {
            setLinkDialog(null);
            setDrawingLink(false);
            setLinkPath([]);
          }
        }}
        tjs={tjs}
        olts={olts}
        onus={onus}
        links={links}
        from={linkDialog?.from ?? null}
        to={linkDialog?.to ?? null}
        link={linkDialog?.link ?? null}
        path={linkPath}
        onPathChange={setLinkPath}
        onStartDraw={startLinkDraw}
        drawing={drawingLink}
        onSaved={handleLinkSaved}
        onRequestDelete={(link) => {
          setLinkDialog(null);
          setLinkToDelete(link);
        }}
      />

      <ConfirmDialog
        open={Boolean(oltToDelete)}
        onOpenChange={(open) => {
          if (!open) setOltToDelete(null);
        }}
        title={`Delete ${oltToDelete?.name ?? 'OLT'}?`}
        description="The OLT is removed and its joints keep their location but lose the OLT link."
        confirmLabel="Delete OLT"
        loading={deleting}
        onConfirm={async () => {
          if (!oltToDelete) return;
          setDeleting(true);
          try {
            await api.deleteOlt(oltToDelete.id);
            toast.success(`${oltToDelete.name} deleted`);
            setSelectedOltId(null);
            setOltToDelete(null);
            await mutate();
          } catch (err) {
            toast.error(err instanceof ApiError ? err.message : 'Could not delete this OLT');
          } finally {
            setDeleting(false);
          }
        }}
      />

      <OnuDialog
        open={Boolean(onuForm)}
        onOpenChange={(open) => {
          if (!open) setOnuForm(null);
        }}
        onu={onuForm?.onu ?? null}
        draftPoint={onuForm?.point ?? null}
        defaultAreaId={areaId ?? null}
        onSaved={async (saved) => {
          setOnuForm(null);
          setSelectedOnuId(saved.id);
          await mutate();
        }}
      />

      <ConfirmDialog
        open={Boolean(onuToDelete)}
        onOpenChange={(open) => {
          if (!open) setOnuToDelete(null);
        }}
        title={`Delete ${onuToDelete?.username ?? 'ONU'}?`}
        description="The ONU is removed from the map and its service area."
        confirmLabel="Delete ONU"
        loading={deleting}
        onConfirm={confirmDeleteOnu}
      />

      <ConfirmDialog
        open={Boolean(tjToDelete)}
        onOpenChange={(open) => {
          if (!open) setTjToDelete(null);
        }}
        title={`Delete ${tjToDelete?.code ?? 'joint'}?`}
        description="This removes the terminal joint and every fibre link attached to it. This cannot be undone."
        confirmLabel="Delete joint"
        loading={deleting}
        onConfirm={confirmDeleteTj}
      />

      <ConfirmDialog
        open={Boolean(linkToDelete)}
        onOpenChange={(open) => {
          if (!open) setLinkToDelete(null);
        }}
        title={`Delete link ${linkToDelete?.fibreId ?? ''}?`}
        description="The fibre is removed and every core it connected becomes free again on both devices."
        confirmLabel="Delete link"
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
