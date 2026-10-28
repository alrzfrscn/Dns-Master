//! Windows network inspection and DNS mutation.
//!
//! Reads are local Win32 queries (`GetAdaptersAddresses`, `GetIfTable2`,
//! `GetIpForwardTable2`, `RegQueryValueEx`). Writes shell out to hidden `netsh`
//! and `ipconfig`; when a DNS write is refused for lack of rights, the same
//! command is retried once through an elevated PowerShell `Start-Process`, so
//! Windows shows its normal UAC prompt. Every spawned console tool is
//! `CREATE_NO_WINDOW`.

use std::ffi::OsString;
use std::net::{Ipv4Addr, SocketAddr, TcpStream};
use std::os::windows::ffi::OsStringExt;
use std::os::windows::process::CommandExt;
use std::process::{Command, Output};
use std::ptr::{null, null_mut};
use std::time::{Duration, Instant};

use windows_sys::core::GUID;
use windows_sys::Win32::Foundation::{ERROR_BUFFER_OVERFLOW, ERROR_SUCCESS};
use windows_sys::Win32::NetworkManagement::IpHelper::{
    FreeMibTable, GetAdaptersAddresses, GetIfTable2, GetIpForwardTable2, GAA_FLAG_INCLUDE_GATEWAYS,
    IF_TYPE_ETHERNET_CSMACD, IF_TYPE_IEEE80211, IF_TYPE_PPP, IF_TYPE_SOFTWARE_LOOPBACK,
    IF_TYPE_TUNNEL, IP_ADAPTER_ADDRESSES_LH, IP_ADAPTER_GATEWAY_ADDRESS_LH,
    IP_ADAPTER_UNICAST_ADDRESS_LH, MIB_IF_ROW2, MIB_IF_TABLE2, MIB_IPFORWARD_TABLE2,
};
use windows_sys::Win32::NetworkManagement::Ndis::IfOperStatusUp;
use windows_sys::Win32::Networking::WinSock::{
    AF_INET, AF_UNSPEC, SOCKADDR_IN, SOCKADDR_INET, SOCKET_ADDRESS,
};
use windows_sys::Win32::System::Registry::{
    RegCloseKey, RegOpenKeyExW, RegQueryValueExW, HKEY, HKEY_LOCAL_MACHINE, KEY_READ,
};

use crate::{CommandError, NetworkAdapter};

/// `CREATE_NO_WINDOW`, so a spawned console tool never flashes on screen.
const CREATE_NO_WINDOW: u32 = 0x0800_0000;
const DNS_PROBE_TIMEOUT: Duration = Duration::from_millis(350);

/// The two values `netsh` needs: the interface alias ("Wi-Fi") and its GUID.
#[derive(Debug, Clone)]
pub struct AdapterTarget {
    pub guid: String,
    pub alias: String,
}

#[derive(Debug, Clone, Copy)]
pub struct Counters {
    pub in_octets: u64,
    pub out_octets: u64,
}

#[derive(Debug, Clone)]
struct InterfaceRow {
    index: u32,
    guid: String,
    alias: String,
    if_type: u32,
    oper_up: bool,
    in_octets: u64,
    out_octets: u64,
    speed_bps: u64,
}

/// Enumerates IPv4-capable interfaces that are up, marks the default route and
/// drops loopback / disconnected pseudo interfaces.
pub fn enumerate_adapters() -> Vec<NetworkAdapter> {
    let rows = interface_rows();
    let default_index = SystemRoute::default_index();
    let mut adapters: Vec<NetworkAdapter> = Vec::new();

    let mut size: u32 = 16 * 1024;
    let mut buffer = vec![0u8; size as usize];
    let mut status;
    loop {
        status = unsafe {
            GetAdaptersAddresses(
                AF_UNSPEC as u32,
                GAA_FLAG_INCLUDE_GATEWAYS,
                null(),
                buffer.as_mut_ptr() as *mut IP_ADAPTER_ADDRESSES_LH,
                &mut size,
            )
        };
        if status == ERROR_BUFFER_OVERFLOW {
            buffer.resize(size as usize, 0);
            continue;
        }
        break;
    }
    if status != ERROR_SUCCESS {
        return adapters;
    }

    let mut cursor = buffer.as_ptr() as *const IP_ADAPTER_ADDRESSES_LH;
    while !cursor.is_null() {
        let link = unsafe { &*cursor };
        cursor = link.Next;

        let name = unsafe { wide_string(link.FriendlyName) };
        if name.is_empty()
            || link.IfType == IF_TYPE_SOFTWARE_LOOPBACK
            || link.OperStatus != IfOperStatusUp
        {
            continue;
        }
        let Some(ipv4) = (unsafe { first_unicast_ipv4(link.FirstUnicastAddress) }) else {
            continue;
        };

        let index = unsafe { link.Anonymous1.Anonymous.IfIndex };
        let row = rows.iter().find(|row| row.index == index);
        let id = row
            .map(|row| row.guid.clone())
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| unsafe { ansi_string(link.AdapterName) });
        if id.is_empty() || adapters.iter().any(|adapter| adapter.id == id) {
            continue;
        }

        let gateway = unsafe { first_gateway_ipv4(link.FirstGatewayAddress) };
        let speed_bps = row
            .map(|row| row.speed_bps)
            .filter(|speed| *speed > 0)
            .unwrap_or(link.ReceiveLinkSpeed);
        let kind = kind_for(link.IfType, &name).to_string();

        adapters.push(NetworkAdapter {
            id,
            name,
            kind,
            status: "up".to_string(),
            ipv4: ipv4.to_string(),
            gateway: gateway.unwrap_or(Ipv4Addr::UNSPECIFIED).to_string(),
            mac: unsafe { format_mac(&link.PhysicalAddress, link.PhysicalAddressLength) },
            speed_mbps: (speed_bps / 1_000_000).min(u32::MAX as u64) as u32,
            is_default: default_index == Some(index),
        });
    }

    adapters.sort_by(|a, b| {
        b.is_default
            .cmp(&a.is_default)
            .then(kind_rank(&a.kind).cmp(&kind_rank(&b.kind)))
            .then(a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    // No default route (VPN-only or captive link): still surface a primary row.
    if !adapters.iter().any(|adapter| adapter.is_default) {
        let fallback = adapters
            .iter()
            .position(|adapter| adapter.gateway != Ipv4Addr::UNSPECIFIED.to_string())
            .unwrap_or(0);
        adapters[fallback].is_default = true;
    }
    adapters
}

/// Per-interface byte counters, or the sum of every up non-loopback interface
/// when the requested id is unknown (hot-plugged or renamed adapter).
pub fn read_counters(adapter_id: &str) -> Option<Counters> {
    let rows = interface_rows();
    if rows.is_empty() {
        return None;
    }
    let wanted = adapter_id.to_lowercase();
    if let Some(row) = rows
        .iter()
        .find(|row| row.guid.to_lowercase() == wanted || row.alias.to_lowercase() == wanted)
    {
        return Some(Counters {
            in_octets: row.in_octets,
            out_octets: row.out_octets,
        });
    }

    let aggregates: Vec<&InterfaceRow> = rows
        .iter()
        .filter(|row| row.oper_up && row.if_type != IF_TYPE_SOFTWARE_LOOPBACK)
        .collect();
    if aggregates.is_empty() {
        return None;
    }
    Some(Counters {
        in_octets: aggregates.iter().map(|row| row.in_octets).sum(),
        out_octets: aggregates.iter().map(|row| row.out_octets).sum(),
    })
}

/// Raw `NameServer` (static) / `DhcpNameServer` values of the adapter's Tcpip
/// key. `None` when the key does not exist (unknown or virtual adapter).
pub fn read_dns_values(adapter_id: &str) -> Option<(String, String)> {
    let path =
        format!("SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces\\{adapter_id}");
    let key = open_reg_key(&path)?;
    let static_servers = read_reg_string(key, "NameServer").unwrap_or_default();
    let dhcp_servers = read_reg_string(key, "DhcpNameServer").unwrap_or_default();
    unsafe { RegCloseKey(key) };
    Some((static_servers, dhcp_servers))
}

/// Hidden `netsh` read used only when the registry lookup failed.
pub fn netsh_dns_output(adapter_name: &str) -> Option<String> {
    let output = std::process::Command::new("netsh")
        .args([
            "interface",
            "ipv4",
            "show",
            "dnsservers",
            &format!("name={adapter_name}"),
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .ok()?;
    if !output.status.success() && output.stdout.is_empty() {
        return None;
    }
    Some(String::from_utf8_lossy(&output.stdout).into_owned())
}

/// One TCP handshake to the resolver (port 53) measures RTT without ICMP rights.
/// A refused connection still measures the round trip; a timeout reports 0.
pub fn probe_latency_ms(target: Ipv4Addr) -> f64 {
    if target.is_unspecified() || target.is_loopback() {
        return 0.0;
    }
    let started = Instant::now();
    let _ = TcpStream::connect_timeout(&SocketAddr::from((target, 53)), DNS_PROBE_TIMEOUT);
    let elapsed = started.elapsed().as_secs_f64() * 1000.0;
    if elapsed >= DNS_PROBE_TIMEOUT.as_secs_f64() * 1000.0 - 1.0 {
        0.0
    } else {
        elapsed
    }
}

/// Resolves the IPC `adapterId` (GUID, GUID without braces, alias or a stale
/// frontend id) to the alias `netsh` needs and the canonical `{GUID}`.
pub fn resolve_adapter(adapter_id: &str) -> Option<AdapterTarget> {
    let wanted = adapter_id.trim().trim_matches(['{', '}']).to_lowercase();
    if wanted.is_empty() {
        return None;
    }
    if let Some(row) = interface_rows().into_iter().find(|row| {
        row.guid.trim_matches(['{', '}']).to_lowercase() == wanted
            || row.alias.to_lowercase() == wanted
    }) {
        return Some(AdapterTarget {
            guid: row.guid,
            alias: row.alias,
        });
    }
    enumerate_adapters()
        .into_iter()
        .find(|adapter| {
            adapter.id.trim_matches(['{', '}']).to_lowercase() == wanted
                || adapter.name.to_lowercase() == wanted
        })
        .map(|adapter| AdapterTarget {
            guid: adapter.id,
            alias: adapter.name,
        })
}

fn hidden(program: &str) -> Command {
    let mut command = Command::new(program);
    command.creation_flags(CREATE_NO_WINDOW);
    command
}

fn output_text(output: &Output) -> String {
    format!(
        "{}{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    )
    .trim()
    .to_string()
}

fn elevation_required() -> CommandError {
    CommandError {
        code: "ELEVATION_REQUIRED".to_string(),
        message: "Administrator privileges are required to modify network adapter DNS settings."
            .to_string(),
    }
}

/// UAC declines and localized "access denied" messages all land here.
fn is_elevation_failure(code: Option<i32>, text: &str) -> bool {
    let lower = text.to_lowercase();
    matches!(code, Some(5) | Some(740))
        || text.trim().is_empty()
        || [
            "elevation",
            "access is denied",
            "administrator",
            "permission",
            "denied",
            "privilege",
        ]
        .iter()
        .any(|needle| lower.contains(needle))
}

/// Runs `netsh` hidden. A permission failure is retried once through an elevated
/// PowerShell `Start-Process`, which is what produces the standard UAC prompt.
pub fn run_netsh(args: &[&str]) -> Result<(), CommandError> {
    let args: Vec<String> = args.iter().map(|arg| arg.to_string()).collect();
    let direct = hidden("netsh")
        .args(&args)
        .output()
        .map_err(|error| CommandError {
            code: "NETSH_SPAWN_FAILED".to_string(),
            message: format!("Could not start netsh: {error}"),
        })?;

    if direct.status.success() {
        return Ok(());
    }

    let text = output_text(&direct);
    // A localized netsh prints non-ASCII text for the same permission refusal,
    // so only a clearly English non-permission error skips the UAC retry.
    if !is_elevation_failure(direct.status.code(), &text) && text.is_ascii() {
        return Err(CommandError {
            code: "NETSH_FAILED".to_string(),
            message: if text.is_empty() {
                format!("netsh exited with code {:?}.", direct.status.code())
            } else {
                text
            },
        });
    }
    run_elevated(&args)
}

fn run_elevated(args: &[String]) -> Result<(), CommandError> {
    // Start-Process joins ArgumentList with spaces, so args with spaces carry
    // their own quotes; single quotes are doubled for the PowerShell literal.
    let line = args
        .iter()
        .map(|arg| {
            if arg.contains(' ') {
                format!("\"{}\"", arg.replace('"', ""))
            } else {
                arg.clone()
            }
        })
        .collect::<Vec<_>>()
        .join(" ");
    let script = format!(
        "$p = Start-Process -FilePath 'netsh' -ArgumentList '{}' -Verb RunAs -WindowStyle Hidden -Wait -PassThru; exit $p.ExitCode",
        line.replace('\'', "''")
    );
    let output = hidden("powershell")
        .args(["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", &script])
        .output()
        .map_err(|error| CommandError {
            code: "ELEVATION_REQUIRED".to_string(),
            message: format!(
                "Administrator privileges are required to modify network adapter DNS settings. ({error})"
            ),
        })?;
    if output.status.success() {
        Ok(())
    } else {
        Err(elevation_required())
    }
}

pub fn flush_dns_cache() -> Result<(), CommandError> {
    // Works without elevation.
    let output = hidden("ipconfig")
        .arg("/flushdns")
        .output()
        .map_err(|error| CommandError {
            code: "FLUSH_FAILED".to_string(),
            message: format!("Could not start ipconfig: {error}"),
        })?;
    if output.status.success() {
        Ok(())
    } else {
        Err(CommandError {
            code: "FLUSH_FAILED".to_string(),
            message: output_text(&output),
        })
    }
}

pub fn set_dns_primary(alias: &str, primary: &str) -> Result<(), CommandError> {
    run_netsh(&[
        "interface",
        "ipv4",
        "set",
        "dnsservers",
        &format!("name={alias}"),
        "static",
        primary,
        "primary",
        "validate=no",
    ])
}

pub fn add_dns_secondary(alias: &str, secondary: &str) -> Result<(), CommandError> {
    run_netsh(&[
        "interface",
        "ipv4",
        "add",
        "dnsservers",
        &format!("name={alias}"),
        secondary,
        "index=2",
        "validate=no",
    ])
}

pub fn reset_dns_dhcp(alias: &str) -> Result<(), CommandError> {
    run_netsh(&[
        "interface",
        "ipv4",
        "set",
        "dnsservers",
        &format!("name={alias}"),
        "source=dhcp",
    ])
}

/// Only the IPv6 resolver registration changes; the IPv6 stack stays enabled.
/// `::1` as the static resolver blocks ISP IPv6 DNS leaks.
pub fn set_ipv6_resolver(alias: &str, enabled: bool) -> Result<(), CommandError> {
    if enabled {
        run_netsh(&[
            "interface",
            "ipv6",
            "set",
            "dnsservers",
            &format!("name={alias}"),
            "source=dhcp",
        ])
    } else {
        run_netsh(&[
            "interface",
            "ipv6",
            "set",
            "dnsservers",
            &format!("name={alias}"),
            "static",
            "::1",
            "primary",
            "validate=no",
        ])
    }
}

/// Default-route lookups, grouped so each `GetIpForwardTable2` copy is freed.
struct SystemRoute;

impl SystemRoute {
    fn default_index() -> Option<u32> {
        Self::with_table(|rows| {
            rows.iter()
                .filter(|row| row.DestinationPrefix.PrefixLength == 0)
                .filter(|row| {
                    sockaddr_inet_ipv4(&row.NextHop)
                        .is_some_and(|next_hop| !next_hop.is_unspecified())
                })
                .min_by_key(|row| row.Metric)
                .map(|row| row.InterfaceIndex)
        })
        .flatten()
    }

    fn with_table<T>(
        read: impl FnOnce(&[windows_sys::Win32::NetworkManagement::IpHelper::MIB_IPFORWARD_ROW2]) -> T,
    ) -> Option<T> {
        let mut table: *mut MIB_IPFORWARD_TABLE2 = null_mut();
        if unsafe { GetIpForwardTable2(AF_INET, &mut table) } != ERROR_SUCCESS || table.is_null() {
            return None;
        }
        let value = unsafe {
            read(std::slice::from_raw_parts(
                (*table).Table.as_ptr(),
                (*table).NumEntries as usize,
            ))
        };
        unsafe { FreeMibTable(table as *const _) };
        Some(value)
    }
}

fn interface_rows() -> Vec<InterfaceRow> {
    let mut table: *mut MIB_IF_TABLE2 = null_mut();
    if unsafe { GetIfTable2(&mut table) } != ERROR_SUCCESS || table.is_null() {
        return Vec::new();
    }
    let rows = unsafe {
        std::slice::from_raw_parts((*table).Table.as_ptr(), (*table).NumEntries as usize)
            .iter()
            .map(|row: &MIB_IF_ROW2| InterfaceRow {
                index: row.InterfaceIndex,
                guid: guid_string(&row.InterfaceGuid),
                alias: wide_array(&row.Alias),
                if_type: row.Type,
                oper_up: row.OperStatus == IfOperStatusUp,
                in_octets: row.InOctets,
                out_octets: row.OutOctets,
                speed_bps: row.ReceiveLinkSpeed,
            })
            .collect()
    };
    unsafe { FreeMibTable(table as *const _) };
    rows
}

fn sockaddr_inet_ipv4(addr: &SOCKADDR_INET) -> Option<Ipv4Addr> {
    ipv4_of(unsafe { &addr.Ipv4 })
}

unsafe fn first_unicast_ipv4(mut cursor: *const IP_ADAPTER_UNICAST_ADDRESS_LH) -> Option<Ipv4Addr> {
    let mut link_local = None;
    while !cursor.is_null() {
        let entry = unsafe { &*cursor };
        if let Some(ip) = unsafe { socket_address_ipv4(&entry.Address) } {
            if !ip.is_loopback() {
                if !ip.is_link_local() {
                    return Some(ip);
                }
                link_local = link_local.or(Some(ip));
            }
        }
        cursor = entry.Next;
    }
    link_local
}

unsafe fn first_gateway_ipv4(mut cursor: *const IP_ADAPTER_GATEWAY_ADDRESS_LH) -> Option<Ipv4Addr> {
    while !cursor.is_null() {
        let entry = unsafe { &*cursor };
        if let Some(ip) = unsafe { socket_address_ipv4(&entry.Address) } {
            if !ip.is_unspecified() && !ip.is_loopback() {
                return Some(ip);
            }
        }
        cursor = entry.Next;
    }
    None
}

unsafe fn socket_address_ipv4(address: &SOCKET_ADDRESS) -> Option<Ipv4Addr> {
    if address.lpSockaddr.is_null() {
        return None;
    }
    let sockaddr = unsafe { &*address.lpSockaddr };
    if sockaddr.sa_family != AF_INET {
        return None;
    }
    ipv4_of(unsafe { &*(address.lpSockaddr as *const SOCKADDR_IN) })
}

fn ipv4_of(internet: &SOCKADDR_IN) -> Option<Ipv4Addr> {
    if internet.sin_family != AF_INET {
        return None;
    }
    // `S_addr` holds the four octets in network order; native bytes keep that order.
    Some(Ipv4Addr::from(
        unsafe { internet.sin_addr.S_un.S_addr }.to_ne_bytes(),
    ))
}

fn kind_for(if_type: u32, name: &str) -> &'static str {
    let lower = name.to_lowercase();
    let virtual_private = [
        "vpn",
        "wireguard",
        "wintun",
        "tap-",
        "tun",
        "tailscale",
        "zerotier",
    ]
    .iter()
    .any(|needle| lower.contains(needle));
    match if_type {
        IF_TYPE_SOFTWARE_LOOPBACK => "loopback",
        IF_TYPE_IEEE80211 => "wifi",
        IF_TYPE_TUNNEL | IF_TYPE_PPP => "vpn",
        IF_TYPE_ETHERNET_CSMACD => {
            if lower.contains("wi-fi") || lower.contains("wifi") || lower.contains("wlan") {
                "wifi"
            } else if virtual_private {
                "vpn"
            } else {
                "ethernet"
            }
        }
        _ if virtual_private => "vpn",
        _ => "ethernet",
    }
}

fn kind_rank(kind: &str) -> u8 {
    match kind {
        "wifi" => 0,
        "ethernet" => 1,
        "vpn" => 2,
        _ => 3,
    }
}

fn guid_string(guid: &GUID) -> String {
    format!(
        "{{{:08x}-{:04x}-{:04x}-{:02x}{:02x}-{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}}}",
        guid.data1,
        guid.data2,
        guid.data3,
        guid.data4[0],
        guid.data4[1],
        guid.data4[2],
        guid.data4[3],
        guid.data4[4],
        guid.data4[5],
        guid.data4[6],
        guid.data4[7]
    )
}

fn wide_array(buffer: &[u16]) -> String {
    let len = buffer
        .iter()
        .position(|unit| *unit == 0)
        .unwrap_or(buffer.len());
    OsString::from_wide(&buffer[..len])
        .to_string_lossy()
        .into_owned()
}

unsafe fn wide_string(ptr: *const u16) -> String {
    if ptr.is_null() {
        return String::new();
    }
    let mut len = 0usize;
    while unsafe { *ptr.add(len) } != 0 {
        len += 1;
    }
    let units = unsafe { std::slice::from_raw_parts(ptr, len) };
    OsString::from_wide(units).to_string_lossy().into_owned()
}

unsafe fn ansi_string(ptr: *const u8) -> String {
    if ptr.is_null() {
        return String::new();
    }
    let mut len = 0usize;
    while unsafe { *ptr.add(len) } != 0 {
        len += 1;
    }
    String::from_utf8_lossy(unsafe { std::slice::from_raw_parts(ptr, len) }).into_owned()
}

unsafe fn format_mac(address: &[u8; 8], length: u32) -> String {
    let len = (length as usize).min(address.len());
    if len == 0 {
        return String::new();
    }
    address[..len]
        .iter()
        .map(|byte| format!("{byte:02X}"))
        .collect::<Vec<_>>()
        .join(":")
}

fn open_reg_key(path: &str) -> Option<HKEY> {
    let wide: Vec<u16> = path.encode_utf16().chain(Some(0)).collect();
    let mut key: HKEY = null_mut();
    let status = unsafe { RegOpenKeyExW(HKEY_LOCAL_MACHINE, wide.as_ptr(), 0, KEY_READ, &mut key) };
    (status == ERROR_SUCCESS && !key.is_null()).then_some(key)
}

fn read_reg_string(key: HKEY, name: &str) -> Option<String> {
    let name: Vec<u16> = name.encode_utf16().chain(Some(0)).collect();
    let mut kind = 0u32;
    let mut bytes = 0u32;
    let status = unsafe {
        RegQueryValueExW(
            key,
            name.as_ptr(),
            null(),
            &mut kind,
            null_mut(),
            &mut bytes,
        )
    };
    if status != ERROR_SUCCESS || bytes == 0 {
        return None;
    }
    let mut buffer = vec![0u16; bytes as usize / 2 + 1];
    let status = unsafe {
        RegQueryValueExW(
            key,
            name.as_ptr(),
            null(),
            &mut kind,
            buffer.as_mut_ptr() as *mut u8,
            &mut bytes,
        )
    };
    if status != ERROR_SUCCESS {
        return None;
    }
    buffer.truncate(bytes as usize / 2);
    Some(
        String::from_utf16_lossy(&buffer)
            .trim_end_matches('\0')
            .to_string(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_permission_failures() {
        assert!(is_elevation_failure(Some(5), ""));
        assert!(is_elevation_failure(Some(740), ""));
        assert!(is_elevation_failure(
            None,
            "The requested operation requires elevation (Run as administrator)."
        ));
        assert!(is_elevation_failure(Some(1), "Access is denied."));
        assert!(!is_elevation_failure(
            Some(1),
            "The parameter is incorrect."
        ));
    }

    #[test]
    fn resolves_real_adapter_ids_and_aliases() {
        if let Some(adapter) = enumerate_adapters().first() {
            let by_id = resolve_adapter(&adapter.id).expect("GUID resolves");
            assert_eq!(by_id.alias, adapter.name);
            assert!(!by_id.guid.trim_matches(['{', '}']).is_empty());

            let by_name = resolve_adapter(&adapter.name).expect("alias resolves");
            assert_eq!(by_name.guid, by_id.guid);
        }
    }

    #[test]
    fn rejects_blank_or_unknown_adapter_ids() {
        assert!(resolve_adapter("").is_none());
        assert!(resolve_adapter("no-such-adapter").is_none());
    }
}
