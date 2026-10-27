import { useMemo, useState } from "react";
import {
  ArrowUpDown,
  Github,
  Loader2,
  Pin,
  PinOff,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import { useApp } from "../../store/AppStore";
import { cn } from "../../lib/cn";
import {
  CATEGORY_META,
  latencyBarTone,
  latencyBars,
  latencyTone,
} from "../../lib/format";
import type { DnsCategory } from "../../types/network";
import { CategoryBadge, LatencyMeter } from "../ui/Indicators";
import { HudLabel } from "../ui/GlassCard";
import { BenchmarkPanel } from "./BenchmarkPanel";
import { CustomDnsModal } from "./CustomDnsModal";

type Filter = "all" | DnsCategory;
type SortMode = "latency" | "name";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "gaming", label: "Game" },
  { id: "sanction", label: "Bypass" },
  { id: "security", label: "Secure" },
  { id: "general", label: "Global" },
];

export function DnsListManager() {
  const {
    servers,
    activeDnsId,
    connection,
    applyDns,
    pingServer,
    togglePin,
    removeDns,
    syncFromGithub,
    syncing,
  } = useApp();

  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortMode>("latency");
  const [modalOpen, setModalOpen] = useState(false);
  const [pinging, setPinging] = useState<Set<string>>(new Set());

  const counts = useMemo(() => {
    const base: Record<Filter, number> = { all: servers.length, gaming: 0, sanction: 0, security: 0, general: 0 };
    for (const server of servers) base[server.category] += 1;
    return base;
  }, [servers]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = servers.filter((server) => {
      const inCategory = filter === "all" || server.category === filter;
      const inSearch =
        needle.length === 0 ||
        server.name.toLowerCase().includes(needle) ||
        server.provider.toLowerCase().includes(needle) ||
        server.nameFa?.toLowerCase().includes(needle) ||
        server.primary.includes(needle) ||
        server.secondary.includes(needle) ||
        server.tags.some((tag) => tag.includes(needle));
      return inCategory && inSearch;
    });
    return list.sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name)
        : (a.latency ?? 999) - (b.latency ?? 999),
    );
  }, [servers, filter, query, sort]);

  const scopeIds = useMemo(() => visible.map((server) => server.id), [visible]);

  const runPing = async (id: string) => {
    setPinging((prev) => new Set(prev).add(id));
    await pingServer(id);
    setPinging((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const pinnedCount = servers.filter((server) => server.pinned).length;
  const customCount = servers.filter((server) => server.custom).length;

  return (
    <div className="relative flex h-full min-h-0 flex-col gap-2.5">
      {/* Toolbar */}
      <div className="glass flex shrink-0 items-center gap-1.5 px-2.5 py-2">
        <div className="flex items-center gap-1">
          {FILTERS.map((item) => {
            const active = filter === item.id;
            const meta = item.id === "all" ? null : CATEGORY_META[item.id];
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setFilter(item.id)}
                aria-pressed={active}
                className={cn(
                  "flex h-[24px] items-center gap-1 rounded-md border px-2 font-mono text-[8px] uppercase tracking-[0.1em] transition-all",
                  active
                    ? meta
                      ? cn(meta.bg, meta.border, meta.text)
                      : "border-neon/35 bg-neon/12 text-neon"
                    : "border-transparent text-ink-500 hover:border-white/10 hover:bg-white/[0.03] hover:text-ink-200",
                )}
              >
                {meta && <span className={cn("h-1 w-1 rounded-full", meta.dot)} />}
                {item.label}
                <span className={cn("text-[7px]", active ? "opacity-70" : "text-ink-600")}>{counts[item.id]}</span>
              </button>
            );
          })}
        </div>

        <div className="flex-1" />

        <div className="relative">
          <Search size={11} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-ink-600" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name or IP"
            aria-label="Search resolvers"
            className="h-[24px] w-[142px] rounded-md border border-white/[0.08] bg-black/25 pl-6 pr-2 text-[10px] text-ink-200 placeholder:text-ink-600 transition-colors focus:border-neon/40 focus:outline-none"
          />
        </div>

        <button
          type="button"
          onClick={() => setSort((prev) => (prev === "latency" ? "name" : "latency"))}
          className="flex h-[24px] items-center gap-1 rounded-md border border-white/[0.08] bg-white/[0.02] px-2 font-mono text-[7.5px] uppercase tracking-[0.1em] text-ink-400 transition-colors hover:border-white/20 hover:text-ink-100"
          title="Toggle sort"
        >
          <ArrowUpDown size={9} />
          {sort === "latency" ? "ping" : "name"}
        </button>

        <span className="mx-0.5 h-4 w-px bg-white/10" />

        <button
          type="button"
          onClick={() => void syncFromGithub()}
          disabled={syncing}
          className="flex h-[24px] items-center gap-1.5 rounded-md border border-white/[0.08] bg-white/[0.02] px-2 font-mono text-[7.5px] uppercase tracking-[0.1em] text-ink-300 transition-colors hover:border-violet/35 hover:text-violet disabled:opacity-50"
          title="Sync resolver list from the configured GitHub raw URL"
        >
          {syncing ? <Loader2 size={9} className="animate-spin" /> : <Github size={9} />}
          {syncing ? "syncing" : "sync"}
        </button>

        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="flex h-[24px] items-center gap-1 rounded-md border border-neon/35 bg-neon/[0.1] px-2 font-mono text-[7.5px] uppercase tracking-[0.1em] text-neon transition-all hover:border-neon/60 hover:bg-neon/[0.16]"
        >
          <Plus size={9} /> add
        </button>
      </div>

      <div className="flex min-h-0 flex-1 gap-2.5">
        {/* Resolver table */}
        <section className="glass flex min-w-0 flex-1 flex-col overflow-hidden p-0">
          <div className="grid grid-cols-[1.5fr_1.15fr_62px_84px] items-center gap-2 border-b border-white/[0.06] px-3 py-1.5">
            <HudLabel className="text-[7.5px]">Resolver</HudLabel>
            <HudLabel className="text-[7.5px]">Endpoints</HudLabel>
            <HudLabel className="text-[7.5px]">Ping</HudLabel>
            <HudLabel className="text-right text-[7.5px]">Control</HudLabel>
          </div>

          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
            {visible.map((server) => {
              const active = server.id === activeDnsId && connection.phase === "connected";
              const applying = server.id === activeDnsId && connection.phase === "connecting";
              const busy = pinging.has(server.id);
              return (
                <div
                  key={server.id}
                  className={cn(
                    "group relative grid grid-cols-[1.5fr_1.15fr_62px_84px] items-center gap-2 border-b border-white/[0.04] px-3 py-[7px] transition-colors",
                    active ? "bg-neon/[0.05]" : "hover:bg-white/[0.025]",
                  )}
                >
                  {active && <span className="absolute inset-y-0 left-0 w-[2px] bg-neon shadow-[0_0_10px_rgba(0,240,255,0.8)]" />}

                  <div className="flex min-w-0 items-center gap-2">
                    <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", CATEGORY_META[server.category].dot)} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate text-[11px] font-medium leading-tight text-ink-100">{server.name}</p>
                        {server.nameFa && (
                          <span className="shrink-0 text-[8.5px] leading-tight text-ink-500">{server.nameFa}</span>
                        )}
                        {server.custom && (
                          <span className="shrink-0 rounded border border-white/10 px-1 font-mono text-[6.5px] uppercase tracking-[0.1em] text-ink-500">
                            own
                          </span>
                        )}
                        {server.id === activeDnsId && (
                          <span className="shrink-0 font-mono text-[6.5px] uppercase tracking-[0.12em] text-neon/80">
                            {applying ? "binding" : "live"}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5">
                        <span className="truncate font-mono text-[7.5px] uppercase tracking-[0.08em] text-ink-600">
                          {server.provider} · {server.tags.slice(0, 2).join(" · ")}
                        </span>
                        <CategoryBadge category={server.category} compact className="shrink-0 scale-[0.82] origin-left" />
                      </div>
                    </div>
                    {server.custom && (
                      <button
                        type="button"
                        onClick={() => removeDns(server.id)}
                        aria-label={`Delete ${server.name}`}
                        className="ml-auto shrink-0 text-ink-600 opacity-0 transition-all hover:text-rose group-hover:opacity-100"
                      >
                        <Trash2 size={10} />
                      </button>
                    )}
                  </div>

                  <div className="min-w-0">
                    <p className="hud-value truncate text-[9.5px] leading-tight text-ink-200">{server.primary}</p>
                    <p className="hud-value truncate text-[8px] leading-tight text-ink-600">
                      {server.secondary || "no secondary"}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <LatencyMeter
                      latency={server.latency}
                      bars={latencyBars(server.latency)}
                      tone={latencyBarTone(server.latency)}
                    />
                    <span className={cn("hud-value text-[9.5px]", latencyTone(server.latency))}>
                      {busy ? "…" : (server.latency ?? "—")}
                    </span>
                  </div>

                  <div className="flex items-center justify-end gap-0.5">
                    <button
                      type="button"
                      onClick={() => togglePin(server.id)}
                      aria-label={server.pinned ? `Unpin ${server.name}` : `Pin ${server.name}`}
                      aria-pressed={server.pinned}
                      title={server.pinned ? "Unpin from quick relays" : "Pin to quick relays"}
                      className={cn(
                        "grid h-[20px] w-[20px] place-items-center rounded border border-transparent transition-colors",
                        server.pinned
                          ? "text-violet hover:bg-violet/10"
                          : "text-ink-600 hover:border-white/10 hover:text-ink-200",
                      )}
                    >
                      {server.pinned ? <Pin size={9} fill="currentColor" /> : <PinOff size={9} />}
                    </button>
                    <button
                      type="button"
                      onClick={() => void runPing(server.id)}
                      disabled={busy}
                      aria-label={`Ping ${server.name}`}
                      title="Probe latency"
                      className="grid h-[20px] w-[20px] place-items-center rounded border border-transparent text-ink-500 transition-colors hover:border-white/10 hover:text-neon disabled:opacity-50"
                    >
                      <RefreshCw size={9} className={busy ? "animate-spin" : ""} />
                    </button>
                    <button
                      type="button"
                      onClick={() => applyDns(server.id)}
                      disabled={active || applying}
                      aria-label={`Use ${server.name}`}
                      className={cn(
                        "h-[20px] min-w-[38px] rounded border px-1.5 font-mono text-[7px] uppercase tracking-[0.12em] transition-all",
                        active
                          ? "border-neon/30 bg-neon/10 text-neon/80"
                          : "border-white/10 bg-white/[0.03] text-ink-300 hover:border-neon/40 hover:bg-neon/10 hover:text-neon",
                      )}
                    >
                      {active ? "live" : applying ? "…" : "use"}
                    </button>
                  </div>
                </div>
              );
            })}

            {visible.length === 0 && (
              <div className="flex h-full min-h-[180px] flex-col items-center justify-center gap-2 px-6 text-center">
                <Search size={16} className="text-ink-600" />
                <p className="text-[11px] text-ink-300">No resolvers match this filter.</p>
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setFilter("all");
                  }}
                  className="font-mono text-[8px] uppercase tracking-[0.12em] text-neon/80 hover:text-neon"
                >
                  clear filters
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-white/[0.06] px-3 py-1.5">
            <span className="font-mono text-[7.5px] uppercase tracking-[0.1em] text-ink-600">
              {visible.length} / {servers.length} resolvers · {pinnedCount} pinned · {customCount} custom
            </span>
            <span className="hidden font-mono text-[7.5px] uppercase tracking-[0.1em] text-ink-600 sm:block">
              seed 2026.10 · ipv4 only
            </span>
          </div>
        </section>

        <BenchmarkPanel scopeIds={scopeIds} />
      </div>

      {modalOpen && <CustomDnsModal onClose={() => setModalOpen(false)} />}
    </div>
  );
}
