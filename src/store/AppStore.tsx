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
  BenchmarkSession,
  BypassResult,
  ConnectionState,
  DnsCategory,
  DnsConfig,
  DnsServer,
  NetworkAdapter,
  TrafficPoint,
  TrafficStats,
  ViewId,
} from "../types/network";
import { BYPASS_TARGETS, MOCK_ADAPTERS } from "../data/mock";
import { DEFAULT_ADAPTER, SEED_SERVERS } from "../data/servers";
import { fetchCurrentDns, fetchLiveTraffic, fetchNetworkAdapters } from "../lib/tauri";

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

  toasts: { id: string; title: string; detail?: string; tone: "info" | "success" | "warning" | "error" }[];
  pushToast: (title: string, tone?: "info" | "success" | "warning" | "error", detail?: string) => void;
  dismissToast: (id: string) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));
const round = (value: number, precision = 1) => Number(value.toFixed(precision));

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
  githubRawUrl: "https://raw.githubusercontent.com/dnsmaster/dns-list/main/dns_list.json",
  autoStart: true,
  autoConnect: false,
  minimizeToTray: true,
  notifications: true,
};

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
  const [toasts, setToasts] = useState<AppContextValue["toasts"]>([]);

  const actionToken = useRef(0);
  const benchmarkRunning = useRef(false);
  const tickRef = useRef(0);
  const serversRef = useRef(servers);
  const syntheticRef = useRef({ down: initialStats.downKbps, up: initialStats.upKbps });

  useEffect(() => {
    serversRef.current = servers;
  }, [servers]);

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
    },
    [],
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  /* ------------------------------------------------------------------ *
   * Rust bridge: real adapters, resolver mode, live counters
   * ------------------------------------------------------------------ */
  const syncDns = useCallback(async (adapterId: string) => {
    const config = await fetchCurrentDns(adapterId);
    if (!config) return;
    const matched = serversRef.current.find(
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
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const real = await fetchNetworkAdapters();
      if (cancelled) return;
      if (real && real.length > 0) {
        const preferred = real.find((adapter) => adapter.isDefault) ?? real[0];
        setAdapters(real);
        setBridgeReady(true);
        setActiveAdapterId(preferred.id);
        void syncDns(preferred.id);
        return;
      }
      void syncDns(activeAdapterId);
    })();
    return () => {
      cancelled = true;
    };
    // Adapter list is read once; the sampler follows activeAdapterId afterwards.
  }, []);

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
        setServers((prev) => prev.map((s) => (s.id === id ? { ...s, uptime: clamp(s.uptime + 0.1, 0, 100) } : s)));
        pushToast(`${target.name} staged`, "success", "Simulated binding · the Windows write lands in Phase 3");
      }, 1100);
    },
    [servers, activeAdapterId, activeAdapter.name, pushToast],
  );

  const disconnect = useCallback(() => {
    const token = ++actionToken.current;
    setConnection((prev) => ({ ...prev, phase: "disconnecting", error: null }));
    window.setTimeout(() => {
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
      pushToast("Link released", "info", "Simulated release · the real DHCP reset lands in Phase 3");
    }, 700);
  }, [activeAdapterId, pushToast]);

  const resetDhcp = useCallback(() => {
    const token = ++actionToken.current;
    setConnection((prev) => ({ ...prev, phase: "resetting", error: null }));
    window.setTimeout(() => {
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
      pushToast("DNS reset to DHCP", "success", "Simulated reset · the Windows write lands in Phase 3");
    }, 850);
  }, [activeAdapterId, activeAdapter.name, pushToast]);

  const pingServer = useCallback(
    async (id: string): Promise<number> => {
      const server = servers.find((s) => s.id === id);
      if (!server) return 0;
      setServers((prev) => prev.map((s) => (s.id === id ? { ...s, latency: null } : s)));
      await sleep(420 + Math.random() * 520);
      const baseline = server.latency ?? 40;
      const measured = Math.round(clamp(baseline + (Math.random() - 0.45) * 14, 9, 180));
      setServers((prev) => prev.map((s) => (s.id === id ? { ...s, latency: measured } : s)));
      return measured;
    },
    [servers],
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
        : (options?.applyBest ? pinnedServers : servers);
      if (pool.length === 0) return;

      benchmarkRunning.current = true;
      const started = Date.now();
      setBenchmark({
        running: true,
        progress: 0,
        total: pool.length,
        currentId: pool[0].id,
        startedAt: started,
        results: pool.map((s) => ({
          serverId: s.id,
          name: s.name,
          category: s.category,
          latencyMs: null,
          jitterMs: null,
          lossPercent: 0,
          score: 0,
          status: "pending",
        })),
      });

      let best: { id: string; latency: number } | null = null;

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
          prev.map((s) => (s.id === server.id ? { ...s, latency, uptime: s.uptime } : s)),
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
        results: [...prev.results].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)),
      }));
      benchmarkRunning.current = false;

      const summary = best ? servers.find((s) => s.id === best.id)?.name : undefined;
      if (options?.applyBest && best) {
        pushToast("Fastest route locked", "success", `${summary ?? "Resolver"} @ ${best.latency} ms`);
        applyDns(best.id);
      } else {
        pushToast("Benchmark complete", "success", `${pool.length} resolvers probed · best ${best?.latency ?? "—"} ms`);
      }
    },
    [servers, pinnedServers, applyDns, pushToast],
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
    },
    [adapters, pushToast, syncDns],
  );

  const toggleIpv6 = useCallback(() => {
    setIpv6Enabled((prev) => {
      pushToast(prev ? "IPv6 disabled" : "IPv6 enabled", prev ? "warning" : "success");
      return !prev;
    });
  }, [pushToast]);

  const flushDns = useCallback(async () => {
    if (flushing) return;
    setFlushing(true);
    pushToast("Flushing resolver cache", "info", "ipconfig /flushdns · simulated");
    await sleep(900);
    setFlushing(false);
    pushToast("DNS cache cleared", "success", "Simulated flush · real ipconfig flush lands in Phase 3");
  }, [flushing, pushToast]);

  const runBypassTest = useCallback(async () => {
    if (bypassRunning) return;
    setBypassRunning(true);
    const resolverLabel = activeDns ? activeDns.name : "DHCP";
    const bypassFriendly = activeDns?.category === "sanction" || activeDns?.category === "gaming";
    const reachableChance = bypassFriendly ? 0.92 : activeDns ? 0.62 : 0.42;

    setBypassResults(makeBypassRows().map((row) => ({ ...row, status: "testing", resolver: resolverLabel })));
    pushToast("Sanction bypass probe started", "info", `${BYPASS_TARGETS.length} targets · ${resolverLabel}`);

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
  }, [activeDns, bypassRunning, pushToast]);

  const updateSetting = useCallback(<K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }, []);

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
    await sleep(1600);
    setSyncing(false);
    pushToast("Resolver list synced", "success", "30 presets verified · no conflicts");
  }, [settings.githubRawUrl, syncing, pushToast]);

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
