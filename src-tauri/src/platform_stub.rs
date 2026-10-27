//! Non-Windows stub so the crate and its unit tests build outside Windows.
//! Every reader reports "nothing available"; commands then stay honest.

use std::net::Ipv4Addr;

use crate::NetworkAdapter;

#[derive(Debug, Clone, Copy)]
pub struct Counters {
    pub in_octets: u64,
    pub out_octets: u64,
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
