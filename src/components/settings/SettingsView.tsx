import { useMemo } from "react";
import {
  Cable,
  CheckCircle2,
  ChevronDown,
  Download,
  Github,
  HardDriveDownload,
  Info,
  Loader2,
  RotateCcw,
  ShieldCheck,
  Wifi,
} from "lucide-react";
import type { AdapterKind } from "../../types/network";
import { useApp } from "../../store/AppStore";
import { cn } from "../../lib/cn";
import { GlassCard, HudLabel } from "../ui/GlassCard";
import { Toggle } from "../ui/Toggle";

const KIND_ICON: Record<AdapterKind, typeof Wifi> = {
  wifi: Wifi,
  ethernet: Cable,
  vpn: ShieldCheck,
  loopback: Wifi,
};

export function SettingsView() {
  const {
    adapters,
    activeAdapterId,
    setActiveAdapter,
    activeAdapter,
    settings,
    updateSetting,
    resetSettings,
    syncFromGithub,
    syncing,
    pushToast,
    servers,
    dnsConfig,
    bridgeReady,
    telemetryLive,
    stats,
  } = useApp();

  const urlValid = useMemo(() => {
    try {
      const url = new URL(settings.githubRawUrl);
      return url.protocol === "https:" && url.pathname.endsWith(".json");
    } catch {
      return false;
    }
  }, [settings.githubRawUrl]);

  return (
    <div className="scroll-thin flex h-full min-h-0 gap-2.5 overflow-y-auto pb-0.5">
      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        {/* Adapter */}
        <GlassCard className="p-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wifi size={13} className="text-neon" />
              <HudLabel>Network adapter</HudLabel>
            </div>
            <span className="rounded border border-mint/25 bg-mint/[0.07] px-1.5 py-[2px] font-mono text-[7px] uppercase tracking-[0.12em] text-mint">
              {activeAdapter.status === "up" ? "interface up" : "interface down"}
            </span>
          </div>

          <p className="mt-2 text-[9px] leading-relaxed text-ink-500">
            Interfaces are read from the Windows IP helper API. Resolver writes, cache flushes and IPv6
            changes run through the same core, with a UAC prompt when Windows requires one.
          </p>

          <label className="mt-2.5 block">
            <span className="font-mono text-[7.5px] uppercase tracking-[0.14em] text-ink-600">Active interface</span>
            <div className="relative mt-1.5">
              <select
                value={activeAdapterId}
                onChange={(event) => setActiveAdapter(event.target.value)}
                className="h-9 w-full appearance-none rounded-md border border-white/10 bg-[#0a0e16] px-3 pr-8 text-[11.5px] text-ink-100 transition-colors hover:border-white/20 focus:border-neon/50 focus:outline-none"
              >
                {adapters.map((adapter) => (
                  <option key={adapter.id} value={adapter.id}>
                    {adapter.name} — {adapter.ipv4} {adapter.isDefault ? "(primary)" : ""}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={12}
                className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-500"
              />
            </div>
          </label>

          <div className="mt-2.5 grid grid-cols-3 gap-1.5">
            {[
              { label: "Local IPv4", value: activeAdapter.ipv4 },
              { label: "Gateway", value: activeAdapter.gateway },
              { label: "Link", value: activeAdapter.speedMbps ? `${activeAdapter.speedMbps} Mbps` : "virtual" },
            ].map((item) => (
              <div key={item.label} className="rounded-md border border-white/[0.06] bg-white/[0.02] px-2 py-1.5">
                <p className="font-mono text-[7px] uppercase tracking-[0.12em] text-ink-600">{item.label}</p>
                <p className="hud-value mt-0.5 truncate text-[9.5px] text-ink-200">{item.value}</p>
              </div>
            ))}
          </div>

          <div className="mt-1.5 flex items-center justify-between gap-2 rounded-md border border-white/[0.06] bg-white/[0.02] px-2 py-1.5">
            <span className="font-mono text-[7px] uppercase tracking-[0.12em] text-ink-600">Windows resolver</span>
            <span className="hud-value min-w-0 flex-1 truncate text-right text-[9.5px] text-ink-200">
              {dnsConfig ? dnsConfig.servers.join(" · ") || "no servers configured" : "unavailable"}
            </span>
            <span
              className={cn(
                "shrink-0 rounded border px-1.5 py-[1px] font-mono text-[7px] uppercase tracking-[0.1em]",
                dnsConfig?.mode === "static"
                  ? "border-neon/25 bg-neon/[0.07] text-neon/90"
                  : "border-amber/25 bg-amber/[0.07] text-amber/90",
              )}
            >
              {dnsConfig?.source ?? "unknown"}
            </span>
          </div>
        </GlassCard>

        {/* GitHub sync */}
        <GlassCard className="p-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Github size={13} className="text-violet" />
              <HudLabel>Resolver source</HudLabel>
            </div>
            <div className="flex items-center gap-1.5">
              {adapters.map((adapter) => {
                const Icon = KIND_ICON[adapter.kind];
                return (
                  <span
                    key={adapter.id}
                    className={cn(
                      "flex items-center gap-1 rounded border px-1.5 py-1 font-mono text-[7px] uppercase tracking-[0.08em]",
                      adapter.id === activeAdapterId
                        ? "border-neon/25 bg-neon/[0.06] text-neon/90"
                        : "border-white/[0.06] text-ink-600",
                    )}
                  >
                    <Icon size={8} /> {adapter.name}
                  </span>
                );
              })}
            </div>
          </div>

          <p className="mt-2 text-[9px] leading-relaxed text-ink-500">
            Pull a curated list from any GitHub raw URL. The payload must expose a{" "}
            <code className="rounded bg-white/[0.06] px-1 py-0.5 font-mono text-[8px] text-ink-300">servers[]</code>{" "}
            array matching{" "}
            <code className="rounded bg-white/[0.06] px-1 py-0.5 font-mono text-[8px] text-ink-300">DnsServer</code>.
          </p>

          <div className="mt-2 flex items-center gap-1.5">
            <div className="relative min-w-0 flex-1">
              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 font-mono text-[8px] text-ink-600">
                GET
              </span>
              <input
                value={settings.githubRawUrl}
                onChange={(event) => updateSetting("githubRawUrl", event.target.value)}
                spellCheck={false}
                aria-label="GitHub raw JSON URL"
                className={cn(
                  "h-8 w-full rounded-md border bg-black/30 pl-8 pr-2 font-mono text-[9px] tracking-tight text-ink-200 transition-colors focus:outline-none",
                  urlValid ? "border-white/10 focus:border-neon/40" : "border-rose/40 focus:border-rose/60",
                )}
              />
            </div>
            <button
              type="button"
              onClick={() => void syncFromGithub()}
              disabled={!urlValid || syncing}
              className="flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-violet/30 bg-violet/[0.08] px-2.5 font-mono text-[7.5px] uppercase tracking-[0.12em] text-violet transition-colors hover:bg-violet/15 disabled:opacity-40"
            >
              {syncing ? <Loader2 size={9} className="animate-spin" /> : <Download size={9} />}
              {syncing ? "syncing" : "sync now"}
            </button>
          </div>
          <div className="mt-1.5 flex items-center justify-between">
            <span className={cn("flex items-center gap-1 text-[8px]", urlValid ? "text-mint/70" : "text-rose/90")}>
              {urlValid ? <CheckCircle2 size={8} /> : <Info size={8} />}
              {urlValid ? "raw manifest url is valid" : "needs an https url ending in .json"}
            </span>
            <span className="font-mono text-[7px] uppercase tracking-[0.1em] text-ink-600">
              {servers.length} in memory
            </span>
          </div>
        </GlassCard>

        {/* Bridge */}
        <GlassCard className="flex min-h-0 flex-1 flex-col p-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <HardDriveDownload size={13} className={bridgeReady ? "text-mint" : "text-amber"} />
              <HudLabel>Rust bridge</HudLabel>
            </div>
            <span
              className={cn(
                "rounded border px-1.5 py-[2px] font-mono text-[7px] uppercase tracking-[0.12em]",
                bridgeReady
                  ? "border-mint/25 bg-mint/[0.08] text-mint"
                  : "border-amber/25 bg-amber/[0.08] text-amber",
              )}
            >
              {telemetryLive ? "live telemetry" : bridgeReady ? "live system core" : "browser fallback"}
            </span>
          </div>

          <p className="mt-2 text-[9px] leading-relaxed text-ink-500">
            Adapters, resolver mode and byte counters come from the Windows API. DNS writes, cache flushes,
            IPv6 changes and latency probes run through the same core; elevation is requested only when needed.
          </p>

          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 rounded-md border border-white/[0.06] bg-black/20 p-2.5">
            {[
              "get_network_adapters",
              "get_live_traffic",
              "get_current_dns",
              "set_dns",
              "reset_dns",
              "flush_dns_cache",
              "set_ipv6_enabled",
              "ping_dns_server",
              "benchmark_dns_servers",
              "run_bypass_probe",
            ].map((command) => (
              <span key={command} className="truncate font-mono text-[8px] leading-relaxed text-ink-400">
                {command}()
              </span>
            ))}
          </div>

          <p className="mt-auto flex items-center gap-1.5 pt-2 font-mono text-[7px] uppercase leading-relaxed tracking-[0.1em] text-ink-600">
            <Info size={8} className="shrink-0" />
            {stats.live ? "counters streaming from the ip helper api" : "counters idle"} · writes live on the rust core
          </p>
        </GlassCard>
      </div>

      {/* Right rail */}
      <div className="flex w-[268px] shrink-0 flex-col gap-2.5">
        <GlassCard className="p-3.5">
          <div className="flex items-center gap-2">
            <ShieldCheck size={13} className="text-neon" />
            <HudLabel>Startup & behaviour</HudLabel>
          </div>

          <div className="mt-1 divide-y divide-white/[0.05]">
            {[
              {
                key: "autoStart" as const,
                title: "Launch with Windows",
                detail: "Add Dns Master to the current user's startup entries.",
              },
              {
                key: "autoConnect" as const,
                title: "Re-apply last resolver",
                detail: "Bind the previous endpoint when the core boots.",
              },
              {
                key: "minimizeToTray" as const,
                title: "Minimize to tray",
                detail: "Keep monitoring while the window is hidden.",
              },
              {
                key: "notifications" as const,
                title: "Desktop notifications",
                detail: "Report resolver changes and blocked probes.",
              },
            ].map((row) => (
              <div key={row.key} className="flex items-center gap-2 py-2 first:pt-1.5 last:pb-1">
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-medium leading-tight text-ink-200">{row.title}</p>
                  <p className="mt-0.5 text-[8px] leading-snug text-ink-500">{row.detail}</p>
                </div>
                <Toggle
                  checked={settings[row.key]}
                  onChange={(next) => updateSetting(row.key, next)}
                  label={row.title}
                />
              </div>
            ))}
          </div>
        </GlassCard>

        <GlassCard className="p-3.5">
          <div className="flex items-center justify-between">
            <HudLabel>Diagnostics</HudLabel>
            <span className={cn("h-1.5 w-1.5 rounded-full", telemetryLive ? "bg-mint" : "bg-amber/80")} />
          </div>

          <div className="mt-2 space-y-1.5">
            {[
              { label: "App", value: "Dns Master 0.1.0" },
              { label: "Channel", value: "Phase 3 · live core" },
              { label: "Frontend", value: "React 19 · Vite 7" },
              { label: "Styling", value: "Tailwind CSS 4" },
              { label: "Backend", value: "Tauri 2 · Win32 API" },
              { label: "Target", value: "Windows 11 x64" },
              { label: "Adapters", value: `${adapters.length} detected` },
              { label: "Telemetry", value: telemetryLive ? "streaming" : "idle" },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between gap-2">
                <span className="font-mono text-[8px] uppercase tracking-[0.08em] text-ink-600">{row.label}</span>
                <span className="hud-value truncate text-[9px] text-ink-300">{row.value}</span>
              </div>
            ))}
          </div>

          <div className="mt-2.5 grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => pushToast("Diagnostics copied", "success", "Environment snapshot → clipboard")}
              className="flex h-7 items-center justify-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] font-mono text-[7px] uppercase tracking-[0.1em] text-ink-300 transition-colors hover:border-neon/30 hover:text-neon"
            >
              <Download size={9} /> copy
            </button>
            <button
              type="button"
              onClick={resetSettings}
              className="flex h-7 items-center justify-center gap-1.5 rounded-md border border-rose/20 bg-rose/[0.04] font-mono text-[7px] uppercase tracking-[0.1em] text-rose/80 transition-colors hover:bg-rose/10"
            >
              <RotateCcw size={9} /> defaults
            </button>
          </div>
        </GlassCard>

        <GlassCard className="p-3">
          <div className="flex items-center gap-2">
            <Info size={11} className="text-ink-500" />
            <HudLabel>Live system core</HudLabel>
          </div>
          <p className="mt-1.5 text-[8.5px] leading-relaxed text-ink-500">
            DNS writes, cache flushes, the IPv6 leak guard, UDP:53 benchmarks and TLS bypass probes are live.
            Windows elevates only the adapter write itself, through a standard UAC prompt.
          </p>
          <div className="mt-2 flex items-center justify-between border-t border-white/[0.05] pt-1.5 font-mono text-[7px] uppercase tracking-[0.08em] text-ink-600">
            <span>ctrl + 1…4 views</span>
            <span>esc closes dialogs</span>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
