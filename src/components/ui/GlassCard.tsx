import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";

interface GlassCardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  /** Adds the subtle top-left cyan wash. */
  sheen?: boolean;
  /** Removes padding so the card can own its layout. */
  flush?: boolean;
}

export function GlassCard({ children, className, sheen = false, flush = false, ...rest }: GlassCardProps) {
  return (
    <div className={cn("glass", !flush && "p-4", className)} {...rest}>
      {sheen && <span className="card-sheen" aria-hidden="true" />}
      <div className="relative flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

export function HudLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("hud-label", className)}>{children}</span>;
}

export function CornerBrackets({ tone = "cyan" }: { tone?: "cyan" | "violet" }) {
  const color = tone === "cyan" ? "border-neon/45" : "border-violet/45";
  return (
    <span aria-hidden="true" className="pointer-events-none absolute inset-0">
      <span className={cn("absolute left-0 top-0 h-2.5 w-2.5 border-l border-t", color)} />
      <span className={cn("absolute right-0 top-0 h-2.5 w-2.5 border-r border-t", color)} />
      <span className={cn("absolute bottom-0 left-0 h-2.5 w-2.5 border-b border-l", color)} />
      <span className={cn("absolute bottom-0 right-0 h-2.5 w-2.5 border-b border-r", color)} />
    </span>
  );
}
