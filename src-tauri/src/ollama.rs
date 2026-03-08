//! Ollama integration: list models and chat with context from DB.

use reqwest::blocking::Client;
use serde::Deserialize;
use std::time::Duration;

pub const OLLAMA_BASE: &str = "http://localhost:11434";

/// Default context window; smaller = faster inference.
const DEFAULT_NUM_CTX: u32 = 4096;
/// Max tokens to generate; limits runaways and speeds up short replies.
const DEFAULT_NUM_PREDICT: u32 = 2048;
/// Keep model loaded (avoids cold start on next request). "24h" or "-1" for indefinite.
const DEFAULT_KEEP_ALIVE: &str = "24h";

#[derive(Deserialize)]
struct TagsResponse {
    models: Option<Vec<OllamaModel>>,
}

#[derive(Deserialize)]
struct OllamaModel {
    name: Option<String>,
}

/// List available Ollama model names. Returns empty vec if Ollama is unreachable.
pub fn ollama_list_models() -> Result<Vec<String>, String> {
    let client = Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .map_err(|e| e.to_string())?;
    let res = client
        .get(format!("{}/api/tags", OLLAMA_BASE))
        .send()
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("Ollama returned {}", res.status()));
    }
    let body: TagsResponse = res.json().map_err(|e| e.to_string())?;
    let names = body
        .models
        .unwrap_or_default()
        .into_iter()
        .filter_map(|m| m.name)
        .collect();
    Ok(names)
}

#[derive(Deserialize)]
struct GenerateResponse {
    response: Option<String>,
}

const DEFAULT_TIMEOUT_SECS: u64 = 120;

/// Build the full prompt: optional persona system prompt + context + user message + clarify instruction.
pub fn build_chat_prompt(
    system_prompt: Option<&str>,
    context: &str,
    user_message: &str,
) -> String {
    let data_instruction = "You have access to the following data from the Marketing Intelligence Engine (ads, pattern stats, verified emails, SEC filings). Use this data only when the user explicitly asks about their ads, patterns, email list, market/filing data, or similar. Otherwise answer normally and do not inject this data into your response.";
    let clarify_instruction = "When you need clarification from the user, end your message with a newline and exactly: [CLARIFY: option1 | option2 | option3]. Use 2-4 short options. Otherwise do not include this line.";
    let context_block = if context.trim().is_empty() {
        String::new()
    } else {
        format!("{}\n\n{}\n\n", data_instruction, context.trim())
    };
    let user_part = format!("User question: {}\n\n{}", user_message.trim(), clarify_instruction);
    match system_prompt {
        Some(sp) if !sp.is_empty() => format!("{}\n\n{}{}", sp.trim(), context_block, user_part),
        _ => format!("{}{}", context_block, user_part),
    }
}

/// Send user message with context to Ollama and return the reply.
/// `timeout_secs`: max time for the request; None = use DEFAULT_TIMEOUT_SECS.
/// `system_prompt`: optional persona/mode system prompt (from frontend agent mode).
pub fn ollama_chat(
    model: String,
    user_message: String,
    context: String,
    timeout_secs: Option<u64>,
    system_prompt: Option<String>,
) -> Result<String, String> {
    let secs = timeout_secs.unwrap_or(DEFAULT_TIMEOUT_SECS);
    let client = Client::builder()
        .timeout(Duration::from_secs(secs))
        .build()
        .map_err(|e| e.to_string())?;

    let prompt = build_chat_prompt(
        system_prompt.as_deref(),
        &context,
        &user_message,
    );

    let body = serde_json::json!({
        "model": model,
        "prompt": prompt,
        "stream": false,
        "options": {
            "num_ctx": DEFAULT_NUM_CTX,
            "num_predict": DEFAULT_NUM_PREDICT
        },
        "keep_alive": DEFAULT_KEEP_ALIVE
    });

    let res = client
        .post(format!("{}/api/generate", OLLAMA_BASE))
        .json(&body)
        .send()
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        let status = res.status();
        let text = res.text().unwrap_or_default();
        return Err(format!("Ollama {}: {}", status, text));
    }

    let gen: GenerateResponse = res.json().map_err(|e| e.to_string())?;
    Ok(gen.response.unwrap_or_default())
}

/// Generate text with a single prompt (no context). Used for copy variants and strategy report.
pub fn ollama_generate(
    model: String,
    prompt: String,
    timeout_secs: Option<u64>,
) -> Result<String, String> {
    ollama_chat(model, prompt, String::new(), timeout_secs, None)
}

/// Pre-warm: send a minimal request so the model stays loaded (avoids cold start on first real request).
pub fn ollama_prewarm(model: String) -> Result<(), String> {
    let client = Client::builder()
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|e| e.to_string())?;
    let body = serde_json::json!({
        "model": model,
        "prompt": "hi",
        "stream": false,
        "options": {
            "num_ctx": DEFAULT_NUM_CTX,
            "num_predict": 1
        },
        "keep_alive": DEFAULT_KEEP_ALIVE
    });
    let res = client
        .post(format!("{}/api/generate", OLLAMA_BASE))
        .json(&body)
        .send()
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("Ollama prewarm returned {}", res.status()));
    }
    Ok(())
}
