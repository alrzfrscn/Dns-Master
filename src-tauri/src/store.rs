//! Persistent user state: `%APPDATA%\com.dnsmaster.desktop\state.json`.
//!
//! Every write goes to `state.json.tmp` and is then renamed over the real file,
//! so a crash or power loss leaves either the old or the new state, never a
//! truncated one. `#[serde(default)]` keeps older files loadable after fields
//! are added.

use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

const APP_DIR: &str = "com.dnsmaster.desktop";
const STATE_FILE: &str = "state.json";

pub const DEFAULT_SYNC_URL: &str =
    "https://raw.githubusercontent.com/dnsmaster/dns-list/main/dns_list.json";

/// One resolver as the frontend stores it (`DnsServer`).
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct DnsEntry {
    pub id: String,
    pub name: String,
    pub name_fa: Option<String>,
    pub provider: String,
    pub primary: String,
    pub secondary: String,
    pub category: String,
    pub tags: Vec<String>,
    pub description: Option<String>,
    pub latency: Option<f64>,
    pub jitter: Option<f64>,
    pub uptime: f64,
    pub pinned: bool,
    pub ipv6: Vec<String>,
    pub custom: bool,
    pub synced: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct PersistedSettings {
    pub launch_with_windows: bool,
    pub reapply_last_resolver: bool,
    pub minimize_to_tray: bool,
    pub desktop_notifications: bool,
    pub github_sync_url: String,
    pub preferred_adapter_id: String,
    pub last_active_dns_id: String,
}

impl Default for PersistedSettings {
    fn default() -> Self {
        Self {
            launch_with_windows: true,
            reapply_last_resolver: false,
            minimize_to_tray: true,
            desktop_notifications: true,
            github_sync_url: DEFAULT_SYNC_URL.to_string(),
            preferred_adapter_id: String::new(),
            last_active_dns_id: String::new(),
        }
    }
}

/// The resolver Windows had before `set_dns` replaced it.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct DnsRollbackSnapshot {
    pub adapter_id: String,
    pub mode: String,
    pub primary: Option<String>,
    pub secondary: Option<String>,
    pub captured_at: i64,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct PersistedAppState {
    pub custom_dns: Vec<DnsEntry>,
    pub synced_dns: Vec<DnsEntry>,
    pub pinned_server_ids: Vec<String>,
    pub settings: PersistedSettings,
    pub previous_dns_snapshot: Option<DnsRollbackSnapshot>,
}

pub fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis() as i64)
        .unwrap_or(0)
}

pub fn app_dir() -> PathBuf {
    match std::env::var_os("APPDATA") {
        Some(base) => PathBuf::from(base).join(APP_DIR),
        // Tests and service accounts without a profile still get a stable spot.
        None => std::env::temp_dir().join(APP_DIR),
    }
}

pub fn state_path() -> PathBuf {
    app_dir().join(STATE_FILE)
}

fn temp_path(path: &Path) -> PathBuf {
    PathBuf::from(format!("{}.tmp", path.display()))
}

/// Writes through a sibling temp file, then renames it into place.
pub fn save_to(path: &Path, state: &PersistedAppState) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Could not create {}: {error}", parent.display()))?;
    }
    let json = serde_json::to_vec_pretty(state)
        .map_err(|error| format!("Could not serialize state: {error}"))?;
    let tmp = temp_path(path);
    fs::write(&tmp, &json)
        .map_err(|error| format!("Could not write {}: {error}", tmp.display()))?;
    fs::rename(&tmp, path).map_err(|error| format!("Could not replace {}: {error}", path.display()))
}

/// A missing or unreadable file is a fresh install, not an error: the defaults
/// are the same state the app would have created on first launch.
pub fn load_from(path: &Path) -> PersistedAppState {
    fs::read_to_string(path)
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

pub fn load() -> PersistedAppState {
    load_from(&state_path())
}

pub fn save(state: &PersistedAppState) -> Result<(), String> {
    save_to(&state_path(), state)
}

/// Best effort: a failed snapshot write only costs the rollback button, never
/// the DNS change the user asked for.
pub fn record_snapshot(snapshot: DnsRollbackSnapshot) {
    let path = state_path();
    let mut state = load_from(&path);
    state.previous_dns_snapshot = Some(snapshot);
    let _ = save_to(&path, &state);
}

pub fn clear_snapshot() {
    let path = state_path();
    let mut state = load_from(&path);
    if state.previous_dns_snapshot.is_none() {
        return;
    }
    state.previous_dns_snapshot = None;
    let _ = save_to(&path, &state);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch_dir() -> PathBuf {
        let unique = format!(
            "dns-master-store-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|elapsed| elapsed.as_nanos())
                .unwrap_or(0)
        );
        std::env::temp_dir().join(unique)
    }

    fn sample() -> PersistedAppState {
        PersistedAppState {
            custom_dns: vec![DnsEntry {
                id: "custom-1".into(),
                name: "My Resolver".into(),
                provider: "Custom".into(),
                primary: "9.9.9.9".into(),
                secondary: "149.112.112.112".into(),
                category: "general".into(),
                tags: vec!["custom".into()],
                latency: Some(21.5),
                uptime: 100.0,
                custom: true,
                pinned: true,
                ..DnsEntry::default()
            }],
            synced_dns: vec![DnsEntry {
                id: "sync-1-1-1-1".into(),
                name: "Cloudflare".into(),
                primary: "1.1.1.1".into(),
                secondary: "1.0.0.1".into(),
                category: "general".into(),
                synced: true,
                ..DnsEntry::default()
            }],
            pinned_server_ids: vec!["custom-1".into(), "electro".into()],
            settings: PersistedSettings {
                reapply_last_resolver: true,
                preferred_adapter_id: "{GUID}".into(),
                last_active_dns_id: "custom-1".into(),
                ..PersistedSettings::default()
            },
            previous_dns_snapshot: Some(DnsRollbackSnapshot {
                adapter_id: "{GUID}".into(),
                mode: "dhcp".into(),
                primary: Some("10.202.10.202".into()),
                secondary: None,
                captured_at: 1_760_000_000_000,
            }),
        }
    }

    #[test]
    fn round_trips_every_field() {
        let state = sample();
        let json = serde_json::to_string(&state).expect("serialize");
        let parsed: PersistedAppState = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(parsed, state);
    }

    #[test]
    fn older_files_get_defaults_for_new_fields() {
        let parsed: PersistedAppState = serde_json::from_str(
            r#"{"customDns":[{"name":"Legacy","primary":"9.9.9.9"}],"settings":{"minimizeToTray":false}}"#,
        )
        .expect("schema evolution");
        assert_eq!(parsed.custom_dns.len(), 1);
        assert_eq!(parsed.custom_dns[0].primary, "9.9.9.9");
        assert!(!parsed.custom_dns[0].custom);
        assert!(parsed.synced_dns.is_empty());
        assert!(parsed.pinned_server_ids.is_empty());
        assert!(parsed.previous_dns_snapshot.is_none());
        assert!(!parsed.settings.minimize_to_tray);
        assert!(parsed.settings.launch_with_windows);
        assert_eq!(parsed.settings.github_sync_url, DEFAULT_SYNC_URL);
    }

    #[test]
    fn atomic_write_then_load_in_a_temp_dir() {
        let dir = scratch_dir();
        let path = dir.join(STATE_FILE);
        let state = sample();

        save_to(&path, &state).expect("save");
        assert_eq!(load_from(&path), state);
        assert!(!temp_path(&path).exists(), "temp file is renamed away");

        let mut changed = state.clone();
        changed.pinned_server_ids.clear();
        save_to(&path, &changed).expect("overwrite");
        assert_eq!(load_from(&path), changed);

        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn missing_and_corrupt_files_fall_back_to_defaults() {
        let dir = scratch_dir();
        let path = dir.join(STATE_FILE);
        assert_eq!(load_from(&path), PersistedAppState::default());

        fs::create_dir_all(&dir).expect("dir");
        fs::write(&path, "{ not json").expect("corrupt");
        assert_eq!(load_from(&path), PersistedAppState::default());
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn state_path_lives_under_the_appdata_identifier() {
        let path = state_path();
        assert!(path.ends_with(STATE_FILE));
        assert_eq!(
            path.parent().and_then(|parent| parent.file_name()),
            Some(std::ffi::OsStr::new(APP_DIR))
        );
    }
}
