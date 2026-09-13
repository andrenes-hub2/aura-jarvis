const SERVICE: &str = "aura-jarvis";
const ACCOUNT: &str = "anthropic_api_key";

/// The Anthropic API key is only needed for ruflo's own `agent_execute`
/// tool, which calls the API directly and bypasses the Claude Code OAuth
/// session entirely. It's stored in the OS credential store (Windows
/// Credential Manager / macOS Keychain / Linux Secret Service) rather than
/// in a file or localStorage, and it never leaves this process once
/// saved — the frontend only ever gets a boolean "configured" status back.
pub(crate) fn stored_api_key() -> Option<String> {
    keyring::Entry::new(SERVICE, ACCOUNT).ok()?.get_password().ok()
}

#[tauri::command]
pub async fn save_api_key(key: String) -> Result<(), String> {
    let key = key.trim().to_string();
    if key.is_empty() {
        return Err("La chiave e' vuota".to_string());
    }
    let entry = keyring::Entry::new(SERVICE, ACCOUNT).map_err(|e| e.to_string())?;
    entry.set_password(&key).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn has_api_key() -> bool {
    stored_api_key().is_some()
}

#[tauri::command]
pub async fn clear_api_key() -> Result<(), String> {
    let entry = keyring::Entry::new(SERVICE, ACCOUNT).map_err(|e| e.to_string())?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

/// Makes one minimal (1 output token) real call to the Anthropic API to
/// confirm the key actually works, rather than just checking its shape.
#[tauri::command]
pub async fn test_api_key(key: String) -> Result<String, String> {
    let key = key.trim();
    if key.is_empty() {
        return Err("Incolla prima una chiave".to_string());
    }

    let client = reqwest::Client::new();
    let response = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&serde_json::json!({
            "model": "claude-haiku-4-5-20251001",
            "max_tokens": 1,
            "messages": [{"role": "user", "content": "hi"}]
        }))
        .send()
        .await
        .map_err(|e| format!("Errore di rete: {e}"))?;

    if response.status().is_success() {
        Ok("Chiave valida".to_string())
    } else {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        let snippet: String = body.chars().take(200).collect();
        Err(format!("Chiave non valida (HTTP {status}): {snippet}"))
    }
}
