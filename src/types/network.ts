/**
 * Shared network domain types.
 *
 * These interfaces are the contract between the React shell and the Rust core.
 * In Phase 2 the `src-tauri` commands must serialize exactly to these shapes
 * (snake_case is converted to camelCase with `#[serde(rename_all = "camelCase")]`).
 */

export type DnsCategory = "gaming" | "sanction" | "security" | "general";

export type AdapterKind = "wifi" | "ethernet" | "vpn" | "loopback";

export type AdapterStatus = "up" | "down";

/** A Windows network adapter as reported by `get_network_adapters`. */
export interface NetworkAdapter {
  id: string;
  name: string;
  kind: AdapterKind;
  status: AdapterStatus;
  ipv4: string;
  gateway: string;
  mac: string;
  /** Negotiated link speed in Mbps, 0 when unknown. */
  speedMbps: number;
  isDefault: boolean;
}

/** One DNS resolver preset, seeded from `src/data/defaultDns.json`. */
export interface DnsServer {
  id: string;
  name: string;
  /** Persian display name, optional for custom entries. */
  nameFa?: string;
  provider: string;
  /** IPv4 primary resolver. */
  primary: string;
  /** IPv4 secondary resolver, empty string when the provider publishes one address. */
  secondary: string;
  category: DnsCategory;
  tags: string[];
  description?: string;
  /** Last measured latency in ms, null when never probed. */
  latency: number | null;
  /** Rolling availability percentage. */
  uptime: number;
  pinned?: boolean;
  ipv6?: string[];
  /** True for user-created entries that are not written back to the seed file. */
  custom?: boolean;
}

/** Result of a single latency probe. */
export interface PingSample {
  serverId: string;
  latencyMs: number;
  jitterMs: number;
  lossPercent: number;
  at: number;
}

/** One point of the live traffic series, in KB/s. */
export interface TrafficPoint {
  /** Unix epoch milliseconds. */
  t: number;
  downKbps: number;
  upKbps: number;
}

/** Aggregated counters for the current monitoring session. */
export interface TrafficStats {
  downKbps: number;
  upKbps: number;
  peakDownKbps: number;
  peakUpKbps: number;
  sessionDownBytes: number;
  sessionUpBytes: number;
  latencyMs: number;
  packetLossPercent: number;
  /** Whether the sampler is currently producing points. */
  live: boolean;
}

/** Full benchmark row for one resolver. */
export interface BenchmarkResult {
  serverId: string;
  name: string;
  category: DnsCategory;
  latencyMs: number | null;
  jitterMs: number | null;
  lossPercent: number;
  /** 0–100 composite quality score. */
  score: number;
  status: "pending" | "testing" | "done" | "timeout";
}

/** Progress envelope for a batch benchmark started in the UI. */
export interface BenchmarkSession {
  running: boolean;
  progress: number;
  total: number;
  currentId: string | null;
  startedAt: number | null;
  results: BenchmarkResult[];
}

/** How resolver settings are currently applied on the adapter. */
export type DnsMode = "dhcp" | "static";

export type ConnectionPhase =
  | "idle"
  | "connecting"
  | "connected"
  | "disconnecting"
  | "resetting"
  | "error";

export interface ConnectionState {
  phase: ConnectionPhase;
  mode: DnsMode;
  /** Active resolver id, null when DHCP is in charge. */
  activeDnsId: string | null;
  /** Adapter the resolver is bound to. */
  adapterId: string;
  /** Unix epoch ms of the last successful apply. */
  since: number | null;
  /** Human readable error from the core, null when healthy. */
  error: string | null;
}

/** Payload for `set_dns`. */
export interface SetDnsRequest {
  adapterId: string;
  primary: string;
  secondary: string;
}

/** Payload returned by `get_current_dns`. */
export interface DnsConfig {
  adapterId: string;
  mode: DnsMode;
  primary: string | null;
  secondary: string | null;
  /** DNS server list configured on the adapter. */
  servers: string[];
  /** "static" when the adapter has a manually assigned resolver. */
  source: "dhcp" | "static" | "unknown";
}

/** A sanction-bypass reachability probe target (Docker Hub, AI APIs, gaming). */
export interface BypassTarget {
  id: string;
  label: string;
  host: string;
  group: "dev" | "ai" | "gaming";
}

export type BypassStatus = "idle" | "testing" | "reachable" | "blocked";

export interface BypassResult {
  targetId: string;
  status: BypassStatus;
  latencyMs: number | null;
  resolver: string;
  detail: string;
}

export interface AppSettings {
  githubRawUrl: string;
  autoStart: boolean;
  autoConnect: boolean;
  minimizeToTray: boolean;
  notifications: boolean;
}

export type ViewId = "dashboard" | "vault" | "tools" | "settings";

export interface ToastMessage {
  id: string;
  title: string;
  detail?: string;
  tone: "info" | "success" | "warning" | "error";
}
