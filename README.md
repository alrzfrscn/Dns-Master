# ⚡ Dns Master

**Next-Generation Windows DNS Changer, RFC 1035 Benchmark Engine & Live Win32 Network Telemetry Deck**<div align="center">

<p align="center">
  <a href="https://github.com/alrzfrscn/Dns-Master/releases"><strong>⬇️ Download Latest Installer</strong></a>
  ·
  <a href="./README.fa.md"><strong>🇮🇷 مستندات فارسی</strong></a>
  ·
  <a href="./docs/ARCHITECTURE.md"><strong>📐 System Architecture</strong></a>
  ·
  <a href="https://github.com/alrzfrscn/Dns-Master/issues"><strong>🐞 Report Bug</strong></a>
  ·
  <a href="https://github.com/alrzfrscn/Dns-Master/issues"><strong>➕ Request DNS</strong></a>
</p>

<br />


<img src="./assets/dashboard.png" alt="Dns Master Dashboard" width="100%" />

</div>

---

## 🎯 Why Dns Master?

Most Windows DNS switchers rely on legacy UI frameworks, spawn visible `cmd.exe` windows, or use simple ICMP `ping` (which many DNS providers block or anycast-spoof). **Dns Master** is engineered from the ground up in **Rust (`windows-sys`)** and **React 19** to deliver a zero-bloat, gaming-grade network control deck.

| Capability | Legacy DNS Tools | ⚡ Dns Master (`v1.0.0`) |
| :--- | :--- | :--- |
| **Latency Measurement** | Basic ICMP `ping` (often blocked or inaccurate) | **True RFC 1035 UDP:53 Wire Queries** + TCP:53 fallback & Jitter calculation |
| **Sanction & Filtering Check** | None | **Live TLS/SNI Handshake Prober** + ISP Sinkhole (`10.10.34.x`) detection |
| **Live Bandwidth Monitor** | None or heavy CPU polling | **Zero-CPU Win32 `GetIfTable2`** real-time 1s Download/Upload stream |
| **DNS Read & Write Safety** | Blind `netsh` execution with CMD flashes | **Locale-neutral Registry Reader**, hidden `CREATE_NO_WINDOW`, read-back verification & **1-Click Rollback** |
| **Resolver List Updates** | Hardcoded / Manual `.ini` edits | **1-Click GitHub Raw JSON Sync** + Local JSON Import/Export |

---

## ✨ Core Features

- 🔮 **Obsidian Glassmorphism HUD (`1100×720`)** — Frameless dark interface with real-time Recharts telemetry, route radar, and keyboard shortcuts (`Ctrl+1…4`).
- 🚀 **Parallel UDP:53 Benchmark Engine** — Sweeps 30+ Global and Iranian resolvers concurrently using bounded worker threads in under 2 seconds, streaming live per-server progress.
- 🛡️ **Sanction Bypass Matrix** — Tests real DNS resolution and port `443` TLS SNI reachability across **Docker Hub, GitHub, OpenAI API, Hugging Face, Steam Store, and EA Online**.
- 🔌 **Smart Multi-Adapter Detection** — Enumerates physical (`Wi-Fi`, `Ethernet`) and virtual/VPN interfaces via `GetAdaptersAddresses` and `GetIpForwardTable2`, automatically highlighting the active default route.
- 🔒 **IPv6 Leak Guard** — Prevents ISP IPv6 DNS leaks by binding the interface's IPv6 resolver to loopback (`::1`) without disabling the Windows IPv6 stack.
- ⏪ **Transactional DNS Rollback** — Automatically snapshots your previous adapter configuration before applying a new DNS so you can restore it in one click.
- 🖥️ **System Tray & Silent Autostart** — Minimizes cleanly to the Windows System Tray for instant 1-click switching (`Engage Electro`, `Reset DHCP`, `Flush DNS`) and supports `HKCU\...\Run` startup (`--minimized`).

---

## 📥 Installation (Windows 10 / 11)

1. Go to the [**Releases Page**](https://github.com/alrzfrscn/Dns-Master/releases).
2. Download the latest **`Dns.Master_1.0.0_x64-setup.exe`** or **`Dns.Master_1.0.0_x64_en-US.msi`**.
3. Run the installer and launch **Dns Master**.
   > **Note on UAC Elevation:** Reading telemetry, benchmarking UDP:53, and flushing DNS cache require **zero** admin privileges. Windows UAC permission is requested *only* when writing a new DNS to a network adapter.

---

## 🌐 Community DNS List & GitHub Sync (`dns_list.json`)

**Dns Master** can pull updated DNS servers directly from GitHub inside **Settings → Resolver Source** (or the **Sync** button in **DNS Vault**).

Default Community Manifest URL:
```text
https://raw.githubusercontent.com/alrzfrscn/Dns-Master/main/dns_list.json
```

### 🤝 Contribute a New DNS Server (Pull Request)
Know a fast gaming or sanction-bypass DNS? Add it to [`dns_list.json`](./dns_list.json) and open a Pull Request! Once merged, every Dns Master user gets it immediately via the **Sync** button.

```json
{
  "version": 1,
  "servers": [
    {
      "id": "electro",
      "name": "Electro",
      "provider": "Electro Team · الکترو",
      "primary": "78.157.42.100",
      "secondary": "78.157.42.101",
      "category": "gaming",
      "location": "IR · Tehran",
      "tags": ["gaming", "bypass", "iran"]
    }
  ]
}
```
*Supported categories:* `"gaming"` | `"sanction"` | `"security"` | `"general"`

---

## 🛠️ Tech Stack & Development

- **Frontend:** React 19, TypeScript, Vite 7, Tailwind CSS 4, Recharts, Lucide Icons, Self-hosted `@fontsource` (`Oxanium`, `Sora`, `JetBrains Mono`).
- **Backend (`src-tauri`):** Rust, Tauri v2, direct Win32 API via `windows-sys` (`IpHelper`, `Ndis`, `WinSock`, `Registry`), pure-`std` RFC 1035 DNS wire parser & TLS ClientHello SNI prober.
- **Architecture Deep-Dive:** Read [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) for full IPC contracts and internals.

### Build from Source

```powershell
# 1. Install frontend dependencies
npm install

# 2. Run in development mode (Vite + Tauri native window)
npm run tauri dev

# 3. Run Rust unit tests (46 tests) & frontend type-check
cargo test --manifest-path src-tauri/Cargo.toml
npm run build

# 4. Build production Windows installers (.exe & .msi)
npm run tauri build
```

---

## ⭐ Support the Project

If **Dns Master** helped lower your ping or bypass developer restrictions, please give the repository a **Star ⭐** and share it with your friends!
