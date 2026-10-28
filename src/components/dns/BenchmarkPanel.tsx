import { useMemo } from "react";
import { Activity, Crosshair, Loader2, Play, Timer, TrendingDown } from "lucide-react";
import { useApp } from "../../store/AppStore";
import { cn } from "../../lib/cn";
import { latencyBarTone, latencyBars } from "../../lib/format";
import { LatencyMeter } from "../ui/Indicators";
import { HudLabel } from "../ui/GlassCard";

interface BenchmarkPanelProps {
  /** Ids currently visible in the vault list, used as the sweep scope. */
  scopeIds: string[];
}

export function BenchmarkPanel({ scopeIds }: BenchmarkPanelProps) {
  const { benchmark, runBenchmark, servers, bridgeReady } = useApp();

  const done = benchmark.results.filter((row) => row.status === "done");
  const best = done.reduce<number | null>(
    (acc, row) => (row.latencyMs !== null && (acc === null || row.latencyMs < acc) ? row.latencyMs : acc),
    null,
  );
  const average = done.length
    ? Math.round(done.reduce((sum, row) => sum + (row.latencyMs ?? 0), 0) / done.length)
    : null;
  const jitter = done.length
    ? Number((done.reduce((sum, row) => sum + (row.jitterMs ?? 0), 0) / done.length).toFixed(1))
    : null;

  const hasRun = benchmark.results.length > 0;
  const rows = useMemo(() => {
    if (hasRun) {
      return [...benchmark.results].sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 12);
    }
    return servers
      .filter((s) => s.latency !== null)
      .sort((a, b) => (a.latency ?? 999) - (b.latency ?? 999))
      .slice(0, 12)
      .map((s) => ({
        serverId: s.id,
        name: s.name,
        category: s.category,
        latencyMs: s.latency,
        jitterMs: null,
        lossPercent: 0,
        score: Math.round(100 - (s.latency ?? 0) * 0.72),
        status: "done" as const,
      }));
  }, [benchmark.results, hasRun, servers]);

  const scopeCount = scopeIds.length || servers.length;

  return (
    <aside className="glass flex w-[268px] shrink-0 flex-col overflow-hidden p-0">
      <div className="flex items-center justify-between px-3.5 pt-3.5">
        <div className="flex items-center gap-2">
          <Crosshair size={12} className="text-neon" />
          <HudLabel>Benchmark</HudLabel>
        </div>
        <span
          className={cn(
            "rounded border px-1.5 py-[2px] font-mono text-[7px] uppercase tracking-[0.14em]",
            benchmark.running
              ? "border-amber/25 bg-amber/10 text-amber"
              : hasRun
                ? "border-mint/25 bg-mint/10 text-mint"
                : "border-white/10 bg-white/[0.03] text-ink-500",
          )}
        >
          {benchmark.running ? "running" : hasRun ? "ready" : "idle"}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-1.5 px-3.5">
        {[
          { label: "Best", value: best, tone: "text-mint", icon: TrendingDown },
          { label: "Avg", value: average, tone: "text-neon", icon: Timer },
          { label: "Jitter", value: jitter, tone: "text-violet", icon: Activity },
        ].map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2 py-1.5">
              <div className="flex items-center gap-1 text-ink-600">
                <Icon size={8} />
                <span className="font-mono text-[7px] uppercase tracking-[0.12em]">{stat.label}</span>
              </div>
              <p className={cn("hud-value mt-0.5 text-[13px] leading-none", stat.value === null ? "text-ink-600" : stat.tone)}>
                {stat.value === null ? "—" : stat.value}
                {stat.value !== null && <span className="ml-0.5 font-mono text-[7px] text-ink-600">ms</span>}
              </p>
            </div>
          );
        })}
      </div>

      <div className="mt-3 px-3.5">
        <button
          type="button"
          onClick={() => void runBenchmark({ ids: scopeIds })}
          disabled={benchmark.running || scopeIds.length === 0}
          className="flex h-[30px] w-full items-center justify-center gap-1.5 rounded-md border border-neon/35 bg-neon/[0.1] font-mono text-[8.5px] uppercase tracking-[0.16em] text-neon shadow-[0_0_24px_-12px_rgba(0,240,255,1)] transition-all hover:border-neon/60 hover:bg-neon/[0.16] disabled:opacity-50"
        >
          {benchmark.running ? <Loader2 size={10} className="animate-spin" /> : <Play size={10} />}
          {benchmark.running ? `sweeping ${benchmark.progress}%` : `run sweep · ${scopeCount}`}
        </button>

        <div className="mt-2 h-[2px] w-full overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-neon via-neon to-violet transition-all duration-300"
            style={{ width: `${benchmark.running || hasRun ? benchmark.progress : 0}%` }}
          />
        </div>
        <p className="mt-1.5 truncate font-mono text-[7.5px] uppercase tracking-[0.1em] text-ink-600">
          {benchmark.running
            ? `probing ${servers.find((s) => s.id === benchmark.currentId)?.name ?? "…"}`
            : hasRun
              ? `${done.length} probes · single pass`
              : "no sweep · showing cached estimates"}
        </p>
      </div>

      <div className="mt-2 flex items-center justify-between border-b border-white/[0.06] px-3.5 pb-1">
        <span className="hud-label text-[7.5px]">Ranked</span>
        <span className="font-mono text-[7px] uppercase tracking-[0.12em] text-ink-600">score / ping</span>
      </div>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-2 py-1.5">
        <div className="space-y-0.5">
          {rows.map((row, index) => {
            const server = servers.find((s) => s.id === row.serverId);
            const score = row.score || 0;
            return (
              <div
                key={row.serverId}
                className="group flex items-center gap-2 rounded-md px-1.5 py-[5px] transition-colors hover:bg-white/[0.035]"
              >
                <span className={cn("w-3 shrink-0 font-mono text-[7.5px]", index === 0 ? "text-mint" : "text-ink-600")}>
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-1">
                    <span className="truncate text-[9.5px] leading-tight text-ink-200">{row.name}</span>
                    <span className="hud-value shrink-0 text-[9px] text-ink-300">
                      {row.latencyMs ?? "—"}
                      <span className="ml-0.5 text-[6.5px] text-ink-600">ms</span>
                    </span>
                  </div>
                  <div className="mt-1 h-[2px] w-full overflow-hidden rounded-full bg-white/[0.05]">
                    <div
                      className={cn("h-full rounded-full transition-all duration-500", latencyBarTone(row.latencyMs))}
                      style={{ width: `${Math.max(4, score)}%`, opacity: 0.85 }}
                    />
                  </div>
                </div>
                {server && (
                  <LatencyMeter
                    latency={row.latencyMs}
                    bars={latencyBars(row.latencyMs)}
                    tone={latencyBarTone(row.latencyMs)}
                    className="shrink-0 scale-90"
                  />
                )}
              </div>
            );
          })}
          {rows.length === 0 && (
            <p className="px-1.5 py-3 text-[9.5px] leading-relaxed text-ink-500">No resolvers in scope.</p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-white/[0.06] px-3.5 py-2">
        <span className="font-mono text-[7px] uppercase tracking-[0.1em] text-ink-600">top 12 · weighted score</span>
        <span className="font-mono text-[7px] uppercase tracking-[0.1em] text-ink-600">
          {bridgeReady ? "udp:53 · live" : "icmp · simulated"}
        </span>
      </div>
    </aside>
  );
}
