import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import { ArrowDown, ArrowUp, Pause, Play, Radio } from "lucide-react";
import { useApp } from "../../store/AppStore";
import { cn } from "../../lib/cn";
import { formatBytes, formatRate, splitRate } from "../../lib/format";
import type { TrafficPoint } from "../../types/network";
import { GlassCard, HudLabel } from "../ui/GlassCard";

function TrafficTooltip({ active, payload }: TooltipContentProps) {
  const point = payload?.[0]?.payload as TrafficPoint | undefined;
  if (!active || !point) return null;
  return (
    <div className="rounded-lg border border-white/10 bg-[#080c13]/95 px-2.5 py-2 shadow-2xl backdrop-blur-xl">
      <p className="font-mono text-[8px] uppercase tracking-[0.14em] text-ink-500">
        {new Date(point.t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
      </p>
      <div className="mt-1 space-y-0.5">
        <p className="flex items-center gap-1.5 font-mono text-[10px] tabular-nums text-neon">
          <ArrowDown size={9} /> {formatRate(point.downKbps)}
        </p>
        <p className="flex items-center gap-1.5 font-mono text-[10px] tabular-nums text-violet">
          <ArrowUp size={9} /> {formatRate(point.upKbps)}
        </p>
      </div>
    </div>
  );
}

export function LiveTrafficChart() {
  const { traffic, stats, streamPaused, toggleStream } = useApp();
  const down = splitRate(stats.downKbps);
  const up = splitRate(stats.upKbps);
  const series = useMemo(() => traffic.map((p) => ({ ...p })), [traffic]);
  const yMax = useMemo(
    () => Math.max(2400, Math.ceil((Math.max(...series.map((p) => p.downKbps)) * 1.18) / 500) * 500),
    [series],
  );

  return (
    <GlassCard sheen flush className="col-span-6 flex min-h-0 flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-3.5">
        <div className="flex items-center gap-2">
          <Radio size={12} className={cn(streamPaused ? "text-ink-500" : "text-neon")} />
          <HudLabel>Live throughput</HudLabel>
          <span
            className={cn(
              "rounded border px-1.5 py-[2px] font-mono text-[7.5px] uppercase tracking-[0.16em]",
              streamPaused
                ? "border-white/10 bg-white/5 text-ink-500"
                : "border-neon/25 bg-neon/10 text-neon/90",
            )}
          >
            {streamPaused ? "paused" : "streaming"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden font-mono text-[8px] uppercase tracking-[0.12em] text-ink-600 sm:block">
            48s window
          </span>
          <button
            type="button"
            onClick={toggleStream}
            aria-label={streamPaused ? "Resume traffic stream" : "Pause traffic stream"}
            className="grid h-6 w-6 place-items-center rounded-md border border-white/[0.07] bg-white/[0.03] text-ink-400 transition-colors hover:border-neon/30 hover:text-neon"
          >
            {streamPaused ? <Play size={10} /> : <Pause size={10} />}
          </button>
        </div>
      </div>

      <div className="mt-2.5 flex items-end justify-between px-4">
        <div className="flex items-end gap-5">
          <div>
            <div className="flex items-center gap-1.5">
              <ArrowDown size={10} className="text-neon" />
              <HudLabel className="text-neon/70">Download</HudLabel>
            </div>
            <p className="mt-0.5 flex items-baseline gap-1">
              <span className="font-display text-[23px] font-semibold leading-none tabular-nums text-ink-100">
                {down.value}
              </span>
              <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-ink-500">{down.unit}</span>
            </p>
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <ArrowUp size={10} className="text-violet" />
              <HudLabel className="text-violet/70">Upload</HudLabel>
            </div>
            <p className="mt-0.5 flex items-baseline gap-1">
              <span className="font-display text-[23px] font-semibold leading-none tabular-nums text-ink-200">
                {up.value}
              </span>
              <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-ink-500">{up.unit}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 pb-0.5 text-right">
          <div>
            <HudLabel className="text-[8px]">Session in</HudLabel>
            <p className="hud-value mt-0.5 text-[10.5px] text-ink-200">{formatBytes(stats.sessionDownBytes)}</p>
          </div>
          <div>
            <HudLabel className="text-[8px]">Session out</HudLabel>
            <p className="hud-value mt-0.5 text-[10.5px] text-ink-200">{formatBytes(stats.sessionUpBytes)}</p>
          </div>
        </div>
      </div>

      <div className="relative mt-1 min-h-0 flex-1 px-1 pb-1">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={series} margin={{ top: 12, right: 14, bottom: 4, left: 4 }}>
            <defs>
              <linearGradient id="traffic-down" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#00F0FF" stopOpacity={0.42} />
                <stop offset="55%" stopColor="#00F0FF" stopOpacity={0.1} />
                <stop offset="100%" stopColor="#00F0FF" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="traffic-up" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#A855F7" stopOpacity={0.38} />
                <stop offset="100%" stopColor="#A855F7" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(255,255,255,0.055)" strokeDasharray="2 6" vertical={false} />
            <XAxis
              dataKey="t"
              tickLine={false}
              axisLine={false}
              tick={{ fill: "#5d6d82", fontSize: 8, fontFamily: "JetBrains Mono" }}
              tickFormatter={(value: number) => {
                const seconds = Math.round((Date.now() - value) / 1000);
                return seconds <= 1 ? "now" : `-${seconds}s`;
              }}
              minTickGap={52}
              height={16}
            />
            <YAxis hide domain={[0, yMax]} />
            <Tooltip
              content={TrafficTooltip}
              cursor={{ stroke: "rgba(0,240,255,0.28)", strokeWidth: 1, strokeDasharray: "3 4" }}
            />
            <Area
              type="monotone"
              dataKey="downKbps"
              stroke="#00F0FF"
              strokeWidth={1.7}
              fill="url(#traffic-down)"
              isAnimationActive={false}
              animationEasing="ease-out"
              dot={false}
              activeDot={{ r: 2.5, fill: "#00F0FF", stroke: "#07090E", strokeWidth: 2 }}
            />
            <Area
              type="monotone"
              dataKey="upKbps"
              stroke="#A855F7"
              strokeWidth={1.4}
              fill="url(#traffic-up)"
              isAnimationActive={false}
              animationEasing="ease-out"
              dot={false}
              activeDot={{ r: 2.5, fill: "#A855F7", stroke: "#07090E", strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="flex items-center justify-between border-t border-white/[0.06] px-4 py-1.5">
        <div className="flex items-center gap-3 font-mono text-[8px] uppercase tracking-[0.1em] text-ink-500">
          <span className="flex items-center gap-1.5">
            <span className="h-[2px] w-3 rounded-full bg-neon shadow-[0_0_6px_rgba(0,240,255,0.9)]" /> down
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-[2px] w-3 rounded-full bg-violet shadow-[0_0_6px_rgba(168,85,247,0.9)]" /> up
          </span>
        </div>
        <span className="font-mono text-[8px] uppercase tracking-[0.1em] text-ink-500">
          peak {formatRate(stats.peakDownKbps)}
        </span>
      </div>
    </GlassCard>
  );
}
