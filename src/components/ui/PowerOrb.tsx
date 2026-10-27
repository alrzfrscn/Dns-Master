import { Power, RotateCcw } from "lucide-react";
import type { ConnectionPhase } from "../../types/network";
import { cn } from "../../lib/cn";

interface PowerOrbProps {
  phase: ConnectionPhase;
  onToggle: () => void;
  onReset: () => void;
}

const BUSY_PHASES: ConnectionPhase[] = ["connecting", "disconnecting", "resetting"];

/**
 * The centrepiece: a layered reactor orb. Cyan while a static resolver is bound,
 * violet-dim on DHCP, spinning while an action is in flight.
 */
export function PowerOrb({ phase, onToggle, onReset }: PowerOrbProps) {
  const connected = phase === "connected";
  const busy = BUSY_PHASES.includes(phase);
  const label = connected ? "Disconnect resolver" : "Apply active resolver";

  return (
    <div className="relative flex h-[158px] w-[158px] shrink-0 items-center justify-center">
      {/* Ambient halo */}
      <div
        aria-hidden="true"
        className={cn(
          "absolute inset-0 rounded-full blur-2xl transition-opacity duration-700",
          connected ? "bg-neon/25 opacity-100" : "bg-violet/15 opacity-70",
        )}
      />
      {/* Tick ring */}
      <svg aria-hidden="true" viewBox="0 0 160 160" className="absolute inset-0 h-full w-full">
        <circle cx="80" cy="80" r="76" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1" strokeDasharray="1 5" />
        <circle
          cx="80"
          cy="80"
          r="68"
          fill="none"
          stroke={connected ? "rgba(0,240,255,0.35)" : "rgba(168,85,247,0.28)"}
          strokeWidth="1.25"
          strokeDasharray="42 260"
          className="origin-center animate-sweep"
          style={{ animationDirection: "reverse", animationDuration: "9s" }}
        />
      </svg>

      {/* Conic rotor */}
      <div
        aria-hidden="true"
        className={cn(
          "absolute inset-[9px] rounded-full p-[1.5px] transition-opacity duration-500",
          busy ? "opacity-100 animate-sweep" : connected ? "animate-sweep opacity-90" : "opacity-40",
        )}
        style={{
          background:
            "conic-gradient(from 0deg, transparent 0deg, rgba(0,240,255,0.95) 72deg, transparent 142deg, rgba(168,85,247,0.75) 226deg, transparent 320deg)",
          animationDuration: busy ? "1.6s" : "8s",
        }}
      >
        <div className="h-full w-full rounded-full bg-[#080b12]" />
      </div>

      {/* Inner disc */}
      <div
        className={cn(
          "absolute inset-[26px] rounded-full border transition-all duration-700",
          connected
            ? "border-neon/40 bg-[radial-gradient(circle_at_50%_38%,rgba(0,240,255,0.22),rgba(7,9,14,0.96)_72%)] shadow-[inset_0_0_34px_rgba(0,240,255,0.28),0_0_44px_-10px_rgba(0,240,255,0.55)]"
            : "border-white/10 bg-[radial-gradient(circle_at_50%_38%,rgba(168,85,247,0.16),rgba(7,9,14,0.96)_72%)] shadow-[inset_0_0_28px_rgba(168,85,247,0.16)]",
        )}
      />

      {connected && (
        <span
          aria-hidden="true"
          className="absolute inset-[22px] rounded-full border border-neon/40 animate-pulse-ring"
        />
      )}

      <button
        type="button"
        onClick={onToggle}
        disabled={busy}
        aria-label={label}
        title={label}
        className={cn(
          "group relative z-10 flex h-[74px] w-[74px] flex-col items-center justify-center gap-1 rounded-full transition-all duration-300",
          "hover:scale-[1.04] active:scale-[0.97] disabled:hover:scale-100",
        )}
      >
        <Power
          size={26}
          strokeWidth={1.7}
          className={cn(
            "transition-colors duration-500",
            busy
              ? "animate-pulse text-amber"
              : connected
                ? "text-neon drop-shadow-[0_0_10px_rgba(0,240,255,0.8)]"
                : "text-ink-200 group-hover:text-neon",
          )}
        />
        <span className="font-mono text-[8px] uppercase tracking-[0.2em] text-ink-400">
          {busy ? "LINKING" : connected ? "ONLINE" : "ENGAGE"}
        </span>
      </button>

      <button
        type="button"
        onClick={onReset}
        title="Reset to DHCP"
        aria-label="Reset resolver to DHCP"
        className="absolute bottom-0 right-1 z-10 grid h-7 w-7 place-items-center rounded-full border border-white/10 bg-[#0a0e16]/90 text-ink-400 backdrop-blur transition-colors hover:border-rose/40 hover:text-rose"
      >
        <RotateCcw size={12} strokeWidth={1.8} />
      </button>
    </div>
  );
}
