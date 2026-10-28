/** Thin, fail-safe bridge to Tauri: window chrome plus the Rust network core. */
import type {
  BenchmarkProgressPayload,
  BypassProbeResult,
  CommandError,
  DnsBenchmarkTarget,
  DnsConfig,
  DnsPingResult,
  Ipv6DnsState,
  NetworkAdapter,
  PersistedAppState,
  SyncedDnsServer,
  TrafficStats,
} from "../types/network";

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export type WindowAction = "minimize" | "toggleMaximize" | "close";

/**
 * Attempts a native window action. Returns false when running in a plain
 * browser so callers can surface an honest message instead of failing silently.
 */
export async function windowAction(action: WindowAction): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const win = getCurrentWindow();
    if (action === "minimize") await win.minimize();
    else if (action === "toggleMaximize") await win.toggleMaximize();
    else await win.close();
    return true;
  } catch {
    return false;
  }
}

/** `invoke` that resolves to null outside Tauri or when the command rejects. */
async function invokeSafe<T>(command: string, args?: Record<string, unknown>): Promise<T | null> {
  if (!isTauri()) return null;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<T>(command, args);
  } catch {
    return null;
  }
}

/** `invoke` that surfaces the typed Rust `CommandError` (e.g. ELEVATION_REQUIRED). */
async function invokeCommand<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri()) {
    const error: CommandError = {
      code: "BRIDGE_UNAVAILABLE",
      message: "The Rust core is not available in a plain browser.",
    };
    throw error;
  }
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(command, args);
}

/** Real Windows interfaces, default route first. Null when the core is absent. */
export function fetchNetworkAdapters(): Promise<NetworkAdapter[] | null> {
  return invokeSafe<NetworkAdapter[]>("get_network_adapters");
}

/** One-second counter delta for the selected adapter. */
export function fetchLiveTraffic(adapterId: string): Promise<TrafficStats | null> {
  return invokeSafe<TrafficStats>("get_live_traffic", { adapterId });
}

/** Resolver currently configured on the adapter (read-only). */
export function fetchCurrentDns(adapterId: string): Promise<DnsConfig | null> {
  return invokeSafe<DnsConfig>("get_current_dns", { adapterId });
}

/** Applies a static resolver pair (UAC fallback happens inside Rust). */
export function invokeSetDns(
  adapterId: string,
  primary: string,
  secondary: string,
): Promise<DnsConfig> {
  return invokeCommand<DnsConfig>("set_dns", { request: { adapterId, primary, secondary } });
}

/** Returns the adapter to DHCP-acquired resolvers and flushes the cache. */
export function invokeResetDns(adapterId: string): Promise<DnsConfig> {
  return invokeCommand<DnsConfig>("reset_dns", { adapterId });
}

/** Clears the Windows resolver cache (`ipconfig /flushdns`). */
export function invokeFlushDns(): Promise<void> {
  return invokeCommand<void>("flush_dns_cache");
}

/**
 * `enabled: false` pins the IPv6 resolver to `::1` (leak guard);
 * `enabled: true` re-acquires it over DHCP. The IPv6 stack is never disabled.
 */
export function invokeSetIpv6(adapterId: string, enabled: boolean): Promise<void> {
  return invokeCommand<void>("set_ipv6_enabled", { adapterId, enabled });
}

/** Two real UDP:53 queries against the primary, falling back to the secondary. */
export function invokePingDnsServer(
  serverId: string,
  primary: string,
  secondary: string | null,
): Promise<DnsPingResult> {
  return invokeCommand<DnsPingResult>("ping_dns_server", { serverId, primary, secondary });
}

/** Parallel UDP:53 sweep across all supplied resolvers. */
export function invokeBenchmarkDnsServers(
  servers: DnsBenchmarkTarget[],
): Promise<DnsPingResult[]> {
  return invokeCommand<DnsPingResult[]>("benchmark_dns_servers", { servers });
}

/** Real resolution + TLS reachability probe for the six sanction targets. */
export function invokeRunBypassProbe(
  adapterId: string,
  resolverIp?: string,
): Promise<BypassProbeResult[]> {
  return invokeCommand<BypassProbeResult[]>("run_bypass_probe", {
    adapterId,
    resolverIp: resolverIp ?? null,
  });
}

/** Persisted state file; null when the core is absent or the file is unreadable. */
export function fetchPersistedState(): Promise<PersistedAppState | null> {
  return invokeSafe<PersistedAppState>("load_persisted_state");
}

/** Atomically replaces the state file (Rust writes `state.json.tmp`, then renames). */
export function savePersistedState(state: PersistedAppState): Promise<void> {
  return invokeCommand<void>("save_persisted_state", { state });
}

/** Restores the resolver Windows had before the last apply (read-back verified). */
export function invokeRestorePreviousDns(adapterId: string): Promise<DnsConfig> {
  return invokeCommand<DnsConfig>("restore_previous_dns", { adapterId });
}

/** True IPv6 resolver registration, so the toggle starts from Windows state. */
export function fetchIpv6DnsState(adapterId: string): Promise<Ipv6DnsState | null> {
  return invokeSafe<Ipv6DnsState>("get_ipv6_dns_state", { adapterId });
}

/** Real HTTPS fetch + validated manifest merge payload. */
export function invokeSyncGithubDnsList(url: string): Promise<SyncedDnsServer[]> {
  return invokeCommand<SyncedDnsServer[]>("sync_github_dns_list", { url });
}

/**
 * Streams one event per finished resolver during a sweep. Returns a no-op
 * unsubscribe outside Tauri or when the event bridge is unavailable.
 */
export async function listenBenchmarkProgress(
  handler: (payload: BenchmarkProgressPayload) => void,
): Promise<() => void> {
  if (!isTauri()) return () => {};
  try {
    const { listen } = await import("@tauri-apps/api/event");
    return await listen<BenchmarkProgressPayload>("benchmark:progress", (event) =>
      handler(event.payload),
    );
  } catch {
    return () => {};
  }
}

