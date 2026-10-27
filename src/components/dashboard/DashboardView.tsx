import { ActiveConnectionCard } from "./ActiveConnectionCard";
import { LiveTrafficChart } from "./LiveTrafficChart";
import { PingRadarWidget } from "./PingRadarWidget";
import { QuickDnsSwitch } from "./QuickDnsSwitch";

export function DashboardView() {
  return (
    <div className="deck-enter grid h-full min-h-0 grid-cols-12 grid-rows-[minmax(0,1fr)_286px] gap-2.5">
      <ActiveConnectionCard />
      <LiveTrafficChart />
      <QuickDnsSwitch />
      <PingRadarWidget />
    </div>
  );
}
