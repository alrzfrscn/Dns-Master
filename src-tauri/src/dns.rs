//! RFC 1035 UDP:53 DNS prober and TLS reachability check.
//!
//! Pure `std` networking: no ICMP, no external resolver library. The same code
//! backs the benchmark, the per-server ping and the sanction bypass prober, and
//! it builds outside Windows so the wire format stays unit-tested.

use std::io::{Read, Write};
use std::net::{Ipv4Addr, SocketAddr, TcpStream, UdpSocket};
use std::sync::atomic::{AtomicU16, Ordering};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

/// 29-byte `A` query for example.com; this name is what makes the packet 29 B.
pub const PROBE_DOMAIN: &str = "example.com";
pub const UDP_TIMEOUT: Duration = Duration::from_millis(900);
pub const TCP_TIMEOUT: Duration = Duration::from_millis(500);
pub const HTTPS_TIMEOUT: Duration = Duration::from_millis(2000);

#[derive(Debug, Clone, Copy)]
pub struct DnsResponse {
    /// First A record in the answer section, when the resolver sent one.
    pub address: Option<Ipv4Addr>,
    pub latency_ms: f64,
}

#[derive(Debug, Clone)]
pub struct HttpsProbe {
    pub latency_ms: f64,
    pub detail: String,
}

/// Randomized 16-bit transaction id: a counter plus the clock, no `rand` crate.
fn next_txid() -> u16 {
    static COUNTER: AtomicU16 = AtomicU16::new(0);
    let counter = COUNTER.fetch_add(0x9e37, Ordering::Relaxed);
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.subsec_nanos())
        .unwrap_or(0);
    counter ^ (nanos as u16) ^ ((nanos >> 16) as u16)
}

/// Minimal standard query: one question, recursion desired, INET/A.
pub fn build_query(txid: u16, name: &str) -> Vec<u8> {
    let mut packet = Vec::with_capacity(32);
    packet.extend_from_slice(&txid.to_be_bytes());
    packet.extend_from_slice(&[0x01, 0x00]); // flags: RD
    packet.extend_from_slice(&[0x00, 0x01]); // QDCOUNT
    packet.extend_from_slice(&[0x00, 0x00]); // ANCOUNT
    packet.extend_from_slice(&[0x00, 0x00]); // NSCOUNT
    packet.extend_from_slice(&[0x00, 0x00]); // ARCOUNT
    for label in name.split('.').filter(|label| !label.is_empty()) {
        packet.push(label.len().min(63) as u8);
        packet.extend_from_slice(label.as_bytes());
    }
    packet.push(0); // root label
    packet.extend_from_slice(&[0x00, 0x01]); // QTYPE A
    packet.extend_from_slice(&[0x00, 0x01]); // QCLASS IN
    packet
}

fn response_txid(packet: &[u8]) -> Option<u16> {
    let bytes = packet.get(..2)?;
    Some(u16::from_be_bytes([bytes[0], bytes[1]]))
}

/// True when the packet is a DNS response carrying the transaction id we sent.
pub fn is_response(packet: &[u8], txid: u16) -> bool {
    packet.len() >= 12 && response_txid(packet) == Some(txid) && packet[2] & 0x80 != 0
}

/// Walks a (possibly compressed) domain name and returns the offset after it.
fn skip_name(packet: &[u8], mut position: usize) -> Option<usize> {
    loop {
        let length = *packet.get(position)?;
        if length & 0xc0 == 0xc0 {
            packet.get(position + 1)?;
            return Some(position + 2);
        }
        if length == 0 {
            return Some(position + 1);
        }
        position = position.checked_add(1 + length as usize)?;
        if position > packet.len() {
            return None;
        }
    }
}

/// Verifies the header and question, then extracts the first A record.
pub fn parse_ipv4_response(packet: &[u8], txid: u16) -> Option<Ipv4Addr> {
    if !is_response(packet, txid) {
        return None;
    }
    let flags = u16::from_be_bytes([packet[2], packet[3]]);
    if flags & 0x000f != 0 {
        return None; // NXDOMAIN / SERVFAIL / REFUSED: no address to trust
    }
    let questions = u16::from_be_bytes([packet[4], packet[5]]) as usize;
    let answers = u16::from_be_bytes([packet[6], packet[7]]) as usize;

    let mut position = 12;
    for _ in 0..questions {
        position = skip_name(packet, position)?.checked_add(4)?;
        if position > packet.len() {
            return None;
        }
    }

    for _ in 0..answers {
        position = skip_name(packet, position)?;
        let header = packet.get(position..position + 10)?;
        let record_type = u16::from_be_bytes([header[0], header[1]]);
        let record_class = u16::from_be_bytes([header[2], header[3]]);
        let data_length = u16::from_be_bytes([header[8], header[9]]) as usize;
        position += 10;
        let data = packet.get(position..position + data_length)?;
        if record_type == 1 && record_class == 1 && data_length == 4 {
            return Some(Ipv4Addr::new(data[0], data[1], data[2], data[3]));
        }
        position += data_length;
    }
    None
}

/// One UDP:53 round trip. `None` on timeout, bind/send failure or a spoofed
/// transaction id; a response without an A record still counts as reachable.
pub fn udp_query(server: Ipv4Addr, name: &str) -> Option<DnsResponse> {
    if server.is_unspecified() {
        return None;
    }
    let socket = UdpSocket::bind((Ipv4Addr::UNSPECIFIED, 0)).ok()?;
    socket.set_write_timeout(Some(UDP_TIMEOUT)).ok()?;
    socket.set_read_timeout(Some(UDP_TIMEOUT)).ok()?;

    let txid = next_txid();
    let query = build_query(txid, name);
    let started = Instant::now();
    socket
        .send_to(&query, SocketAddr::from((server, 53)))
        .ok()?;

    let deadline = started + UDP_TIMEOUT;
    let mut buffer = [0u8; 1500];
    loop {
        let remaining = deadline.checked_duration_since(Instant::now())?;
        socket
            .set_read_timeout(Some(remaining.max(Duration::from_millis(1))))
            .ok()?;
        let (length, from) = socket.recv_from(&mut buffer).ok()?;
        if from.ip() != std::net::IpAddr::V4(server) {
            continue; // ignore stray packets, keep the remaining deadline
        }
        let packet = &buffer[..length];
        if !is_response(packet, txid) {
            continue;
        }
        return Some(DnsResponse {
            address: parse_ipv4_response(packet, txid),
            latency_ms: started.elapsed().as_secs_f64() * 1000.0,
        });
    }
}

/// TCP:53 fallback. Refused still proves the host answered, so it yields an RTT.
pub fn tcp_rtt(server: Ipv4Addr) -> Option<f64> {
    if server.is_unspecified() {
        return None;
    }
    let started = Instant::now();
    match TcpStream::connect_timeout(&SocketAddr::from((server, 53)), TCP_TIMEOUT) {
        Ok(_) => Some(started.elapsed().as_secs_f64() * 1000.0),
        Err(error) if error.kind() == std::io::ErrorKind::ConnectionRefused => {
            Some(started.elapsed().as_secs_f64() * 1000.0)
        }
        Err(_) => None,
    }
}

/// Iranian ISP sinkholes and addresses that can never be a real public A record.
pub fn is_sinkhole(ip: Ipv4Addr) -> bool {
    matches!(
        ip.octets(),
        [10, 10, 34, 34] | [10, 10, 34, 35] | [10, 10, 34, 36]
    ) || ip.is_unspecified()
        || ip.is_loopback()
        || ip.is_multicast()
        || ip.is_link_local()
        || ip.octets()[0] == 0
}

fn random_bytes<const N: usize>() -> [u8; N] {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_nanos() as u64)
        .unwrap_or(0x5eed);
    let mut state = nanos ^ (nanos << 13) ^ 0x9e37_79b9_7f4a_7c15;
    let mut bytes = [0u8; N];
    for byte in &mut bytes {
        state ^= state << 13;
        state ^= state >> 7;
        state ^= state << 17;
        *byte = state as u8;
    }
    bytes
}

/// TLS 1.2/1.3 ClientHello with SNI, enough to tell "accepts TLS" from "reset".
fn build_client_hello(host: &str) -> Vec<u8> {
    let host = host.as_bytes();

    let mut server_name = Vec::new();
    server_name.extend_from_slice(&((host.len() + 3) as u16).to_be_bytes());
    server_name.push(0); // host_name
    server_name.extend_from_slice(&(host.len() as u16).to_be_bytes());
    server_name.extend_from_slice(host);

    let mut extensions = Vec::new();
    extensions.extend_from_slice(&[0x00, 0x00]); // server_name
    extensions.extend_from_slice(&(server_name.len() as u16).to_be_bytes());
    extensions.extend_from_slice(&server_name);
    extensions.extend_from_slice(&[0x00, 0x2b, 0x00, 0x05, 0x04, 0x03, 0x04, 0x03, 0x03]); // versions 1.3, 1.2
    extensions.extend_from_slice(&[0x00, 0x0d, 0x00, 0x06, 0x00, 0x04, 0x04, 0x03, 0x08, 0x04]); // sig algs

    let mut body = Vec::new();
    body.extend_from_slice(&[0x03, 0x03]); // legacy TLS 1.2
    body.extend_from_slice(&random_bytes::<32>());
    body.push(0); // session id
    body.extend_from_slice(&[0x00, 0x08, 0x13, 0x01, 0x13, 0x02, 0xc0, 0x2b, 0xc0, 0x2f]);
    body.push(0x01);
    body.push(0x00); // null compression
    body.extend_from_slice(&(extensions.len() as u16).to_be_bytes());
    body.extend_from_slice(&extensions);

    let mut handshake = vec![0x01];
    let length = body.len();
    handshake.extend_from_slice(&[(length >> 16) as u8, (length >> 8) as u8, length as u8]);
    handshake.extend_from_slice(&body);

    let mut record = vec![0x16, 0x03, 0x01]; // handshake, TLS 1.0 record version
    record.extend_from_slice(&(handshake.len() as u16).to_be_bytes());
    record.extend_from_slice(&handshake);
    record
}

/// Sends the ClientHello to the resolved address and waits for a TLS record.
/// A handshake or an alert both prove the endpoint is not silently resetting.
pub fn https_probe(ip: Ipv4Addr, host: &str) -> Result<HttpsProbe, String> {
    let started = Instant::now();
    let mut stream = TcpStream::connect_timeout(&SocketAddr::from((ip, 443)), HTTPS_TIMEOUT)
        .map_err(|error| format!("TCP connect failed ({error})"))?;
    stream.set_read_timeout(Some(HTTPS_TIMEOUT)).ok();
    stream.set_write_timeout(Some(HTTPS_TIMEOUT)).ok();
    stream
        .write_all(&build_client_hello(host))
        .map_err(|error| format!("TLS write failed ({error})"))?;

    let mut header = [0u8; 5];
    stream
        .read_exact(&mut header)
        .map_err(|error| format!("TLS read failed ({error})"))?;

    let latency_ms = started.elapsed().as_secs_f64() * 1000.0;
    match header[0] {
        0x16 => Ok(HttpsProbe {
            latency_ms,
            detail: "TLS handshake accepted".to_string(),
        }),
        0x15 => Ok(HttpsProbe {
            latency_ms,
            detail: "TLS alert returned (no TCP reset)".to_string(),
        }),
        other => Err(format!("Unexpected TLS record 0x{other:02x}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_a_29_byte_query_with_matching_txid() {
        let query = build_query(0xbeef, PROBE_DOMAIN);
        assert_eq!(query.len(), 29);
        assert_eq!(u16::from_be_bytes([query[0], query[1]]), 0xbeef);
        assert_eq!(&query[2..4], &[0x01, 0x00]);
        assert_eq!(u16::from_be_bytes([query[4], query[5]]), 1);
        assert_eq!(u16::from_be_bytes([query[6], query[7]]), 0);
        assert_eq!(query[12], 7);
        assert_eq!(&query[13..20], b"example");
        assert_eq!(query[20], 3);
        assert_eq!(&query[21..24], b"com");
        assert_eq!(query[24], 0);
        assert_eq!(&query[25..], &[0x00, 0x01, 0x00, 0x01]); // QTYPE A, QCLASS IN
    }

    #[test]
    fn parses_a_synthetic_a_record_response() {
        let txid = 0x1234;
        let query = build_query(txid, PROBE_DOMAIN);
        let mut packet = query.clone();
        packet[2] = 0x81; // QR + RD
        packet[3] = 0x80; // RA, RCODE 0
        packet[6] = 0x00;
        packet[7] = 0x01; // ANCOUNT 1
        packet.extend_from_slice(&[0xc0, 0x0c]); // pointer to QNAME
        packet.extend_from_slice(&[0x00, 0x01, 0x00, 0x01]); // A / IN
        packet.extend_from_slice(&[0x00, 0x00, 0x00, 0x3c]); // TTL 60
        packet.extend_from_slice(&[0x00, 0x04, 93, 184, 216, 34]);

        assert!(is_response(&packet, txid));
        assert_eq!(
            parse_ipv4_response(&packet, txid),
            Some(Ipv4Addr::new(93, 184, 216, 34))
        );
        assert_eq!(parse_ipv4_response(&packet, txid ^ 1), None);
    }

    #[test]
    fn rejects_servfail_and_truncated_packets() {
        let txid = 7;
        let mut packet = build_query(txid, PROBE_DOMAIN);
        packet[2] = 0x81;
        packet[3] = 0x82; // SERVFAIL
        assert!(is_response(&packet, txid));
        assert_eq!(parse_ipv4_response(&packet, txid), None);
        assert!(!is_response(&packet[..11], txid));
    }

    #[test]
    fn detects_sinkhole_and_bogon_addresses() {
        for text in [
            "10.10.34.34",
            "10.10.34.35",
            "10.10.34.36",
            "0.0.0.0",
            "127.0.0.1",
        ] {
            assert!(is_sinkhole(text.parse().unwrap()), "{text}");
        }
        for text in ["1.1.1.1", "93.184.216.34", "8.8.8.8", "10.202.10.202"] {
            assert!(!is_sinkhole(text.parse().unwrap()), "{text}");
        }
    }

    #[test]
    fn client_hello_carries_the_host_name() {
        let hello = build_client_hello("api.openai.com");
        assert_eq!(hello[0], 0x16);
        assert!(hello.windows(14).any(|window| window == b"api.openai.com"));
    }

    #[cfg(windows)]
    #[test]
    fn live_udp_query_handles_offline_gracefully() {
        match udp_query(Ipv4Addr::new(1, 1, 1, 1), PROBE_DOMAIN) {
            Some(response) => {
                assert!(response.latency_ms >= 0.0);
                assert!(
                    response.address.is_some(),
                    "1.1.1.1 should return an A record"
                );
            }
            None => {
                // Offline or filtered UDP: acceptable, the prober must not panic.
            }
        }
    }
}
