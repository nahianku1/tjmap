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

export type EthernetSpeed = '1G' | '10G' | '40G' | '100G';

export type PortStatus = 'free' | 'in_use';

export interface PonPort {
  label: string;
  outputDbm: number | null;
  /** Optional service VLAN assigned to this port (1–4094). */
  vlanId?: number | null;
  /** Server-derived: in use while a joint is served through this port. */
  status?: PortStatus;
  joints?: number;
}

export interface EthernetPort {
  label: string;
  speed: EthernetSpeed;
  /** Optional service VLAN assigned to this port (1–4094). */
  vlanId?: number | null;
  /** Server-derived: in use while it carries the OLT uplink. */
  status?: PortStatus;
}

export interface Olt {
  id: string;
  code: string;
  name: string;
  ponPort: string | null;
  uplinkPort: string | null;
  ponPorts: PonPort[];
  ethernetPorts: EthernetPort[];
  notes: string | null;
  areaId: string | null;
  areaName: string | null;
  districtId: string | null;
  districtName: string | null;
  lat: number | null;
  lng: number | null;
  tjCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface OltInput {
  name: string;
  code?: string;
  ponPort?: string;
  uplinkPort?: string;
  ponPorts?: PonPort[];
  ethernetPorts?: EthernetPort[];
  areaId?: string | null;
  lat?: number;
  lng?: number;
  notes?: string;
}

/** The OLT summary embedded on a joint. */
export interface TjOlt {
  id: string;
  code: string | null;
  name: string | null;
  ponPort: string | null;
  uplinkPort: string | null;
}

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
  oltId: string | null;
  olt: TjOlt | null;
  createdAt: string;
  updatedAt: string;
}

export type LinkStatus = 'active' | 'cut';

export type DeviceKind = 'tj' | 'olt' | 'onu';

/** A device endpoint in the Add Link dialog (terminal joint or OLT cabinet). */
export interface LinkDeviceRef {
  kind: DeviceKind;
  id: string;
  code: string;
  name: string | null;
  lat?: number;
  lng?: number;
}

/** A bend in a hand-drawn cable route (intermediate waypoint, not an endpoint). */
export interface LinkPathPoint {
  lat: number;
  lng: number;
}

export interface LinkCore {
  index: number;
  label: string;
  color: string;
  status: 'connected' | 'free';
  fromCoreLabel: string | null;
  toCoreLabel: string | null;
}

export interface FibreLink {
  id: string;
  fromKind: DeviceKind;
  toKind: DeviceKind;
  fromTjId: string | null;
  fromOltId: string | null;
  fromOnuId: string | null;
  toTjId: string | null;
  toOltId: string | null;
  toOnuId: string | null;
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
  fromCoreLabel?: string | null;
  toCoreLabel?: string | null;
  cores: LinkCore[];
  /** Duct waypoints drawn on the map; empty means a straight span. */
  path: LinkPathPoint[];
  status: LinkStatus;
  lengthM: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OnuCore {
  label: string;
  color: string;
  status: CoreStatus;
  /** Set when a fibre link uses this core, so the link can free it later. */
  connectedLinkId?: string | null;
}

export interface Onu {
  id: string;
  username: string;
  macAddress?: string | null;
  vlanId?: number | null;
  fibreId: string;
  cores: OnuCore[];
  notes?: string | null;
  lat: number | null;
  lng: number | null;
  areaId?: string | null;
  areaName?: string | null;
  districtId?: string | null;
  districtName?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface OnuInput {
  username: string;
  macAddress?: string;
  vlanId?: number | null;
  fibreId: string;
  cores: OnuCore[];
  areaId?: string | null;
  lat?: number;
  lng?: number;
  notes?: string;
}

export interface Network {
  tjs: Tj[];
  links: FibreLink[];
  olts: Olt[];
  onus?: Onu[];
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
  oltId?: string | null;
}

export interface LinkInput {
  fromTjId?: string;
  fromOltId?: string;
  fromOnuId?: string;
  toTjId?: string;
  toOltId?: string;
  toOnuId?: string;
  fibreId: string;
  cableType?: string;
  fromCoreLabel?: string | null;
  toCoreLabel?: string | null;
  coreCount: number;
  status: LinkStatus;
  notes?: string;
  cores?: Omit<LinkCore, 'status'>[];
  path?: LinkPathPoint[];
}

export type LinkUpdate = Partial<
  Omit<
    LinkInput,
    'fromTjId' | 'fromOltId' | 'fromOnuId' | 'toTjId' | 'toOltId' | 'toOnuId'
  >
>;
