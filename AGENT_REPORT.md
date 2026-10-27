# NeonDNS — Phase 1 Agent Report

Date: 2026-10-27
Project: `D:\Project\Dns Master`
Scope: Phase 1 (UI shell, simulated state, frozen Rust contracts)

---

## 1. Environment

| Tool | Version |
| --- | --- |
| OS | Windows 11 Pro Education 10.0.28000 x64 |
| Node.js | v24.21.0 |
| npm | 12.2.0 |
| rustc | 1.98.1 (48a229cea 2026-09-01) |
| cargo | 1.98.1 (797e8a9bc 2026-08-05) |
| Tauri | 2.12.5 (`tauri-macros` 2.7.4) |
| React / React DOM | 19.2.0 |
| Vite | 7.3.7 |
| Tailwind CSS | 4.1.14 via `@tailwindcss/vite` |
| Recharts | 3.2.1 |
| lucide-react | 0.545.0 |

Rust, Node and npm were already installed. All dependencies are local in `node_modules`; fonts are bundled offline through `@fontsource`.

## 2. Run

```powershell
npm install          # already done
npm run dev          # Vite only, http://localhost:1420
npm run build        # tsc --noEmit && vite build
npm run tauri dev    # native shell (needs WebView2 / MSVC)
npm run tauri build  # native installer
```

The Vite dev server is pinned to port `1420` with `strictPort`, as Tauri expects.

## 3. File tree

```text
D:\Project\Dns Master
├─ assets/app-icon.png
├─ dns_list.json                 # original seed supplied before scaffolding (kept)
├─ index.html
├─ package.json
├─ tsconfig.json
├─ vite.config.ts
├─ src
│  ├─ App.tsx
│  ├─ main.tsx
│  ├─ index.css                  # theme tokens, glass/HUD utilities, keyframes
│  ├─ components
│  │  ├─ layout
│  │  │  ├─ Ambient.tsx          # radial neon ambience + grid
│  │  │  ├─ Header.tsx           # frameless drag region, status chips, window controls
│  │  │  ├─ Sidebar.tsx          # nav, active resolver card, live bus
│  │  │  └─ StatusBar.tsx
│  │  ├─ dashboard
│  │  │  ├─ ActiveConnectionCard.tsx
│  │  │  ├─ DashboardView.tsx
│  │  │  ├─ LiveTrafficChart.tsx
│  │  │  ├─ PingRadarWidget.tsx
│  │  │  └─ QuickDnsSwitch.tsx
│  │  ├─ dns
│  │  │  ├─ BenchmarkPanel.tsx
│  │  │  ├─ CustomDnsModal.tsx
│  │  │  └─ DnsListManager.tsx
│  │  ├─ tools/NetworkTools.tsx
│  │  ├─ settings/SettingsView.tsx
│  │  └─ ui
│  │     ├─ GlassCard.tsx
│  │     ├─ Indicators.tsx
│  │     ├─ PowerOrb.tsx
│  │     ├─ ToastStack.tsx
│  │     └─ Toggle.tsx
│  ├─ data
│  │  ├─ defaultDns.json         # 30 resolvers (merged with the original dns_list.json)
│  │  ├─ mock.ts
│  │  └─ servers.ts
│  ├─ lib
│  │  ├─ cn.ts
│  │  ├─ format.ts               # latency bars, category meta, IPv4 validation
│  │  └─ tauri.ts                # fail-safe window controls
│  ├─ store/AppStore.tsx         # all simulated state and actions
│  └─ types/network.ts           # shared UI ↔ Rust contracts
└─ src-tauri
   ├─ build.rs
   ├─ Cargo.toml
   ├─ tauri.conf.json            # frameless 1100×720 window, CSP, icons
   ├─ capabilities/default.json
   ├─ icons/*                    # generated from assets/app-icon.png
   └─ src
      ├─ main.rs
      └─ lib.rs                  # 8 commands + 3 unit tests
```

Screenshots used during verification live in `.openchamber/screenshots/` and are not part of the build.

## 4. Phase 1 features

**Shell**
- Frameless dark window, 1100×720, custom minimize / maximize / close controls. In a browser these fall back to an honest toast.
- Obsidian `#07090E` base, radial cyan/violet ambience, HUD grid, glass cards.
- Non-scrolling shell: each view scrolls internally at its own panel.
- Keyboard: `Ctrl+1…4` switches views, `Esc` closes the custom resolver dialog.
- Toast stack, reduced-motion support.

**Dashboard**
- Active connection hero: state orb, primary/secondary resolver, adapter latency/speed, Engage Electro / Release Link / Reset actions.
- Live traffic area chart (48 points, 1 s sampler) with pause/resume, download/upload, session totals and peak.
- Four pinned relay cards with latency, signal meters, endpoint and live sparkline.
- Route radar with ranked nodes, best node, jitter and loss.
- Utility bar: Flush DNS, Reset DNS, Find Fastest.

**DNS Vault & Benchmark**
- 30 seeded resolvers, categories `gaming | sanction | security | general`, Persian secondary names.
- Search, category filters, pin/unpin, per-row ping, apply/use.
- Batch sweep progress, best/avg/jitter stats, top-12 weighted ranking.
- Custom resolver modal with IPv4 validation, duplicate detection and category selection.
- GitHub raw URL sync (simulated pull, URL validation, toast result).
- Persisted-in-memory only; no seed file is overwritten.

**Network Tools**
- Flush DNS cache, reset DHCP, IPv6 resolution toggle.
- Sanction bypass tester: 6 targets (Docker Hub, GitHub, OpenAI API, Hugging Face, Steam Store, EA Online) with queued/reachable/blocked states, latency, resolver used, and a 3-group matrix (Developer / AI services / Gaming).
- Adapter hygiene readout (gateway, link speed, DNS leak guard, status) and "switch to Electro" shortcut.

**Settings**
- Adapter selector (Wi-Fi, Ethernet, WireGuard VPN) with live IPv4/gateway/link stats.
- GitHub manifest URL validation + sync.
- Startup & behaviour toggles: launch with Windows, re-apply last resolver, minimize to tray, notifications.
- Diagnostics snapshot, copy, reset-to-defaults.
- Rust bridge card listing the frozen Phase 2 commands, with an explicit "nothing is modified in this build" guardrail.

**Design system**
- Tailwind CSS 4 `@theme` tokens: obsidian, panel, neon, violet, mint, amber, rose, ink 100–600.
- Oxanium (display), Sora (body), JetBrains Mono (data), self-hosted.
- Reusable glass card, HUD label, latency meter, toggle, power orb, toast primitives.

## 5. State model

Single React context in `src/store/AppStore.tsx`:

- `view`, `servers`, `pinnedServers`, `customDns`
- `adapters`, `activeAdapterId`
- `connection` (`phase`, `mode`, `activeDnsId`, `adapterId`, `since`, `error`)
- `traffic` (48-point series), `stats`, `streamPaused`
- `benchmark` (running/progress/currentId/results)
- `ipv6Enabled`, `bypassResults`, `bypassRunning`
- `settings`, `syncing`, `toasts`

Actions include `applyDns`, `disconnect`, `resetDhcp`, `flushDns`, `pingServer`, `runBenchmark`, `runBypassProbe`, `addCustomDns`, `togglePin`, `syncFromGithub`, `updateSetting`, `resetSettings`, `pushToast`.

An incrementing `actionToken` cancels stale async applies when the adapter changes, resets, or disconnects. Traffic is sampled once per second; benchmark and probe actions use deterministic timers. No OS state is touched.

The seed `src/data/defaultDns.json` contains 30 entries and preserves the resolvers from the original `dns_list.json` rather than overwriting them.

## 6. Build verification

```text
npx tsc --noEmit
→ clean (exit 0)

npm run build
→ tsc --noEmit && vite build
→ 2302 modules transformed
→ built in 9.68s
→ dist/index.html                     0.76 kB │ gzip   0.42 kB
→ dist/assets/index-*.css            69.86 kB │ gzip  11.59 kB
→ dist/assets/index-*.js            345.01 kB │ gzip 101.75 kB
→ dist/assets/charts-*.js           365.26 kB │ gzip 107.42 kB
→ dist/assets/icons-*.js             23.19 kB │ gzip   8.68 kB
→ dist/assets/window-*.js            16.16 kB │ gzip   4.15 kB
→ fonts, self-hosted, 8–28 kB each
```

No chunk-size warning after removing the redundant `react` manual chunk (React 19 is already bundled into the entry).

```text
cargo test --manifest-path src-tauri\Cargo.toml
→ running 3 tests
→ accepts_valid_pairs ... ok
→ rejects_invalid_ipv4 ... ok
→ mutating_commands_are_honest ... ok
→ 3 passed; 0 failed
```

Manual UI verification was done at 1100×720 for Dashboard (idle, connected, reset), Vault (list, filters, benchmark), Tools (probe matrix, tiles), Settings (all cards fit) and the custom resolver dialog. A fade-in on the dialog can make a screenshot taken immediately after opening appear blank for a frame; it renders normally after the animation.

## 7. Rust IPC contracts (frozen)

All commands use `#[serde(rename_all = "camelCase")]` for structs and Tauri's default camelCase argument names on the JS side.

### `get_network_adapters`

```rust
fn get_network_adapters() -> Result<Vec<NetworkAdapter>, CommandError>
```

`NetworkAdapter`:

```ts
{
  id: string;          // "adapter-wifi"
  name: string;        // "Wi-Fi"
  kind: "wifi" | "ethernet" | "vpn" | "loopback";
  status: "up" | "down";
  ipv4: string;
  gateway: string;
  mac: string;
  speedMbps: number;   // 0 when unknown
  isDefault: boolean;
}
```

JS: `invoke<NetworkAdapter[]>("get_network_adapters")`

Phase 2 source: `GetAdaptersAddresses` plus `GetIfTable2`; filter loopback by default.

### `get_live_traffic`

```rust
fn get_live_traffic(adapter_id: String) -> Result<TrafficStats, CommandError>
```

`TrafficStats`:

```ts
{
  downKbps: number;
  upKbps: number;
  peakDownKbps: number;
  peakUpKbps: number;
  sessionDownBytes: number;
  sessionUpBytes: number;
  latencyMs: number;
  packetLossPercent: number;
  live: boolean;
}
```

JS: `invoke<TrafficStats>("get_live_traffic", { adapterId })`

Phase 2 source: poll interface counters once per second, return deltas; the frontend owns the 48-point history. The current body returns a zeroed, `live: false` snapshot.

### `get_current_dns`

```rust
fn get_current_dns(adapter_id: String) -> Result<DnsConfig, CommandError>
```

`DnsConfig`:

```ts
{
  adapterId: string;
  mode: "dhcp" | "static";
  primary: string | null;
  secondary: string | null;
  servers: string[];
  source: "dhcp" | "static" | "unknown";
}
```

JS: `invoke<DnsConfig>("get_current_dns", { adapterId })`

Phase 2 source: `netsh interface ipv4 show dnsservers name=<adapter>` or the per-interface registry key. The current body returns DHCP with no servers.

### Other commands

```rust
fn set_dns(request: SetDnsRequest) -> Result<DnsConfig, CommandError>
fn reset_dns(adapter_id: String) -> Result<DnsConfig, CommandError>
fn flush_dns_cache() -> Result<(), CommandError>
fn set_ipv6_enabled(adapter_id: String, enabled: bool) -> Result<(), CommandError>
fn run_bypass_probe(adapter_id: String) -> Result<Vec<serde_json::Value>, CommandError>
```

`SetDnsRequest`:

```ts
{ adapterId: string; primary: string; secondary: string }
```

`CommandError`:

```ts
{ code: string; message: string }
```

Codes currently emitted: `INVALID_IPV4` (`set_dns` validation) and `NOT_IMPLEMENTED` (every mutation).

**Honesty rule:** `set_dns`, `reset_dns`, `flush_dns_cache`, `set_ipv6_enabled` and `run_bypass_probe` validate their input and then return `NOT_IMPLEMENTED`. The UI therefore cannot claim a system change until Phase 2 implements and verifies it. The unit test `mutating_commands_are_honest` enforces this.

**Visibility constraint:** command functions are deliberately private (`fn`, not `pub fn`). With rustc 1.98 and `tauri-macros` 2.7.4, a public command makes the macro emit `#[macro_export]` plus a same-name self-import, which fails with `E0255` (macro defined multiple times). `generate_handler!` works with private functions in the same module. Keep them private unless the macro/toolchain is upgraded and verified.

## 8. Phase 2 handoff

1. **Wire the bridge** — replace store timers with `invoke()` calls. The TypeScript contract in `src/types/network.ts` already matches the serde output; use `src/lib/tauri.ts` as the failure-safe wrapper.
2. **Adapters** — enumerate real interfaces, mark the default route, expose VPN/virtual adapters, handle hot-plug.
3. **Traffic** — poll `GetIfTable2` deltas per second on a background thread; emit only counters, keep history in React.
4. **DNS apply/reset** — snapshot current settings for rollback, run `netsh` (or the Win32 API) with elevation, read back and verify, then return the new `DnsConfig`.
5. **Flush / IPv6** — `ipconfig /flushdns`; toggle IPv6 resolver registration without disabling the stack.
6. **Bypass probe** — real TLS handshakes through the active resolver, with timeouts and block classification.
7. **Persistence** — settings and custom resolvers currently live in memory only; add a store (JSON file or `tauri-plugin-store`).
8. **GitHub sync** — the current pull is simulated; implement fetch, schema validation and merge/dedupe against the seed.
9. **Elevation** — DNS writes need an elevated helper or a signed service; the current manifest is not elevated.
10. **Packaging** — verify `npm run tauri build` on a machine with WebView2 and the MSVC build tools; icons are already generated.

## 9. Known limits / skipped in Phase 1

- No real DNS, DHCP, adapter, IPv6 or cache mutation. All buttons are simulated and say so in Settings.
- No persistence: reloading resets pins, custom resolvers, settings and session totals.
- GitHub sync does not perform a network request.
- Recharts entrance animation is disabled (`isAnimationActive={false}`) because it left the area series clipped; the chart still animates through the 1 s live data feed.
- No automated frontend test runner. Validation (`isValidIPv4`, duplicate detection, Rust contracts) is covered by the three Rust tests plus manual browser checks at 1100×720.
- `npm run tauri dev/build` was not executed end-to-end; the Rust crate compiles and its tests pass. The UI was verified in the browser, with window controls falling back to a toast outside Tauri.
- The original `dns_list.json` is left untouched; its entries were merged into `defaultDns.json`.

---

# Dns Master - Phase 2 Completion Report

Date: 2026-10-27
Scope: rebrand, real Windows adapter/traffic/DNS reads, live UI wiring

## 10. Rebrand: NeonDNS -> Dns Master

| Surface | Phase 1 | Phase 2 |
| --- | --- | --- |
| Cargo package | `neondns` | `dns-master` |
| Rust lib | `neondns_lib` | `dns_master_lib` |
| Tauri productName | NeonDNS | Dns Master |
| Bundle identifier | `com.neondns.desktop` | `com.dnsmaster.desktop` |
| Window title | NeonDNS | Dns Master |
| npm package | neondns | dns-master |
| UI wordmark | NEONDNS | DNS MASTER (`Control Deck` subtitle kept) |

`index.html`, `capabilities/default.json`, `src-tauri/src/main.rs` and the package metadata were updated with the name. The bundled resolver seed is now `defaultDns.json`; the original `dns_list.json` seed is still untouched.

## 11. New dependency

Only one Rust crate was added, and it was already present in `Cargo.lock` (so no network fetch was needed):

```toml
windows-sys = { version = "0.61", features = [
  "Win32_Foundation",
  "Win32_NetworkManagement_IpHelper",   # GetAdaptersAddresses / GetIfTable2 / GetIpForwardTable2
  "Win32_NetworkManagement_Ndis",
  "Win32_Networking_WinSock",
  "Win32_System_Registry",              # DNS values per interface
] }
```

No `sysinfo`, no shell for the read path, no elevation. The read commands use Win32 directly; `netsh` is spawned only as a hidden fallback for DNS parsing, always with `CREATE_NO_WINDOW` (`0x08000000`), so no console window flashes.

## 12. Command layer

All three read commands are `#[tauri::command(async)]`, so their blocking Win32 calls and the TCP latency probe run on the blocking thread pool instead of the event loop. Functions stay **private** for the reason documented in section 7 (rustc 1.98 + tauri-macros 2.7.4 emits E0255 for `pub fn` commands).

### `get_network_adapters`

- Enumerates IPv4/IPv6 interfaces with `GetAdaptersAddresses` (GUID, alias, MAC, oper status, addresses).
- Link speed/type comes from `GetIfTable2`; the default interface is found through `GetIpForwardTable2` (a route whose next hop is `0.0.0.0`).
- Filters loopback and `down` interfaces, classifies `wifi | ethernet | vpn | loopback` from the NDIS medium + alias, and sorts default-first then by kind.
- `id` is the adapter GUID, which is also the registry key name and the value passed back to the other two commands.

### `get_live_traffic(adapterId)`

- Reads `InOctets`/`OutOctets` from `GetIfTable2` **without spawning anything**.
- State (`tauri::State<Mutex<TrafficMonitorState>>`) keeps the previous counters, the last timestamp and the session totals/peaks.
- Rate = byte delta / real elapsed seconds (`Instant`), converted to KiB/s (`/1024`), matching the existing chart unit. Peaks and session bytes accumulate in Rust; the first sample after start is 0.
- Changing adapter resets the baseline, peaks and session totals so a switch cannot produce a bogus spike.
- Unknown GUID: falls back to aggregating all up, non-loopback interfaces so the UI keeps working; if counters are unavailable it returns `COUNTERS_UNAVAILABLE`.
- Latency = TCP connect to port 53 of the configured resolver (else gateway, else `1.1.1.1`), 350 ms timeout, result cached for 5 s (`LATENCY_TTL`). `packetLossPercent` is reported as `0.0` because no loss sampling exists yet.

### `get_current_dns(adapterId)`

- Reads `HKLM\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters\Interfaces\{GUID}`: `NameServer` (static) and `DhcpNameServer`.
- A non-empty `NameServer` wins (`mode: "static"`), otherwise `DhcpNameServer` (`mode: "dhcp"`); both empty -> `source: "unknown"`.
- `0.0.0.0`, `::` and blanks are discarded; `servers` preserves order and `primary`/`secondary` are the first two.
- Fallback only: parses English `netsh interface ipv4 show dnsservers name=<alias>` output (hidden, `CREATE_NO_WINDOW`). The registry path is language-neutral and preferred so localized Windows builds still work.
- No DHCP lease details, no resolver reachability beyond the latency probe, no writes.

### Mutations (unchanged, honest)

`set_dns` still validates IPv4 pairs then returns `NOT_IMPLEMENTED`. `reset_dns`, `flush_dns_cache`, `set_ipv6_enabled` and `run_bypass_probe` do the same. The UI labels them "Simulated ... Phase 3"; `mutating_commands_are_honest` enforces this.

## 13. Frontend wiring

- `src/lib/tauri.ts` exports `fetchNetworkAdapters`, `fetchLiveTraffic`, `fetchCurrentDns` and `invokeSafe`; outside Tauri every call resolves `null` instead of throwing.
- `AppStore.tsx` reads adapters once on mount, selects the default route adapter, then calls `syncDns` to match the read resolver against the bundled list (primary/secondary, then `servers`); an unmatched resolver stays "PASSIVE / DHCP" with the real `primary` shown.
- The 1 s sampler calls `get_live_traffic`; if the bridge is unavailable it falls back to the Phase 1 synthesized curve and the badges stay amber. Real data sets `telemetryLive`.
- New context fields: `dnsConfig` (real `mode/source/primary/secondary/servers`) and `bridgeReady`/`telemetryLive`.
- Badges: Sidebar "RUST CORE / LIVE TELEMETRY" (amber "SIMULATED" in a plain browser), StatusBar "CORE ONLINE ... RUST CORE - LIVE TELEMETRY", Settings shows the resolver readout, bridge state and read-only diagnostics.
- `MOCK_ADAPTERS` remains only as the browser fallback; the store no longer rewrites `isDefault` on adapter switch (the Rust side owns that flag).

## 14. Verification

| Check | Result |
| --- | --- |
| `cargo test` (`src-tauri`) | 13 passed, 0 failed |
| `npx tsc --noEmit` | exit 0, no diagnostics |
| `npm run build` | success (Vite 7.3.7, ~10 s) |
| `cargo build` (dev) | success |
| Native run | `npm run dev` + `src-tauri\target\debug\dns-master.exe`, dashboard screenshot verified |

Tests cover: IPv4 validation/acceptance, server-list parsing, static-vs-DHCP classification, empty -> unknown, `netsh` static and DHCP output parsing, rate math from real elapsed time, session reset on adapter change, real adapter enumeration on Windows, unknown adapter safety, and the honesty rule for mutations.

The native screenshot (capture kept outside the repo) shows the real host values: Wi-Fi `192.168.1.2`, gateway `192.168.1.1`, DHCP resolver `5.200.200.200`, 144 Mbps link, `LIVE TELEMETRY` badge, `RUST CORE - LIVE TELEMETRY` in the status bar, a moving 1 s chart and session totals increasing. The second up adapter (`xray_tun`, static `1.1.1.1`/`8.8.8.8`) is listed but not default, exactly as the routing table says.

Run order matters: the debug binary loads `http://localhost:1420`, so either use `npm run tauri dev` or start `npm run dev` first, then launch the exe.

## 15. Known limits / skipped in Phase 2

- DNS writes, flush, IPv6 toggle and the bypass prober remain simulated by design (Phase 3). No elevation or UAC flow exists.
- Traffic unit is KiB/s; the previous UI already plotted that unit, so the contract was kept rather than silently changing to kbit/s.
- Session totals and peaks reset when the adapter changes and when the process restarts (no persistence yet).
- `packetLossPercent` is always `0.0`; jitter/loss needs a real sampling probe.
- Latency is a cached TCP:53 connect, not a DNS query; a resolver that drops TCP:53 will look slow even if UDP works. TTL 5 s keeps the UI responsive without network spam.
- The `netsh` DNS fallback parses English output only; the registry path is the primary and is locale-independent.
- Only one "default" adapter is reported (the interface holding `0.0.0.0/0`); split/default routes on multiple interfaces are collapsed.
- Hot-plug is handled by the existing "refresh" affordances, not by a background adapter-change listener; the adapter list is read once per launch/settings refresh.
- No automated frontend test runner; the bridge is verified by the Rust tests, the native run and the browser fallback.

## 16. Phase 3 handoff

1. **Apply DNS**: `set_dns` - validate, snapshot the previous resolver for rollback, write with `netsh interface ipv4 set dnsservers name=<alias> source=static address=<primary>` (+ `add dnsservers` for the secondary), read back via `get_current_dns` and only then return success. Requires elevation or a signed helper; the manifest is not elevated yet.
2. **Reset DNS**: `reset_dns` - `netsh ... source=dhcp`, then read back and verify the DHCP resolver arrived.
3. **Flush**: `flush_dns_cache` - `ipconfig /flushdns` hidden, typed result, no console flash.
4. **IPv6**: `set_ipv6_enabled` - toggle resolver registration only, never disable the IPv6 stack.
5. **Bypass prober**: `run_bypass_probe` - UDP:53 benchmark plus TLS handshakes through the bound resolver with timeouts and block classification; replace the `0.0` loss/jitter placeholders with measured values.
6. **Persistence**: settings, custom resolvers, pins and session totals currently live in memory; add a JSON/`tauri-plugin-store` store.
7. **Routing detail**: expose per-adapter routes/metrics instead of a single boolean `isDefault` if multi-homed behavior matters.
8. **Packaging**: run `npm run tauri build`, verify WebView2 bootstrapping and icons, then decide on signing/elevation.
