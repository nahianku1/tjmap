'use client';

import { useParams } from 'next/navigation';
import { MapWorkspace } from '@/components/map/map-workspace';

export default function AreaMapPage() {
  const params = useParams<{ id: string }>();

  // Keyed by area so switching to another area remounts the workspace: camera,
  // selection, dialogs and drafts all belong to the area that was opened.
  return <MapWorkspace key={params?.id ?? 'area'} areaId={params?.id} />;
}
