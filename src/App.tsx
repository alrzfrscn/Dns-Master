import { useEffect } from "react";
import type { ViewId } from "./types/network";
import { useApp } from "./store/AppStore";
import { Ambient } from "./components/layout/Ambient";
import { Header } from "./components/layout/Header";
import { Sidebar } from "./components/layout/Sidebar";
import { StatusBar } from "./components/layout/StatusBar";
import { ToastStack } from "./components/ui/ToastStack";
import { DashboardView } from "./components/dashboard/DashboardView";
import { DnsListManager } from "./components/dns/DnsListManager";
import { NetworkTools } from "./components/tools/NetworkTools";
import { SettingsView } from "./components/settings/SettingsView";

const VIEWS: ViewId[] = ["dashboard", "vault", "tools", "settings"];

export default function App() {
  const { view, setView } = useApp();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!event.ctrlKey || event.altKey || event.shiftKey) return;
      const index = Number(event.key);
      if (index >= 1 && index <= VIEWS.length) {
        const target = event.target as HTMLElement | null;
        if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
        event.preventDefault();
        setView(VIEWS[index - 1]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setView]);

  return (
    <div className="relative flex h-full w-full overflow-hidden bg-obsidian text-ink-100">
      <Ambient />
      <Sidebar />

      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <Header />

        <main className="relative min-h-0 flex-1 overflow-hidden px-3 pb-2.5 pt-3">
          {view === "dashboard" && <DashboardView />}
          {view === "vault" && <DnsListManager />}
          {view === "tools" && <NetworkTools />}
          {view === "settings" && <SettingsView />}
        </main>

        <StatusBar />
      </div>

      <ToastStack />
    </div>
  );
}
