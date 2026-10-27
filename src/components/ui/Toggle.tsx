import { cn } from "../../lib/cn";

interface ToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}

/** Accessible switch used across tools and settings. */
export function Toggle({ checked, onChange, label, disabled = false }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-[22px] w-[40px] shrink-0 rounded-full border transition-all duration-300",
        checked
          ? "border-neon/50 bg-neon/20 shadow-[0_0_18px_-4px_rgba(0,240,255,0.7)]"
          : "border-white/10 bg-white/[0.05]",
        disabled && "opacity-40",
      )}
    >
      <span
        className={cn(
          "absolute top-1/2 h-[14px] w-[14px] -translate-y-1/2 rounded-full transition-all duration-300",
          checked
            ? "left-[21px] bg-neon shadow-[0_0_12px_rgba(0,240,255,0.9)]"
            : "left-[3px] bg-ink-400",
        )}
      />
    </button>
  );
}
