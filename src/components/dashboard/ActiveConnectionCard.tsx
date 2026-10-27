import { ArrowUpRight, Cable, Gauge, Globe2, ShieldCheck, Unplug, Zap } from "lucide-react";
import { useApp } from "../../store/AppStore";
import { cn } from "../../lib/cn";
import { latencyQuality, latencyTone, formatDuration } from "../../lib/format";
import { GlassCard, HudLabel } from "../ui/GlassCard";
import { CategoryBadge } from "../ui/Indicators";
import { PowerOrb } from "../ui/PowerOrb";

export function ActiveConnectionCard() {
  const {
    connection,
    activeDns,
    activeAdapter,
    pinnedServers,
    applyDns,
    disconnect,
    resetDhcp,
    stats,
    dnsConfig,
  } = useApp();

  const connected = connection.phase === "connected" && activeDns !== null;
  const busy = ["connecting", "disconnecting", "resetting"].includes(connection.phase);
  const systemStatic = !connected && connection.mode === "static";
  const recommended = pinnedServers[0] ?? null;
  const uptime = connection.since ? formatDuration(Date.now() - connection.since) : null;

  const statusTone = connected
    ? "border-mint/30 bg-mint/10 text-mint"
    : busy
      ? "border-amber/30 bg-amber/10 text-amber"
      : systemStatic
        ? "border-neon/30 bg-neon/10 text-neon"
        : "border-violet/30 bg-violet/10 text-violet";

  const statusLabel = connected
    ? "TUNNEL ONLINE"
    : connection.phase === "connecting"
      ? "BINDING"
      : connection.phase === "disconnecting"
        ? "RELEASING"
        : connection.phase === "resetting"
          ? "RESETTING"
          : systemStatic
            ? "STATIC / SYSTEM"
            : "PASSIVE / DHCP";

  return (
    <GlassCard sheen flush className="col-span-6 flex min-h-0 flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-3.5">
        <div className="flex items-center gap-2">
          <span className="relative flex h-1.5 w-1.5">
            {connected && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-mint/70" />}
            <span className={cn("relative h-1.5 w-1.5 rounded-full", connected ? "bg-mint" : "bg-ink-500")} />
          </span>
          <HudLabel>Active link</HudLabel>
        </div>
        <span
          className={cn(
            "rounded-full border px-2 py-[3px] font-mono text-[8px] uppercase tracking-[0.16em]",
            statusTone,
          )}
        >
          {statusLabel}
        </span>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center gap-3 px-3 pb-1 pt-2">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-10 top-1/2 h-[220px] w-[220px] -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(0,240,255,0.1),transparent_65%)]"
        />
        <PowerOrb phase={connection.phase} onToggle={() => (connected ? disconnect() : applyDns(recommended?.id ?? "electro"))} onReset={resetDhcp} />

        <div className="relative flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-2">
            <span className="hud-label">{connected ? "Bound resolver" : "Fallback resolver"}</span>
            {activeDns && <CategoryBadge category={activeDns.category} compact className="scale-[0.92]" />}
          </div>

          <div className="mt-1 flex items-baseline gap-2">
            <h2 className="truncate font-display text-[21px] font-semibold leading-none tracking-[0.01em] text-ink-100">
              {activeDns?.name ?? (systemStatic ? "Custom static" : "DHCP Default")}
            </h2>
          </div>
          {activeDns?.nameFa ? (
            <p dir="rtl" className="mt-1 truncate text-right text-[10px] leading-none text-ink-500">
              {activeDns.nameFa}
            </p>
          ) : (
            <p className="mt-1 truncate font-mono text-[9px] uppercase tracking-[0.12em] text-ink-600">
              {connected ? "manual assignment" : systemStatic ? "windows resolver" : "carrier assigned"}
            </p>
          )}

          <div className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1.5">
            <div>
              <HudLabel className="text-[8px]">Primary</HudLabel>
              <p className="hud-value mt-0.5 text-[11.5px] text-ink-200">
                {activeDns?.primary ?? dnsConfig?.primary ?? "automatic"}
              </p>
            </div>
            <div>
              <HudLabel className="text-[8px]">Secondary</HudLabel>
              <p className="hud-value mt-0.5 text-[11.5px] text-ink-200">
                {activeDns?.secondary || dnsConfig?.secondary || "—"}
              </p>
            </div>
          </div>

          <div className="mt-2.5 grid grid-cols-2 gap-x-2.5 gap-y-2 border-t border-white/[0.06] pt-2">
            <div className="flex items-center gap-1.5">
              <Cable size={10} className="shrink-0 text-ink-500" />
              <div className="min-w-0">
                <p className="truncate text-[9.5px] leading-tight text-ink-200">{activeAdapter.name}</p>
                <p className="hud-value truncate text-[8px] leading-tight text-ink-500">{activeAdapter.ipv4}</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <Gauge size={10} className="shrink-0 text-ink-500" />
              <div className="min-w-0">
                <p className={cn("whitespace-nowrap text-[9.5px] leading-tight", latencyTone(stats.latencyMs))}>
                  {Math.round(stats.latencyMs)} ms · {latencyQuality(stats.latencyMs)}
                </p>
                <p className="hud-value truncate text-[8px] leading-tight text-ink-500">
                  {activeAdapter.speedMbps > 0 ? `${activeAdapter.speedMbps} Mbps` : "virtual link"}
                </p>
              </div>
            </div>
          </div>

          <button
            type="button"
            disabled={busy}
            onClick={() => (connected ? disconnect() : applyDns(recommended?.id ?? "electro"))}
            className={cn(
              "mt-2.5 flex h-[31px] w-full items-center justify-center gap-1.5 rounded-lg border font-mono text-[9px] uppercase tracking-[0.18em] transition-all duration-300",
              connected
                ? "border-rose/30 bg-rose/[0.07] text-rose/90 hover:border-rose/60 hover:bg-rose/15"
                : "border-neon/35 bg-neon/[0.11] text-neon shadow-[0_0_24px_-10px_rgba(0,240,255,0.9)] hover:border-neon/70 hover:bg-neon/[0.18]",
              busy && "cursor-wait opacity-60",
            )}
          >
            {connected ? <Unplug size={11} /> : busy ? <Zap size={11} className="animate-pulse" /> : <ArrowUpRight size={11} />}
            {busy ? "negotiating" : connected ? "release link" : `engage ${recommended?.name ?? "resolver"}`}
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-white/[0.06] px-4 py-2">
        <span className="flex items-center gap-1.5 font-mono text-[8px] uppercase tracking-[0.12em] text-ink-500">
          <Globe2 size={9} className="text-ink-600" />
          {activeAdapter.gateway} · gw
        </span>
        <span className="flex items-center gap-1.5 font-mono text-[8px] uppercase tracking-[0.12em] text-ink-500">
          <ShieldCheck size={9} className={connected ? "text-mint" : "text-ink-600"} />
          {uptime ? `up ${uptime}` : "no override"}
        </span>
      </div>
    </GlassCard>
  );
}
