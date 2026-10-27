import type { DnsCategory } from "../types/network";

/** Format a KB/s figure the way the dashboard reads it. */
export function formatRate(kbps: number): string {
  if (!Number.isFinite(kbps) || kbps <= 0) return "0 KB/s";
  if (kbps >= 1024 * 1024) return `${(kbps / (1024 * 1024)).toFixed(2)} GB/s`;
  if (kbps >= 1024) {
    const mb = kbps / 1024;
    return `${mb >= 100 ? mb.toFixed(0) : mb.toFixed(2)} MB/s`;
  }
  return `${kbps >= 100 ? Math.round(kbps) : kbps.toFixed(1)} KB/s`;
}

export function splitRate(kbps: number): { value: string; unit: string } {
  const parts = formatRate(kbps).split(" ");
  return { value: parts[0] ?? "0", unit: parts[1] ?? "KB/s" };
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exp;
  return `${value >= 100 || exp === 0 ? Math.round(value) : value.toFixed(2)} ${units[exp]}`;
}

/** Short duration label: "04m 12s", "1h 08m". */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "00s";
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
  return `${String(s).padStart(2, "0")}s`;
}

export function formatClock(date: Date): string {
  return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export function latencyTone(ms: number | null): string {
  if (ms === null) return "text-slate-500";
  if (ms <= 35) return "text-mint";
  if (ms <= 60) return "text-neon";
  if (ms <= 90) return "text-amber";
  return "text-rose";
}

export function latencyBarTone(ms: number | null): string {
  if (ms === null) return "bg-slate-600";
  if (ms <= 35) return "bg-mint";
  if (ms <= 60) return "bg-neon";
  if (ms <= 90) return "bg-amber";
  return "bg-rose";
}

export function latencyQuality(ms: number | null): string {
  if (ms === null) return "UNPROBED";
  if (ms <= 35) return "ELITE";
  if (ms <= 60) return "GOOD";
  if (ms <= 90) return "FAIR";
  return "POOR";
}

/** Number of filled bars (1–4) for the mini signal meter. */
export function latencyBars(ms: number | null): number {
  if (ms === null) return 0;
  if (ms <= 35) return 4;
  if (ms <= 60) return 3;
  if (ms <= 90) return 2;
  return 1;
}

export const CATEGORY_META: Record<
  DnsCategory,
  { label: string; short: string; text: string; bg: string; border: string; dot: string; glow: string }
> = {
  gaming: {
    label: "Gaming",
    short: "GAME",
    text: "text-neon",
    bg: "bg-neon/10",
    border: "border-neon/30",
    dot: "bg-neon",
    glow: "shadow-[0_0_18px_-4px_rgba(0,240,255,0.8)]",
  },
  sanction: {
    label: "Sanction Bypass",
    short: "BYPASS",
    text: "text-violet",
    bg: "bg-violet/10",
    border: "border-violet/30",
    dot: "bg-violet",
    glow: "shadow-[0_0_18px_-4px_rgba(168,85,247,0.8)]",
  },
  security: {
    label: "Security",
    short: "SECURE",
    text: "text-mint",
    bg: "bg-mint/10",
    border: "border-mint/30",
    dot: "bg-mint",
    glow: "shadow-[0_0_18px_-4px_rgba(61,255,192,0.8)]",
  },
  general: {
    label: "General",
    short: "GLOBAL",
    text: "text-amber",
    bg: "bg-amber/10",
    border: "border-amber/30",
    dot: "bg-amber",
    glow: "shadow-[0_0_18px_-4px_rgba(255,196,107,0.8)]",
  },
};

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

export function isValidIPv4(value: string): boolean {
  const match = IPV4.exec(value.trim());
  if (!match) return false;
  return match.slice(1).every((octet) => {
    const n = Number(octet);
    return Number.isInteger(n) && n >= 0 && n <= 255 && String(n) === octet.replace(/^0+(?=\d)/, "");
  });
}

export function seededNoise(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}
