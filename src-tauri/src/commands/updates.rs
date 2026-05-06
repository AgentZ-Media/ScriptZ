use serde::{Deserialize, Serialize};

const RELEASES_API: &str = "https://api.github.com/repos/agent-z-de/scriptz/releases/latest";

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateInfo {
    pub available: bool,
    pub current: String,
    pub latest: Option<String>,
    pub url: Option<String>,
    pub published_at: Option<String>,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn check_for_update(current: String) -> Result<UpdateInfo, String> {
    let client = match reqwest::Client::builder()
        .user_agent("ScriptZ-Updater/1.0")
        .timeout(std::time::Duration::from_secs(10))
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            return Ok(UpdateInfo {
                available: false,
                current,
                latest: None,
                url: None,
                published_at: None,
                error: Some(format!("client: {e}")),
            });
        }
    };
    let resp = match client.get(RELEASES_API).send().await {
        Ok(r) => r,
        Err(e) => {
            return Ok(UpdateInfo {
                available: false,
                current,
                latest: None,
                url: None,
                published_at: None,
                error: Some(format!("net: {e}")),
            });
        }
    };
    if !resp.status().is_success() {
        return Ok(UpdateInfo {
            available: false,
            current,
            latest: None,
            url: None,
            published_at: None,
            error: Some(format!("http {}", resp.status())),
        });
    }
    let json: serde_json::Value = match resp.json().await {
        Ok(j) => j,
        Err(e) => {
            return Ok(UpdateInfo {
                available: false,
                current,
                latest: None,
                url: None,
                published_at: None,
                error: Some(format!("json: {e}")),
            });
        }
    };
    let tag = json
        .get("tag_name")
        .and_then(|v| v.as_str())
        .map(|s| s.trim_start_matches('v').to_string());
    let url = json
        .get("html_url")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let published_at = json
        .get("published_at")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let available = match (&tag, &current) {
        (Some(latest), cur) => is_newer(cur, latest),
        _ => false,
    };
    Ok(UpdateInfo {
        available,
        current,
        latest: tag,
        url,
        published_at,
        error: None,
    })
}

fn is_newer(current: &str, latest: &str) -> bool {
    use semver::Version;
    let cur = Version::parse(current.trim_start_matches('v'));
    let lat = Version::parse(latest.trim_start_matches('v'));
    match (cur, lat) {
        (Ok(c), Ok(l)) => l > c,
        _ => latest != current,
    }
}
