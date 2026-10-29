# DNS Master

<div align="center">

![DNS Master Banner](assets/banner.svg)

**A native Windows control deck for DNS resolvers — benchmark, switch, verify, and persist.**

[![Build Status](https://img.shields.io/github/actions/workflow/status/alrzfrscn/Dns-Master/ci.yml?branch=main&style=for-the-badge&logo=githubactions&logoColor=white)](https://github.com/alrzfrscn/Dns-Master/actions)
[![Version](https://img.shields.io/github/v/release/alrzfrscn/Dns-Master?style=for-the-badge&logo=github&logoColor=white&color=00D4AA)](https://github.com/alrzfrscn/Dns-Master/releases)
[![License](https://img.shields.io/github/license/alrzfrscn/Dns-Master?style=for-the-badge&logo=opensourceinitiative&logoColor=white&color=5A67D8)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Windows%2010%2F11-0078D6?style=for-the-badge&logo=windows&logoColor=white)](https://www.microsoft.com/windows)
[![Tauri](https://img.shields.io/badge/Tauri-2.0-24C8DB?style=for-the-badge&logo=tauri&logoColor=white)](https://tauri.app)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=white)](https://react.dev)
[![Rust](https://img.shields.io/badge/Rust-1.77%2B-DEA584?style=for-the-badge&logo=rust&logoColor=white)](https://www.rust-lang.org)

[![Download Latest](https://img.shields.io/badge/Download-Latest%20Release-00D4AA?style=for-the-badge&logo=github&logoColor=white)](https://github.com/alrzfrscn/Dns-Master/releases/latest)
[![Telegram](https://img.shields.io/badge/Telegram-Contact%20Author-2CA5E0?style=for-the-badge&logo=telegram&logoColor=white)](https://t.me/ImGr8)
[![Stars](https://img.shields.io/github/stars/alrzfrscn/Dns-Master?style=for-the-badge&logo=github&logoColor=white&color=F0B323)](https://github.com/alrzfrscn/Dns-Master/stargazers)

</div>

---

## ✨ Why DNS Master?

<div align="center">

| Before DNS Master | After DNS Master |
|:---:|:---:|
| 🐌 Slow, unreliable DNS | ⚡ Benchmarked, optimal resolvers |
| 🔧 Manual `netsh` commands | 🖱️ One-click apply with rollback |
| ❓ Guessing which resolver is fastest | 📊 Real-time latency, jitter & loss |
| 🌐 Sanctions blocking access | 🛡️ TLS SNI bypass verification |
| 💾 Settings lost on reboot | 🔒 Persistent across restarts |

</div>

---

## 🚀 Features

### 📡 **Live Traffic Telemetry**
Real-time per-adapter byte counters via `GetIfTable2`, streamed at 1Hz with session totals and peak tracking. No sampling daemon, no console window.

### ⚡ **Parallel DNS Benchmark**
RFC 1035 UDP:53 benchmark with bounded 15-thread sweep. Per-resolver latency, jitter, and packet loss — streamed into the table as each probe finishes.

### 🛡️ **TLS SNI Sanction Bypass Prober**
Resolves 6 real targets (Docker Hub, GitHub, OpenAI, Hugging Face, Steam, EA), rejects sinkholes and bogons, then proves port 443 with a real ClientHello carrying the correct SNI.

### 🔍 **Locale-Neutral Registry Reader**
Reads `Tcpip\Parameters\Interfaces\{GUID}` directly — no parsing of localized `netsh` output.

### 🛡️ **UAC-Safe Writer with Rollback**
Applies resolvers hidden and unelevated. Retries through UAC prompt only when Windows refuses. Verifies read-back before reporting success. Keeps previous resolver for one-click rollback.

### 💾 **Persistent State**
Custom resolvers, GitHub-synced rows, pins, settings, and rollback snapshot live in `%APPDATA%\com.dnsmaster.desktop\state.json`, written atomically.

### 🪟 **Real Windows Startup**
*Launch with Windows* toggle writes/removes `HKCU\Software\Microsoft\Windows\CurrentVersion\Run\DnsMaster`, launching with `--minimized` — no window on boot.

### 📦 **System Tray & Close-to-Tray**
Left-click restores; menu offers show/hide, quick engage, DHCP reset, cache flush, and real quit. Closing window hides it when *Minimize to tray* is enabled.

### 📤 **JSON Import / Export**
Export custom and pinned resolvers as `{ "servers": [...] }` manifest. Import any local manifest through the same validator the sync uses.

### 🔔 **Desktop Notifications**
Native notices for applies, resets, and syncs when the window is in the background.

### 🔄 **GitHub Raw JSON Sync**
HTTPS-only fetch, manifest validation, merge by primary IPv4. Real measurements and pins survive a pull.

---

## 📸 Screenshots

<div align="center">

| Main Dashboard | Benchmark Panel | Settings |
|:---:|:---:|:---:|
| ![Dashboard](assets/screenshots/dashboard.png) | ![Benchmark](assets/screenshots/benchmark.png) | ![Settings](assets/screenshots/settings.png) |
| *Real-time traffic & resolver status* | *Parallel latency, jitter & loss* | *Resolver source, sync & preferences* |

| System Tray | Custom DNS Modal | Network Tools |
|:---:|:---:|:---:|
| ![Tray](assets/screenshots/tray.png) | ![Custom DNS](assets/screenshots/custom-dns.png) | ![Tools](assets/screenshots/tools.png) |
| *Quick actions from tray* | *Add/edit custom resolvers* | *Flush cache, reset DHCP, test connectivity* |

</div>

---

## 📦 Installation

### Option 1: Modern Setup Installer (Recommended)
1. Go to [Releases](https://github.com/alrzfrscn/Dns-Master/releases/latest)
2. Download **`Dns.Master_1.0.0_x64-setup.exe`**
3. Run installer (No admin privileges required for standard user install)

### Option 2: Windows Installer (MSI)
1. Download **`Dns.Master_1.0.0_x64_en-US.msi`** from [Releases](https://github.com/alrzfrscn/Dns-Master/releases/latest)
2. Ideal for enterprise, silent, or automated deployments

### Option 3: Package Managers *(Coming Soon)*
```powershell
# Winget (coming soon)
winget install alrzfrscn.dns-master

# Scoop (coming soon)
scoop install dns-master
🎯 Quick Start
hub
Diagram
Mermaid diagram
Launch DNS Master from Start Menu or tray
Select your active network adapter (top dropdown)
Benchmark — click the ▶ Benchmark button to test all resolvers
Review — sort by latency, jitter, or packet loss
Apply — click Apply on your chosen resolver
Persist — enable Launch with Windows & Minimize to tray in Settings
🌐 Custom Resolver List on GitHub
Host your own curated resolver list and sync it across machines.
Create Your List
code
JSON
{
  "version": 1,
  "servers": [
    {
      "id": "electro",
      "name": "Electro",
      "nameFa": "الکترو",
      "provider": "Electro",
      "primary": "78.157.42.100",
      "secondary": "78.157.42.101",
      "category": "gaming",
      "tags": ["gaming", "low-ping"],
      "description": "Low-latency gaming resolver"
    },
    {
      "id": "shecan",
      "name": "Shecan",
      "nameFa": "شکن",
      "provider": "Shecan",
      "primary": "178.22.122.100",
      "secondary": "185.51.200.2",
      "category": "sanction",
      "tags": ["sanction-bypass", "iran"],
      "description": "Sanction bypass for Iranian users"
    }
  ]
}
Field Reference
Field	Required	Type	Description
id	✅	string	Unique identifier (slug)
name	✅	string	Display name
nameFa	❌	string	Persian display name
provider	❌	string	Provider/organization name
primary	✅	IPv4	Primary DNS server (not 0.0.0.0)
secondary	❌	IPv4	Secondary DNS server
category	❌	enum	gaming | sanction | security | general
tags	❌	string[]	Filterable tags
description	❌	string	Human-readable description
Sync Setup
Export — Settings → Resolver Source → Export JSON → save as dns_list.json
Commit — Push to a public GitHub repository
Get Raw URL — e.g., https://raw.githubusercontent.com/alrzfrscn/Dns-Master/main/dns_list.json
Paste & Sync — Settings → Resolver Source → paste URL → click Sync
💡 Tip: Pin resolvers before export to preserve them across syncs. Pins and real measurements survive a pull.
⚙️ Configuration
State File Location
code
Code
%APPDATA%\com.dnsmaster.desktop\state.json
CLI Arguments
Argument	Description
--minimized	Start minimized to tray (used by Windows startup)
--benchmark	Run benchmark on startup, output JSON to stdout
--apply <id>	Apply resolver by ID, exit on completion
--reset-dhcp	Reset adapter to DHCP, exit
--flush-cache	Flush DNS cache, exit
🛠️ Development
Prerequisites
Windows 10/11 (x64)
Node.js 20+
Rust 1.77.2+ with MSVC toolchain (rustup default stable-msvc)
WebView2 Runtime (Pre-installed on Win 11; installer available for Win 10)
Setup
code
Powershell
# Clone repository
git clone https://github.com/alrzfrscn/Dns-Master.git
cd Dns-Master

# Install dependencies
npm install

# Full native development shell
npm run tauri dev
🔒 Security & Privacy
No telemetry — zero data collection, no analytics
Local-only — all data stays on your machine
HTTPS-only sync — GitHub raw URLs fetched over TLS 1.2+
Manifest validation — strict schema, rejects malformed lists
UAC-aware — never elevates silently, always prompts
Open source — audit the code yourself
📄 License
MIT License — see LICENSE for details.
📞 Support & Community
Channel	Purpose
Telegram (@ImGr8)	Direct chat, feedback & developer contact
GitHub Issues	Bug reports & feature requests
GitHub Releases	Download latest executables & updates
<div align="center">
Made with ❤️ for Windows users who want control over their DNS
⭐ Star this repo • 🐛 Report Bug • 💡 Request Feature • 💬 Telegram
</div>
```