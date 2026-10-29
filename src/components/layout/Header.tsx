import { Activity, ChevronRight, Minus, Square, Wifi, X } from "lucide-react";
import type { ViewId } from "../../types/network";
import { useApp } from "../../store/AppStore";
import { cn } from "../../lib/cn";
import { latencyTone } from "../../lib/format";
import { invokeHandleWindowClose, isTauri, windowAction } from "../../lib/tauri";

const VIEW_META: Record<ViewId, { eyebrow: string; title: string; caption: string }> = {
  dashboard: { eyebrow: "Operations / 01", title: "Control Deck", caption: "Resolver state & live throughput" },
  vault: { eyebrow: "Resolvers / 02", title: "DNS Vault", caption: "Benchmark, pin and sync endpoints" },
  tools: { eyebrow: "Repair / 03", title: "Network Tools", caption: "Cache, DHCP and bypass diagnostics" },
  settings: { eyebrow: "System / 04", title: "Settings", caption: "Adapters, sync source and startup" },
};

export function Header() {
  const { view, connection, activeDns, activeAdapter, stats, settings, pushToast } = useApp();
  const meta = VIEW_META[view];
  const connected = connection.phase === "connected";

  const runWindowAction = async (action: "minimize" | "toggleMaximize" | "close") => {
    if (action === "close" && isTauri()) {
      try {
        // Close-to-tray when enabled; otherwise a real exit.
        await invokeHandleWindowClose(settings.minimizeToTray);
        return;
      } catch {
        // Fall through to the native close below.
      }
    }
    const handled = await windowAction(action);
    if (!handled) {
      pushToast("Desktop-only control", "info", "Window controls need the Tauri desktop shell");
    }
  };

  return (
    <header
      data-tauri-drag-region
      className="relative z-20 flex h-[60px] shrink-0 items-center gap-3 border-b border-white/[0.06] px-4"
    >
      <div className="flex min-w-0 items-center gap-2.5" data-tauri-drag-region>
        <div className="flex flex-col justify-center">
          <div className="flex items-center gap-1.5">
            <span className="hud-label text-neon/70">{meta.eyebrow}</span>
            <ChevronRight size={9} className="text-ink-600" />
            <span className="font-mono text-[8.5px] uppercase tracking-[0.14em] text-ink-600">
              {connected ? "static link" : "dhcp link"}
            </span>
          </div>
          <div className="mt-1 flex items-baseline gap-2.5">
            <h1 className="font-display text-[16px] font-semibold leading-none tracking-[0.02em] text-ink-100">
              {meta.title}
            </h1>
            <p className="hidden text-[10.5px] leading-none text-ink-500 md:block">{meta.caption}</p>
          </div>
        </div>
      </div>

      <div className="flex-1" />

      <div className="hidden items-center gap-2 sm:flex">
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.07] bg-white/[0.03] px-2 py-1.5">
          <Wifi size={11} className="text-ink-400" />
          <span className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-ink-300">{activeAdapter.name}</span>
        </span>

        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg border px-2 py-1.5 font-mono text-[9.5px] uppercase tracking-[0.1em]",
            connected
              ? "border-neon/25 bg-neon/[0.08] text-neon"
              : "border-amber/25 bg-amber/[0.06] text-amber",
          )}
        >
          <span className={cn("h-1 w-1 rounded-full", connected ? "bg-neon animate-blink" : "bg-amber")} />
          {activeDns ? activeDns.name : "DHCP"}
        </span>

        <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.07] bg-white/[0.03] px-2 py-1.5">
          <Activity size={11} className={latencyTone(stats.latencyMs)} />
          <span className={cn("font-mono text-[9.5px] tabular-nums", latencyTone(stats.latencyMs))}>
            {Math.round(stats.latencyMs)} ms
          </span>
        </span>

        <span className="inline-flex items-center rounded-lg border border-violet/25 bg-violet/[0.07] px-2 py-1.5 font-mono text-[9px] uppercase tracking-[0.1em] text-violet">
          v1.0.0 · release
        </span>
      </div>

      <div className="ml-1 flex items-center gap-0.5 border-l border-white/[0.07] pl-2">
        <button
          type="button"
          onClick={() => void runWindowAction("minimize")}
          aria-label="Minimize window"
          className="grid h-7 w-8 place-items-center rounded-md text-ink-400 transition-colors hover:bg-white/[0.06] hover:text-ink-100"
        >
          <Minus size={13} />
        </button>
        <button
          type="button"
          onClick={() => void runWindowAction("toggleMaximize")}
          aria-label="Maximize window"
          className="grid h-7 w-8 place-items-center rounded-md text-ink-400 transition-colors hover:bg-white/[0.06] hover:text-ink-100"
        >
          <Square size={10} />
        </button>
        <button
          type="button"
          onClick={() => void runWindowAction("close")}
          aria-label="Close window"
          className="grid h-7 w-8 place-items-center rounded-md text-ink-400 transition-colors hover:bg-rose/15 hover:text-rose"
        >
          <X size={13} />
        </button>
      </div>
    </header>
  );
}
