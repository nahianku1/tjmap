'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { Cable, Loader2, RefreshCw, Trash2, Undo2, WifiOff, X } from 'lucide-react';
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
import { LinkTypeDialog } from '@/components/map/link-type-dialog';
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
  DeviceKind,
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
import { routeLengthMeters } from '@/lib/route';
import { devicePorts } from '@/lib/device-ports';
import type { FibreCableType } from '@/lib/fibre-cores';

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

  // The map works against local device/link state so an optimistic move can be
  // applied and kept. SWR data is copied in whenever a fresh payload arrives.
  const [localTjs, setLocalTjs] = useState<Tj[]>(data?.tjs ?? []);
  const [localOlts, setLocalOlts] = useState<Olt[]>(data?.olts ?? []);
  const [localOnus, setLocalOnus] = useState<Onu[]>(data?.onus ?? []);
  const [localLinks, setLinks] = useState<FibreLink[]>(data?.links ?? []);
  const tjs = localTjs;
  const olts = localOlts;
  const onus = localOnus;
  const links = localLinks;
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
  // Map connection tool: click device → pick port → click far device → pick port.
  const [connectFrom, setConnectFrom] = useState<{ ref: LinkDeviceRef; port: string } | null>(null);
  const [connectTarget, setConnectTarget] = useState<LinkDeviceRef | null>(null);
  const [connectBends, setConnectBends] = useState<LinkPathPoint[]>([]);
  /** Ports picked on the map, still to be confirmed in the cable form. */
  const [linkDialogPorts, setLinkDialogPorts] = useState<{ from: string; to: string } | null>(null);
  const [linkDialogInitialPath, setLinkDialogInitialPath] = useState<LinkPathPoint[] | null>(null);
  /** Cable construction picker opened before the map picks ports. */
  const [linkTypePicker, setLinkTypePicker] = useState<{ ref: LinkDeviceRef | null } | null>(null);
  const [connectFibreType, setConnectFibreType] = useState<FibreCableType>('tube');
  const connecting = mode === 'connect';
  const [linkPath, setLinkPath] = useState<LinkPathPoint[]>([]);
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
  // A fibre connected to the ONU being edited owns its fibre ID, so that field
  // stays read-only while the cable is attached.
  const onuFormLinkedFibreId = useMemo(() => {
    const onuId = onuForm?.onu?.id;
    if (!onuId) return null;
    const link = links.find((item) => item.fromOnuId === onuId || item.toOnuId === onuId);
    return link?.fibreId ?? null;
  }, [links, onuForm]);

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
      if (mode === 'connect') {
        setConnectFrom(null);
        setConnectTarget(null);
        setConnectBends([]);
        setMode('idle');
        return;
      }
      if (mode !== 'idle') {
        setMode('idle');
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [mode]);

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

  // Mirror fresh server payloads into the local state the map renders from.
  useEffect(() => {
    setLocalTjs(data?.tjs ?? []);
    setLocalOlts(data?.olts ?? []);
    setLocalOnus(data?.onus ?? []);
    setLinks(data?.links ?? []);
  }, [data]);

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

  /**
   * Enter the map connection tool: no dialog, ports are picked in a popover on
   * each device and clicks on the map draw the cable's polygon route.
   */
  const startConnect = useCallback(
    (ref?: LinkDeviceRef | null) => {
      if (!isAdmin) {
        toast.error('Viewer seat', { description: 'Only admins can connect fibre.' });
        return;
      }
      setSelectedTjId(null);
      setSelectedOltId(null);
      setSelectedOnuId(null);
      setSelectedLinkId(null);
      setConnectFrom(null);
      setConnectBends([]);
      setConnectTarget(ref ?? null);
      setMode('connect');
      toast.info(ref ? `Connect ${ref.code}` : 'Connect a cable', {
        description: ref
          ? 'Pick a free port on this device, then click the far device and pick its port.'
          : 'Click a device and pick a port, then click the far device. Click empty map to bend the route.',
      });
    },
    [isAdmin],
  );

  /** Ask which cable construction to build before any port is picked. */
  const requestLink = useCallback(
    (ref: LinkDeviceRef | null) => {
      if (!isAdmin) {
        toast.error('Viewer seat', { description: 'Only admins can connect fibre.' });
        return;
      }
      setLinkTypePicker({ ref });
    },
    [isAdmin],
  );

  const startLinkMode = useCallback(() => {
    requestLink(null);
  }, [requestLink]);

  const chooseLinkType = useCallback(
    (type: FibreCableType) => {
      const ref = linkTypePicker?.ref ?? null;
      setLinkTypePicker(null);
      setConnectFibreType(type);
      startConnect(ref);
    },
    [linkTypePicker, startConnect],
  );

  const cancelConnect = useCallback(() => {
    setMode('idle');
    setConnectFrom(null);
    setConnectTarget(null);
    setConnectBends([]);
  }, []);

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

  const handleLocationSelect = useCallback(
    (item: SearchResultItem) => {
      setPinnedLocation({ lat: item.lat, lng: item.lng, title: item.title, subtitle: item.subtitle });
      const isDevice = item.type === 'tj' || item.type === 'olt' || item.type === 'onu';
      setFocus({
        lng: item.lng,
        lat: item.lat,
        zoom: isDevice ? 15 : 14,
        nonce: Date.now(),
      });
      if (item.type === 'tj' && item.tjId) {
        setSelectedTjId(item.tjId);
        setSelectedLinkId(null);
        setSelectedOltId(null);
        setSelectedOnuId(null);
      } else if (item.type === 'olt' && item.oltId) {
        setSelectedOltId(item.oltId);
        setSelectedTjId(null);
        setSelectedLinkId(null);
        setSelectedOnuId(null);
      } else if (item.type === 'onu' && item.onuId) {
        setSelectedOnuId(item.onuId);
        setSelectedTjId(null);
        setSelectedOltId(null);
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

  const handleAddOnuAtPinnedLocation = useCallback(
    (point: { lat: number; lng: number; address: string }) => {
      setSelectedOnuId(null);
      setOnuForm({ onu: null, point: { lat: point.lat, lng: point.lng } });
      setPinnedLocation(null);
    },
    [],
  );

  /**
   * Keep the URL on the area a device was just saved into, so reloading the page
   * reopens that area instead of falling back to the national map.
   */
  const focusDeviceArea = useCallback(
    (deviceAreaId?: string | null) => {
      if (!deviceAreaId || deviceAreaId === areaId) return;
      router.push(`/areas/${deviceAreaId}`);
    },
    [areaId, router],
  );

  const handleTjSaved = useCallback(
    async (saved: Tj) => {
      const wasNewJoint = !editingTj;
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
      if (wasNewJoint) focusDeviceArea(saved.areaId);
    },
    [mutate, joinRestoreLink, editingTj, focusDeviceArea],
  );

  const handleDeviceMove = useCallback(
    async (move: { kind: 'tj' | 'olt' | 'onu'; id: string; lat: number; lng: number }) => {
      const deviceCode =
        move.kind === 'tj'
          ? tjs.find((item) => item.id === move.id)?.code
          : move.kind === 'olt'
            ? olts.find((item) => item.id === move.id)?.code
            : onus.find((item) => item.id === move.id)?.username;

      const endpointFor = (link: FibreLink, side: 'from' | 'to') => {
        if (side === 'from') {
          if (link.fromTjId) return { kind: 'tj' as const, id: link.fromTjId };
          if (link.fromOltId) return { kind: 'olt' as const, id: link.fromOltId };
          if (link.fromOnuId) return { kind: 'onu' as const, id: link.fromOnuId };
          return null;
        }
        if (link.toTjId) return { kind: 'tj' as const, id: link.toTjId };
        if (link.toOltId) return { kind: 'olt' as const, id: link.toOltId };
        if (link.toOnuId) return { kind: 'onu' as const, id: link.toOnuId };
        return null;
      };

      // Only the device the user dragged changes place; everything else on the
      // map stays where it is and its spans are re-terminated onto the new spot.
      const movedDevices = new Map<
        string,
        { kind: DeviceKind; id: string; lat: number; lng: number }
      >();
      movedDevices.set(`${move.kind}:${move.id}`, {
        kind: move.kind,
        id: move.id,
        lat: move.lat,
        lng: move.lng,
      });

      const movedFor = (link: FibreLink, side: 'from' | 'to') => {
        const endpoint = endpointFor(link, side);
        return endpoint ? movedDevices.get(`${endpoint.kind}:${endpoint.id}`) ?? null : null;
      };

      // Re-anchor a span against the moved endpoint, keeping its drawn bends.
      const withMovedDevices = (link: FibreLink): FibreLink => {
        const from = movedFor(link, 'from');
        const to = movedFor(link, 'to');
        if (!from && !to) return link;
        const fromLat = from?.lat ?? link.fromLat;
        const fromLng = from?.lng ?? link.fromLng;
        const toLat = to?.lat ?? link.toLat;
        const toLng = to?.lng ?? link.toLng;
        const path = link.path;
        return {
          ...link,
          fromLat,
          fromLng,
          toLat,
          toLng,
          path,
          lengthM: routeLengthMeters(fromLat, fromLng, toLat, toLng, path),
        };
      };

      const previousTjs = tjs;
      const previousOlts = olts;
      const previousOnus = onus;
      const previousLinks = links;

      // Apply the move on screen first; it must never wait on a refetch.
      setLocalTjs((current) =>
        current.map((tj) => {
          const moved = movedDevices.get(`tj:${tj.id}`);
          return moved ? { ...tj, lat: moved.lat, lng: moved.lng } : tj;
        }),
      );
      setLocalOlts((current) =>
        current.map((olt) => {
          const moved = movedDevices.get(`olt:${olt.id}`);
          return moved ? { ...olt, lat: moved.lat, lng: moved.lng } : olt;
        }),
      );
      setLocalOnus((current) =>
        current.map((onu) => {
          const moved = movedDevices.get(`onu:${onu.id}`);
          return moved ? { ...onu, lat: moved.lat, lng: moved.lng } : onu;
        }),
      );
      const nextLinks = links.map(withMovedDevices);
      setLinks(nextLinks);

      try {
        // 1. Save the new coordinates for the dragged device and every device
        //    wired to it, which travelled by the same offset.
        await Promise.all(
          [...movedDevices.values()].map((device) =>
            device.kind === 'tj'
              ? api.updateTj(device.id, { lat: device.lat, lng: device.lng })
              : device.kind === 'olt'
                ? api.updateOlt(device.id, { lat: device.lat, lng: device.lng })
                : api.updateOnu(device.id, { lat: device.lat, lng: device.lng }),
          ),
        );

        // 2. Persist every span whose endpoint moved so the server recomputes and
        //    stores its fibre length from the new coordinates.
        const affected = nextLinks.filter(
          (link) => movedFor(link, 'from') || movedFor(link, 'to'),
        );
        const savedLinks = await Promise.all(
          affected.map((link) => api.updateLink(link.id, { path: link.path })),
        );

        // Keep the server's recalculated spans (length + endpoint values).
        if (savedLinks.length > 0) {
          const savedById = new Map(savedLinks.map((link) => [link.id, link]));
          setLinks((current) => current.map((item) => savedById.get(item.id) ?? item));
        }

        toast.success(`${deviceCode ?? 'Device'} moved`, {
          id: 'device-move',
          description: `Saved the new position and ${affected.length} fibre length${
            affected.length === 1 ? '' : 's'
          }.`,
        });
      } catch (err) {
        // Nothing was saved, so put the map back exactly where it was.
        setLocalTjs(previousTjs);
        setLocalOlts(previousOlts);
        setLocalOnus(previousOnus);
        setLinks(previousLinks);
        toast.error(err instanceof ApiError ? err.message : 'Could not save this device move');
      }
    },
    [tjs, olts, onus, links],
  );

  const handleMoveLinkPath = useCallback(
    async (id: string, path: { lat: number; lng: number }[]) => {
      const previousLinks = links;

      // Apply the new route and its recomputed length immediately.
      setLinks((current) =>
        current.map((link) =>
          link.id === id
            ? {
                ...link,
                path,
                lengthM: routeLengthMeters(
                  link.fromLat,
                  link.fromLng,
                  link.toLat,
                  link.toLng,
                  path,
                ),
              }
            : link,
        ),
      );

      try {
        const updated = await api.updateLink(id, { path });
        setLinks((current) => current.map((item) => (item.id === id ? updated : item)));
        toast.success(`Link ${updated.fibreId} rerouted`, {
          id: 'link-route-move',
          description: `${formatDistance(updated.lengthM)} of fibre.`,
        });
      } catch (err) {
        setLinks(previousLinks);
        toast.error(err instanceof ApiError ? err.message : 'Could not save this route');
      }
    },
    [links],
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

      // The cable linked to an ONU is that subscriber's drop fibre, so the ONU
      // takes the link's fibre ID instead of keeping a stale or blank value.
      const onuIds = [
        saved.fromKind === 'onu' ? saved.fromOnuId : null,
        saved.toKind === 'onu' ? saved.toOnuId : null,
      ];
      for (const onuId of onuIds) {
        if (!onuId) continue;
        const onu = onus.find((item) => item.id === onuId);
        if (!onu || onu.fibreId === saved.fibreId) continue;
        try {
          await api.updateOnu(onuId, { fibreId: saved.fibreId });
        } catch {
          // The link itself is saved; failing to sync the label must not undo it.
        }
      }

      setSelectedLinkId(saved.id);
      await mutate();
    },
    [mutate, tjs, onus],
  );

  /**
   * Port picked in the connection popover. The first end arms the cable; the
   * second opens the cable form with both ports filled in, so the fibre ID,
   * tubes and optical parameters are set before anything is saved.
   */
  const handlePickConnectPort = useCallback(
    (port: string) => {
      const target = connectTarget;
      if (!target) return;
      const targetPorts = devicePorts(target.kind, target.id, { tjs, olts, onus });
      if (!targetPorts.some((entry) => entry.label === port)) return;

      if (!connectFrom) {
        setConnectFrom({ ref: target, port });
        setConnectTarget(null);
        toast.success(`From ${target.code} · ${port}`, {
          description: 'Now click the device at the far end and pick its port.',
        });
        return;
      }

      if (connectFrom.ref.kind === target.kind && connectFrom.ref.id === target.id) {
        setConnectFrom({ ref: target, port });
        setConnectTarget(null);
        toast.info(`From port set to ${port}`, { description: 'Now click the far device.' });
        return;
      }

      // Both ends are chosen: hand them to the cable form instead of saving now.
      const fromRef = connectFrom.ref;
      const fromPort = connectFrom.port;
      const bends = connectBends;
      setMode('idle');
      setConnectFrom(null);
      setConnectTarget(null);
      setConnectBends([]);
      setLinkDialogInitialPath(bends);
      setLinkDialogPorts({ from: fromPort, to: port });
      setLinkDialog({ from: fromRef, to: target, link: null });
      toast.info('Name the new cable', {
        description: `${fromRef.code} ${fromPort} → ${target.code} ${port}. Set its fibre ID, tubes and optical parameters, then create it.`,
      });
    },
    [connectTarget, connectFrom, connectBends, tjs, olts, onus],
  );

  const handleLinkFrom = useCallback(
    (tj: Tj) => {
      requestLink(tjToRef(tj));
    },
    [requestLink],
  );

  const handleLinkFromOlt = useCallback(
    (olt: Olt) => {
      requestLink(oltToRef(olt));
    },
    [requestLink],
  );

  const handleLinkFromOnu = useCallback(
    (onu: Onu) => {
      requestLink(onuToRef(onu));
    },
    [requestLink],
  );

  /** Resolve a map marker click back to the device record it stands for. */
  const deviceRef = useCallback(
    ({ kind, id }: { kind: DeviceKind; id: string }): LinkDeviceRef | null => {
      if (kind === 'tj') {
        const tj = tjs.find((item) => item.id === id);
        return tj ? tjToRef(tj) : null;
      }
      if (kind === 'olt') {
        const olt = olts.find((item) => item.id === id);
        return olt ? oltToRef(olt) : null;
      }
      const onu = onus.find((item) => item.id === id);
      return onu ? onuToRef(onu) : null;
    },
    [tjs, olts, onus],
  );

  const handleConnectDevice = useCallback(
    (device: { kind: DeviceKind; id: string }) => {
      const ref = deviceRef(device);
      if (!ref) return;
      setConnectTarget(ref);
    },
    [deviceRef],
  );

  const connectPorts = useMemo(
    () =>
      connectTarget
        ? devicePorts(connectTarget.kind, connectTarget.id, { tjs, olts, onus })
        : [],
    [connectTarget, tjs, olts, onus],
  );

  const handleConnectBend = useCallback((point: { lat: number; lng: number }) => {
    setConnectBends((current) => {
      const last = current[current.length - 1];
      if (last && Math.abs(last.lat - point.lat) < 1e-5 && Math.abs(last.lng - point.lng) < 1e-5) {
        return current;
      }
      return [...current, point];
    });
  }, []);

  const handleConnectMovePoint = useCallback(
    (index: number, point: { lat: number; lng: number }) => {
      // Bend 0 is the from-device anchor when the first port is already chosen.
      const offset = connectFrom ? 1 : 0;
      if (index < offset) return;
      setConnectBends((current) =>
        current.map((item, position) => (position === index - offset ? point : item)),
      );
    },
    [connectFrom],
  );

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
              mode={mode}
              drawPath={
                connecting
                  ? connectFrom && connectFrom.ref.lat != null && connectFrom.ref.lng != null
                    ? [{ lat: connectFrom.ref.lat, lng: connectFrom.ref.lng }, ...connectBends]
                    : connectBends
                  : []
              }
              onDrawPoint={connecting ? handleConnectBend : undefined}
              onMoveDrawPoint={connecting ? handleConnectMovePoint : undefined}
              connectTarget={connecting ? connectTarget : null}
              connectPorts={connecting ? connectPorts : []}
              onConnectDevice={handleConnectDevice}
              onPickConnectPort={(port) => {
                void handlePickConnectPort(port);
              }}
              onCancelConnectTarget={() => setConnectTarget(null)}
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
              onAddOnuAtPinnedLocation={handleAddOnuAtPinnedLocation}
              canMoveDevices={isAdmin}
              onMoveDevice={handleDeviceMove}
              onMoveLinkPath={handleMoveLinkPath}
            />

            <LocationSearch
              tjs={tjs}
              olts={olts}
              onus={onus}
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

            {connecting ? (
              <div className="pointer-events-none absolute inset-x-0 top-4 z-30 flex justify-center px-4">
                <div className="pointer-events-auto flex w-full max-w-2xl flex-wrap items-center gap-2 rounded-2xl border border-white/60 bg-background/95 p-2.5 shadow-xl backdrop-blur dark:border-white/10">
                  <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                    <Cable className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">
                      Connecting cable · {connectFibreType === 'core' ? '12-core' : 'multi-tube'}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {connectFrom
                        ? `From ${connectFrom.ref.code} · ${connectFrom.port} — pick the far port to open the cable form.`
                        : 'Click a device and pick the port to start from.'}{' '}
                      {connectBends.length} bend{connectBends.length === 1 ? '' : 's'} · click the map to
                      draw the cable route
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={connectBends.length === 0}
                      onClick={() => setConnectBends((current) => current.slice(0, -1))}
                    >
                      <Undo2 className="size-3.5" />
                      Undo
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={connectBends.length === 0}
                      onClick={() => setConnectBends([])}
                    >
                      <Trash2 className="size-3.5" />
                      Clear
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={cancelConnect}>
                      <X className="size-3.5" />
                      Cancel
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}

            {connecting ? null : (
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
        links={links}
        onLinksChanged={async () => {
          await mutate();
        }}
        onSaved={async (saved) => {
          const wasNewCabinet = !oltForm?.olt;
          setOltForm(null);
          setSelectedOltId(saved.id);
          await mutate();
          if (wasNewCabinet) focusDeviceArea(saved.areaId);
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
        onLinksChanged={async () => {
          await mutate();
        }}
        onSaved={handleTjSaved}
      />

      <LinkTypeDialog
        open={Boolean(linkTypePicker)}
        onOpenChange={(open) => {
          if (!open) setLinkTypePicker(null);
        }}
        deviceCode={linkTypePicker?.ref?.code ?? null}
        onSelect={chooseLinkType}
      />

      <LinkDialog
        open={Boolean(linkDialog)}
        onOpenChange={(open) => {
          if (!open) {
            setLinkDialog(null);
            setLinkDialogPorts(null);
            setLinkDialogInitialPath(null);
            setLinkPath([]);
          }
        }}
        tjs={tjs}
        olts={olts}
        onus={onus}
        links={links}
        from={linkDialog?.from ?? null}
        to={linkDialog?.to ?? null}
        fromPort={linkDialogPorts?.from ?? null}
        toPort={linkDialogPorts?.to ?? null}
        initialPath={linkDialogInitialPath}
        fibreType={connectFibreType}
        link={linkDialog?.link ?? null}
        path={linkPath}
        onPathChange={setLinkPath}
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
        linkedFibreId={onuFormLinkedFibreId}
        links={links}
        onLinksChanged={async () => {
          await mutate();
        }}
        onSaved={async (saved) => {
          const wasNewOnu = !onuForm?.onu;
          setOnuForm(null);
          setSelectedOnuId(saved.id);
          await mutate();
          if (wasNewOnu) focusDeviceArea(saved.areaId);
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
