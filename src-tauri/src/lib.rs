//! Dns Master Rust core — Phase 3 DNS mutation, UDP:53 benchmarking and probes.
//!
//! Reads are real Windows queries; writes run hidden `netsh` / `ipconfig` with a
//! UAC `runas` fallback. Latency, jitter and bypass results come from real
//! RFC 1035 UDP:53 packets and TLS ClientHellos (see `dns.rs`). Field names use
//! camelCase over the IPC boundary.

use std::net::Ipv4Addr;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};

mod dns;

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

/// Real UDP:53 measurement for one resolver (primary, else secondary).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DnsPingResult {
    pub server_id: String,
    pub latency_ms: f64,
    pub jitter_ms: f64,
    pub packet_loss_percent: f64,
    pub reachable: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DnsBenchmarkTarget {
    pub server_id: String,
    pub primary: String,
    pub secondary: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BypassProbeResult {
    pub id: String,
    pub name: String,
    pub domain: String,
    pub group: String,
    /// "reachable" | "blocked"
    pub status: String,
    pub latency_ms: f64,
    pub resolved_ip: String,
    pub detail: String,
    pub resolver_used: String,
}

#[derive(Debug, Clone, Copy)]
struct BypassTarget {
    id: &'static str,
    name: &'static str,
    domain: &'static str,
    group: &'static str,
}

const BYPASS_TARGETS: [BypassTarget; 6] = [
    BypassTarget {
        id: "docker",
        name: "Docker Hub",
        domain: "registry-1.docker.io",
        group: "Developer",
    },
    BypassTarget {
        id: "github",
        name: "GitHub",
        domain: "github.com",
        group: "Developer",
    },
    BypassTarget {
        id: "openai",
        name: "OpenAI API",
        domain: "api.openai.com",
        group: "AI services",
    },
    BypassTarget {
        id: "huggingface",
        name: "Hugging Face",
        domain: "huggingface.co",
        group: "AI services",
    },
    BypassTarget {
        id: "steam",
        name: "Steam Store",
        domain: "store.steampowered.com",
        group: "Gaming",
    },
    BypassTarget {
        id: "ea",
        name: "EA Online",
        domain: "ea.com",
        group: "Gaming",
    },
];

/// Enough parallel probes to finish a 30-server sweep in one or two waves
/// without flooding a home router's NAT table.
const BENCHMARK_THREADS: usize = 15;

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

fn parse_resolver(value: &str) -> Option<Ipv4Addr> {
    value
        .trim()
        .parse::<Ipv4Addr>()
        .ok()
        .filter(|ip| !ip.is_unspecified())
}

/// One resolver sample: UDP:53 first, a TCP:53 handshake when UDP is filtered.
fn sample_resolver(ip: Ipv4Addr) -> Option<f64> {
    dns::udp_query(ip, dns::PROBE_DOMAIN)
        .map(|response| response.latency_ms)
        .or_else(|| dns::tcp_rtt(ip))
}

/// Two queries on the primary, two on the secondary when the primary is dead.
/// Loss is failed attempts over total attempts, so it lands on 0/50/100.
fn probe_server(server_id: &str, primary: &str, secondary: Option<&str>) -> DnsPingResult {
    let Some(primary_ip) = parse_resolver(primary) else {
        return DnsPingResult {
            server_id: server_id.to_string(),
            latency_ms: 0.0,
            jitter_ms: 0.0,
            packet_loss_percent: 100.0,
            reachable: false,
        };
    };

    let mut samples: Vec<f64> = Vec::new();
    let mut attempts: usize = 0;
    let measure = |ip: Ipv4Addr, samples: &mut Vec<f64>, attempts: &mut usize| {
        *attempts += 1;
        if let Some(sample) = sample_resolver(ip) {
            samples.push(sample);
        }
    };
    measure(primary_ip, &mut samples, &mut attempts);
    measure(primary_ip, &mut samples, &mut attempts);
    if samples.is_empty() {
        if let Some(secondary_ip) = secondary
            .and_then(parse_resolver)
            .filter(|ip| *ip != primary_ip)
        {
            measure(secondary_ip, &mut samples, &mut attempts);
            measure(secondary_ip, &mut samples, &mut attempts);
        }
    }

    let reachable = !samples.is_empty();
    let latency_ms = if samples.is_empty() {
        0.0
    } else {
        round1(samples.iter().sum::<f64>() / samples.len() as f64)
    };
    let jitter_ms = if samples.len() >= 2 {
        round1((samples[0] - samples[1]).abs())
    } else {
        0.0
    };
    let packet_loss_percent = if attempts == 0 {
        100.0
    } else {
        round1((attempts - samples.len()) as f64 / attempts as f64 * 100.0)
    };

    DnsPingResult {
        server_id: server_id.to_string(),
        latency_ms,
        jitter_ms,
        packet_loss_percent,
        reachable,
    }
}

fn adapter_not_found(adapter_id: &str) -> CommandError {
    CommandError {
        code: "ADAPTER_NOT_FOUND".to_string(),
        message: format!("Network adapter '{adapter_id}' was not found."),
    }
}

/// Windows applies `netsh` writes asynchronously through the registry, so read
/// back a few times before declaring the change failed.
fn verified_dns(
    adapter_id: &str,
    accept: impl Fn(&DnsConfig) -> bool,
) -> Result<DnsConfig, CommandError> {
    let mut config = read_dns_config(adapter_id);
    for _ in 0..8 {
        if accept(&config) {
            return Ok(config);
        }
        std::thread::sleep(Duration::from_millis(120));
        config = read_dns_config(adapter_id);
    }
    if accept(&config) {
        return Ok(config);
    }
    Err(CommandError {
        code: "VERIFY_FAILED".to_string(),
        message: if config.servers.is_empty() {
            "Windows did not apply the requested resolver change.".to_string()
        } else {
            format!(
                "Windows kept '{}' instead of the requested resolver.",
                config.servers.join(", ")
            )
        },
    })
}

fn bypass_resolver(adapter_id: &str, resolver_ip: Option<&str>) -> Ipv4Addr {
    resolver_ip
        .and_then(parse_resolver)
        .unwrap_or_else(|| latency_target(adapter_id))
}

fn probe_bypass_target(target: BypassTarget, resolver: Ipv4Addr) -> BypassProbeResult {
    let resolver_used = resolver.to_string();
    let row =
        |status: &str, latency_ms: f64, resolved_ip: String, detail: String| BypassProbeResult {
            id: target.id.to_string(),
            name: target.name.to_string(),
            domain: target.domain.to_string(),
            group: target.group.to_string(),
            status: status.to_string(),
            latency_ms,
            resolved_ip,
            detail,
            resolver_used: resolver_used.clone(),
        };

    let Some(response) = dns::udp_query(resolver, target.domain) else {
        return row(
            "blocked",
            0.0,
            String::new(),
            "DNS resolution failed / UDP:53 timed out".to_string(),
        );
    };
    let Some(address) = response.address else {
        return row(
            "blocked",
            round1(response.latency_ms),
            String::new(),
            "Resolver returned no A record".to_string(),
        );
    };
    if dns::is_sinkhole(address) {
        return row(
            "blocked",
            round1(response.latency_ms),
            address.to_string(),
            format!("DNS Sinkhole / Filtered ({address})"),
        );
    }

    match dns::https_probe(address, target.domain) {
        Ok(probe) => row(
            "reachable",
            round1(probe.latency_ms),
            address.to_string(),
            probe.detail,
        ),
        Err(error) => row(
            "blocked",
            round1(response.latency_ms),
            address.to_string(),
            format!("TLS blocked ({error})"),
        ),
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

/// Validates, snapshots the previous resolver, applies with hidden `netsh`,
/// flushes the cache and verifies the read-back before reporting success.
#[tauri::command(async)]
fn set_dns(request: SetDnsRequest) -> Result<DnsConfig, CommandError> {
    validate_pair(&request.primary, &request.secondary)?;
    let adapter = platform::resolve_adapter(&request.adapter_id)
        .ok_or_else(|| adapter_not_found(&request.adapter_id))?;

    // Rollback reference for the next phase; never returned or logged.
    let _previous = read_dns_config(&adapter.guid);

    platform::set_dns_primary(&adapter.alias, &request.primary)?;
    if !request.secondary.is_empty() {
        platform::add_dns_secondary(&adapter.alias, &request.secondary)?;
    }
    platform::flush_dns_cache()?;

    verified_dns(&adapter.guid, |config| {
        config.primary.as_deref() == Some(request.primary.as_str())
    })
}

/// `netsh ... source=dhcp`, flush, then verify the adapter is back on DHCP.
#[tauri::command(async)]
fn reset_dns(adapter_id: String) -> Result<DnsConfig, CommandError> {
    let adapter =
        platform::resolve_adapter(&adapter_id).ok_or_else(|| adapter_not_found(&adapter_id))?;
    platform::reset_dns_dhcp(&adapter.alias)?;
    platform::flush_dns_cache()?;
    verified_dns(&adapter.guid, |config| config.mode == "dhcp")
}

/// `ipconfig /flushdns` hidden; no elevation needed.
#[tauri::command(async)]
fn flush_dns_cache() -> Result<(), CommandError> {
    platform::flush_dns_cache()
}

/// Keeps the IPv6 stack up and only changes resolver registration.
#[tauri::command(async)]
fn set_ipv6_enabled(adapter_id: String, enabled: bool) -> Result<(), CommandError> {
    let adapter =
        platform::resolve_adapter(&adapter_id).ok_or_else(|| adapter_not_found(&adapter_id))?;
    platform::set_ipv6_resolver(&adapter.alias, enabled)
}

/// Two real UDP:53 round trips; a single server is fast enough not to need a
/// thread of its own, so it stays on the async blocking pool.
#[tauri::command(async)]
fn ping_dns_server(
    server_id: String,
    primary: String,
    secondary: Option<String>,
) -> Result<DnsPingResult, CommandError> {
    if parse_resolver(&primary).is_none() {
        return Err(CommandError {
            code: "INVALID_IPV4".to_string(),
            message: format!("Resolver '{primary}' is not a valid IPv4 address."),
        });
    }
    Ok(probe_server(&server_id, &primary, secondary.as_deref()))
}

/// Bounded parallel sweep (`std::thread::scope`, at most 15 workers) sorted by
/// reachability then `latency + jitter`.
#[tauri::command(async)]
fn benchmark_dns_servers(
    servers: Vec<DnsBenchmarkTarget>,
) -> Result<Vec<DnsPingResult>, CommandError> {
    if servers.is_empty() {
        return Ok(Vec::new());
    }

    let next = std::sync::atomic::AtomicUsize::new(0);
    let collected: Mutex<Vec<DnsPingResult>> = Mutex::new(Vec::with_capacity(servers.len()));
    let workers = servers.len().min(BENCHMARK_THREADS);

    std::thread::scope(|scope| {
        for _ in 0..workers {
            scope.spawn(|| loop {
                let index = next.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                let Some(target) = servers.get(index) else {
                    break;
                };
                let result = probe_server(
                    &target.server_id,
                    &target.primary,
                    target.secondary.as_deref(),
                );
                collected
                    .lock()
                    .unwrap_or_else(|poison| poison.into_inner())
                    .push(result);
            });
        }
    });

    let mut results = collected
        .into_inner()
        .unwrap_or_else(|poison| poison.into_inner());
    results.sort_by(|a, b| {
        b.reachable.cmp(&a.reachable).then(
            (a.latency_ms + a.jitter_ms)
                .partial_cmp(&(b.latency_ms + b.jitter_ms))
                .unwrap_or(std::cmp::Ordering::Equal),
        )
    });
    Ok(results)
}

/// Resolves all six targets in parallel through the active resolver, rejecting
/// sinkholes and unverified addresses, then proves port 443 accepts TLS.
#[tauri::command(async)]
fn run_bypass_probe(
    adapter_id: String,
    resolver_ip: Option<String>,
) -> Result<Vec<BypassProbeResult>, CommandError> {
    let resolver = bypass_resolver(&adapter_id, resolver_ip.as_deref());
    let mut results = Vec::with_capacity(BYPASS_TARGETS.len());

    std::thread::scope(|scope| {
        let handles: Vec<_> = BYPASS_TARGETS
            .iter()
            .map(|target| {
                let target = *target;
                scope.spawn(move || probe_bypass_target(target, resolver))
            })
            .collect();
        for handle in handles {
            if let Ok(result) = handle.join() {
                results.push(result);
            }
        }
    });

    Ok(results)
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
            ping_dns_server,
            benchmark_dns_servers,
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
        assert_eq!(
            parse_server_list("1.1.1.1, 1.0.0.1"),
            vec!["1.1.1.1", "1.0.0.1"]
        );
        assert_eq!(
            parse_server_list("178.22.122.100 185.51.200.2"),
            vec!["178.22.122.100", "185.51.200.2"]
        );
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
            Counters {
                in_octets: 1_000,
                out_octets: 500,
            },
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
        monitor.sample_at(
            "adapter-a",
            Counters {
                in_octets: 1_000,
                out_octets: 1_000,
            },
            start,
        );
        monitor.sample_at(
            "adapter-a",
            Counters {
                in_octets: 101_000,
                out_octets: 51_000,
            },
            start + Duration::from_secs(1),
        );
        assert_eq!(monitor.session_in, 100_000);

        let (down, up) = monitor.sample_at(
            "adapter-b",
            Counters {
                in_octets: 9_000,
                out_octets: 9_000,
            },
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
            assert!(
                adapter.ipv4.parse::<Ipv4Addr>().is_ok(),
                "ipv4 {}",
                adapter.ipv4
            );
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
    fn set_dns_rejects_invalid_ipv4_before_touching_windows() {
        let error = set_dns(SetDnsRequest {
            adapter_id: "adapter-wifi".into(),
            primary: "999.1.1.1".into(),
            secondary: "".into(),
        })
        .unwrap_err();
        assert_eq!(error.code, "INVALID_IPV4");

        let error = set_dns(SetDnsRequest {
            adapter_id: "adapter-wifi".into(),
            primary: "1.1.1.1".into(),
            secondary: "nope".into(),
        })
        .unwrap_err();
        assert_eq!(error.code, "INVALID_IPV4");
    }

    #[test]
    fn sinkhole_addresses_are_rejected() {
        for text in [
            "10.10.34.34",
            "10.10.34.35",
            "10.10.34.36",
            "0.0.0.0",
            "127.0.0.1",
        ] {
            assert!(dns::is_sinkhole(text.parse().unwrap()), "{text}");
        }
        assert!(!dns::is_sinkhole(Ipv4Addr::new(1, 1, 1, 1)));
        assert!(!dns::is_sinkhole(Ipv4Addr::new(185, 51, 200, 2)));
    }

    #[test]
    fn invalid_resolver_never_reports_reachable() {
        let result = probe_server("x", "not-an-ip", None);
        assert!(!result.reachable);
        assert_eq!(result.packet_loss_percent, 100.0);
        assert_eq!(result.latency_ms, 0.0);
    }

    #[test]
    fn benchmark_targets_must_carry_an_ipv4_primary() {
        let error = ping_dns_server("x".into(), "1.1.1".into(), None).unwrap_err();
        assert_eq!(error.code, "INVALID_IPV4");
    }

    #[cfg(windows)]
    #[test]
    fn set_dns_reports_unknown_adapter_without_writing() {
        let error = set_dns(SetDnsRequest {
            adapter_id: "no-such-adapter".into(),
            primary: "1.1.1.1".into(),
            secondary: "".into(),
        })
        .unwrap_err();
        assert_eq!(error.code, "ADAPTER_NOT_FOUND");
    }

    #[cfg(windows)]
    #[test]
    fn live_bypass_probe_returns_six_typed_rows() {
        let results = run_bypass_probe("no-such-adapter".into(), Some("1.1.1.1".into()))
            .expect("probe must not fail");
        assert_eq!(results.len(), 6);
        for row in &results {
            assert!(
                row.status == "reachable" || row.status == "blocked",
                "{}",
                row.status
            );
            assert_eq!(row.resolver_used, "1.1.1.1");
            assert!(!row.id.is_empty() && !row.domain.is_empty());
        }
    }

    #[cfg(windows)]
    #[test]
    fn live_benchmark_sweep_is_parallel() {
        let ips = [
            "1.1.1.1",
            "8.8.8.8",
            "8.8.4.4",
            "9.9.9.9",
            "149.112.112.112",
            "208.67.222.222",
            "208.67.220.220",
            "76.76.2.0",
            "76.76.10.0",
            "94.140.14.14",
            "94.140.15.15",
            "185.228.168.9",
            "185.228.169.9",
            "77.88.8.8",
            "77.88.8.1",
        ];
        let targets: Vec<DnsBenchmarkTarget> = ips
            .iter()
            .map(|ip| DnsBenchmarkTarget {
                server_id: (*ip).to_string(),
                primary: (*ip).to_string(),
                secondary: None,
            })
            .collect();

        let started = Instant::now();
        let results = benchmark_dns_servers(targets).expect("sweep runs");
        let elapsed = started.elapsed();
        println!(
            "elapsed {elapsed:?} · {:?}",
            results
                .iter()
                .map(|r| (
                    r.server_id.as_str(),
                    r.latency_ms,
                    r.jitter_ms,
                    r.reachable,
                    r.packet_loss_percent
                ))
                .collect::<Vec<_>>()
        );
        assert_eq!(results.len(), ips.len());
        assert!(elapsed < Duration::from_secs(10), "sweep took {elapsed:?}");
        let first_unreachable = results.iter().position(|r| !r.reachable);
        if let Some(index) = first_unreachable {
            assert!(results[index..].iter().all(|r| !r.reachable));
        }
    }

    #[cfg(windows)]
    #[test]
    fn live_flush_dns_cache_succeeds() {
        flush_dns_cache().expect("ipconfig /flushdns works without elevation");
    }

    #[cfg(windows)]
    #[test]
    fn live_udp_benchmark_probes_a_public_resolver() {
        // Single reachable resolver: exercises the real UDP:53 path. Offline
        // networks yield an unreachable result, which is still a valid answer.
        let result = probe_server("cloudflare", "1.1.1.1", None);
        assert!((0.0..=100.0).contains(&result.packet_loss_percent));
        assert!(result.jitter_ms >= 0.0);
        if result.reachable {
            assert!(result.latency_ms > 0.0);
            assert_eq!(result.packet_loss_percent, 0.0);
        } else {
            assert_eq!(result.latency_ms, 0.0);
        }
    }
}
