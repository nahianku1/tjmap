import type {
  Area,
  AreaInput,
  AuthResponse,
  District,
  DistrictInput,
  FibreLink,
  LinkInput,
  LinkUpdate,
  Network,
  Olt,
  OltInput,
  Onu,
  OnuInput,
  SubArea,
  SubAreaDeleteResult,
  SubAreaInput,
  Tj,
  TjInput,
  User,
} from './types';

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') ?? 'http://localhost:4000/api';

let accessToken: string | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let refreshInFlight: Promise<AuthResponse | null> | null = null;
let sessionLostHandler: (() => void) | null = null;

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

export function onSessionLost(handler: (() => void) | null) {
  sessionLostHandler = handler;
}

function messageFromPayload(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object') return fallback;
  const message = (payload as { message?: string | string[] }).message;
  if (Array.isArray(message)) return message.join(' ');
  if (typeof message === 'string') return message;
  return fallback;
}

async function rawRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers,
      credentials: 'include',
      cache: 'no-store',
    });
  } catch {
    throw new ApiError('Cannot reach the API. Is the backend running?', 0);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  const payload = text ? safeJson(text) : null;

  if (!response.ok) {
    throw new ApiError(messageFromPayload(payload, `Request failed (${response.status})`), response.status);
  }

  return payload as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function scheduleSilentRefresh(expiresInSeconds: number) {
  if (refreshTimer) clearTimeout(refreshTimer);
  const delay = Math.max(30, expiresInSeconds - 120) * 1000;
  refreshTimer = setTimeout(() => {
    void refreshSession().catch(() => undefined);
  }, delay);
}

export function stopSilentRefresh() {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = null;
}

export async function refreshSession(): Promise<AuthResponse | null> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      const session = await rawRequest<AuthResponse>('/auth/refresh', { method: 'POST' });
      accessToken = session.accessToken;
      scheduleSilentRefresh(session.expiresIn);
      return session;
    } catch (error) {
      accessToken = null;
      stopSilentRefresh();
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        sessionLostHandler?.();
        return null;
      }
      throw error;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

async function request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  try {
    return await rawRequest<T>(path, init);
  } catch (error) {
    if (retry && error instanceof ApiError && error.status === 401) {
      const session = await refreshSession();
      if (session) {
        return rawRequest<T>(path, init);
      }
    }
    throw error;
  }
}

function jsonBody(body: unknown): RequestInit {
  return { body: JSON.stringify(body) };
}

export const api = {
  baseUrl: BASE_URL,

  signup(input: {
    name: string;
    email: string;
    mobile: string;
    password: string;
    role: 'user' | 'admin';
  }): Promise<AuthResponse> {
    return request<AuthResponse>('/auth/signup', { method: 'POST', ...jsonBody(input) }, false);
  },

  login(input: { email: string; password: string }): Promise<AuthResponse> {
    return request<AuthResponse>('/auth/login', { method: 'POST', ...jsonBody(input) }, false);
  },

  logout(): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>('/auth/logout', { method: 'POST' }, false);
  },

  me(): Promise<User> {
    return request<User>('/auth/me');
  },

  network(): Promise<Network> {
    return request<Network>('/tjs/network');
  },

  districts(): Promise<District[]> {
    return request<District[]>('/districts');
  },

  district(id: string): Promise<District> {
    return request<District>(`/districts/${id}`);
  },

  createDistrict(input: DistrictInput): Promise<District> {
    return request<District>('/districts', { method: 'POST', ...jsonBody(input) });
  },

  updateDistrict(id: string, input: Partial<DistrictInput>): Promise<District> {
    return request<District>(`/districts/${id}`, { method: 'PATCH', ...jsonBody(input) });
  },

  deleteDistrict(id: string): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>(`/districts/${id}`, { method: 'DELETE' });
  },

  areas(): Promise<Area[]> {
    return request<Area[]>('/areas');
  },

  area(id: string): Promise<Area> {
    return request<Area>(`/areas/${id}`);
  },

  areaNetwork(id: string): Promise<Network> {
    return request<Network>(`/areas/${id}/network`);
  },

  createArea(districtId: string, input: AreaInput): Promise<Area> {
    return request<Area>(`/districts/${districtId}/areas`, { method: 'POST', ...jsonBody(input) });
  },

  updateArea(id: string, input: Partial<AreaInput>): Promise<Area> {
    return request<Area>(`/areas/${id}`, { method: 'PATCH', ...jsonBody(input) });
  },

  deleteArea(id: string): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>(`/areas/${id}`, { method: 'DELETE' });
  },

  subAreas(areaId?: string): Promise<SubArea[]> {
    return request<SubArea[]>(
      areaId ? `/sub-areas?areaId=${encodeURIComponent(areaId)}` : '/sub-areas',
    );
  },

  subArea(id: string): Promise<SubArea> {
    return request<SubArea>(`/sub-areas/${id}`);
  },

  createSubArea(areaId: string, input: SubAreaInput): Promise<SubArea> {
    return request<SubArea>(`/areas/${areaId}/sub-areas`, { method: 'POST', ...jsonBody(input) });
  },

  updateSubArea(id: string, input: Partial<SubAreaInput>): Promise<SubArea> {
    return request<SubArea>(`/sub-areas/${id}`, { method: 'PATCH', ...jsonBody(input) });
  },

  deleteSubArea(id: string): Promise<SubAreaDeleteResult> {
    return request<SubAreaDeleteResult>(`/sub-areas/${id}`, { method: 'DELETE' });
  },

  olts(areaId?: string): Promise<Olt[]> {
    return request<Olt[]>(areaId ? `/olts?areaId=${encodeURIComponent(areaId)}` : '/olts');
  },

  olt(id: string): Promise<Olt> {
    return request<Olt>(`/olts/${id}`);
  },

  createOlt(input: OltInput): Promise<Olt> {
    return request<Olt>('/olts', { method: 'POST', ...jsonBody(input) });
  },

  updateOlt(id: string, input: Partial<OltInput>): Promise<Olt> {
    return request<Olt>(`/olts/${id}`, { method: 'PATCH', ...jsonBody(input) });
  },

  deleteOlt(id: string): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>(`/olts/${id}`, { method: 'DELETE' });
  },

  onus(areaId?: string): Promise<Onu[]> {
    return request<Onu[]>(areaId ? `/onus?areaId=${encodeURIComponent(areaId)}` : '/onus');
  },

  onu(id: string): Promise<Onu> {
    return request<Onu>(`/onus/${id}`);
  },

  createOnu(input: OnuInput): Promise<Onu> {
    return request<Onu>('/onus', { method: 'POST', ...jsonBody(input) });
  },

  updateOnu(id: string, input: Partial<OnuInput>): Promise<Onu> {
    return request<Onu>(`/onus/${id}`, { method: 'PATCH', ...jsonBody(input) });
  },

  deleteOnu(id: string): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>(`/onus/${id}`, { method: 'DELETE' });
  },

  createTj(input: TjInput): Promise<Tj> {
    return request<Tj>('/tjs', { method: 'POST', ...jsonBody(input) });
  },

  updateTj(id: string, input: Partial<TjInput>): Promise<Tj> {
    return request<Tj>(`/tjs/${id}`, { method: 'PATCH', ...jsonBody(input) });
  },

  deleteTj(id: string): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>(`/tjs/${id}`, { method: 'DELETE' });
  },

  createLink(input: LinkInput): Promise<FibreLink> {
    return request<FibreLink>('/links', { method: 'POST', ...jsonBody(input) });
  },

  updateLink(id: string, input: Partial<LinkUpdate>): Promise<FibreLink> {
    return request<FibreLink>(`/links/${id}`, { method: 'PATCH', ...jsonBody(input) });
  },

  deleteLink(id: string): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>(`/links/${id}`, { method: 'DELETE' });
  },
};

export const fetcher = <T,>(path: string) => request<T>(path);
