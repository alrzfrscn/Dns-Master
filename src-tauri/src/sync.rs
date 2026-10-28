//! Real GitHub raw-JSON resolver sync: URL guard, hidden `curl` fetch and
//! manifest validation.
//!
//! Both `{ "servers": [...] }` (the bundled seed format) and a top-level array
//! are accepted. Every entry is validated; duplicates by primary IPv4 collapse.

use std::collections::HashSet;
use std::net::{IpAddr, Ipv4Addr};

use serde::Serialize;

use crate::CommandError;

pub const SYNC_TIMEOUT_SECS: u32 = 8;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncedDnsServer {
    pub id: String,
    pub name: String,
    pub name_fa: Option<String>,
    pub provider: String,
    pub primary: String,
    pub secondary: String,
    pub category: String,
    pub tags: Vec<String>,
    pub description: Option<String>,
}

fn manifest_error(message: impl Into<String>) -> CommandError {
    CommandError {
        code: "SYNC_INVALID_MANIFEST".to_string(),
        message: message.into(),
    }
}

fn url_error(message: impl Into<String>) -> CommandError {
    CommandError {
        code: "SYNC_INVALID_URL".to_string(),
        message: message.into(),
    }
}

/// HTTPS only, and never this machine, a private range or a link-local address:
/// the fetch runs with the user's full network access, so a bad URL would be a
/// server-side request forgery into the LAN.
pub fn validate_url(url: &str) -> Result<(), CommandError> {
    let trimmed = url.trim();
    let Some(rest) = trimmed.strip_prefix("https://") else {
        return Err(url_error("The sync URL must start with https://."));
    };
    let authority = rest.split(['/', '?', '#']).next().unwrap_or("");
    let host = if let Some(bracketed) = authority.strip_prefix('[') {
        bracketed.split(']').next().unwrap_or("")
    } else {
        authority
            .rsplit('@')
            .next()
            .unwrap_or("")
            .split(':')
            .next()
            .unwrap_or("")
    }
    .trim()
    .to_lowercase();
    if host.is_empty() {
        return Err(url_error("The sync URL has no host."));
    }
    if host == "localhost" || host.ends_with(".local") || host.ends_with(".localhost") {
        return Err(url_error("The sync URL must not point at this machine."));
    }
    if let Ok(ip) = host.parse::<IpAddr>() {
        let local = match ip {
            IpAddr::V4(ip) => {
                ip.is_loopback()
                    || ip.is_private()
                    || ip.is_link_local()
                    || ip.is_unspecified()
                    || ip.is_broadcast()
            }
            IpAddr::V6(ip) => {
                ip.is_loopback()
                    || ip.is_unspecified()
                    || ip.is_unique_local()
                    || ip.is_unicast_link_local()
            }
        };
        if local {
            return Err(url_error(
                "The sync URL must not point at a local or private address.",
            ));
        }
    }
    Ok(())
}

fn text_field(object: &serde_json::Map<String, serde_json::Value>, key: &str) -> Option<String> {
    object
        .get(key)
        .and_then(serde_json::Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn normalize_category(raw: &str) -> String {
    match raw.trim().to_lowercase().as_str() {
        "gaming" | "game" | "games" => "gaming",
        "sanction" | "bypass" | "unblock" => "sanction",
        "security" | "secure" | "privacy" => "security",
        _ => "general",
    }
    .to_string()
}

pub fn parse_manifest(text: &str) -> Result<Vec<SyncedDnsServer>, CommandError> {
    let value: serde_json::Value = serde_json::from_str(text)
        .map_err(|error| manifest_error(format!("The sync payload is not valid JSON: {error}")))?;
    let entries = match &value {
        serde_json::Value::Array(items) => items.as_slice(),
        serde_json::Value::Object(map) => map
            .get("servers")
            .and_then(serde_json::Value::as_array)
            .map(Vec::as_slice)
            .ok_or_else(|| {
                manifest_error("The manifest object must expose a \"servers\" array.")
            })?,
        _ => {
            return Err(manifest_error(
                "The manifest must be a JSON array or an object with a \"servers\" array.",
            ))
        }
    };
    if entries.is_empty() {
        return Err(manifest_error("The manifest contains no servers."));
    }

    let mut servers: Vec<SyncedDnsServer> = Vec::with_capacity(entries.len());
    let mut seen: HashSet<String> = HashSet::new();
    for (index, entry) in entries.iter().enumerate() {
        let object = entry
            .as_object()
            .ok_or_else(|| manifest_error(format!("Entry #{index} is not a JSON object.")))?;
        let name = text_field(object, "name")
            .ok_or_else(|| manifest_error(format!("Entry #{index} has no name.")))?;
        let primary = text_field(object, "primary")
            .ok_or_else(|| manifest_error(format!("Entry '{name}' has no primary resolver.")))?;
        let primary_ip = primary.parse::<Ipv4Addr>().map_err(|_| {
            manifest_error(format!(
                "Entry '{name}' has an invalid IPv4 primary '{primary}'."
            ))
        })?;
        if primary_ip.is_unspecified() {
            return Err(manifest_error(format!(
                "Entry '{name}' uses 0.0.0.0 as its primary resolver."
            )));
        }
        let secondary = match text_field(object, "secondary") {
            Some(value) => {
                let ip = value.parse::<Ipv4Addr>().map_err(|_| {
                    manifest_error(format!(
                        "Entry '{name}' has an invalid IPv4 secondary '{value}'."
                    ))
                })?;
                if ip.is_unspecified() {
                    String::new()
                } else {
                    ip.to_string()
                }
            }
            None => String::new(),
        };
        let primary = primary_ip.to_string();
        if !seen.insert(primary.clone()) {
            continue;
        }

        let tags = object
            .get("tags")
            .and_then(serde_json::Value::as_array)
            .map(|items| {
                items
                    .iter()
                    .filter_map(serde_json::Value::as_str)
                    .map(str::trim)
                    .filter(|tag| !tag.is_empty())
                    .map(str::to_string)
                    .collect::<Vec<_>>()
            })
            .filter(|tags| !tags.is_empty())
            .unwrap_or_else(|| vec!["github".to_string()]);

        servers.push(SyncedDnsServer {
            id: text_field(object, "id")
                .unwrap_or_else(|| format!("sync-{}", primary.replace('.', "-"))),
            name,
            name_fa: text_field(object, "nameFa"),
            provider: text_field(object, "provider").unwrap_or_default(),
            primary,
            secondary,
            category: normalize_category(&text_field(object, "category").unwrap_or_default()),
            tags,
            description: text_field(object, "description"),
        });
        if let Some(server) = servers.last_mut() {
            if server.provider.is_empty() {
                server.provider = server.name.clone();
            }
        }
    }

    if servers.is_empty() {
        return Err(manifest_error(
            "Every manifest entry was a duplicate or invalid.",
        ));
    }
    Ok(servers)
}

/// Validates the URL, fetches it through hidden `curl` and parses the manifest.
pub fn fetch(url: &str) -> Result<Vec<SyncedDnsServer>, CommandError> {
    validate_url(url)?;
    let body = crate::platform::http_get_text(url.trim(), SYNC_TIMEOUT_SECS)?;
    parse_manifest(&body)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_a_top_level_array() {
        let servers = parse_manifest(
            r#"[{"name":"A","primary":"1.1.1.1","secondary":"1.0.0.1","category":"general"}]"#,
        )
        .expect("array manifest");
        assert_eq!(servers.len(), 1);
        assert_eq!(servers[0].primary, "1.1.1.1");
        assert_eq!(servers[0].secondary, "1.0.0.1");
        assert_eq!(servers[0].id, "sync-1-1-1-1");
        assert_eq!(servers[0].provider, "A");
        assert_eq!(servers[0].tags, vec!["github"]);
    }

    #[test]
    fn accepts_the_servers_wrapper_and_normalizes_categories() {
        let servers = parse_manifest(
            r#"{"version":1,"servers":[
                {"id":"game","name":"Game","primary":"10.202.10.10","category":"Gaming"},
                {"name":"By","primary":"185.51.200.2","category":"bypass"},
                {"name":"Sec","primary":"9.9.9.9","category":"privacy"},
                {"name":"Odd","primary":"8.8.8.8","category":"weird"}
            ]}"#,
        )
        .expect("wrapper manifest");
        assert_eq!(servers.len(), 4);
        assert_eq!(servers[0].category, "gaming");
        assert_eq!(servers[1].category, "sanction");
        assert_eq!(servers[2].category, "security");
        assert_eq!(servers[3].category, "general");
        assert_eq!(servers[0].id, "game");
    }

    #[test]
    fn deduplicates_by_primary_and_drops_empty_secondaries() {
        let servers = parse_manifest(
            r#"[{"name":"A","primary":"1.1.1.1","secondary":""},
                {"name":"A copy","primary":"1.1.1.1","secondary":"1.0.0.1"},
                {"name":"B","primary":"9.9.9.9"}]"#,
        )
        .expect("dedupe");
        assert_eq!(servers.len(), 2);
        assert_eq!(servers[0].name, "A");
        assert_eq!(servers[0].secondary, "");
        assert_eq!(servers[1].secondary, "");
    }

    #[test]
    fn rejects_malformed_manifests() {
        for payload in [
            "not json",
            "[]",
            "{}",
            r#"{"servers":{}}"#,
            r#"[42]"#,
            r#"[{"primary":"1.1.1.1"}]"#,
            r#"[{"name":"A"}]"#,
            r#"[{"name":"A","primary":"1.1.1"}]"#,
            r#"[{"name":"A","primary":"0.0.0.0"}]"#,
            r#"[{"name":"A","primary":"1.1.1.1","secondary":"nope"}]"#,
        ] {
            let error = parse_manifest(payload).expect_err(payload);
            assert_eq!(error.code, "SYNC_INVALID_MANIFEST", "{payload}");
            assert!(!error.message.is_empty());
        }
    }

    #[test]
    fn only_accepts_https_public_urls() {
        assert!(validate_url("https://raw.githubusercontent.com/a/b.json").is_ok());
        assert!(validate_url("https://example.com/list").is_ok());
        for url in [
            "http://example.com/list.json",
            "file:///C:/list.json",
            "https://localhost/list.json",
            "https://127.0.0.1/list.json",
            "https://10.0.0.5/list.json",
            "https://192.168.1.2/list.json",
            "https://169.254.1.1/list.json",
            "https://[::1]/list.json",
            "https://printer.local/list.json",
            "https:///list.json",
        ] {
            let error = validate_url(url).expect_err(url);
            assert_eq!(error.code, "SYNC_INVALID_URL", "{url}");
        }
    }
}
