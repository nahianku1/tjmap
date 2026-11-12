'use client';

import { useParams } from 'next/navigation';
import { MapWorkspace } from '@/components/map/map-workspace';

export default function AreaMapPage() {
  const params = useParams<{ id: string }>();

  return <MapWorkspace areaId={params?.id} />;
}
