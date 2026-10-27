import { Crosshair, Radar } from "lucide-react";
import { useApp } from "../../store/AppStore";
import { cn } from "../../lib/cn";
import { latencyTone } from "../../lib/format";
import type { DnsCategory } from "../../types/network";
import { GlassCard, HudLabel } from "../ui/GlassCard";

const BLIP_COLOR: Record<DnsCategory, string> = {
  gaming: "#00F0FF",
  sanction: "#A855F7",
  security: "#3DFFC0",
  general: "#FFC46B",
};

export function PingRadarWidget() {
  const { pinnedServers, activeDnsId, stats, benchmark } = useApp();
  const nodes = pinnedServers.slice(0, 4);
  const best = [...nodes].sort((a, b) => (a.latency ?? 999) - (b.latency ?? 999))[0];

  return (
    <GlassCard flush className="col-span-5 flex min-h-0 flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-3">
        <div className="flex items-center gap-2">
          <Radar size={12} className="text-violet" />
          <HudLabel>Route radar</HudLabel>
        </div>
        <span className="font-mono text-[8px] uppercase tracking-[0.14em] text-ink-600">
          {benchmark.running ? "sweeping" : `${nodes.length} nodes`}
        </span>
      </div>

      <div className="flex min-h-0 flex-1 items-center gap-2 px-3 pt-1">
        {/* Radar scope */}
        <div className="relative h-[150px] w-[150px] shrink-0">
          <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle,rgba(0,240,255,0.09),transparent_68%)]" />
          <svg viewBox="0 0 140 140" className="absolute inset-0 h-full w-full">
            <g stroke="rgba(255,255,255,0.09)" fill="none" strokeWidth="0.7">
              <circle cx="70" cy="70" r="60" strokeDasharray="1 4" />
              <circle cx="70" cy="70" r="44" />
              <circle cx="70" cy="70" r="28" strokeDasharray="2 4" />
              <circle cx="70" cy="70" r="12" />
              <path d="M70 8v124M8 70h124" />
              <path d="M26 26l88 88M114 26l-88 88" opacity="0.4" strokeDasharray="2 6" />
            </g>

            {/* sweep wedge */}
            <g className="origin-center animate-sweep" style={{ transformBox: "fill-box", animationDuration: "5.4s" }}>
              <path d="M70 70 L70 10 A60 60 0 0 1 120 52 Z" fill="url(#radar-sweep)" opacity="0.55" />
            </g>
            <defs>
              <radialGradient id="radar-sweep" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#00F0FF" stopOpacity="0.55" />
                <stop offset="100%" stopColor="#00F0FF" stopOpacity="0" />
              </radialGradient>
            </defs>

            {nodes.map((node, index) => {
              const angle = ((-118 + index * 74) * Math.PI) / 180;
              const radius = 16 + (Math.min(node.latency ?? 110, 120) / 120) * 40;
              const x = 70 + Math.cos(angle) * radius;
              const y = 70 + Math.sin(angle) * radius;
              const active = node.id === activeDnsId;
              const color = BLIP_COLOR[node.category];
              return (
                <g key={node.id}>
                  <circle cx={x} cy={y} r={active ? 10 : 7} fill={color} opacity={0.14} />
                  <circle
                    cx={x}
                    cy={y}
                    r={active ? 3.2 : 2.4}
                    fill={color}
                    className={active ? "animate-breathe" : ""}
                    style={{ filter: `drop-shadow(0 0 5px ${color})` }}
                  />
                </g>
              );
            })}

            <circle cx="70" cy="70" r="1.8" fill="#00F0FF" />
          </svg>

          {/* HUD reticle */}
          <div className="pointer-events-none absolute inset-3 rounded-full border border-neon/10" />
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          {nodes.map((node, index) => (
            <div key={node.id} className="flex items-center gap-1.5">
              <span className="w-2 font-mono text-[7px] text-ink-600">0{index + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-1">
                  <span
                    className={cn(
                      "truncate text-[9.5px] leading-none",
                      node.id === activeDnsId ? "font-medium text-ink-100" : "text-ink-300",
                    )}
                  >
                    {node.name}
                  </span>
                  <span className={cn("hud-value shrink-0 text-[9px]", latencyTone(node.latency))}>
                    {node.latency ?? "—"}
                  </span>
                </div>
                <div className="mt-1 h-[2px] w-full overflow-hidden rounded-full bg-white/[0.06]">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${Math.max(6, Math.min(100, 100 - ((node.latency ?? 110) / 130) * 92))}%`,
                      backgroundColor: BLIP_COLOR[node.category],
                      boxShadow: `0 0 6px ${BLIP_COLOR[node.category]}66`,
                    }}
                  />
                </div>
              </div>
            </div>
          ))}
          {nodes.length === 0 && (
            <p className="text-[9.5px] leading-relaxed text-ink-500">No pinned relays. Add pins in the vault.</p>
          )}
        </div>
      </div>

      <div className="mt-1 flex items-center justify-between border-t border-white/[0.06] px-4 py-1.5">
        <span className="flex items-center gap-1.5 font-mono text-[8px] uppercase tracking-[0.12em] text-ink-500">
          <Crosshair size={9} className="text-neon/70" />
          best <span className="text-neon/90">{best?.name ?? "—"}</span>
        </span>
        <span className="flex items-center gap-2.5 font-mono text-[8px] uppercase tracking-[0.1em] text-ink-600">
          <span>
            jit <span className="text-ink-300">1.8</span>
          </span>
          <span>
            loss <span className="text-ink-300">{stats.packetLossPercent.toFixed(2)}%</span>
          </span>
        </span>
      </div>
    </GlassCard>
  );
}
