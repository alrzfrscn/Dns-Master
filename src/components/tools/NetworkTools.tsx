import {
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  Container,
  Eraser,
  Gamepad2,
  Info,
  Loader2,
  Network,
  Play,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import type { BypassStatus } from "../../types/network";
import { BYPASS_TARGETS } from "../../data/mock";
import { useApp } from "../../store/AppStore";
import { cn } from "../../lib/cn";
import { GlassCard, HudLabel } from "../ui/GlassCard";
import { CategoryBadge } from "../ui/Indicators";
import { Toggle } from "../ui/Toggle";

const GROUPS = [
  { id: "dev" as const, label: "Developer", icon: Container, tone: "text-neon" },
  { id: "ai" as const, label: "AI services", icon: BrainCircuit, tone: "text-violet" },
  { id: "gaming" as const, label: "Gaming", icon: Gamepad2, tone: "text-mint" },
];

const STATUS_META: Record<BypassStatus, { label: string; className: string }> = {
  idle: { label: "queued", className: "border-white/10 bg-white/[0.03] text-ink-500" },
  testing: { label: "probing", className: "border-amber/30 bg-amber/10 text-amber" },
  reachable: { label: "reachable", className: "border-mint/30 bg-mint/10 text-mint" },
  blocked: { label: "blocked", className: "border-rose/30 bg-rose/10 text-rose" },
};

export function NetworkTools() {
  const {
    flushing,
    flushDns,
    resetDhcp,
    connection,
    ipv6Enabled,
    toggleIpv6,
    bypassResults,
    bypassRunning,
    runBypassTest,
    activeDns,
    activeAdapter,
    applyDns,
    dnsConfig,
    bridgeReady,
  } = useApp();

  const reachable = bypassResults.filter((row) => row.status === "reachable").length;
  const blocked = bypassResults.filter((row) => row.status === "blocked").length;
  const tested = reachable + blocked;

  const groupStats = GROUPS.map((group) => {
    const targets = BYPASS_TARGETS.filter((target) => target.group === group.id);
    const rows = targets.map((target) => bypassResults.find((row) => row.targetId === target.id));
    const groupReachable = rows.filter((row) => row?.status === "reachable").length;
    const groupBlocked = rows.filter((row) => row?.status === "blocked").length;
    const latencies = rows
      .map((row) => row?.latencyMs)
      .filter((value): value is number => typeof value === "number");
    const average = latencies.length
      ? Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length)
      : null;
    return { ...group, total: targets.length, reach: groupReachable, blocked: groupBlocked, average };
  });

  const bypassFriendly = activeDns?.category === "sanction" || activeDns?.category === "gaming";

  return (
    <div className="flex h-full min-h-0 flex-col gap-2.5">
      {/* Utility tiles */}
      <div className="grid shrink-0 grid-cols-3 gap-2.5">
        <div className="glass glass-hover flex items-center gap-3 px-3.5 py-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-mint/20 bg-mint/[0.07] text-mint">
            <Eraser size={15} />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-[11.5px] font-medium leading-tight text-ink-100">Flush DNS cache</h3>
            <p className="mt-0.5 text-[9px] leading-snug text-ink-500">Clears stale resolver entries on {activeAdapter.name}.</p>
          </div>
          <button
            type="button"
            onClick={() => void flushDns()}
            disabled={flushing}
            className="flex h-[26px] shrink-0 items-center gap-1 rounded-md border border-mint/30 bg-mint/[0.07] px-2 font-mono text-[7.5px] uppercase tracking-[0.12em] text-mint transition-colors hover:bg-mint/15 disabled:opacity-50"
          >
            {flushing ? <Loader2 size={9} className="animate-spin" /> : <Play size={9} />}
            {flushing ? "flushing" : "flush"}
          </button>
        </div>

        <div className="glass glass-hover flex items-center gap-3 px-3.5 py-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-rose/20 bg-rose/[0.07] text-rose">
            <RotateCcw size={15} />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-[11.5px] font-medium leading-tight text-ink-100">Reset to DHCP</h3>
            <p className="mt-0.5 text-[9px] leading-snug text-ink-500">Drop the override and re-acquire carrier DNS.</p>
          </div>
          <button
            type="button"
            onClick={resetDhcp}
            className="flex h-[26px] shrink-0 items-center gap-1 rounded-md border border-rose/30 bg-rose/[0.07] px-2 font-mono text-[7.5px] uppercase tracking-[0.12em] text-rose transition-colors hover:bg-rose/15"
          >
            <Play size={9} /> run
          </button>
        </div>

        <div className="glass glass-hover flex items-center gap-3 px-3.5 py-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-violet/20 bg-violet/[0.07] text-violet">
            <Network size={15} />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-[11.5px] font-medium leading-tight text-ink-100">IPv6 resolution</h3>
            <p className="mt-0.5 text-[9px] leading-snug text-ink-500">
              {ipv6Enabled ? "AAAA lookups are active." : "Disabled — avoids leaky AAAA routing."}
            </p>
          </div>
          <Toggle checked={ipv6Enabled} onChange={() => toggleIpv6()} label="Toggle IPv6 resolution" />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 gap-2.5">
        {/* Bypass tester */}
        <GlassCard flush className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 pb-2.5 pt-3.5">
            <div className="flex items-center gap-2.5">
              <span className="grid h-7 w-7 place-items-center rounded-md border border-violet/25 bg-violet/10 text-violet">
                <ShieldAlert size={13} />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-display text-[13px] font-semibold tracking-wide text-ink-100">Sanction bypass tester</h2>
                  <span className="rounded border border-white/10 bg-white/[0.03] px-1.5 py-[1px] font-mono text-[7px] uppercase tracking-[0.12em] text-ink-500">
                    udp:53 + tls
                  </span>
                </div>
                <p className="mt-0.5 font-mono text-[8px] uppercase tracking-[0.1em] text-ink-600">
                  docker · ai apis · game storefronts
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void runBypassTest()}
              disabled={bypassRunning}
              className="flex h-[28px] items-center gap-1.5 rounded-md border border-neon/35 bg-neon/[0.09] px-2.5 font-mono text-[8px] uppercase tracking-[0.14em] text-neon transition-all hover:border-neon/60 hover:bg-neon/[0.16] disabled:opacity-50"
            >
              {bypassRunning ? <Loader2 size={10} className="animate-spin" /> : <ShieldCheck size={10} />}
              {bypassRunning ? `${tested}/${bypassResults.length}` : "run probe"}
            </button>
          </div>

          <div className="grid grid-cols-[1.4fr_74px_52px_1fr] gap-2 border-y border-white/[0.06] px-4 py-1.5">
            <HudLabel className="text-[7px]">Target</HudLabel>
            <HudLabel className="text-[7px]">State</HudLabel>
            <HudLabel className="text-[7px]">Tls</HudLabel>
            <HudLabel className="text-[7px]">Detail</HudLabel>
          </div>

          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-2 py-1.5">
            {GROUPS.map((group) => {
              const GroupIcon = group.icon;
              const targets = BYPASS_TARGETS.filter((target) => target.group === group.id);
              return (
                <div key={group.id} className="mb-1.5 last:mb-0">
                  <div className="flex items-center gap-1.5 px-2 py-1">
                    <GroupIcon size={9} className={group.tone} />
                    <span className="font-mono text-[7px] uppercase tracking-[0.18em] text-ink-600">{group.label}</span>
                    <span className="h-px flex-1 bg-white/[0.05]" />
                  </div>

                  {targets.map((target) => {
                    const result = bypassResults.find((row) => row.targetId === target.id);
                    const status = result?.status ?? "idle";
                    const meta = STATUS_META[status];
                    return (
                      <div
                        key={target.id}
                        className="group grid grid-cols-[1.4fr_74px_52px_1fr] items-center gap-2 rounded-md px-2 py-[6px] transition-colors hover:bg-white/[0.03]"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <span
                            className={cn(
                              "h-1 w-1 shrink-0 rounded-full",
                              status === "reachable"
                                ? "bg-mint"
                                : status === "blocked"
                                  ? "bg-rose"
                                  : status === "testing"
                                    ? "animate-pulse bg-amber"
                                    : "bg-ink-600",
                            )}
                          />
                          <div className="min-w-0">
                            <p className="truncate text-[10.5px] leading-tight text-ink-200">{target.label}</p>
                            <p className="truncate font-mono text-[7.5px] leading-tight text-ink-600">{target.host}</p>
                          </div>
                        </div>

                        <span
                          className={cn(
                            "inline-flex w-fit items-center gap-1 rounded border px-1.5 py-[2px] font-mono text-[7px] uppercase tracking-[0.1em]",
                            meta.className,
                          )}
                        >
                          {status === "testing" && <Loader2 size={7} className="animate-spin" />}
                          {status === "reachable" && <CheckCircle2 size={7} />}
                          {status === "blocked" && <XCircle size={7} />}
                          {meta.label}
                        </span>

                        <span className="hud-value text-[9px] text-ink-300">
                          {result?.latencyMs ? `${result.latencyMs}ms` : status === "testing" ? "···" : "—"}
                        </span>

                        <span className="truncate font-mono text-[7.5px] text-ink-600">
                          {result?.detail ?? "Not tested"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* Group matrix */}
          <div className="border-t border-white/[0.06] px-3 pb-2 pt-2.5">
            <div className="flex items-center justify-between px-1">
              <HudLabel>Group matrix</HudLabel>
              <span className="font-mono text-[7px] uppercase tracking-[0.1em] text-ink-600">
                {tested}/{bypassResults.length} probed
              </span>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {groupStats.map((group) => {
                const Icon = group.icon;
                return (
                  <div key={group.id} className="rounded-md border border-white/[0.06] bg-white/[0.02] px-2.5 py-2">
                    <div className="flex items-center justify-between">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <Icon size={9} className={cn("shrink-0", group.tone)} />
                        <span className="truncate text-[9px] text-ink-300">{group.label}</span>
                      </span>
                      <span className="hud-value shrink-0 text-[8px] text-mint">
                        {group.reach}/{group.total}
                      </span>
                    </div>
                    <div className="mt-1.5 flex h-1 gap-[2px] overflow-hidden rounded-full bg-white/[0.05]">
                      <span
                        className="bg-mint/80 transition-all duration-500"
                        style={{ width: `${(group.reach / group.total) * 100}%` }}
                      />
                      <span
                        className="bg-rose/70 transition-all duration-500"
                        style={{ width: `${(group.blocked / group.total) * 100}%` }}
                      />
                    </div>
                    <div className="mt-1.5 flex items-center justify-between font-mono text-[7px] uppercase tracking-[0.06em] text-ink-600">
                      <span>avg {group.average ?? "—"} ms</span>
                      <span>{group.blocked} blocked</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-white/[0.06] px-4 py-2">
            <div className="flex items-center gap-3 font-mono text-[7.5px] uppercase tracking-[0.1em]">
              <span className="flex items-center gap-1 text-mint">
                <span className="h-1 w-1 rounded-full bg-mint" /> {reachable} reachable
              </span>
              <span className="flex items-center gap-1 text-rose">
                <span className="h-1 w-1 rounded-full bg-rose" /> {blocked} blocked
              </span>
              <span className="text-ink-600">{bypassResults.length - tested} pending</span>
            </div>
            <span className="flex items-center gap-1 font-mono text-[7px] uppercase tracking-[0.1em] text-ink-600">
              <Info size={8} /> {bridgeReady ? "live dns + tls probes" : "core offline · simulated"}
            </span>
          </div>
        </GlassCard>

        {/* Context rail */}
        <div className="flex w-[244px] shrink-0 flex-col gap-2.5">
          <GlassCard className="p-3.5">
            <div className="flex items-center justify-between">
              <HudLabel>Resolver under test</HudLabel>
              {activeDns ? (
                <CategoryBadge category={activeDns.category} compact className="scale-90" />
              ) : (
                <span className="rounded-full border border-amber/25 bg-amber/[0.08] px-2 py-[3px] font-mono text-[8px] uppercase tracking-[0.14em] text-amber">
                  dhcp
                </span>
              )}
            </div>
            <p className="mt-1.5 font-display text-[15px] font-semibold leading-none text-ink-100">
              {activeDns?.name ?? (dnsConfig?.mode === "static" ? "Static resolver" : "DHCP Default")}
            </p>
            <p className="mt-1 font-mono text-[9px] text-ink-500">
              {activeDns?.primary ?? dnsConfig?.primary ?? "carrier assigned"}
            </p>

            <div className="mt-2.5 rounded-md border border-white/[0.06] bg-white/[0.02] p-2">
              <p className={cn("text-[9px] leading-snug", bypassFriendly ? "text-mint/90" : "text-amber/90")}>
                {bypassFriendly
                  ? "This resolver is bypass-oriented. Probes should succeed on most restricted hosts."
                  : "A general resolver may fail restricted hosts. Switch to a bypass profile for a clean test."}
              </p>
            </div>

            {!bypassFriendly && activeDns?.id !== "shecan" && (
              <button
                type="button"
                onClick={() => applyDns("shecan")}
                className="mt-2 flex h-[26px] w-full items-center justify-center gap-1.5 rounded-md border border-violet/30 bg-violet/[0.08] font-mono text-[7.5px] uppercase tracking-[0.12em] text-violet transition-colors hover:bg-violet/15"
              >
                switch to shecan <ArrowRight size={9} />
              </button>
            )}

            <div className="mt-2.5 flex items-center justify-between border-t border-white/[0.06] pt-2 font-mono text-[7.5px] uppercase tracking-[0.1em] text-ink-600">
              <span>{activeAdapter.name}</span>
              <span className={connection.mode === "static" ? "text-neon/80" : "text-amber/80"}>
                {connection.mode}
              </span>
            </div>
          </GlassCard>

          <GlassCard className="flex min-h-0 flex-1 flex-col p-3.5">
            <HudLabel>Adapter hygiene</HudLabel>
            <div className="mt-2 space-y-1.5">
              {[
                { label: "Local address", value: activeAdapter.ipv4, tone: "text-ink-200" },
                { label: "Gateway", value: activeAdapter.gateway, tone: "text-ink-200" },
                { label: "Link speed", value: `${activeAdapter.speedMbps} Mbps`, tone: "text-ink-200" },
                { label: "IPv6 lookups", value: ipv6Enabled ? "enabled" : "disabled", tone: ipv6Enabled ? "text-mint" : "text-ink-400" },
                { label: "Cache state", value: flushing ? "clearing" : "clean", tone: flushing ? "text-amber" : "text-mint" },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[8px] uppercase tracking-[0.08em] text-ink-600">{row.label}</span>
                  <span className={cn("hud-value truncate text-[9px]", row.tone)}>{row.value}</span>
                </div>
              ))}
            </div>

            <div className="mt-auto rounded-md border border-white/[0.06] bg-black/20 p-2">
              <p className="font-mono text-[7px] uppercase leading-relaxed tracking-[0.1em] text-ink-600">
                adapter, resolver and throughput reads stream from the rust core ·{" "}
                {bridgeReady
                  ? "probes resolve through the active resolver with a live tls handshake"
                  : "bypass probes simulated while the core is offline"}
              </p>
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}
