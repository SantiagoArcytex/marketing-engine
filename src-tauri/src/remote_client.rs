//! Cloud API client: OpenAI-compatible (OpenRouter, Groq) and Google Gemini.
//! Enables large-context chat without local inference. API keys are passed from the frontend;
//! consider tauri-plugin-stronghold for secure storage.

use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::time::Duration;

/// Supported cloud providers. Frontend sends this + API key.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CloudProvider {
    OpenRouter,
    Groq,
    Google,
}

impl CloudProvider {
    pub fn as_str(self) -> &'static str {
        match self {
            CloudProvider::OpenRouter => "openrouter",
            CloudProvider::Groq => "groq",
            CloudProvider::Google => "google",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s.trim().to_lowercase().as_str() {
            "openrouter" => Some(CloudProvider::OpenRouter),
            "groq" => Some(CloudProvider::Groq),
            "google" => Some(CloudProvider::Google),
            _ => None,
        }
    }
}

// --- OpenAI-compatible (OpenRouter, Groq) ---

#[derive(Serialize)]
struct OpenAIChatRequest {
    model: String,
    messages: Vec<OpenAIChatMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    stream: Option<bool>,
}

#[derive(Serialize)]
struct OpenAIChatMessage {
    role: String,
    content: String,
}

#[derive(Deserialize)]
struct OpenAIChatResponse {
    choices: Option<Vec<OpenAIChoice>>,
}

#[derive(Deserialize)]
struct OpenAIChoice {
    message: Option<OpenAIMessage>,
    #[serde(rename = "delta")]
    delta_message: Option<OpenAIMessage>,
}

#[derive(Deserialize)]
struct OpenAIMessage {
    content: Option<String>,
}

/// Model IDs per provider (OpenAI-compatible endpoint).
fn openai_model_for_provider(provider: CloudProvider) -> &'static str {
    match provider {
        CloudProvider::OpenRouter => "openai/gpt-4o-mini",
        CloudProvider::Groq => "llama-4-scout-17b-16e-instant",
        CloudProvider::Google => unreachable!("use gemini_chat for Google"),
    }
}

fn openai_url_for_provider(provider: CloudProvider) -> &'static str {
    match provider {
        CloudProvider::OpenRouter => "https://openrouter.ai/api/v1/chat/completions",
        CloudProvider::Groq => "https://api.groq.com/openai/v1/chat/completions",
        CloudProvider::Google => unreachable!("use gemini_chat for Google"),
    }
}

/// Non-streaming chat via any OpenAI-compatible API at the given base URL.
/// base_url: e.g. "https://api.openai.com/v1" (we append "/chat/completions") or full "https://.../chat/completions".
pub async fn openai_compatible_chat_with_url(
    base_url: &str,
    api_key: &str,
    model: &str,
    system: Option<&str>,
    user_content: &str,
    max_tokens: Option<u32>,
) -> Result<String, String> {
    let base = base_url.trim().trim_end_matches('/');
    let url = if base.ends_with("/chat/completions") {
        base.to_string()
    } else {
        format!("{}/chat/completions", base)
    };
    let model = model.trim();
    if model.is_empty() {
        return Err("Model name is required for cloud API".to_string());
    }
    let mut messages: Vec<OpenAIChatMessage> = Vec::new();
    if let Some(s) = system.filter(|s| !s.is_empty()) {
        messages.push(OpenAIChatMessage {
            role: "system".to_string(),
            content: s.to_string(),
        });
    }
    messages.push(OpenAIChatMessage {
        role: "user".to_string(),
        content: user_content.to_string(),
    });

    let body = OpenAIChatRequest {
        model: model.to_string(),
        messages,
        max_tokens,
        stream: Some(false),
    };

    let client = Client::builder()
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|e| e.to_string())?;

    let res = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", api_key.trim()))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        let status = res.status();
        let text = res.text().await.unwrap_or_default();
        return Err(format!("Cloud API {}: {}", status, text));
    }

    let parsed: OpenAIChatResponse = res.json().await.map_err(|e| e.to_string())?;
    let text = parsed
        .choices
        .and_then(|c| c.into_iter().next())
        .and_then(|c| c.message)
        .and_then(|m| m.content)
        .unwrap_or_default();
    Ok(text)
}

/// Non-streaming chat via OpenAI-compatible API (OpenRouter, Groq).
pub async fn openai_compatible_chat(
    api_key: &str,
    provider: CloudProvider,
    model_override: Option<&str>,
    system: Option<&str>,
    user_content: &str,
    max_tokens: Option<u32>,
) -> Result<String, String> {
    let model = model_override
        .map(str::to_string)
        .unwrap_or_else(|| openai_model_for_provider(provider).to_string());
    let mut messages: Vec<OpenAIChatMessage> = Vec::new();
    if let Some(s) = system.filter(|s| !s.is_empty()) {
        messages.push(OpenAIChatMessage {
            role: "system".to_string(),
            content: s.to_string(),
        });
    }
    messages.push(OpenAIChatMessage {
        role: "user".to_string(),
        content: user_content.to_string(),
    });

    let body = OpenAIChatRequest {
        model,
        messages,
        max_tokens,
        stream: Some(false),
    };

    let client = Client::builder()
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|e| e.to_string())?;

    let auth_header = match provider {
        CloudProvider::OpenRouter => format!("Bearer {}", api_key.trim()),
        CloudProvider::Groq => format!("Bearer {}", api_key.trim()),
        CloudProvider::Google => unreachable!(),
    };

    let res = client
        .post(openai_url_for_provider(provider))
        .header("Authorization", auth_header)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        let status = res.status();
        let text = res.text().await.unwrap_or_default();
        return Err(format!("Cloud API {}: {}", status, text));
    }

    let parsed: OpenAIChatResponse = res.json().await.map_err(|e| e.to_string())?;
    let text = parsed
        .choices
        .and_then(|c| c.into_iter().next())
        .and_then(|c| c.message)
        .and_then(|m| m.content)
        .unwrap_or_default();
    Ok(text)
}

// --- Google Gemini (different API shape, 1M context) ---

#[derive(Serialize)]
struct GeminiGenerateRequest {
    contents: Vec<GeminiContent>,
    #[serde(skip_serializing_if = "Option::is_none")]
    system_instruction: Option<GeminiContent>,
    generation_config: Option<GeminiGenerationConfig>,
}

#[derive(Serialize)]
struct GeminiContent {
    parts: Vec<GeminiPart>,
}

#[derive(Serialize)]
struct GeminiPart {
    text: String,
}

#[derive(Serialize)]
struct GeminiGenerationConfig {
    #[serde(skip_serializing_if = "Option::is_none")]
    max_output_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
}

#[derive(Deserialize)]
struct GeminiGenerateResponse {
    candidates: Option<Vec<GeminiCandidate>>,
}

#[derive(Deserialize)]
struct GeminiCandidate {
    content: Option<GeminiContentResponse>,
}

#[derive(Deserialize)]
struct GeminiContentResponse {
    parts: Option<Vec<GeminiPartResponse>>,
}

#[derive(Deserialize)]
struct GeminiPartResponse {
    text: Option<String>,
}

const GEMINI_DEFAULT_MODEL: &str = "gemini-2.0-flash";
const GEMINI_BASE: &str = "https://generativelanguage.googleapis.com/v1beta";

/// Non-streaming chat via Google Gemini API (supports 1M+ context).
pub async fn gemini_chat(
    api_key: &str,
    model_override: Option<&str>,
    system: Option<&str>,
    user_content: &str,
    max_tokens: Option<u32>,
) -> Result<String, String> {
    let model = model_override
        .map(str::to_string)
        .unwrap_or_else(|| GEMINI_DEFAULT_MODEL.to_string());
    let url = format!(
        "{}/models/{}:generateContent?key={}",
        GEMINI_BASE,
        model.trim(),
        api_key.trim()
    );

    let system_instruction = system.filter(|s| !s.is_empty()).map(|s| GeminiContent {
        parts: vec![GeminiPart {
            text: s.to_string(),
        }],
    });

    let body = GeminiGenerateRequest {
        contents: vec![GeminiContent {
            parts: vec![GeminiPart {
                text: user_content.to_string(),
            }],
        }],
        system_instruction,
        generation_config: Some(GeminiGenerationConfig {
            max_output_tokens: max_tokens.or(Some(2048)),
            temperature: Some(0.7),
        }),
    };

    let client = Client::builder()
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|e| e.to_string())?;

    let res = client
        .post(&url)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        let status = res.status();
        let text = res.text().await.unwrap_or_default();
        return Err(format!("Gemini API {}: {}", status, text));
    }

    let parsed: GeminiGenerateResponse = res.json().await.map_err(|e| e.to_string())?;
    let text = parsed
        .candidates
        .and_then(|c| c.into_iter().next())
        .and_then(|c| c.content)
        .and_then(|c| c.parts)
        .and_then(|p| p.into_iter().next())
        .and_then(|p| p.text)
        .unwrap_or_default();
    Ok(text)
}

/// Unified remote chat: custom base URL (any OpenAI-compatible API), or provider-based (OpenRouter, Groq, Gemini).
pub async fn remote_chat(
    api_key: &str,
    provider: Option<CloudProvider>,
    model_override: Option<String>,
    system: Option<String>,
    user_content: String,
    max_tokens: Option<u32>,
    base_url: Option<&str>,
) -> Result<String, String> {
    let key = api_key.trim();
    if key.is_empty() {
        return Err("Cloud API key is required".to_string());
    }
    // Custom base URL: use any OpenAI-compatible endpoint; model name is required.
    if let Some(url) = base_url.filter(|s| !s.trim().is_empty()) {
        let model = model_override
            .as_deref()
            .filter(|s| !s.trim().is_empty())
            .ok_or("Model name is required when using a custom API base URL")?;
        return openai_compatible_chat_with_url(
            url,
            key,
            model,
            system.as_deref(),
            &user_content,
            max_tokens,
        )
        .await;
    }
    // Provider-based: use Google, OpenRouter, or Groq with optional model override.
    let provider = provider.unwrap_or(CloudProvider::OpenRouter);
    match provider {
        CloudProvider::Google => {
            gemini_chat(
                key,
                model_override.as_deref(),
                system.as_deref(),
                &user_content,
                max_tokens,
            )
            .await
        }
        CloudProvider::OpenRouter | CloudProvider::Groq => {
            openai_compatible_chat(
                key,
                provider,
                model_override.as_deref(),
                system.as_deref(),
                &user_content,
                max_tokens,
            )
            .await
        }
    }
}
