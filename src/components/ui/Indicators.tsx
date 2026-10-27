import type { DnsCategory } from "../../types/network";
import { cn } from "../../lib/cn";
import { CATEGORY_META } from "../../lib/format";

export function CategoryBadge({
  category,
  className,
  compact = false,
}: {
  category: DnsCategory;
  className?: string;
  compact?: boolean;
}) {
  const meta = CATEGORY_META[category];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-[3px] font-mono text-[9px] font-medium uppercase tracking-[0.14em]",
        meta.bg,
        meta.border,
        meta.text,
        className,
      )}
    >
      <span className={cn("h-1 w-1 rounded-full", meta.dot)} />
      {compact ? meta.short : meta.label}
    </span>
  );
}

export function LatencyMeter({
  latency,
  bars,
  tone,
  className,
}: {
  latency: number | null;
  bars: number;
  tone: string;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-[3px]", className)} title={latency === null ? "No probe yet" : `${latency} ms`}>
      {[1, 2, 3, 4].map((level) => (
        <span
          key={level}
          className={cn(
            "w-[3px] rounded-full transition-colors duration-500",
            level <= bars ? tone : "bg-white/12",
          )}
          style={{ height: `${4 + level * 2.5}px` }}
        />
      ))}
    </span>
  );
}
