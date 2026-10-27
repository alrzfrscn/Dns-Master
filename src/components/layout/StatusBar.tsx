import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, CircleDot, Clock3, Cpu, Wifi } from "lucide-react";
import { useApp } from "../../store/AppStore";
import { cn } from "../../lib/cn";
import { formatRate, splitRate } from "../../lib/format";

function useClock(): string {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function StatusBar() {
  const { stats, activeAdapter, connection, activeDns, streamPaused, dnsConfig, bridgeReady, telemetryLive } = useApp();
  const clock = useClock();
  const down = splitRate(stats.downKbps);
  const up = splitRate(stats.upKbps);
  const staticMode = connection.mode === "static" && activeDns !== null;

  return (
    <footer className="relative z-20 flex h-[30px] shrink-0 items-center gap-3 border-t border-white/[0.06] bg-[#080b11]/60 px-4 backdrop-blur-xl">
      <div className="flex items-center gap-1.5">
        <span className={cn("relative flex h-1.5 w-1.5", streamPaused ? "" : "")}>
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-mint/60" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-mint" />
        </span>
        <span className="font-mono text-[8.5px] uppercase tracking-[0.14em] text-ink-300">
          {streamPaused ? "Stream paused" : "Core online"}
        </span>
      </div>

      <span className="h-3 w-px bg-white/10" />

      <div className="flex items-center gap-1.5 text-ink-500">
        <Wifi size={10} />
        <span className="font-mono text-[8.5px] uppercase tracking-[0.1em]">{activeAdapter.name}</span>
        <span className="font-mono text-[8.5px] tabular-nums text-ink-400">{activeAdapter.ipv4}</span>
      </div>

      <span className="hidden h-3 w-px bg-white/10 sm:block" />

      <div className="hidden items-center gap-3 sm:flex">
        <span className="flex items-center gap-1">
          <ArrowDown size={9} className="text-neon" />
          <span className="font-mono text-[8.5px] tabular-nums text-ink-300">
            {down.value} <span className="text-ink-600">{down.unit}</span>
          </span>
        </span>
        <span className="flex items-center gap-1">
          <ArrowUp size={9} className="text-violet" />
          <span className="font-mono text-[8.5px] tabular-nums text-ink-300">
            {up.value} <span className="text-ink-600">{up.unit}</span>
          </span>
        </span>
        <span className="hidden font-mono text-[8px] uppercase tracking-[0.1em] text-ink-600 lg:block">
          peak {formatRate(stats.peakDownKbps)}
        </span>
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-1.5">
        <CircleDot size={9} className={staticMode ? "text-neon" : "text-amber"} />
        <span
          className={cn(
            "font-mono text-[8.5px] uppercase tracking-[0.14em]",
            staticMode ? "text-neon/80" : "text-amber/80",
          )}
        >
          {staticMode ? "Static DNS" : "DHCP"}
        </span>
        <span className="font-mono text-[8.5px] tabular-nums text-ink-500">
          {activeDns?.primary ?? dnsConfig?.primary ?? "auto"}
        </span>
      </div>

      <span className="h-3 w-px bg-white/10" />

      <span className={cn("flex items-center gap-1.5", telemetryLive ? "text-mint/80" : "text-ink-600")}>
        <Cpu size={9} />
        <span className="font-mono text-[8px] uppercase tracking-[0.1em]">
          {telemetryLive ? "rust core · live telemetry" : bridgeReady ? "rust core · idle" : "rust bridge · browser"}
        </span>
      </span>

      <span className="h-3 w-px bg-white/10" />

      <span className="flex items-center gap-1.5 text-ink-500">
        <Clock3 size={9} />
        <span className="font-mono text-[8.5px] tabular-nums tracking-[0.06em]">{clock}</span>
      </span>
    </footer>
  );
}
