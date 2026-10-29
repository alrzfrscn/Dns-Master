import { Activity, DatabaseZap, Gauge, SlidersHorizontal, Wrench } from "lucide-react";
import type { ViewId } from "../../types/network";
import { useApp } from "../../store/AppStore";
import { cn } from "../../lib/cn";
import { formatBytes, formatDuration } from "../../lib/format";

const NAV: { id: ViewId; label: string; hint: string; icon: typeof Gauge; index: string }[] = [
  { id: "dashboard", label: "Dashboard", hint: "Overview", icon: Gauge, index: "01" },
  { id: "vault", label: "DNS Vault", hint: "Benchmark", icon: DatabaseZap, index: "02" },
  { id: "tools", label: "Network Tools", hint: "Repair", icon: Wrench, index: "03" },
  { id: "settings", label: "Settings", hint: "System", icon: SlidersHorizontal, index: "04" },
];

function BrandMark() {
  return (
    <svg viewBox="0 0 40 40" className="h-9 w-9" aria-hidden="true">
      <defs>
        <linearGradient id="brand-ring" x1="4" y1="4" x2="36" y2="36" gradientUnits="userSpaceOnUse">
          <stop stopColor="#00F0FF" />
          <stop offset="1" stopColor="#A855F7" />
        </linearGradient>
      </defs>
      <circle cx="20" cy="20" r="18" fill="none" stroke="url(#brand-ring)" strokeWidth="1.4" strokeDasharray="78 36" />
      <circle cx="20" cy="20" r="13" fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth="1" />
      <path d="M22.4 7.6 12.8 21.4h6.1L16.6 32.4 27.6 17.6h-6.2z" fill="#00F0FF" opacity="0.92" />
      <circle cx="31.6" cy="9.4" r="1.6" fill="#A855F7" />
    </svg>
  );
}

export function Sidebar() {
  const { view, setView, servers, activeDns, connection, activeAdapter, activeDnsId, stats, traffic, dnsConfig, bridgeReady, telemetryLive } = useApp();

  const connected = connection.phase === "connected" && activeDns !== null;
  const since = connection.since ? formatDuration(Date.now() - connection.since) : null;
  const busSeries = traffic.slice(-24);
  const busPeak = Math.max(...busSeries.map((point) => point.downKbps), 1);

  return (
    <aside className="relative z-20 flex w-[222px] shrink-0 flex-col border-r border-white/[0.06] bg-[#080b11]/55 px-3 pb-3 pt-4 backdrop-blur-2xl">
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-1.5" data-tauri-drag-region>
        <BrandMark />
        <div className="min-w-0">
          <div className="flex items-baseline gap-1">
            <span className="font-display text-[15px] font-bold tracking-[0.18em] text-ink-100">DNS</span>
            <span className="font-display text-[15px] font-bold tracking-[0.18em] text-neon">MASTER</span>
          </div>
          <p className="mt-0.5 font-mono text-[8px] uppercase tracking-[0.24em] text-ink-500">
            Control Deck · v1.0.0 · RELEASE
          </p>
        </div>
      </div>

      <div className="hairline my-4 opacity-60" />

      <p className="hud-label px-2 pb-2">Operations</p>
      <nav className="flex flex-col gap-1" aria-label="Primary">
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = view === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setView(item.id)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group relative flex items-center gap-2.5 rounded-[10px] border px-2.5 py-[9px] text-left transition-all duration-200",
                active
                  ? "border-neon/20 bg-gradient-to-r from-neon/[0.13] via-neon/[0.04] to-transparent text-ink-100"
                  : "border-transparent text-ink-300 hover:border-white/[0.06] hover:bg-white/[0.035] hover:text-ink-100",
              )}
            >
              {active && (
                <span className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-r-full bg-neon shadow-[0_0_10px_rgba(0,240,255,0.9)]" />
              )}
              <Icon
                size={15}
                strokeWidth={1.7}
                className={cn(
                  "shrink-0 transition-colors",
                  active ? "text-neon" : "text-ink-500 group-hover:text-ink-200",
                )}
              />
              <span className="flex-1">
                <span className="block text-[12px] font-medium leading-tight">{item.label}</span>
                <span className={cn("mt-0.5 block font-mono text-[8px] uppercase tracking-[0.16em]", active ? "text-neon/60" : "text-ink-600")}>
                  {item.hint}
                </span>
              </span>
              <span className={cn("font-mono text-[8px]", active ? "text-neon/70" : "text-ink-600")}>{item.index}</span>
            </button>
          );
        })}
      </nav>

      {/* Binding card */}
      <div className="mt-5 rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
        <div className="flex items-center justify-between">
          <span className="hud-label">Active resolver</span>
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              connected ? "bg-mint shadow-[0_0_8px_rgba(61,255,192,0.9)]" : "bg-amber/80",
            )}
          />
        </div>
        <p className={cn("mt-2 truncate font-display text-[14px] font-semibold tracking-wide", connected ? "text-ink-100" : "text-ink-300")}>
          {activeDns?.name ?? (dnsConfig?.mode === "static" ? "Static resolver" : "DHCP Default")}
        </p>
        <p className="mt-0.5 truncate font-mono text-[9.5px] tracking-tight text-ink-500">
          {activeDns?.primary ?? dnsConfig?.primary ?? "Assigned by " + activeAdapter.name}
        </p>

        <div className="mt-2.5 flex items-end gap-[3px]">
          {Array.from({ length: 22 }).map((_, index) => {
            const base = connected ? 7 : 3;
            const height = base + Math.abs(Math.sin(index * 1.7 + stats.downKbps / 900)) * (connected ? 11 : 5);
            return (
              <span
                key={index}
                className={cn("flex-1 rounded-sm transition-all duration-700", connected ? "bg-neon/55" : "bg-white/10")}
                style={{ height: `${height}px` }}
              />
            );
          })}
        </div>

        <div className="mt-2 flex items-center justify-between border-t border-white/[0.06] pt-2 font-mono text-[8.5px] uppercase tracking-[0.1em] text-ink-500">
          <span className="truncate">{activeAdapter.name}</span>
          <span className={connected ? "text-neon/80" : "text-ink-500"}>{since ?? (activeDnsId ? "LINKING" : "PASSIVE")}</span>
        </div>
      </div>

      {/* Live bus */}
      <div className="mt-2.5 rounded-xl border border-white/[0.06] bg-white/[0.015] p-2.5">
        <div className="flex items-center justify-between">
          <span className="hud-label">Live bus</span>
          <span className="flex items-center gap-1 font-mono text-[7px] uppercase tracking-[0.14em] text-ink-600">
            <span className={cn("h-1 w-1 rounded-full", connected ? "bg-mint" : "bg-ink-600")} />
            {connected ? "rx/tx" : "monitor"}
          </span>
        </div>
        <div className="mt-2 flex h-7 items-end gap-[2px]" aria-hidden="true">
          {busSeries.map((point, index) => {
            const height = 4 + (point.downKbps / busPeak) * 22;
            return (
              <span
                key={point.t}
                className={cn(
                  "flex-1 rounded-sm transition-all duration-700",
                  index === 23 ? "bg-neon/80 shadow-[0_0_6px_rgba(0,240,255,0.7)]" : "bg-neon/30",
                )}
                style={{ height: `${height}px` }}
              />
            );
          })}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-1.5 border-t border-white/[0.05] pt-2">
          <div>
            <p className="font-mono text-[6.5px] uppercase tracking-[0.12em] text-ink-600">Session in</p>
            <p className="hud-value mt-0.5 text-[9px] text-ink-300">{formatBytes(stats.sessionDownBytes)}</p>
          </div>
          <div>
            <p className="font-mono text-[6.5px] uppercase tracking-[0.12em] text-ink-600">Session out</p>
            <p className="hud-value mt-0.5 text-[9px] text-ink-300">{formatBytes(stats.sessionUpBytes)}</p>
          </div>
        </div>
      </div>

      <div className="flex-1" />

      {/* Core status */}
      <div className="rounded-xl border border-white/[0.06] bg-[#0a0e15]/70 p-2.5">
        <div className="flex items-center gap-2">
          <Activity size={12} className={telemetryLive ? "text-mint" : "text-amber"} />
          <span className="flex-1 font-mono text-[9px] uppercase tracking-[0.16em] text-ink-300">Rust core</span>
          <span
            className={cn(
              "rounded border px-1.5 py-0.5 font-mono text-[7.5px] uppercase tracking-[0.12em]",
              telemetryLive
                ? "border-mint/25 bg-mint/10 text-mint"
                : "border-amber/25 bg-amber/10 text-amber",
            )}
          >
            {telemetryLive ? "Live telemetry" : bridgeReady ? "Core ready" : "Simulated"}
          </span>
        </div>
        <p className="mt-1.5 font-mono text-[8px] uppercase tracking-[0.1em] text-ink-600">
          {servers.length} presets · {bridgeReady ? "windows API" : "browser preview"}
        </p>
      </div>
    </aside>
  );
}
