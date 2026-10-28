//! Non-Windows stub so the crate and its unit tests build outside Windows.
//! Every reader reports "nothing available" and every write is unsupported.

use std::net::Ipv4Addr;

use crate::{CommandError, NetworkAdapter};

#[derive(Debug, Clone, Copy)]
pub struct Counters {
    pub in_octets: u64,
    pub out_octets: u64,
}

#[derive(Debug, Clone)]
pub struct AdapterTarget {
    pub guid: String,
    pub alias: String,
}

pub fn enumerate_adapters() -> Vec<NetworkAdapter> {
    Vec::new()
}

pub fn read_counters(_adapter_id: &str) -> Option<Counters> {
    None
}

pub fn read_dns_values(_adapter_id: &str) -> Option<(String, String)> {
    None
}

pub fn netsh_dns_output(_adapter_name: &str) -> Option<String> {
    None
}

pub fn probe_latency_ms(_target: Ipv4Addr) -> f64 {
    0.0
}

pub fn resolve_adapter(_adapter_id: &str) -> Option<AdapterTarget> {
    None
}

fn unsupported() -> CommandError {
    CommandError {
        code: "NOT_SUPPORTED".to_string(),
        message: "DNS mutation is only available on Windows.".to_string(),
    }
}

pub fn flush_dns_cache() -> Result<(), CommandError> {
    Err(unsupported())
}

pub fn set_dns_primary(_alias: &str, _primary: &str) -> Result<(), CommandError> {
    Err(unsupported())
}

pub fn add_dns_secondary(_alias: &str, _secondary: &str) -> Result<(), CommandError> {
    Err(unsupported())
}

pub fn reset_dns_dhcp(_alias: &str) -> Result<(), CommandError> {
    Err(unsupported())
}

pub fn set_ipv6_resolver(_alias: &str, _enabled: bool) -> Result<(), CommandError> {
    Err(unsupported())
}
