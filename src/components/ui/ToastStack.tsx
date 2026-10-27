import { CheckCircle2, Info, TriangleAlert, X, XCircle } from "lucide-react";
import { useApp } from "../../store/AppStore";
import { cn } from "../../lib/cn";

const TONE = {
  info: { icon: Info, color: "text-neon", bar: "bg-neon", ring: "border-neon/25" },
  success: { icon: CheckCircle2, color: "text-mint", bar: "bg-mint", ring: "border-mint/25" },
  warning: { icon: TriangleAlert, color: "text-amber", bar: "bg-amber", ring: "border-amber/25" },
  error: { icon: XCircle, color: "text-rose", bar: "bg-rose", ring: "border-rose/25" },
} as const;

export function ToastStack() {
  const { toasts, dismissToast } = useApp();

  return (
    <div className="pointer-events-none absolute bottom-11 right-4 z-50 flex w-[292px] flex-col gap-2">
      {toasts.map((toast) => {
        const tone = TONE[toast.tone];
        const Icon = tone.icon;
        return (
          <div
            key={toast.id}
            className={cn(
              "pointer-events-auto animate-rise overflow-hidden rounded-xl border bg-[#0a0e16]/92 p-3 backdrop-blur-xl",
              tone.ring,
            )}
            role="status"
          >
            <div className="flex items-start gap-2.5">
              <Icon size={14} className={cn("mt-[2px] shrink-0", tone.color)} />
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-medium leading-snug text-ink-100">{toast.title}</p>
                {toast.detail && (
                  <p className="mt-0.5 truncate font-mono text-[10px] text-ink-500">{toast.detail}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                aria-label="Dismiss notification"
                className="text-ink-600 transition-colors hover:text-ink-200"
              >
                <X size={13} />
              </button>
            </div>
            <span className={cn("absolute bottom-0 left-0 h-px w-full opacity-50", tone.bar)} />
          </div>
        );
      })}
    </div>
  );
}
