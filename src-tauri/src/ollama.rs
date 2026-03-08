//! Ollama integration: list models and chat with context from DB.

use reqwest::blocking::Client;
use serde::Deserialize;
use std::time::Duration;

pub const OLLAMA_BASE: &str = "http://localhost:11434";

fn resolve_base(base: Option<&str>) -> &str {
    match base {
        Some(s) if !s.trim().is_empty() => s.trim(),
        _ => OLLAMA_BASE,
    }
}

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
pub fn ollama_list_models(base_url: Option<&str>) -> Result<Vec<String>, String> {
    let base = resolve_base(base_url);
    let client = Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .map_err(|e| e.to_string())?;
    let res = client
        .get(format!("{}/api/tags", base))
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
/// Order is intentional for prefix caching: [system_prompt?] + [data_instruction + context] + [user_message + clarify].
/// Only the last segment (user message) changes per turn; never place the user message or variable content at the top.
/// Screen context (current module, selected ad, etc.) must not be injected by default; if added later, only when
/// the user explicitly asks (e.g. "what am I looking at?", "use the ad I have open") or opts in via UI.
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
    base_url: Option<&str>,
    num_ctx: Option<u32>,
    num_predict: Option<u32>,
) -> Result<String, String> {
    let secs = timeout_secs.unwrap_or(DEFAULT_TIMEOUT_SECS);
    let base = resolve_base(base_url);
    let ctx = num_ctx.unwrap_or(DEFAULT_NUM_CTX);
    let pred = num_predict.unwrap_or(DEFAULT_NUM_PREDICT);
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
            "num_ctx": ctx,
            "num_predict": pred
        },
        "keep_alive": DEFAULT_KEEP_ALIVE
    });

    let res = client
        .post(format!("{}/api/generate", base))
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
    ollama_chat(model, prompt, String::new(), timeout_secs, None, None, None, None)
}

/// Embed a single string. Uses POST /api/embed. Returns the embedding vector or error.
pub fn ollama_embed(model: &str, input: &str) -> Result<Vec<f32>, String> {
    let client = Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;
    let body = serde_json::json!({
        "model": model,
        "input": input
    });
    let res = client
        .post(format!("{}/api/embed", OLLAMA_BASE))
        .json(&body)
        .send()
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        let text = res.text().unwrap_or_default();
        return Err(format!("Ollama embed error: {}", text));
    }
    #[derive(serde::Deserialize)]
    struct EmbedResponse {
        embeddings: Option<Vec<Vec<f64>>>,
    }
    let parsed: EmbedResponse = res.json().map_err(|e| e.to_string())?;
    let vec = parsed
        .embeddings
        .and_then(|v| v.into_iter().next())
        .ok_or("No embedding in response")?;
    Ok(vec.into_iter().map(|f| f as f32).collect())
}

/// Run a vision model on a single image (base64). Returns the model's text description/analysis.
/// Use a vision-capable model (e.g. llava, llama3.2-vision, moondream).
pub fn ollama_vision_analyze(
    model: String,
    prompt: String,
    image_base64: String,
    timeout_secs: Option<u64>,
    base_url: Option<&str>,
    num_ctx: Option<u32>,
    num_predict: Option<u32>,
) -> Result<String, String> {
    let secs = timeout_secs.unwrap_or(DEFAULT_TIMEOUT_SECS);
    let base = resolve_base(base_url);
    let ctx = num_ctx.unwrap_or(DEFAULT_NUM_CTX);
    let pred = num_predict.unwrap_or(DEFAULT_NUM_PREDICT);
    let client = Client::builder()
        .timeout(Duration::from_secs(secs))
        .build()
        .map_err(|e| e.to_string())?;
    let body = serde_json::json!({
        "model": model,
        "prompt": prompt,
        "images": [image_base64],
        "stream": false,
        "options": {
            "num_ctx": ctx,
            "num_predict": pred
        },
        "keep_alive": DEFAULT_KEEP_ALIVE
    });
    let res = client
        .post(format!("{}/api/generate", base))
        .json(&body)
        .send()
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        let status = res.status();
        let text = res.text().unwrap_or_default();
        return Err(format!("Ollama vision {}: {}", status, text));
    }
    let gen: GenerateResponse = res.json().map_err(|e| e.to_string())?;
    Ok(gen.response.unwrap_or_default())
}

/// Pre-warm: send a minimal request so the model stays loaded (avoids cold start on first real request).
pub fn ollama_prewarm(model: String, base_url: Option<&str>) -> Result<(), String> {
    let base = resolve_base(base_url);
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
        .post(format!("{}/api/generate", base))
        .json(&body)
        .send()
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("Ollama prewarm returned {}", res.status()));
    }
    Ok(())
}
