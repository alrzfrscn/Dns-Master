//! Dns Master Rust core — Phase 2 read/telemetry layer.
//!
//! `get_network_adapters`, `get_live_traffic` and `get_current_dns` are real
//! Windows reads (`GetAdaptersAddresses`, `GetIfTable2`, `GetIpForwardTable2`,
//! the Tcpip registry keys, with a hidden `netsh` fallback). Field names use
//! camelCase over the IPC boundary.
//!
//! Mutating commands still fail with `NOT_IMPLEMENTED`: Phase 3 owns DNS writes,
//! cache flushes and the TLS bypass prober, so the shell can never claim it
//! changed a system setting when it did not.

use std::net::Ipv4Addr;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};

#[cfg(windows)]
mod platform;
#[cfg(not(windows))]
#[path = "platform_stub.rs"]
mod platform;

use platform::Counters;

/// How often the cached latency probe is allowed to hit the network.
const LATENCY_TTL: Duration = Duration::from_secs(5);
const KIB: f64 = 1024.0;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkAdapter {
    pub id: String,
    pub name: String,
    /// "wifi" | "ethernet" | "vpn" | "loopback"
    pub kind: String,
    /// "up" | "down"
    pub status: String,
    pub ipv4: String,
    pub gateway: String,
    pub mac: String,
    pub speed_mbps: u32,
    pub is_default: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrafficStats {
    pub down_kbps: f64,
    pub up_kbps: f64,
    pub peak_down_kbps: f64,
    pub peak_up_kbps: f64,
    pub session_down_bytes: u64,
    pub session_up_bytes: u64,
    pub latency_ms: f64,
    pub packet_loss_percent: f64,
    pub live: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DnsConfig {
    pub adapter_id: String,
    /// "dhcp" | "static"
    pub mode: String,
    pub primary: Option<String>,
    pub secondary: Option<String>,
    pub servers: Vec<String>,
    /// "dhcp" | "static" | "unknown"
    pub source: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetDnsRequest {
    pub adapter_id: String,
    pub primary: String,
    pub secondary: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandError {
    pub code: String,
    pub message: String,
}

/// One-second delta bookkeeping for `get_live_traffic`. The frontend owns the
/// 48-point chart history; this state only keeps counters, peaks and the cached
/// latency so a poll never spawns a process.
#[derive(Debug)]
pub struct TrafficMonitorState {
    adapter_id: String,
    last_at: Option<Instant>,
    last_in: u64,
    last_out: u64,
    session_in: u64,
    session_out: u64,
    peak_down: f64,
    peak_up: f64,
    latency_ms: f64,
    latency_at: Option<Instant>,
}

impl Default for TrafficMonitorState {
    fn default() -> Self {
        Self {
            adapter_id: String::new(),
            last_at: None,
            last_in: 0,
            last_out: 0,
            session_in: 0,
            session_out: 0,
            peak_down: 0.0,
            peak_up: 0.0,
            latency_ms: 0.0,
            latency_at: None,
        }
    }
}

impl TrafficMonitorState {
    /// Byte deltas over the real elapsed interval, in KiB/s (the unit the chart
    /// renders). The first sample on an adapter seeds the baseline and reports 0.
    fn sample_at(&mut self, adapter_id: &str, counters: Counters, now: Instant) -> (f64, f64) {
        if self.adapter_id != adapter_id {
            self.adapter_id = adapter_id.to_string();
            self.last_at = None;
            self.session_in = 0;
            self.session_out = 0;
            self.peak_down = 0.0;
            self.peak_up = 0.0;
            self.latency_ms = 0.0;
            self.latency_at = None;
        }

        let mut down = 0.0;
        let mut up = 0.0;
        if let Some(previous) = self.last_at {
            let elapsed = now.saturating_duration_since(previous).as_secs_f64();
            // Two polls inside 50 ms are noise; keep the baseline and skip the delta.
            if elapsed >= 0.05 {
                let in_bytes = counters.in_octets.saturating_sub(self.last_in);
                let out_bytes = counters.out_octets.saturating_sub(self.last_out);
                self.session_in += in_bytes;
                self.session_out += out_bytes;
                down = in_bytes as f64 / KIB / elapsed;
                up = out_bytes as f64 / KIB / elapsed;
            }
        }

        self.last_at = Some(now);
        self.last_in = counters.in_octets;
        self.last_out = counters.out_octets;
        self.peak_down = self.peak_down.max(down);
        self.peak_up = self.peak_up.max(up);
        (down, up)
    }

    /// Cached probe: at most one TCP handshake per `LATENCY_TTL`, so a timed-out
    /// resolver cannot stall every second.
    fn latency_ms(&mut self, target: Ipv4Addr, now: Instant) -> f64 {
        let fresh = self
            .latency_at
            .is_some_and(|at| now.saturating_duration_since(at) < LATENCY_TTL);
        if !fresh {
            self.latency_at = Some(now);
            let measured = platform::probe_latency_ms(target);
            if measured > 0.0 {
                self.latency_ms = measured;
            }
        }
        self.latency_ms
    }
}

fn round1(value: f64) -> f64 {
    (value * 10.0).round() / 10.0
}

fn phase_three(command: &str) -> CommandError {
    CommandError {
        code: "NOT_IMPLEMENTED".to_string(),
        message: format!("{command} lands with the DNS write layer in Phase 3."),
    }
}

/// Validates both resolver addresses before any future mutation runs.
fn validate_pair(primary: &str, secondary: &str) -> Result<(), CommandError> {
    if primary.parse::<Ipv4Addr>().is_err() {
        return Err(CommandError {
            code: "INVALID_IPV4".to_string(),
            message: format!("Primary resolver '{primary}' is not a valid IPv4 address."),
        });
    }
    if !secondary.is_empty() && secondary.parse::<Ipv4Addr>().is_err() {
        return Err(CommandError {
            code: "INVALID_IPV4".to_string(),
            message: format!("Secondary resolver '{secondary}' is not a valid IPv4 address."),
        });
    }
    Ok(())
}

/// Splits a registry or `netsh` list ("1.1.1.1, 1.0.0.1") into unique IPv4 strings.
fn parse_server_list(raw: &str) -> Vec<String> {
    let mut servers: Vec<String> = Vec::new();
    for token in raw.split([' ', ',', ';', '\t', '\r', '\n', '|', '\\']) {
        if let Ok(ip) = token.trim().parse::<Ipv4Addr>() {
            // "0.0.0.0" is the placeholder Windows writes for "no resolver".
            if ip.is_unspecified() {
                continue;
            }
            let text = ip.to_string();
            if !servers.contains(&text) {
                servers.push(text);
            }
        }
    }
    servers
}

/// Decides DHCP vs static from the two Tcpip registry values.
fn classify_dns(adapter_id: &str, static_raw: &str, dhcp_raw: &str) -> DnsConfig {
    let static_servers = parse_server_list(static_raw);
    let dhcp_servers = parse_server_list(dhcp_raw);
    let static_configured = static_raw
        .split([' ', ',', ';', '\t', '\r', '\n'])
        .any(|token| !token.trim().is_empty() && token.trim() != "0.0.0.0");

    let (mode, servers, source) = if static_configured {
        ("static", static_servers, "static")
    } else if !dhcp_servers.is_empty() {
        ("dhcp", dhcp_servers, "dhcp")
    } else {
        ("dhcp", Vec::new(), "unknown")
    };

    DnsConfig {
        adapter_id: adapter_id.to_string(),
        mode: mode.to_string(),
        primary: servers.first().cloned(),
        secondary: servers.get(1).cloned(),
        servers,
        source: source.to_string(),
    }
}

/// Parses `netsh interface ipv4 show dnsservers name=<adapter>` output.
/// English Windows only; used solely when the registry key is unreadable.
fn parse_netsh_dns(adapter_id: &str, output: &str) -> Option<DnsConfig> {
    let mut servers: Vec<String> = Vec::new();
    let mut source = "";
    let mut collecting = false;
    let lowered = output.to_lowercase();

    for line in output.lines() {
        let lower = line.to_lowercase();
        if lower.contains("statically configured dns servers") {
            source = "static";
            collecting = true;
            servers.clear();
            servers.extend(parse_server_list(line));
            continue;
        }
        if lower.contains("dns servers configured through dhcp") {
            source = "dhcp";
            collecting = true;
            servers.clear();
            servers.extend(parse_server_list(line));
            continue;
        }
        if !collecting {
            continue;
        }
        let found = parse_server_list(line);
        if found.is_empty() {
            collecting = false;
        } else {
            servers.extend(found);
        }
    }

    if source.is_empty() {
        if lowered.contains("no dns servers configured") {
            source = "dhcp";
        } else {
            return None;
        }
    }

    let mut unique: Vec<String> = Vec::new();
    for server in servers {
        if !unique.contains(&server) {
            unique.push(server);
        }
    }

    Some(DnsConfig {
        adapter_id: adapter_id.to_string(),
        mode: source.to_string(),
        primary: unique.first().cloned(),
        secondary: unique.get(1).cloned(),
        servers: unique,
        source: source.to_string(),
    })
}

/// Registry first (language-neutral), hidden `netsh` as the fallback.
fn read_dns_config(adapter_id: &str) -> DnsConfig {
    if let Some((static_raw, dhcp_raw)) = platform::read_dns_values(adapter_id) {
        return classify_dns(adapter_id, &static_raw, &dhcp_raw);
    }
    if let Some(config) = read_dns_via_netsh(adapter_id) {
        return config;
    }
    DnsConfig {
        adapter_id: adapter_id.to_string(),
        mode: "dhcp".to_string(),
        primary: None,
        secondary: None,
        servers: Vec::new(),
        source: "unknown".to_string(),
    }
}

fn read_dns_via_netsh(adapter_id: &str) -> Option<DnsConfig> {
    let name = platform::enumerate_adapters()
        .into_iter()
        .find(|adapter| adapter.id.eq_ignore_ascii_case(adapter_id))?
        .name;
    let output = platform::netsh_dns_output(&name)?;
    parse_netsh_dns(adapter_id, &output)
}

/// Probe target: the configured resolver, else the adapter's gateway.
fn latency_target(adapter_id: &str) -> Ipv4Addr {
    if let Some((static_raw, dhcp_raw)) = platform::read_dns_values(adapter_id) {
        if let Some(primary) = classify_dns(adapter_id, &static_raw, &dhcp_raw)
            .primary
            .and_then(|server| server.parse::<Ipv4Addr>().ok())
        {
            return primary;
        }
    }
    platform::enumerate_adapters()
        .into_iter()
        .find(|adapter| adapter.id.eq_ignore_ascii_case(adapter_id))
        .and_then(|adapter| adapter.gateway.parse::<Ipv4Addr>().ok())
        .filter(|gateway| !gateway.is_unspecified())
        .unwrap_or(Ipv4Addr::new(1, 1, 1, 1))
}

/// Enumerates real Windows interfaces, default route first.
// Commands stay private: a `pub fn` makes tauri-macros add `#[macro_export]` plus a
// self-import, which rustc 1.98 rejects with E0255.
#[tauri::command(async)]
fn get_network_adapters() -> Result<Vec<NetworkAdapter>, CommandError> {
    Ok(platform::enumerate_adapters())
}

/// Reads native interface counters and returns the delta since the last poll.
#[tauri::command(async)]
fn get_live_traffic(
    state: tauri::State<'_, Mutex<TrafficMonitorState>>,
    adapter_id: String,
) -> Result<TrafficStats, CommandError> {
    let counters = platform::read_counters(&adapter_id).ok_or_else(|| CommandError {
        code: "COUNTERS_UNAVAILABLE".to_string(),
        message: format!("No byte counters for adapter '{adapter_id}'."),
    })?;
    let mut monitor = state.lock().map_err(|_| CommandError {
        code: "MONITOR_LOCKED".to_string(),
        message: "Traffic monitor state is poisoned.".to_string(),
    })?;

    let now = Instant::now();
    let (down, up) = monitor.sample_at(&adapter_id, counters, now);
    let latency = monitor.latency_ms(latency_target(&adapter_id), now);

    Ok(TrafficStats {
        down_kbps: round1(down),
        up_kbps: round1(up),
        peak_down_kbps: round1(monitor.peak_down),
        peak_up_kbps: round1(monitor.peak_up),
        session_down_bytes: monitor.session_in,
        session_up_bytes: monitor.session_out,
        latency_ms: round1(latency),
        packet_loss_percent: 0.0,
        live: true,
    })
}

/// Reads the resolver currently configured on the adapter (read-only).
#[tauri::command(async)]
fn get_current_dns(adapter_id: String) -> Result<DnsConfig, CommandError> {
    Ok(read_dns_config(&adapter_id))
}

/// Phase 3: validate, snapshot for rollback, then apply with `netsh` and verify.
#[tauri::command]
fn set_dns(request: SetDnsRequest) -> Result<DnsConfig, CommandError> {
    validate_pair(&request.primary, &request.secondary)?;
    Err(phase_three("set_dns"))
}

/// Phase 3: `netsh interface ipv4 set dnsservers name=<adapter> source=dhcp`.
#[tauri::command]
fn reset_dns(adapter_id: String) -> Result<DnsConfig, CommandError> {
    let _ = adapter_id;
    Err(phase_three("reset_dns"))
}

/// Phase 3: spawn `ipconfig /flushdns` and report a typed result.
#[tauri::command]
fn flush_dns_cache() -> Result<(), CommandError> {
    Err(phase_three("flush_dns_cache"))
}

/// Phase 3: toggle IPv6 resolver registration without touching the IPv6 stack.
#[tauri::command]
fn set_ipv6_enabled(adapter_id: String, enabled: bool) -> Result<(), CommandError> {
    let _ = (adapter_id, enabled);
    Err(phase_three("set_ipv6_enabled"))
}

/// Phase 3: TLS handshake probes against Docker Hub, AI APIs and game stores
/// through the currently bound resolver.
#[tauri::command]
fn run_bypass_probe(adapter_id: String) -> Result<Vec<serde_json::Value>, CommandError> {
    let _ = adapter_id;
    Err(phase_three("run_bypass_probe"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(Mutex::new(TrafficMonitorState::default()))
        .invoke_handler(tauri::generate_handler![
            get_network_adapters,
            get_live_traffic,
            get_current_dns,
            set_dns,
            reset_dns,
            flush_dns_cache,
            set_ipv6_enabled,
            run_bypass_probe
        ])
        .run(tauri::generate_context!())
        .expect("error while running Dns Master");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_invalid_ipv4() {
        assert!(validate_pair("999.1.1.1", "").is_err());
        assert!(validate_pair("1.1.1.1", "not-an-ip").is_err());
    }

    #[test]
    fn accepts_valid_pairs() {
        assert!(validate_pair("1.1.1.1", "1.0.0.1").is_ok());
        assert!(validate_pair("10.202.10.10", "").is_ok());
    }

    #[test]
    fn parses_server_lists() {
        assert_eq!(parse_server_list("1.1.1.1, 1.0.0.1"), vec!["1.1.1.1", "1.0.0.1"]);
        assert_eq!(parse_server_list("178.22.122.100 185.51.200.2"), vec![
            "178.22.122.100",
            "185.51.200.2"
        ]);
        assert_eq!(parse_server_list("1.1.1.1,1.1.1.1"), vec!["1.1.1.1"]);
        assert!(parse_server_list("0.0.0.0 nope 2001:db8::1").is_empty());
    }

    #[test]
    fn classifies_static_over_dhcp() {
        let config = classify_dns("adapter", "178.22.122.100,185.51.200.2", "10.202.10.202");
        assert_eq!(config.mode, "static");
        assert_eq!(config.source, "static");
        assert_eq!(config.servers, vec!["178.22.122.100", "185.51.200.2"]);
        assert_eq!(config.primary.as_deref(), Some("178.22.122.100"));
        assert_eq!(config.secondary.as_deref(), Some("185.51.200.2"));
    }

    #[test]
    fn classifies_dhcp_when_no_static_list() {
        let config = classify_dns("adapter", "", "10.202.10.202 10.202.10.102");
        assert_eq!(config.mode, "dhcp");
        assert_eq!(config.source, "dhcp");
        assert_eq!(config.servers.len(), 2);
    }

    #[test]
    fn unknown_when_both_lists_are_empty() {
        let config = classify_dns("adapter", "", "");
        assert_eq!(config.source, "unknown");
        assert!(config.servers.is_empty());
    }

    #[test]
    fn parses_netsh_static_output() {
        let output = "\r\nConfiguration for interface \"Ethernet\"\r\n    \
            Statically Configured DNS Servers:    1.1.1.1\r\n                                    \
            1.0.0.1\r\n    Register with which suffix:           Primary only\r\n";
        let config = parse_netsh_dns("adapter", output).expect("static output");
        assert_eq!(config.mode, "static");
        assert_eq!(config.servers, vec!["1.1.1.1", "1.0.0.1"]);
        assert_eq!(config.secondary.as_deref(), Some("1.0.0.1"));
    }

    #[test]
    fn parses_netsh_dhcp_output() {
        let output = "Configuration for interface \"Wi-Fi\"\r\n    \
            DNS servers configured through DHCP:  10.202.10.202\r\n                                    \
            10.202.10.102\r\n    Register with which suffix:           Primary only\r\n";
        let config = parse_netsh_dns("adapter", output).expect("dhcp output");
        assert_eq!(config.mode, "dhcp");
        assert_eq!(config.source, "dhcp");
        assert_eq!(config.servers, vec!["10.202.10.202", "10.202.10.102"]);
    }

    #[test]
    fn traffic_deltas_use_real_elapsed_time() {
        let mut monitor = TrafficMonitorState::default();
        let start = Instant::now();
        let (down, up) = monitor.sample_at(
            "adapter-a",
            Counters { in_octets: 1_000, out_octets: 500 },
            start,
        );
        assert_eq!((down, up), (0.0, 0.0));

        let (down, up) = monitor.sample_at(
            "adapter-a",
            Counters {
                in_octets: 1_000 + 204_800,
                out_octets: 500 + 102_400,
            },
            start + Duration::from_millis(200),
        );
        assert!((down - 1000.0).abs() < 0.01, "down {down}");
        assert!((up - 500.0).abs() < 0.01, "up {up}");
        assert_eq!(monitor.session_in, 204_800);
        assert_eq!(monitor.session_out, 102_400);
        assert!(monitor.peak_down >= down);
    }

    #[test]
    fn traffic_session_resets_when_adapter_changes() {
        let mut monitor = TrafficMonitorState::default();
        let start = Instant::now();
        monitor.sample_at("adapter-a", Counters { in_octets: 1_000, out_octets: 1_000 }, start);
        monitor.sample_at(
            "adapter-a",
            Counters { in_octets: 101_000, out_octets: 51_000 },
            start + Duration::from_secs(1),
        );
        assert_eq!(monitor.session_in, 100_000);

        let (down, up) = monitor.sample_at(
            "adapter-b",
            Counters { in_octets: 9_000, out_octets: 9_000 },
            start + Duration::from_secs(2),
        );
        assert_eq!((down, up), (0.0, 0.0));
        assert_eq!(monitor.session_in, 0);
        assert_eq!(monitor.session_out, 0);
    }

    #[cfg(windows)]
    #[test]
    fn enumerates_real_adapters() {
        let adapters = platform::enumerate_adapters();
        for adapter in &adapters {
            assert_eq!(adapter.status, "up");
            assert_ne!(adapter.kind, "loopback");
            assert!(!adapter.name.is_empty());
            assert!(adapter.ipv4.parse::<Ipv4Addr>().is_ok(), "ipv4 {}", adapter.ipv4);
            assert!(adapter.gateway.parse::<Ipv4Addr>().is_ok());
            assert!("wifi" == adapter.kind || "ethernet" == adapter.kind || "vpn" == adapter.kind);
        }
        assert!(adapters.iter().filter(|adapter| adapter.is_default).count() <= 1);
        if let Some(default) = adapters.first() {
            if adapters.iter().any(|adapter| adapter.is_default) {
                assert!(default.is_default, "default adapter is listed first");
            }
        }
    }

    #[test]
    fn unknown_adapter_reads_safely() {
        let config = get_current_dns("no-such-adapter".to_string()).expect("read must not fail");
        assert!(config.servers.is_empty());
        assert_eq!(config.adapter_id, "no-such-adapter");
    }

    #[test]
    fn mutating_commands_are_honest() {
        let error = set_dns(SetDnsRequest {
            adapter_id: "adapter-wifi".into(),
            primary: "178.22.122.100".into(),
            secondary: "185.51.200.2".into(),
        })
        .unwrap_err();
        assert_eq!(error.code, "NOT_IMPLEMENTED");
    }
}
