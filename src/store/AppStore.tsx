import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  AppSettings,
  BenchmarkResult,
  BenchmarkSession,
  BypassResult,
  ConnectionState,
  DnsCategory,
  DnsConfig,
  DnsRollbackSnapshot,
  DnsServer,
  NetworkAdapter,
  PersistedAppState,
  PersistedSettings,
  SyncedDnsServer,
  TrafficPoint,
  TrafficStats,
  ViewId,
} from "../types/network";
import { BYPASS_TARGETS, MOCK_ADAPTERS } from "../data/mock";
import { DEFAULT_ADAPTER, SEED_SERVERS } from "../data/servers";
import {
  fetchCurrentDns,
  fetchIpv6DnsState,
  fetchLiveTraffic,
  fetchNetworkAdapters,
  fetchPersistedState,
  invokeBenchmarkDnsServers,
  invokeExitApp,
  invokeFlushDns,
  invokeImportDnsManifest,
  invokePingDnsServer,
  invokeResetDns,
  invokeRestorePreviousDns,
  invokeRunBypassProbe,
  invokeSetDns,
  invokeSetIpv6,
  invokeSyncGithubDnsList,
  isTauri,
  listenBenchmarkProgress,
  listenTrayActions,
  savePersistedState,
  setAutostartEnabled,
} from "../lib/tauri";

const HISTORY_LENGTH = 48;
const MAX_TOASTS = 3;

interface CustomDnsInput {
  name: string;
  primary: string;
  secondary: string;
  category: DnsCategory;
  description?: string;
}

interface AppContextValue {
  view: ViewId;
  setView: (view: ViewId) => void;

  servers: DnsServer[];
  pinnedServers: DnsServer[];
  activeDns: DnsServer | null;
  activeDnsId: string | null;
  connection: ConnectionState;

  adapters: NetworkAdapter[];
  activeAdapter: NetworkAdapter;
  activeAdapterId: string;
  setActiveAdapter: (id: string) => void;
  /** Resolver read from Windows, null outside Tauri. */
  dnsConfig: DnsConfig | null;
  /** True once adapters came from the Rust core (not the browser mock). */
  bridgeReady: boolean;
  /** True while get_live_traffic is streaming real interface counters. */
  telemetryLive: boolean;

  traffic: TrafficPoint[];
  stats: TrafficStats;
  streamPaused: boolean;
  toggleStream: () => void;

  benchmark: BenchmarkSession;
  runBenchmark: (options?: { ids?: string[]; applyBest?: boolean }) => Promise<void>;

  applyDns: (id: string) => void;
  disconnect: () => void;
  resetDhcp: () => void;
  pingServer: (id: string) => Promise<number>;
  addCustomDns: (input: CustomDnsInput) => DnsServer;
  removeDns: (id: string) => void;
  togglePin: (id: string) => void;
  /** Resolver Windows had before the last apply, null when there is none. */
  previousDnsSnapshot: DnsRollbackSnapshot | null;
  rollbackDns: () => Promise<void>;

  ipv6Enabled: boolean;
  toggleIpv6: () => void;
  flushing: boolean;
  flushDns: () => Promise<void>;

  bypassResults: BypassResult[];
  bypassRunning: boolean;
  runBypassTest: () => Promise<void>;

  settings: AppSettings;
  updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  resetSettings: () => void;
  syncFromGithub: () => Promise<void>;
  syncing: boolean;
  /** Downloads the custom + pinned resolvers as a `{ servers: [...] }` manifest. */
  exportDnsManifest: () => void;
  /** Validates and merges a local manifest with the GitHub sync rules. */
  importDnsManifest: (json: string) => Promise<void>;
  /** Quits the process even when minimize-to-tray is enabled. */
  exitApp: () => void;

  toasts: { id: string; title: string; detail?: string; tone: "info" | "success" | "warning" | "error" }[];
  pushToast: (title: string, tone?: "info" | "success" | "warning" | "error", detail?: string) => void;
  dismissToast: (id: string) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));
const round = (value: number, precision = 1) => Number(value.toFixed(precision));

/** Human-readable Rust `CommandError`, without hiding an elevation refusal. */
function describeError(error: unknown): string {
  const candidate = error as Partial<{ code: string; message: string }> | null;
  if (candidate?.code === "ELEVATION_REQUIRED") {
    return (
      candidate.message ??
      "Administrator privileges are required to modify network adapter DNS settings."
    );
  }
  return candidate?.message ?? "The Windows core rejected the command.";
}

function buildInitialHistory(): TrafficPoint[] {
  const now = Date.now();
  return Array.from({ length: HISTORY_LENGTH }, (_, index) => {
    const phase = index / 3.4;
    return {
      t: now - (HISTORY_LENGTH - index) * 1000,
      downKbps: Math.max(60, 1500 + Math.sin(phase) * 820 + Math.sin(phase * 2.7) * 260),
      upKbps: Math.max(20, 260 + Math.sin(phase * 1.3 + 1.2) * 130),
    };
  });
}

const initialTraffic: TrafficPoint[] = buildInitialHistory();

const initialStats: TrafficStats = {
  downKbps: initialTraffic[initialTraffic.length - 1]?.downKbps ?? 0,
  upKbps: initialTraffic[initialTraffic.length - 1]?.upKbps ?? 0,
  peakDownKbps: Math.max(...initialTraffic.map((p) => p.downKbps)),
  peakUpKbps: Math.max(...initialTraffic.map((p) => p.upKbps)),
  sessionDownBytes: 0,
  sessionUpBytes: 0,
  latencyMs: 24,
  packetLossPercent: 0,
  live: true,
};

const initialBenchmark: BenchmarkSession = {
  running: false,
  progress: 0,
  total: 0,
  currentId: null,
  startedAt: null,
  results: [],
};

const DEFAULT_SETTINGS: AppSettings = {
  githubRawUrl: "https://raw.githubusercontent.com/alrzfrscn/Dns-Master/main/dns_list.json",
  autoStart: false,
  autoConnect: false,
  minimizeToTray: true,
  notifications: true,
};

const settingsToPersisted = (
  settings: AppSettings,
  adapterId: string,
  lastActiveDnsId: string | null,
): PersistedSettings => ({
  launchWithWindows: settings.autoStart,
  reapplyLastResolver: settings.autoConnect,
  minimizeToTray: settings.minimizeToTray,
  desktopNotifications: settings.notifications,
  githubSyncUrl: settings.githubRawUrl,
  preferredAdapterId: adapterId,
  lastActiveDnsId: lastActiveDnsId ?? "",
});

const settingsFromPersisted = (persisted: PersistedSettings): AppSettings => ({
  githubRawUrl: persisted.githubSyncUrl || DEFAULT_SETTINGS.githubRawUrl,
  autoStart: persisted.launchWithWindows,
  autoConnect: persisted.reapplyLastResolver,
  minimizeToTray: persisted.minimizeToTray,
  notifications: persisted.desktopNotifications,
});

/**
 * Persisted custom/synced rows first (the user's own entries win), then the
 * bundled seed. Duplicates collapse on the primary IPv4 address, and stored pin
 * ids decide which rows stay pinned.
 */
function mergePersistedServers(
  seed: DnsServer[],
  persisted: PersistedAppState | null,
): DnsServer[] {
  const byPrimary = new Map<string, DnsServer>();
  const add = (server: DnsServer) => {
    if (!server.primary || byPrimary.has(server.primary)) return;
    byPrimary.set(server.primary, server);
  };
  persisted?.customDns.forEach((server) => add({ ...server, custom: true, synced: false }));
  persisted?.syncedDns.forEach((server) => add({ ...server, custom: false, synced: true }));
  seed.forEach(add);

  if (!persisted) return [...byPrimary.values()];
  // Files written before the pin flag existed cannot tell "first run" from
  // "unpinned everything", so only those keep the seed pins when empty.
  if (!persisted.pinsInitialized) {
    const hasUserState =
      persisted.pinnedServerIds.length > 0 ||
      persisted.customDns.length > 0 ||
      persisted.syncedDns.length > 0;
    if (!hasUserState) return [...byPrimary.values()];
  }
  const pins = new Set(persisted.pinnedServerIds);
  return [...byPrimary.values()].map((server) => ({ ...server, pinned: pins.has(server.id) }));
}

/**
 * Merges validated manifest rows by primary IPv4. Real measurements and pins
 * survive; a user-created row is never overwritten by a GitHub pull. Imported
 * rows become `custom`, so the user owns and can delete them.
 */
function mergeIncomingServers(
  current: DnsServer[],
  incoming: SyncedDnsServer[],
  custom: boolean,
): { next: DnsServer[]; added: number; updated: number } {
  const byPrimary = new Map(current.map((server) => [server.primary, server]));
  const next = current.slice();
  let added = 0;
  let updated = 0;

  for (const entry of incoming) {
    const existing = byPrimary.get(entry.primary);
    if (existing?.custom && !custom) continue;
    const row: DnsServer = {
      id: entry.id || existing?.id || `sync-${entry.primary.replace(/\./g, "-")}`,
      name: entry.name,
      nameFa: entry.nameFa ?? undefined,
      provider: entry.provider || entry.name,
      primary: entry.primary,
      secondary: entry.secondary,
      category: entry.category,
      tags: entry.tags.length > 0 ? entry.tags : [custom ? "import" : "github"],
      description: entry.description ?? undefined,
      latency: existing?.latency ?? null,
      jitter: existing?.jitter ?? null,
      uptime: existing?.uptime ?? 100,
      pinned: existing?.pinned ?? false,
      custom,
      synced: !custom,
    };
    if (existing) {
      next[next.indexOf(existing)] = row;
      updated += 1;
    } else {
      next.push(row);
      added += 1;
    }
    byPrimary.set(entry.primary, row);
  }
  return { next, added, updated };
}

function snapshotFromConfig(config: DnsConfig): DnsRollbackSnapshot {
  return {
    adapterId: config.adapterId,
    mode: config.mode,
    primary: config.primary,
    secondary: config.secondary,
    capturedAt: Date.now(),
  };
}

function makeBypassRows(): BypassResult[] {
  return BYPASS_TARGETS.map((target) => ({
    targetId: target.id,
    status: "idle",
    latencyMs: null,
    resolver: "—",
    detail: "Not tested",
  }));
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<ViewId>("dashboard");
  const [servers, setServers] = useState<DnsServer[]>(SEED_SERVERS);
  const [activeDnsId, setActiveDnsId] = useState<string | null>(null);
  const [connection, setConnection] = useState<ConnectionState>({
    phase: "idle",
    mode: "dhcp",
    activeDnsId: null,
    adapterId: DEFAULT_ADAPTER,
    since: null,
    error: null,
  });
  const [adapters, setAdapters] = useState<NetworkAdapter[]>(MOCK_ADAPTERS);
  const [activeAdapterId, setActiveAdapterId] = useState<string>(DEFAULT_ADAPTER);
  const [dnsConfig, setDnsConfig] = useState<DnsConfig | null>(null);
  const [bridgeReady, setBridgeReady] = useState(false);
  const [telemetryLive, setTelemetryLive] = useState(false);
  const [traffic, setTraffic] = useState<TrafficPoint[]>(initialTraffic);
  const [stats, setStats] = useState<TrafficStats>(initialStats);
  const [streamPaused, setStreamPaused] = useState(false);
  const [benchmark, setBenchmark] = useState<BenchmarkSession>(initialBenchmark);
  const [ipv6Enabled, setIpv6Enabled] = useState(false);
  const [flushing, setFlushing] = useState(false);
  const [bypassResults, setBypassResults] = useState<BypassResult[]>(makeBypassRows);
  const [bypassRunning, setBypassRunning] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [previousDnsSnapshot, setPreviousDnsSnapshot] = useState<DnsRollbackSnapshot | null>(null);
  const [toasts, setToasts] = useState<AppContextValue["toasts"]>([]);

  const actionToken = useRef(0);
  const benchmarkRunning = useRef(false);
  const tickRef = useRef(0);
  const serversRef = useRef(servers);
  const hydrated = useRef(false);
  const notificationsRef = useRef(DEFAULT_SETTINGS.notifications);
  const syntheticRef = useRef({ down: initialStats.downKbps, up: initialStats.upKbps });

  useEffect(() => {
    serversRef.current = servers;
  }, [servers]);

  useEffect(() => {
    notificationsRef.current = settings.notifications;
  }, [settings.notifications]);

  const activeAdapter = adapters.find((a) => a.id === activeAdapterId) ?? adapters[0];
  const activeDns = useMemo(
    () => servers.find((s) => s.id === activeDnsId) ?? null,
    [servers, activeDnsId],
  );
  const pinnedServers = useMemo(
    () =>
      servers
        .filter((s) => s.pinned)
        .sort((a, b) => (a.latency ?? 999) - (b.latency ?? 999))
        .slice(0, 4),
    [servers],
  );

  const pushToast = useCallback(
    (title: string, tone: "info" | "success" | "warning" | "error" = "info", detail?: string) => {
      const id = `${Date.now()}-${Math.random().toString(16).slice(2, 7)}`;
      setToasts((prev) => [...prev.slice(-(MAX_TOASTS - 1)), { id, title, detail, tone }]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4200);

      // Native notification only when the window is not in front, so an
      // attended user does not get the same message twice.
      const away = document.visibilityState === "hidden" || !document.hasFocus();
      if (
        away &&
        notificationsRef.current &&
        typeof Notification !== "undefined" &&
        Notification.permission === "granted"
      ) {
        try {
          new Notification(title, { body: detail ?? "", silent: true });
        } catch {
          // WebView2 may refuse notifications; the HUD toast already covers it.
        }
      }
    },
    [],
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  /* ------------------------------------------------------------------ *
   * Rust bridge: real adapters, resolver mode, live counters
   * ------------------------------------------------------------------ */
  const syncDns = useCallback(async (adapterId: string, list?: DnsServer[]) => {
    const config = await fetchCurrentDns(adapterId);
    if (!config) return null;
    const pool = list ?? serversRef.current;
    const matched = pool.find(
      (server) =>
        config.servers.includes(server.primary) || (server.secondary !== "" && config.servers.includes(server.secondary)),
    );
    setDnsConfig(config);
    setActiveDnsId(matched?.id ?? null);
    setConnection((prev) => ({
      phase: matched ? "connected" : "idle",
      mode: config.mode,
      activeDnsId: matched?.id ?? null,
      adapterId,
      since: prev.adapterId === adapterId ? prev.since : null,
      error: null,
    }));
    return matched?.id ?? null;
  }, []);

  /** Seeds the IPv6 toggle from the real resolver registration. */
  const syncIpv6 = useCallback(async (adapterId: string) => {
    const state = await fetchIpv6DnsState(adapterId);
    if (state) setIpv6Enabled(!state.guarded);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [real, persisted] = await Promise.all([fetchNetworkAdapters(), fetchPersistedState()]);
      if (cancelled) return;

      const merged = mergePersistedServers(SEED_SERVERS, persisted);
      serversRef.current = merged;
      setServers(merged);
      if (persisted) {
        setSettings(settingsFromPersisted(persisted.settings));
        setPreviousDnsSnapshot(persisted.previousDnsSnapshot);
      }
      hydrated.current = true;

      if (real && real.length > 0) {
        const preferred =
          real.find((adapter) => adapter.id === persisted?.settings.preferredAdapterId) ??
          real.find((adapter) => adapter.isDefault) ??
          real[0];
        setAdapters(real);
        setBridgeReady(true);
        // Windows is the source of truth for startup: reconcile the stored
        // preference with the real Run key (also repairs a deleted value).
        void setAutostartEnabled(persisted?.settings.launchWithWindows ?? DEFAULT_SETTINGS.autoStart)
          .then((verified) => setSettings((prev) => ({ ...prev, autoStart: verified })))
          .catch(() => {});
        setActiveAdapterId(preferred.id);
        const bound = await syncDns(preferred.id, merged);
        if (cancelled) return;
        void syncIpv6(preferred.id);
        const lastId = persisted?.settings.lastActiveDnsId;
        if (persisted?.settings.reapplyLastResolver && lastId && lastId !== bound) {
          const last = merged.find((server) => server.id === lastId);
          if (last) {
            pushToast(
              "Last resolver available",
              "info",
              `${last.name} is not bound · engage it from the deck`,
            );
          }
        }
        return;
      }
      void syncDns(activeAdapterId, merged);
    })();
    return () => {
      cancelled = true;
    };
    // Adapter list and state file are read once; the sampler follows activeAdapterId afterwards.
  }, [pushToast, syncDns, syncIpv6]);

  /* ------------------------------------------------------------------ *
   * Persistence: debounced atomic save of custom/synced rows, pins and
   * settings whenever the user changes anything.
   * ------------------------------------------------------------------ */
  const persistPayload = useMemo<PersistedAppState | null>(() => {
    if (!hydrated.current) return null;
    return {
      customDns: servers.filter((server) => server.custom),
      syncedDns: servers.filter((server) => server.synced),
      pinnedServerIds: servers.filter((server) => server.pinned).map((server) => server.id),
      pinsInitialized: true,
      settings: settingsToPersisted(settings, activeAdapterId, activeDnsId),
      previousDnsSnapshot,
    };
  }, [servers, settings, activeAdapterId, activeDnsId, previousDnsSnapshot]);

  useEffect(() => {
    if (!bridgeReady || !persistPayload) return;
    const id = window.setTimeout(() => void savePersistedState(persistPayload), 600);
    return () => window.clearTimeout(id);
  }, [bridgeReady, persistPayload]);


  /* ------------------------------------------------------------------ *
   * Live traffic sampler: real `get_live_traffic` deltas with a
   * synthesized fallback when the Rust core is not available.
   * ------------------------------------------------------------------ */
  useEffect(() => {
    if (streamPaused) {
      setStats((prev) => ({ ...prev, live: false }));
      return;
    }

    let cancelled = false;
    let inFlight = false;

    const pushPoint = (downKbps: number, upKbps: number) => {
      setTraffic((prev) => [...prev.slice(1 - HISTORY_LENGTH), { t: Date.now(), downKbps, upKbps }]);
    };

    const sample = async () => {
      if (cancelled) return;

      if (bridgeReady && !inFlight) {
        inFlight = true;
        const live = await fetchLiveTraffic(activeAdapterId);
        inFlight = false;
        if (cancelled) return;
        if (live) {
          pushPoint(live.downKbps, live.upKbps);
          setStats(live);
          setTelemetryLive(true);
          return;
        }
      }

      tickRef.current += 1;
      const tick = tickRef.current;
      const burst = tick % 17 === 0 ? 2.4 : tick % 11 === 0 ? 1.6 : 1;
      const down = Math.max(
        80,
        (syntheticRef.current.down * 0.62 + 1500 * 0.38) * burst +
          Math.sin(tick / 2.1) * 340 +
          (Math.random() - 0.5) * 520,
      );
      const up = Math.max(
        18,
        (syntheticRef.current.up * 0.7 + 240 * 0.3) * (1 + (burst - 1) * 0.45) +
          Math.sin(tick / 1.7 + 2) * 90 +
          (Math.random() - 0.5) * 150,
      );
      syntheticRef.current = { down, up };
      pushPoint(down, up);
      setStats((current) => ({
        ...current,
        downKbps: down,
        upKbps: up,
        peakDownKbps: Math.max(current.peakDownKbps, down),
        peakUpKbps: Math.max(current.peakUpKbps, up),
        sessionDownBytes: current.sessionDownBytes + down * 1024,
        sessionUpBytes: current.sessionUpBytes + up * 1024,
        latencyMs: round(clamp(current.latencyMs + (Math.random() - 0.5) * 3.4, 12, 48)),
        packetLossPercent: Math.random() > 0.94 ? round(Math.random() * 0.8, 2) : current.packetLossPercent,
        live: true,
      }));
    };

    const id = window.setInterval(() => void sample(), 1000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [streamPaused, bridgeReady, activeAdapterId]);

  const toggleStream = useCallback(() => {
    setStreamPaused((prev) => {
      pushToast(prev ? "Traffic stream resumed" : "Traffic stream paused", prev ? "success" : "warning");
      return !prev;
    });
  }, [pushToast]);

  /* ----------------------------- DNS actions ----------------------------- */
  const applyDns = useCallback(
    (id: string) => {
      const target = servers.find((s) => s.id === id);
      if (!target) return;
      const token = ++actionToken.current;
      setConnection((prev) => ({
        ...prev,
        phase: "connecting",
        error: null,
        adapterId: activeAdapterId,
      }));

      if (!bridgeReady) {
        pushToast(`Applying ${target.name}`, "info", `${target.primary} · ${activeAdapter.name}`);
        window.setTimeout(() => {
          if (token !== actionToken.current) return;
          setActiveDnsId(id);
          setConnection({
            phase: "connected",
            mode: "static",
            activeDnsId: id,
            adapterId: activeAdapterId,
            since: Date.now(),
            error: null,
          });
          setServers((prev) =>
            prev.map((s) => (s.id === id ? { ...s, uptime: clamp(s.uptime + 0.1, 0, 100) } : s)),
          );
          pushToast(`${target.name} staged`, "success", "Simulated binding · the Tauri core is offline");
        }, 1100);
        return;
      }

      void (async () => {
        pushToast(`Applying ${target.name}`, "info", `${target.primary} · ${activeAdapter.name}`);
        try {
          const config = await invokeSetDns(activeAdapterId, target.primary, target.secondary);
          if (token !== actionToken.current) return;
          setDnsConfig(config);
          setActiveDnsId(id);
          setConnection({
            phase: "connected",
            mode: config.mode,
            activeDnsId: id,
            adapterId: activeAdapterId,
            since: Date.now(),
            error: null,
          });
          setServers((prev) =>
            prev.map((s) => (s.id === id ? { ...s, uptime: clamp(s.uptime + 0.1, 0, 100) } : s)),
          );
          // The core stored the pre-apply resolver; mirror it locally so the
          // rollback button and the next debounced save keep it.
          if (dnsConfig && dnsConfig.adapterId === activeAdapterId) {
            setPreviousDnsSnapshot(snapshotFromConfig(dnsConfig));
          } else {
            void fetchPersistedState().then((state) => {
              if (state?.previousDnsSnapshot) setPreviousDnsSnapshot(state.previousDnsSnapshot);
            });
          }
          pushToast(
            `${target.name} applied`,
            "success",
            `Windows resolver · ${config.servers.join(" · ") || target.primary}`,
          );
        } catch (error) {
          if (token !== actionToken.current) return;
          const message = describeError(error);
          setConnection((prev) => ({ ...prev, phase: "error", error: message }));
          pushToast("DNS change failed", "error", message);
        }
      })();
    },
    [servers, activeAdapterId, activeAdapter.name, bridgeReady, dnsConfig, pushToast],
  );

  const releaseDns = useCallback(
    (phase: "disconnecting" | "resetting", simulatedDelay: number) => {
      const token = ++actionToken.current;
      setConnection((prev) => ({ ...prev, phase, error: null }));

      const settle = () => {
        if (token !== actionToken.current) return;
        setActiveDnsId(null);
        setConnection({
          phase: "idle",
          mode: "dhcp",
          activeDnsId: null,
          adapterId: activeAdapterId,
          since: null,
          error: null,
        });
      };

      if (!bridgeReady) {
        window.setTimeout(() => {
          settle();
          pushToast(
            phase === "disconnecting" ? "Link released" : "DNS reset to DHCP",
            "info",
            "Simulated · the Tauri core is offline",
          );
        }, simulatedDelay);
        return;
      }

      void (async () => {
        try {
          const config = await invokeResetDns(activeAdapterId);
          settle();
          setDnsConfig(config);
          pushToast(
            "DNS reset to DHCP",
            "success",
            `Windows resolver released · ${config.servers.join(" · ") || "carrier assigned"}`,
          );
        } catch (error) {
          if (token !== actionToken.current) return;
          const message = describeError(error);
          setConnection((prev) => ({ ...prev, phase: "error", error: message }));
          pushToast("Reset failed", "error", message);
        }
      })();
    },
    [activeAdapterId, bridgeReady, pushToast],
  );

  const disconnect = useCallback(() => releaseDns("disconnecting", 700), [releaseDns]);
  const resetDhcp = useCallback(() => releaseDns("resetting", 850), [releaseDns]);

  /** Puts back the resolver Windows had before the last apply (or DHCP). */
  const rollbackDns = useCallback(async () => {
    if (!previousDnsSnapshot) return;
    const token = ++actionToken.current;
    setConnection((prev) => ({ ...prev, phase: "resetting", error: null }));

    if (!bridgeReady) {
      window.setTimeout(() => {
        if (token !== actionToken.current) return;
        setPreviousDnsSnapshot(null);
        pushToast("Previous DNS restored", "info", "Simulated · the Tauri core is offline");
      }, 700);
      return;
    }

    try {
      const config = await invokeRestorePreviousDns(activeAdapterId);
      if (token !== actionToken.current) return;
      const matched = serversRef.current.find((server) => config.servers.includes(server.primary));
      setDnsConfig(config);
      setActiveDnsId(matched?.id ?? null);
      setConnection({
        phase: matched ? "connected" : "idle",
        mode: config.mode,
        activeDnsId: matched?.id ?? null,
        adapterId: activeAdapterId,
        since: matched ? Date.now() : null,
        error: null,
      });
      setPreviousDnsSnapshot(null);
      pushToast(
        "Previous DNS restored",
        "success",
        config.servers.join(" · ") || "carrier assigned (DHCP)",
      );
    } catch (error) {
      if (token !== actionToken.current) return;
      const message = describeError(error);
      setConnection((prev) => ({ ...prev, phase: "error", error: message }));
      pushToast("Rollback failed", "error", message);
    }
  }, [previousDnsSnapshot, bridgeReady, activeAdapterId, pushToast]);

  const pingServer = useCallback(
    async (id: string): Promise<number> => {
      const server = servers.find((s) => s.id === id);
      if (!server) return 0;
      setServers((prev) => prev.map((s) => (s.id === id ? { ...s, latency: null, jitter: null } : s)));

      if (bridgeReady) {
        try {
          const ping = await invokePingDnsServer(id, server.primary, server.secondary || null);
          const latency = ping.reachable ? Math.round(ping.latencyMs) : null;
          setServers((prev) =>
            prev.map((s) =>
              s.id === id ? { ...s, latency, jitter: ping.reachable ? ping.jitterMs : null } : s,
            ),
          );
          if (!ping.reachable) {
            pushToast(`${server.name} unreachable`, "warning", "No answer on UDP:53 or TCP:53");
          }
          return latency ?? 0;
        } catch (error) {
          pushToast("Ping failed", "error", describeError(error));
          return 0;
        }
      }

      await sleep(420 + Math.random() * 520);
      const baseline = server.latency ?? 40;
      const measured = Math.round(clamp(baseline + (Math.random() - 0.45) * 14, 9, 180));
      setServers((prev) =>
        prev.map((s) => (s.id === id ? { ...s, latency: measured, jitter: round(Math.random() * 4) } : s)),
      );
      return measured;
    },
    [servers, bridgeReady, pushToast],
  );

  const addCustomDns = useCallback(
    (input: CustomDnsInput): DnsServer => {
      const id = `custom-${Date.now().toString(36)}`;
      const server: DnsServer = {
        id,
        name: input.name.trim(),
        provider: "Custom",
        primary: input.primary.trim(),
        secondary: input.secondary.trim(),
        category: input.category,
        tags: ["custom"],
        description: input.description?.trim() || "User-defined resolver.",
        latency: null,
        uptime: 100,
        custom: true,
        pinned: false,
      };
      setServers((prev) => [server, ...prev]);
      pushToast("Custom resolver added", "success", `${server.name} · ${server.primary}`);
      return server;
    },
    [pushToast],
  );

  const removeDns = useCallback(
    (id: string) => {
      const target = servers.find((s) => s.id === id);
      if (!target?.custom) return;
      setServers((prev) => prev.filter((s) => s.id !== id));
      if (activeDnsId === id) {
        setActiveDnsId(null);
        setConnection((prev) => ({
          ...prev,
          phase: "idle",
          mode: "dhcp",
          activeDnsId: null,
          since: null,
        }));
      }
      pushToast("Resolver removed", "info", target.name);
    },
    [servers, activeDnsId, pushToast],
  );

  const togglePin = useCallback(
    (id: string) => {
      setServers((prev) => {
        const target = prev.find((s) => s.id === id);
        if (!target) return prev;
        const pinnedCount = prev.filter((s) => s.pinned).length;
        if (!target.pinned && pinnedCount >= 4) {
          pushToast("Pin limit reached", "warning", "Unpin one of the four quick-switch slots first");
          return prev;
        }
        return prev.map((s) => (s.id === id ? { ...s, pinned: !s.pinned } : s));
      });
    },
    [pushToast],
  );

  /* ---------------------------- Benchmarking ---------------------------- */
  const runBenchmark = useCallback(
    async (options?: { ids?: string[]; applyBest?: boolean }) => {
      if (benchmarkRunning.current) return;
      const pool = options?.ids?.length
        ? servers.filter((s) => options.ids?.includes(s.id))
        : options?.applyBest
          ? pinnedServers
          : servers;
      if (pool.length === 0) return;

      benchmarkRunning.current = true;
      const started = Date.now();
      setBenchmark({
        running: true,
        progress: 0,
        total: pool.length,
        currentId: pool[0].id,
        startedAt: started,
        results: pool.map(
          (s): BenchmarkResult => ({
            serverId: s.id,
            name: s.name,
            category: s.category,
            latencyMs: null,
            jitterMs: null,
            lossPercent: 0,
            score: 0,
            status: "pending",
          }),
        ),
      });

      let best: { id: string; latency: number } | null = null;

      try {
        if (bridgeReady) {
          // One bounded parallel UDP:53 sweep; the core sorts but the UI owns
          // scores. `benchmark:progress` streams each finished resolver so the
          // rows, percentage and current name move before the sweep ends.
          const unlisten = await listenBenchmarkProgress((payload) => {
            const ping = payload.result;
            const reachable = ping.reachable;
            const latency = reachable ? Math.round(ping.latencyMs) : null;
            const jitter = reachable ? round(ping.jitterMs) : null;
            const loss = ping.packetLossPercent;
            const score =
              reachable && latency !== null && jitter !== null
                ? Math.round(clamp(100 - latency * 0.72 - jitter * 1.6 - loss * 8, 4, 99))
                : 0;
            setServers((prev) =>
              prev.map((s) => (s.id === ping.serverId ? { ...s, latency, jitter } : s)),
            );
            setBenchmark((prev) =>
              prev.running
                ? {
                    ...prev,
                    progress: Math.round(
                      (payload.completed / Math.max(1, payload.total)) * 100,
                    ),
                    currentId: ping.serverId,
                    results: prev.results.map((row) =>
                      row.serverId === ping.serverId
                        ? {
                            ...row,
                            status: reachable ? "done" : "timeout",
                            latencyMs: latency,
                            jitterMs: jitter,
                            lossPercent: loss,
                            score,
                          }
                        : row,
                    ),
                  }
                : prev,
            );
          });

          const pings = await invokeBenchmarkDnsServers(
            pool.map((s) => ({
              serverId: s.id,
              primary: s.primary,
              secondary: s.secondary || null,
            })),
          ).finally(unlisten);
          const byId = new Map(pings.map((ping) => [ping.serverId, ping]));

          const results = pool.map((s): BenchmarkResult => {
            const ping = byId.get(s.id);
            const reachable = ping?.reachable === true;
            const latency = reachable && ping ? Math.round(ping.latencyMs) : null;
            const jitter = reachable && ping ? round(ping.jitterMs) : null;
            const loss = ping?.packetLossPercent ?? 100;
            const score =
              reachable && latency !== null && jitter !== null
                ? Math.round(clamp(100 - latency * 0.72 - jitter * 1.6 - loss * 8, 4, 99))
                : 0;
            return {
              serverId: s.id,
              name: s.name,
              category: s.category,
              latencyMs: latency,
              jitterMs: jitter,
              lossPercent: loss,
              score,
              status: reachable ? "done" : "timeout",
            };
          });

          const byServer = new Map(results.map((row) => [row.serverId, row]));
          setServers((prev) =>
            prev.map((s) => {
              const row = byServer.get(s.id);
              return row ? { ...s, latency: row.latencyMs, jitter: row.jitterMs } : s;
            }),
          );

          for (const row of results) {
            if (row.latencyMs !== null && (!best || row.latencyMs < best.latency)) {
              best = { id: row.serverId, latency: row.latencyMs };
            }
          }

          setBenchmark({
            running: false,
            progress: 100,
            total: pool.length,
            currentId: null,
            startedAt: started,
            results: [...results].sort((a, b) => (b.score || 0) - (a.score || 0)),
          });
        } else {
          for (let index = 0; index < pool.length; index += 1) {
            const server = pool[index];
            setBenchmark((prev) => ({
              ...prev,
              currentId: server.id,
              results: prev.results.map((r) =>
                r.serverId === server.id ? { ...r, status: "testing" } : r,
              ),
            }));
            await sleep(170 + Math.random() * 220);

            const base = server.latency ?? 45;
            const latency = Math.round(clamp(base + (Math.random() - 0.4) * 12, 8, 180));
            const jitter = round(clamp(Math.random() * 9 + 1.2, 0.4, 18));
            const loss = Math.random() > 0.92 ? round(Math.random() * 1.6, 2) : 0;
            const score = Math.round(clamp(100 - latency * 0.72 - jitter * 1.6 - loss * 8, 4, 99));

            setServers((prev) =>
              prev.map((s) => (s.id === server.id ? { ...s, latency, jitter } : s)),
            );
            setBenchmark((prev) => ({
              ...prev,
              progress: Math.round(((index + 1) / pool.length) * 100),
              results: prev.results.map((r) =>
                r.serverId === server.id
                  ? { ...r, status: "done", latencyMs: latency, jitterMs: jitter, lossPercent: loss, score }
                  : r,
              ),
            }));
            if (!best || latency < best.latency) best = { id: server.id, latency };
          }

          setBenchmark((prev) => ({
            ...prev,
            running: false,
            currentId: null,
            progress: 100,
            results: [...prev.results].sort((a, b) => (b.score || 0) - (a.score || 0)),
          }));
        }

        const summary = best
          ? servers.find((s) => s.id === (best as { id: string }).id)?.name
          : undefined;
        if (options?.applyBest && best) {
          pushToast("Fastest route locked", "success", `${summary ?? "Resolver"} @ ${best.latency} ms`);
          applyDns(best.id);
        } else {
          pushToast(
            "Benchmark complete",
            "success",
            `${pool.length} resolvers probed · best ${best?.latency ?? "—"} ms`,
          );
        }
      } catch (error) {
        pushToast("Benchmark failed", "error", describeError(error));
        setBenchmark((prev) => ({ ...prev, running: false, currentId: null }));
      } finally {
        benchmarkRunning.current = false;
      }
    },
    [servers, pinnedServers, applyDns, bridgeReady, pushToast],
  );

  /* ------------------------------ Utilities ------------------------------ */
  const setActiveAdapter = useCallback(
    (id: string) => {
      const adapter = adapters.find((a) => a.id === id);
      if (!adapter) return;
      setActiveAdapterId(id);
      actionToken.current += 1;
      setActiveDnsId(null);
      setDnsConfig(null);
      setConnection({
        phase: "idle",
        mode: "dhcp",
        activeDnsId: null,
        adapterId: id,
        since: null,
        error: null,
      });
      pushToast("Adapter switched", "info", adapter.name);
      void syncDns(id);
      void syncIpv6(id);
    },
    [adapters, pushToast, syncDns, syncIpv6],
  );

  const toggleIpv6 = useCallback(() => {
    const next = !ipv6Enabled;
    if (!bridgeReady) {
      setIpv6Enabled(next);
      pushToast(next ? "IPv6 enabled" : "IPv6 disabled", next ? "success" : "warning");
      return;
    }

    void (async () => {
      try {
        await invokeSetIpv6(activeAdapterId, next);
        setIpv6Enabled(next);
        void syncIpv6(activeAdapterId);
        pushToast(
          next ? "IPv6 resolution enabled" : "IPv6 DNS leak guard on",
          next ? "success" : "warning",
          next
            ? "IPv6 resolvers re-acquired over DHCP"
            : "IPv6 resolver pinned to ::1 · stack left enabled",
        );
      } catch (error) {
        pushToast("IPv6 change failed", "error", describeError(error));
      }
    })();
  }, [ipv6Enabled, bridgeReady, activeAdapterId, pushToast, syncIpv6]);

  const flushDns = useCallback(async () => {
    if (flushing) return;
    setFlushing(true);
    try {
      if (bridgeReady) {
        pushToast("Flushing resolver cache", "info", "ipconfig /flushdns · Windows core");
        await invokeFlushDns();
        const config = await fetchCurrentDns(activeAdapterId);
        if (config) setDnsConfig(config);
        pushToast("DNS cache cleared", "success", "Windows resolver cache flushed");
      } else {
        pushToast("Flushing resolver cache", "info", "simulated · Tauri core offline");
        await sleep(900);
        pushToast("DNS cache cleared", "success", "Simulated flush · needs the Tauri core");
      }
    } catch (error) {
      pushToast("Flush failed", "error", describeError(error));
    } finally {
      setFlushing(false);
    }
  }, [flushing, bridgeReady, activeAdapterId, pushToast]);

  const runBypassTest = useCallback(async () => {
    if (bypassRunning) return;
    setBypassRunning(true);
    const resolverLabel = dnsConfig?.primary ?? (activeDns ? activeDns.name : "DHCP");
    const bypassFriendly = activeDns?.category === "sanction" || activeDns?.category === "gaming";
    const reachableChance = bypassFriendly ? 0.92 : activeDns ? 0.62 : 0.42;

    setBypassResults(
      makeBypassRows().map((row) => ({ ...row, status: "testing", resolver: resolverLabel })),
    );
    pushToast("Sanction bypass probe started", "info", `${BYPASS_TARGETS.length} targets · ${resolverLabel}`);

    if (bridgeReady) {
      try {
        const probes = await invokeRunBypassProbe(activeAdapterId, dnsConfig?.primary ?? undefined);
        setBypassResults(
          probes.map((probe) => ({
            targetId: probe.id,
            status: probe.status,
            latencyMs: probe.latencyMs > 0 ? Math.round(probe.latencyMs) : null,
            resolver: probe.resolverUsed,
            detail: probe.detail,
          })),
        );
        const reachable = probes.filter((probe) => probe.status === "reachable").length;
        pushToast(
          "Bypass probe finished",
          reachable > 0 ? "success" : "warning",
          `${reachable}/${probes.length} reachable · resolver ${probes[0]?.resolverUsed ?? resolverLabel}`,
        );
      } catch (error) {
        const message = describeError(error);
        setBypassResults(
          makeBypassRows().map((row) => ({ ...row, status: "blocked", detail: message })),
        );
        pushToast("Bypass probe failed", "error", message);
      } finally {
        setBypassRunning(false);
      }
      return;
    }

    for (const target of BYPASS_TARGETS) {
      await sleep(420 + Math.random() * 460);
      const reachable = Math.random() < reachableChance;
      setBypassResults((prev) =>
        prev.map((row) =>
          row.targetId === target.id
            ? {
                ...row,
                status: reachable ? "reachable" : "blocked",
                latencyMs: reachable ? Math.round(38 + Math.random() * 120) : null,
                detail: reachable ? "TLS handshake completed" : "Handshake reset (possible sanction)",
              }
            : row,
        ),
      );
    }

    setBypassRunning(false);
    pushToast("Bypass probe finished", "success", `Resolver under test: ${resolverLabel}`);
  }, [activeDns, dnsConfig, activeAdapterId, bridgeReady, bypassRunning, pushToast]);

  const updateSetting = useCallback(
    <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
      setSettings((prev) => ({ ...prev, [key]: value }));

      if (key === "autoStart") {
        const enabled = value as boolean;
        if (!isTauri()) return;
        void setAutostartEnabled(enabled)
          .then((verified) => setSettings((prev) => ({ ...prev, autoStart: verified })))
          .catch((error) => {
            // The registry refused: show the real state, not the wish.
            setSettings((prev) => ({ ...prev, autoStart: !enabled }));
            pushToast("Startup entry failed", "error", describeError(error));
          });
      }

      if (key === "notifications" && value && typeof Notification !== "undefined") {
        if (Notification.permission === "default") {
          void Notification.requestPermission().catch(() => {});
        }
      }
    },
    [pushToast],
  );

  const resetSettings = useCallback(() => {
    setSettings({ ...DEFAULT_SETTINGS });
    pushToast("Settings restored", "success", "Defaults re-applied to this session");
  }, [pushToast]);

  const syncFromGithub = useCallback(async () => {
    if (syncing) return;
    let host = "remote";
    try {
      host = new URL(settings.githubRawUrl).hostname;
    } catch {
      host = "invalid url";
    }
    setSyncing(true);
    pushToast("Pulling resolver list", "info", host);

    if (!bridgeReady) {
      await sleep(1600);
      setSyncing(false);
      pushToast("Resolver list synced", "success", "Simulated pull · the Tauri core is offline");
      return;
    }

    try {
      const incoming = await invokeSyncGithubDnsList(settings.githubRawUrl);
      const { next, added, updated } = mergeIncomingServers(serversRef.current, incoming, false);
      serversRef.current = next;
      setServers(next);
      pushToast(
        "Resolver list synced",
        "success",
        `${incoming.length} verified · ${added} added · ${updated} updated`,
      );
    } catch (error) {
      pushToast("Sync failed", "error", describeError(error));
    } finally {
      setSyncing(false);
    }
  }, [settings.githubRawUrl, syncing, bridgeReady, pushToast]);

  /** `{ servers: [...] }` manifest of the user's own and pinned resolvers. */
  const exportDnsManifest = useCallback(() => {
    const byPrimary = new Map<string, DnsServer>();
    for (const server of servers) {
      if ((server.custom || server.pinned) && !byPrimary.has(server.primary)) {
        byPrimary.set(server.primary, server);
      }
    }
    const rows = [...byPrimary.values()];
    if (rows.length === 0) {
      pushToast("Nothing to export", "warning", "Pin or create a resolver first");
      return;
    }
    const manifest = {
      version: 1,
      servers: rows.map((server) => ({
        id: server.id,
        name: server.name,
        nameFa: server.nameFa ?? null,
        provider: server.provider,
        primary: server.primary,
        secondary: server.secondary,
        category: server.category,
        tags: server.tags,
        description: server.description ?? null,
      })),
    };
    const blob = new Blob([JSON.stringify(manifest, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "dns_list.json";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    pushToast("Manifest exported", "success", `${rows.length} resolvers · dns_list.json`);
  }, [servers, pushToast]);

  /** Local import through the Rust validator, merged like a GitHub pull. */
  const importDnsManifest = useCallback(
    async (json: string) => {
      if (!bridgeReady) {
        pushToast("Import needs the desktop core", "warning", "The manifest validator runs in Rust");
        return;
      }
      try {
        const incoming = await invokeImportDnsManifest(json);
        const { next, added, updated } = mergeIncomingServers(serversRef.current, incoming, true);
        serversRef.current = next;
        setServers(next);
        pushToast(
          "Manifest imported",
          "success",
          `${incoming.length} verified · ${added} added · ${updated} updated`,
        );
      } catch (error) {
        pushToast("Import failed", "error", describeError(error));
      }
    },
    [bridgeReady, pushToast],
  );

  const exitApp = useCallback(() => {
    if (!isTauri()) {
      pushToast("Quit needs the desktop shell", "info");
      return;
    }
    void invokeExitApp().catch((error) => pushToast("Quit failed", "error", describeError(error)));
  }, [pushToast]);

  /* Tray actions that need the selected adapter; Rust owns show/hide and quit. */
  const trayActionsRef = useRef({ applyDns, resetDhcp, flushDns, servers });
  useEffect(() => {
    trayActionsRef.current = { applyDns, resetDhcp, flushDns, servers };
  }, [applyDns, resetDhcp, flushDns, servers]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    void listenTrayActions((action) => {
      const handlers = trayActionsRef.current;
      if (action === "engage") {
        const target =
          handlers.servers.find((server) => server.pinned) ??
          handlers.servers.find((server) => server.id === "electro") ??
          handlers.servers[0];
        if (target) handlers.applyDns(target.id);
      } else if (action === "reset-dhcp") {
        handlers.resetDhcp();
      } else if (action === "flush-dns") {
        void handlers.flushDns();
      }
    }).then((stop) => {
      if (cancelled) stop();
      else unlisten = stop;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  const value = useMemo<AppContextValue>(
    () => ({
      view,
      setView,
      servers,
      pinnedServers,
      activeDns,
      activeDnsId,
      connection,
      adapters,
      activeAdapter,
      activeAdapterId,
      setActiveAdapter,
      dnsConfig,
      bridgeReady,
      telemetryLive,
      traffic,
      stats,
      streamPaused,
      toggleStream,
      benchmark,
      runBenchmark,
      applyDns,
      disconnect,
      resetDhcp,
      pingServer,
      addCustomDns,
      removeDns,
      togglePin,
      previousDnsSnapshot,
      rollbackDns,
      ipv6Enabled,
      toggleIpv6,
      flushing,
      flushDns,
      bypassResults,
      bypassRunning,
      runBypassTest,
      settings,
      updateSetting,
      resetSettings,
      syncFromGithub,
      syncing,
      exportDnsManifest,
      importDnsManifest,
      exitApp,
      toasts,
      pushToast,
      dismissToast,
    }),
    [
      view,
      servers,
      pinnedServers,
      activeDns,
      activeDnsId,
      connection,
      adapters,
      activeAdapter,
      activeAdapterId,
      setActiveAdapter,
      dnsConfig,
      bridgeReady,
      telemetryLive,
      traffic,
      stats,
      streamPaused,
      toggleStream,
      benchmark,
      runBenchmark,
      applyDns,
      disconnect,
      resetDhcp,
      pingServer,
      addCustomDns,
      removeDns,
      togglePin,
      previousDnsSnapshot,
      rollbackDns,
      ipv6Enabled,
      toggleIpv6,
      flushing,
      flushDns,
      bypassResults,
      bypassRunning,
      runBypassTest,
      settings,
      updateSetting,
      resetSettings,
      syncFromGithub,
      syncing,
      exportDnsManifest,
      importDnsManifest,
      exitApp,
      toasts,
      pushToast,
      dismissToast,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside <AppProvider>");
  return ctx;
}

export type { CustomDnsInput };
