# Dns Master v1.0.0

A native Windows control deck for DNS resolvers: benchmark them, switch them, verify them, and keep them after a reboot.

Built with Tauri 2 (Rust) and React 19. The Rust core talks to Windows directly, so what the UI shows is what the machine is actually doing.

## Features

- **Win32 live traffic telemetry** — per-adapter byte counters from `GetIfTable2`, streamed once a second with session totals and peaks. No sampling daemon, no console window.
- **RFC 1035 UDP:53 parallel benchmark** — real DNS queries with a bounded 15-thread sweep, per-resolver latency, jitter and packet loss, streamed into the table as each probe finishes.
- **TLS SNI sanction bypass prober** — resolves six real targets (Docker Hub, GitHub, OpenAI, Hugging Face, Steam, EA), rejects sinkholes and bogons, then proves port 443 with a real ClientHello carrying the correct SNI.
- **Locale-neutral registry DNS reader** — reads `Tcpip\Parameters\Interfaces\{GUID}` instead of parsing localized `netsh` output.
- **UAC-safe `netsh` writer with rollback** — applies resolvers hidden and unelevated, retries through a UAC prompt only when Windows refuses, verifies the read-back before reporting success, and keeps the previous resolver for one-click rollback.
- **Persistent state** — custom resolvers, GitHub-synced rows, pins, settings and the rollback snapshot live in `%APPDATA%\com.dnsmaster.desktop\state.json`, written atomically.
- **Real Windows startup** — the *Launch with Windows* toggle writes or removes `HKCU\Software\Microsoft\Windows\CurrentVersion\Run\DnsMaster`, launching with `--minimized` so Windows boots without a window in your face.
- **System tray & close-to-tray** — left-click restores the window; the menu offers show/hide, quick engage, DHCP reset, cache flush and a real quit. Closing the window hides it when *Minimize to tray* is on.
- **JSON import / export** — export your custom and pinned resolvers as a `{ "servers": [...] }` manifest, ready for your own GitHub repo, and import any local manifest through the same validator the sync uses.
- **Desktop notifications** — native notices for applies, resets and syncs when the window is in the background.
- **GitHub raw JSON sync** — HTTPS-only fetch, manifest validation, merge by primary IPv4; real measurements and pins survive a pull.

## Custom resolver list on GitHub

1. Pin or create the resolvers you want, then open **Settings → Resolver source → export json**. The app downloads `dns_list.json`.
2. Commit that file to a public repository.
3. Open its **raw** address, for example
   `https://raw.githubusercontent.com/<user>/<repo>/main/dns_list.json`.
4. Paste the URL into **Settings → Resolver source** and press **sync**.

Accepted payloads are a top-level array or an object with a `servers` array:

```json
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
      "description": "Low-latency resolver."
    }
  ]
}
```

Every entry is validated: `name` is required, `primary` must be a valid IPv4 address other than `0.0.0.0`, `secondary` may be empty or a valid IPv4 address, and `category` is normalized to `gaming | sanction | security | general`. Duplicate primaries collapse. One invalid entry rejects the whole manifest, so a bad list never half-applies.

## Development

Requirements: Windows 10/11, Node.js 20+, Rust 1.77.2+ with the MSVC toolchain, and WebView2 (present on Windows 11 and current Windows 10).

```powershell
npm install

npm run dev          # Vite only, http://localhost:1420
npm run tauri dev    # native shell with the Rust core
npx tsc --noEmit     # type check
cargo test --manifest-path src-tauri/Cargo.toml
```

`npm run dev` alone renders the UI with simulated data; every bridge call resolves to `null` and the badges say so.

## Production build

```powershell
npm run tauri:build
```

The installer and executables land in `src-tauri/target/release/bundle/`. `npm run build` runs the TypeScript check and the Vite bundle only.

## Notes

- DNS writes may trigger a UAC prompt; refusing it leaves the resolver untouched and the UI reports the real error.
- The UDP:53 numbers are measured truth. Networks that transparently intercept DNS will make every resolver look fast.
- The TLS probe reads the first TLS record: it proves the endpoint answers with the requested SNI, not that a full handshake or certificate validation completed.
- Startup registration is per user (`HKCU`), so no administrator rights are needed to enable or remove it.
