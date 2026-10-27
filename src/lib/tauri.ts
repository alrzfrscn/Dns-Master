/** Thin, fail-safe bridge to Tauri: window chrome plus the Rust network core. */
import type { DnsConfig, NetworkAdapter, TrafficStats } from "../types/network";

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
