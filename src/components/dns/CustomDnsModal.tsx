import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Plus, ShieldPlus, X } from "lucide-react";
import { useApp } from "../../store/AppStore";
import { cn } from "../../lib/cn";
import { CATEGORY_META, isValidIPv4 } from "../../lib/format";
import type { DnsCategory } from "../../types/network";

const CATEGORIES: DnsCategory[] = ["gaming", "sanction", "security", "general"];

export function CustomDnsModal({ onClose }: { onClose: () => void }) {
  const { addCustomDns, servers } = useApp();
  const [name, setName] = useState("");
  const [primary, setPrimary] = useState("");
  const [secondary, setSecondary] = useState("");
  const [category, setCategory] = useState<DnsCategory>("gaming");
  const [description, setDescription] = useState("");
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const errors = useMemo(() => {
    const next: { name?: string; primary?: string; secondary?: string } = {};
    if (name.trim().length < 2) next.name = "Give the resolver a name.";
    if (!isValidIPv4(primary)) next.primary = "Enter a valid IPv4 address.";
    if (secondary.trim() && !isValidIPv4(secondary)) next.secondary = "Secondary must be a valid IPv4 or empty.";
    const duplicate = servers.some(
      (s) => s.primary === primary.trim() || (secondary.trim() !== "" && s.primary === secondary.trim()),
    );
    if (!next.primary && duplicate) next.primary = "This endpoint already exists in the vault.";
    return next;
  }, [name, primary, secondary, servers]);

  const valid = Object.keys(errors).length === 0;

  const submit = () => {
    setTouched(true);
    if (!valid) return;
    addCustomDns({ name, primary, secondary, category, description });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#04060a]/70 p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="custom-dns-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="glass relative w-[400px] max-w-full animate-rise overflow-hidden p-0">
        <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-neon/60 to-transparent" />
        <div className="flex items-start justify-between px-4 pb-3 pt-4">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg border border-neon/25 bg-neon/10 text-neon">
              <ShieldPlus size={15} />
            </span>
            <div>
              <h2 id="custom-dns-title" className="font-display text-[14px] font-semibold tracking-wide text-ink-100">
                Add custom resolver
              </h2>
              <p className="mt-0.5 font-mono text-[8px] uppercase tracking-[0.16em] text-ink-500">
                Vault / manual entry
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="grid h-6 w-6 place-items-center rounded-md text-ink-500 transition-colors hover:bg-white/5 hover:text-ink-100"
          >
            <X size={13} />
          </button>
        </div>

        <div className="space-y-3 px-4 pb-4">
          <label className="block">
            <span className="hud-label">Label</span>
            <input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. My Gaming Resolver"
              aria-label="Resolver label"
              className={cn(
                "mt-1.5 h-8 w-full rounded-md border bg-black/30 px-2.5 text-[11.5px] text-ink-100 placeholder:text-ink-600 transition-colors focus:border-neon/50 focus:outline-none",
                touched && errors.name ? "border-rose/50" : "border-white/10",
              )}
            />
            {touched && errors.name && <p className="mt-1 text-[9px] text-rose">{errors.name}</p>}
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="hud-label">Primary IPv4</span>
              <input
                value={primary}
                onChange={(event) => setPrimary(event.target.value)}
                placeholder="10.10.10.10"
                inputMode="decimal"
                aria-label="Primary IPv4"
                className={cn(
                  "mt-1.5 h-8 w-full rounded-md border bg-black/30 px-2.5 font-mono text-[11px] tracking-tight text-ink-100 placeholder:text-ink-600 transition-colors focus:border-neon/50 focus:outline-none",
                  touched && errors.primary ? "border-rose/50" : "border-white/10",
                )}
              />
            </label>
            <label className="block">
              <span className="hud-label">Secondary IPv4</span>
              <input
                value={secondary}
                onChange={(event) => setSecondary(event.target.value)}
                placeholder="optional"
                inputMode="decimal"
                aria-label="Secondary IPv4"
                className={cn(
                  "mt-1.5 h-8 w-full rounded-md border bg-black/30 px-2.5 font-mono text-[11px] tracking-tight text-ink-100 placeholder:text-ink-600 transition-colors focus:border-neon/50 focus:outline-none",
                  touched && errors.secondary ? "border-rose/50" : "border-white/10",
                )}
              />
            </label>
          </div>
          {touched && (errors.primary || errors.secondary) && (
            <p className="flex items-center gap-1.5 text-[9px] text-rose">
              <AlertTriangle size={10} /> {errors.primary ?? errors.secondary}
            </p>
          )}

          <div>
            <span className="hud-label">Category</span>
            <div className="mt-1.5 grid grid-cols-4 gap-1.5">
              {CATEGORIES.map((item) => {
                const meta = CATEGORY_META[item];
                const active = category === item;
                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setCategory(item)}
                    aria-pressed={active}
                    className={cn(
                      "rounded-md border px-1 py-1.5 font-mono text-[8px] uppercase tracking-[0.1em] transition-all",
                      active
                        ? cn(meta.bg, meta.border, meta.text)
                        : "border-white/[0.07] bg-white/[0.02] text-ink-500 hover:border-white/15 hover:text-ink-300",
                    )}
                  >
                    {meta.short}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="block">
            <span className="hud-label">Note (optional)</span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={2}
              placeholder="What is this resolver for?"
              aria-label="Resolver note"
              className="mt-1.5 w-full resize-none rounded-md border border-white/10 bg-black/30 px-2.5 py-2 text-[10.5px] leading-relaxed text-ink-200 placeholder:text-ink-600 transition-colors focus:border-neon/50 focus:outline-none"
            />
          </label>
        </div>

        <div className="flex items-center justify-between border-t border-white/[0.07] bg-black/20 px-4 py-3">
          <span className="font-mono text-[8px] uppercase tracking-[0.12em] text-ink-600">stored locally · session</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-7 rounded-md border border-white/10 px-3 font-mono text-[8.5px] uppercase tracking-[0.14em] text-ink-400 transition-colors hover:bg-white/5 hover:text-ink-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={touched && !valid}
              className="flex h-7 items-center gap-1.5 rounded-md border border-neon/40 bg-neon/15 px-3 font-mono text-[8.5px] uppercase tracking-[0.14em] text-neon transition-all hover:border-neon/70 hover:bg-neon/25 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Plus size={10} /> Save resolver
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
