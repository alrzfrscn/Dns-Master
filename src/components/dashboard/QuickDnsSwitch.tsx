import { ArrowUpRight, Eraser, Loader2, RotateCcw, Sparkles, Zap } from "lucide-react";
import { useApp } from "../../store/AppStore";
import { cn } from "../../lib/cn";
import { latencyBarTone, latencyBars, latencyTone, seededNoise } from "../../lib/format";
import { GlassCard, HudLabel } from "../ui/GlassCard";
import { CategoryBadge, LatencyMeter } from "../ui/Indicators";

export function QuickDnsSwitch() {
  const {
    pinnedServers,
    applyDns,
    activeDnsId,
    connection,
    flushDns,
    flushing,
    resetDhcp,
    runBenchmark,
    benchmark,
    setView,
  } = useApp();

  const busy = ["connecting", "disconnecting", "resetting"].includes(connection.phase);

  return (
    <GlassCard flush className="col-span-7 flex min-h-0 flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-3">
        <div className="flex items-center gap-2">
          <Zap size={12} className="text-neon" />
          <HudLabel>Quick relays</HudLabel>
          <span className="rounded border border-white/[0.07] bg-white/[0.03] px-1.5 py-[2px] font-mono text-[7.5px] uppercase tracking-[0.14em] text-ink-500">
            pinned {pinnedServers.length}/4
          </span>
        </div>
        <button
          type="button"
          onClick={() => setView("vault")}
          className="group flex items-center gap-1 font-mono text-[8.5px] uppercase tracking-[0.16em] text-ink-500 transition-colors hover:text-neon"
        >
          full vault
          <ArrowUpRight size={10} className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
        </button>
      </div>

      <div className="mt-2.5 flex items-center gap-1.5 px-3">
        <button
          type="button"
          onClick={() => void flushDns()}
          disabled={flushing}
          className="flex h-[27px] flex-1 items-center justify-center gap-1.5 rounded-md border border-white/[0.07] bg-white/[0.025] font-mono text-[8px] uppercase tracking-[0.14em] text-ink-300 transition-all hover:border-mint/30 hover:bg-mint/[0.06] hover:text-mint disabled:opacity-50"
        >
          {flushing ? <Loader2 size={10} className="animate-spin" /> : <Eraser size={10} />}
          {flushing ? "flushing" : "flush dns"}
        </button>
        <button
          type="button"
          onClick={resetDhcp}
          className="flex h-[27px] flex-1 items-center justify-center gap-1.5 rounded-md border border-white/[0.07] bg-white/[0.025] font-mono text-[8px] uppercase tracking-[0.14em] text-ink-300 transition-all hover:border-rose/30 hover:bg-rose/[0.06] hover:text-rose"
        >
          <RotateCcw size={10} />
          reset dns
        </button>
        <button
          type="button"
          onClick={() => void runBenchmark({ ids: pinnedServers.map((s) => s.id), applyBest: true })}
          disabled={benchmark.running || pinnedServers.length === 0}
          className="flex h-[27px] flex-[1.25] items-center justify-center gap-1.5 rounded-md border border-neon/30 bg-neon/[0.08] font-mono text-[8px] uppercase tracking-[0.14em] text-neon shadow-[0_0_20px_-10px_rgba(0,240,255,0.9)] transition-all hover:border-neon/60 hover:bg-neon/[0.14] disabled:opacity-50"
        >
          {benchmark.running ? <Loader2 size={10} className="animate-spin" /> : <Sparkles size={10} />}
          {benchmark.running ? `scanning ${benchmark.progress}%` : "find fastest"}
        </button>
      </div>

      <div className="mt-2 grid min-h-0 flex-1 grid-cols-2 gap-1.5 px-3 pb-1">
        {pinnedServers.map((server) => {
          const active = activeDnsId === server.id && connection.phase === "connected";
          const applying = activeDnsId === server.id && connection.phase === "connecting";
          return (
            <button
              key={server.id}
              type="button"
              disabled={busy}
              onClick={() => applyDns(server.id)}
              aria-pressed={active}
              className={cn(
                "group relative flex flex-col justify-between overflow-hidden rounded-lg border px-2.5 py-2 text-left transition-all duration-300",
                active
                  ? "border-neon/40 bg-neon/[0.07] shadow-[inset_0_0_24px_rgba(0,240,255,0.08),0_0_24px_-16px_rgba(0,240,255,0.9)]"
                  : "border-white/[0.07] bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.045]",
                busy && "cursor-not-allowed opacity-70",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "absolute inset-x-0 top-0 h-[1.5px] transition-opacity",
                  active ? "bg-gradient-to-r from-transparent via-neon to-transparent opacity-100" : "opacity-0 group-hover:opacity-50",
                  active ? "" : "bg-gradient-to-r from-transparent via-white/40 to-transparent",
                )}
              />
              <div className="flex w-full items-center justify-between gap-2">
                <span className="truncate text-[11px] font-medium leading-none text-ink-100">{server.name}</span>
                <CategoryBadge category={server.category} compact className="shrink-0 scale-[0.9] origin-right" />
              </div>

              <div className="my-auto flex w-full items-end justify-between gap-2 py-1">
                <p className={cn("hud-value shrink-0 text-[15px] leading-none", latencyTone(server.latency))}>
                  {server.latency ?? "—"}
                  <span className="ml-0.5 font-mono text-[7.5px] text-ink-600">ms</span>
                </p>
                <div className="flex h-[18px] flex-1 items-end justify-end gap-[2px]" aria-hidden="true">
                  {Array.from({ length: 11 }).map((_, index) => {
                    const noise = seededNoise(`${server.id}-${index}`);
                    const height = 4 + noise * 12 * (server.latency && server.latency < 45 ? 1 : 0.62);
                    return (
                      <span
                        key={index}
                        className={cn(
                          "w-[2.5px] rounded-sm transition-opacity",
                          latencyBarTone(server.latency),
                          active ? "opacity-90" : "opacity-35 group-hover:opacity-70",
                        )}
                        style={{ height: `${height}px` }}
                      />
                    );
                  })}
                </div>
              </div>

              <div className="flex w-full items-center justify-between gap-1.5">
                <p className="truncate font-mono text-[7.5px] leading-none tracking-tight text-ink-600">
                  {server.primary}
                </p>
                {applying ? (
                  <Loader2 size={10} className="shrink-0 animate-spin text-neon" />
                ) : (
                  <LatencyMeter
                    latency={server.latency}
                    bars={latencyBars(server.latency)}
                    tone={latencyBarTone(server.latency)}
                    className="shrink-0"
                  />
                )}
              </div>
            </button>
          );
        })}
        {pinnedServers.length === 0 && (
          <div className="col-span-2 grid place-items-center rounded-lg border border-dashed border-white/10 text-[10px] text-ink-500">
            Pin resolvers in the vault to populate quick slots.
          </div>
        )}
      </div>
    </GlassCard>
  );
}
