export type Role = 'user' | 'admin';

export interface User {
  id: string;
  name: string;
  email: string;
  mobile: string;
  role: Role;
  createdAt: string;
}

export type TjType = 'box' | 'cut' | 'pon_power';

export type CoreStatus = 'in_use' | 'free' | 'spliced' | 'damaged';

export interface Core {
  label: string;
  color: string;
  count: number;
  status?: CoreStatus;
  powerDbm?: number | null;
  connectedUserFibreId?: string | null;
  connectedUserCoreLabel?: string | null;
}

export interface UserFibreCore {
  coreIndex: number;
  label: string;
  color: string;
  status: CoreStatus;
  connectedToOutputCore?: boolean;
}

export interface UserFibre {
  id: string;
  outputCoreLabel: string;
  label: string;
  color: string;
  coreCount: number;
  connectedCoreIndex?: number | null;
  cores: UserFibreCore[];
}

export interface Splitter {
  enabled: boolean;
  ratio?: string | null;
  inputCoreLabel?: string | null;
  inputPowerDbm?: number | null;
  lossDb?: number | null;
  outputPowerDbm?: number | null;
  powerStatus?: string | null;
  outputs: Core[];
}

export type CutSeverity = 'minor' | 'major' | 'outage';

export type CutRepairStatus = 'cut_unresolved' | 'splicing_in_progress' | 'restored';

export interface CutData {
  faultDistanceMeters?: number | null;
  cutTime?: string | null;
  damagedCores?: number | null;
  restoredCores?: number | null;
  repairStatus?: CutRepairStatus | null;
  restorationNotes?: string | null;
}

export interface PonData {
  oltName?: string | null;
  ponPort?: string | null;
  wavelength?: string | null;
  inputPowerDbm?: number | null;
  calculatedOutputDbm?: number | null;
  powerStatus?: string | null;
  budgetMarginDb?: number | null;
}

export interface Bounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

export interface District {
  id: string;
  code: string;
  name: string;
  description: string | null;
  lat: number | null;
  lng: number | null;
  zoom: number | null;
  bounds: Bounds | null;
  areaCount: number;
  tjCount: number;
  cutCount: number;
  linkCount: number;
  createdAt: string;
  updatedAt: string;
  areas?: Area[];
}

export interface Area {
  id: string;
  districtId: string;
  districtCode: string;
  districtName: string;
  code: string | null;
  name: string;
  description: string | null;
  lat: number | null;
  lng: number | null;
  zoom: number | null;
  bounds: Bounds | null;
  tjCount: number;
  cutCount: number;
  linkCount: number;
  createdAt: string;
  updatedAt: string;
  district?: District | null;
}

export interface DistrictInput {
  name: string;
  code?: string;
  description?: string;
}

export type AreaInput = DistrictInput;

export interface Tj {
  id: string;
  code: string;
  name: string | null;
  tjType: TjType;
  lat: number;
  lng: number;
  address: string | null;
  notes: string | null;
  fibreId: string | null;
  inputPowerDbm?: number | null;
  cores: Core[];
  outputCores?: Core[];
  splitter: Splitter;
  userFibres?: UserFibre[];
  isCut: boolean;
  cutReason: string | null;
  cutSeverity: CutSeverity | null;
  cutData?: CutData | null;
  ponData?: PonData | null;
  areaId: string | null;
  areaName: string | null;
  districtId: string | null;
  districtName: string | null;
  createdAt: string;
  updatedAt: string;
}

export type LinkStatus = 'active' | 'cut';

export interface FibreLink {
  id: string;
  fromTjId: string;
  toTjId: string;
  fromCode: string;
  toCode: string;
  fromName: string | null;
  toName: string | null;
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
  fibreId: string;
  cableType: string | null;
  coreCount: number;
  status: LinkStatus;
  lengthM: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Network {
  tjs: Tj[];
  links: FibreLink[];
}

export interface AuthResponse {
  accessToken: string;
  expiresIn: number;
  user: User;
}

export interface TjInput {
  code: string;
  name?: string;
  tjType?: TjType;
  lat: number;
  lng: number;
  address?: string;
  notes?: string;
  fibreId?: string;
  inputPowerDbm?: number | null;
  cores: Core[];
  outputCores?: Core[];
  splitter: Splitter;
  userFibres?: UserFibre[];
  isCut: boolean;
  cutReason?: string;
  cutSeverity?: CutSeverity | null;
  cutData?: CutData | null;
  ponData?: PonData | null;
  areaId?: string | null;
}

export interface LinkInput {
  fromTjId: string;
  toTjId: string;
  fibreId: string;
  cableType?: string;
  coreCount: number;
  status: LinkStatus;
  notes?: string;
}

export type LinkUpdate = Omit<LinkInput, 'fromTjId' | 'toTjId'>;
