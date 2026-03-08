//! Marketing Intelligence Engine - Rust backend
//! SQLite init, Tauri commands, and app setup.

mod analysis;
mod db;
mod email_verify;
mod ollama;
mod remote_client;
mod scrape;
mod sec;
mod strategy_agent;

use base64::Engine;
use analysis::analyze_ad_copy;
use db::{
    clear_all_ads, count_verified_emails, delete_ads_by_source, get_ads_content, get_pattern_stats,
    init_db, insert_ads, list_ads, list_verified_emails, update_ad_patterns, upsert_ad_embedding,
    upsert_verified_email, AdRow, PatternStats,
};
use email_verify::{verify_email as verify_email_impl, VerifyResult};
use rusqlite::Connection;
use scrape::{fetch_ads_for_query, fetch_ads_from_url_browser};
use std::fs;
use std::path::PathBuf;
use sec::{fetch_company_tickers, fetch_submissions, resolve_cik, CompanyTickerRow, FilingSummary};
use remote_client::{remote_chat, CloudProvider};
use strategy_agent::{build_chat_context, run_strategy_agent, run_strategy_agent_llm};
use tauri::{Emitter, Manager};

/// Application state: path to the SQLite database.
pub struct AppState {
    pub db_path: PathBuf,
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! Welcome to the Marketing Intelligence Engine.", name)
}

/// Scrape ads for a query keyword.
/// - mode: "replace" = delete existing ads for this source then insert; "append" = insert only.
/// - scrape_mode: "static" = demo/static HTML; "browser" = headless Chrome (requires url).
/// - url: when scrape_mode is "browser", the URL to load (e.g. a JS-heavy ad library page).
/// Limit caps how many ads to insert per run (default 50).
#[tauri::command]
fn scrape_ads(
    state: tauri::State<AppState>,
    query: String,
    mode: Option<String>,
    limit: Option<usize>,
    scrape_mode: Option<String>,
    url: Option<String>,
    proxy: Option<String>,
) -> Result<usize, String> {
    let query = query.trim().to_string();
    if query.is_empty() {
        return Ok(0);
    }
    let replace = mode.as_deref().map(|m| m.eq_ignore_ascii_case("replace")).unwrap_or(true);
    let cap = limit.unwrap_or(50).clamp(1, 500);
    let use_browser = scrape_mode
        .as_deref()
        .map(|m| m.eq_ignore_ascii_case("browser"))
        .unwrap_or(false);
    let conn = Connection::open(&state.db_path).map_err(|e| e.to_string())?;
    if replace {
        let _ = delete_ads_by_source(&conn, &query).map_err(|e| e.to_string())?;
    }
    let proxy_ref = proxy.as_deref().and_then(|s| {
        let s = s.trim();
        if s.is_empty() {
            None
        } else if s.starts_with("http://") || s.starts_with("https://") || s.starts_with("socks5://") {
            Some(s)
        } else {
            None
        }
    });
    let snippets = if use_browser {
        let url_to_use = url
            .as_deref()
            .map(str::trim)
            .filter(|s| s.starts_with("http://") || s.starts_with("https://"))
            .ok_or("Browser mode requires a valid http(s) URL")?;
        fetch_ads_from_url_browser(url_to_use, &query, Some(cap), proxy_ref)?
    } else {
        fetch_ads_for_query(&query, Some(cap))?
    };
    let rows: Vec<_> = snippets
        .into_iter()
        .map(|s| (s.content, s.hook, s.emotion, s.offer, s.audience, s.source))
        .collect();
    insert_ads(&conn, &rows).map_err(|e| e.to_string())
}

/// Index ads for semantic search: generate embeddings via Ollama and store in ad_embeddings.
/// Requires an embedding model (e.g. nomic-embed-text). Returns number of ads indexed.
#[tauri::command]
fn index_ads_embeddings(state: tauri::State<AppState>, embedding_model: String) -> Result<usize, String> {
    let model = embedding_model.trim();
    if model.is_empty() {
        return Err("Embedding model name required (e.g. nomic-embed-text)".to_string());
    }
    let conn = Connection::open(&state.db_path).map_err(|e| e.to_string())?;
    let rows = list_ads(&conn, None, 10_000).map_err(|e| e.to_string())?;
    let mut count = 0usize;
    for row in rows {
        let text = row.content.as_deref().unwrap_or("").trim();
        if text.is_empty() {
            continue;
        }
        if let Ok(embedding) = ollama::ollama_embed(model, text) {
            if upsert_ad_embedding(&conn, row.id, &embedding).is_ok() {
                count += 1;
            }
        }
    }
    Ok(count)
}

/// Clear ads: if source is Some(s), delete only ads for that source; else delete all. Returns deleted count.
#[tauri::command]
fn clear_ads(state: tauri::State<AppState>, source: Option<String>) -> Result<usize, String> {
    let conn = Connection::open(&state.db_path).map_err(|e| e.to_string())?;
    let n = match source.as_deref() {
        Some(s) => delete_ads_by_source(&conn, s).map_err(|e| e.to_string())?,
        None => clear_all_ads(&conn).map_err(|e| e.to_string())?,
    };
    Ok(n)
}

/// List ads with optional source filter and limit (default 500).
#[tauri::command]
fn list_ads_cmd(
    state: tauri::State<AppState>,
    source_filter: Option<String>,
    limit: Option<i32>,
) -> Result<Vec<AdRow>, String> {
    let conn = Connection::open(&state.db_path).map_err(|e| e.to_string())?;
    list_ads(
        &conn,
        source_filter.as_deref(),
        limit.unwrap_or(500),
    )
    .map_err(|e| e.to_string())
}

/// Run pattern analysis on ads (all or by ids) and update DB. Returns number updated.
#[tauri::command]
fn analyze_patterns(state: tauri::State<AppState>, ad_ids: Option<Vec<i64>>) -> Result<usize, String> {
    let conn = Connection::open(&state.db_path).map_err(|e| e.to_string())?;
    let ids_opt = ad_ids.as_deref().filter(|s| !s.is_empty());
    let rows = get_ads_content(&conn, ids_opt).map_err(|e| e.to_string())?;
    let mut count = 0;
    for (id, content) in rows {
        let content = content.as_deref().unwrap_or("");
        let a = analyze_ad_copy(content);
        update_ad_patterns(
            &conn,
            id,
            a.hook.as_deref(),
            a.emotion.as_deref(),
            a.offer.as_deref(),
            a.audience.as_deref(),
        )
        .map_err(|e| e.to_string())?;
        count += 1;
    }
    Ok(count)
}

/// Get pattern stats for charts (top hooks, emotions, offers).
#[tauri::command]
fn get_pattern_stats_cmd(state: tauri::State<AppState>) -> Result<PatternStats, String> {
    let conn = Connection::open(&state.db_path).map_err(|e| e.to_string())?;
    get_pattern_stats(&conn).map_err(|e| e.to_string())
}

/// Verify a single email (syntax, MX, disposable). Runs DNS in a blocking task so
/// TokioAsyncResolver's runtime is not dropped from within Tauri's async runtime.
#[tauri::command]
async fn verify_email_cmd(email: String) -> Result<VerifyResult, String> {
    let result = tauri::async_runtime::spawn_blocking(move || -> Result<VerifyResult, String> {
        let rt = tokio::runtime::Runtime::new().map_err(|e| e.to_string())?;
        Ok(rt.block_on(verify_email_impl(&email)))
    })
    .await
    .map_err(|e| e.to_string())??;
    Ok(result)
}

/// Verify single email and store result in DB.
#[tauri::command]
async fn verify_email_and_store(state: tauri::State<'_, AppState>, email: String) -> Result<VerifyResult, String> {
    let result = tauri::async_runtime::spawn_blocking(move || -> Result<VerifyResult, String> {
        let rt = tokio::runtime::Runtime::new().map_err(|e| e.to_string())?;
        Ok(rt.block_on(verify_email_impl(&email)))
    })
    .await
    .map_err(|e| e.to_string())??;
    let db_path = state.db_path.clone();
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    let status = match &result.status {
        email_verify::VerifyStatus::Ok => "ok",
        email_verify::VerifyStatus::Invalid => "invalid",
        email_verify::VerifyStatus::Disposable => "disposable",
        email_verify::VerifyStatus::CatchAll => "catch_all",
        email_verify::VerifyStatus::Unknown => "unknown",
    };
    upsert_verified_email(
        &conn,
        &result.email,
        status,
        &result.quality,
        Some(result.tests.syntax),
        Some(result.tests.mx),
        Some(result.tests.disposable),
    )
    .map_err(|e| e.to_string())?;
    Ok(result)
}

/// Max concurrent DNS/MX lookups during bulk verify to avoid triggering network safeguards.
const BULK_VERIFY_CONCURRENCY: usize = 5;

/// Bulk verify: read emails from file path (one per line or CSV). Returns count verified.
/// Limits concurrent verifications (semaphore) to avoid ISP/network issues.
#[tauri::command]
async fn verify_bulk(state: tauri::State<'_, AppState>, file_path: String) -> Result<usize, String> {
    use std::sync::Arc;
    use tokio::sync::Semaphore;

    let contents = std::fs::read_to_string(&file_path).map_err(|e| e.to_string())?;
    let emails: Vec<String> = contents
        .lines()
        .map(|s| s.trim().to_string())
        .filter(|s| s.contains('@'))
        .collect();
    let conn = Connection::open(&state.db_path).map_err(|e| e.to_string())?;
    let semaphore = Arc::new(Semaphore::new(BULK_VERIFY_CONCURRENCY));
    let mut count = 0;
    for email in emails {
        let _permit = semaphore
            .clone()
            .acquire_owned()
            .await
            .map_err(|e| e.to_string())?;
        let result = tauri::async_runtime::spawn_blocking({
            let email = email.clone();
            move || {
                let rt = tokio::runtime::Runtime::new().expect("runtime");
                rt.block_on(verify_email_impl(&email))
            }
        })
        .await
        .map_err(|e| e.to_string())?;
        let status = match &result.status {
            email_verify::VerifyStatus::Ok => "ok",
            email_verify::VerifyStatus::Invalid => "invalid",
            email_verify::VerifyStatus::Disposable => "disposable",
            email_verify::VerifyStatus::CatchAll => "catch_all",
            email_verify::VerifyStatus::Unknown => "unknown",
        };
        let _ = upsert_verified_email(
            &conn,
            &result.email,
            status,
            &result.quality,
            Some(result.tests.syntax),
            Some(result.tests.mx),
            Some(result.tests.disposable),
        );
        count += 1;
    }
    Ok(count)
}

/// Run strategy agent: gather ads, patterns, emails and return markdown report.
/// If model is Some and non-empty, use that Ollama model for LLM-assisted report; otherwise use static report.
#[tauri::command]
async fn run_strategy_agent_cmd(
    state: tauri::State<'_, AppState>,
    query: String,
    model: Option<String>,
    timeout_secs: Option<u64>,
) -> Result<String, String> {
    let model = model.as_deref().map(str::trim).filter(|s| !s.is_empty());
    if let Some(m) = model {
        let db_path = state.db_path.clone();
        let query = query.clone();
        let model = m.to_string();
        tauri::async_runtime::spawn_blocking(move || run_strategy_agent_llm(&db_path, &query, &model, timeout_secs))
            .await
            .map_err(|e| e.to_string())?
    } else {
        run_strategy_agent(&state.db_path, &query)
    }
}

/// Generate copy variants from hook/offer. If model is Some and non-empty, use Ollama for LLM-generated variants; otherwise template-based.
#[tauri::command]
async fn generate_copy_variants(
    hook: Option<String>,
    offer: Option<String>,
    model: Option<String>,
    timeout_secs: Option<u64>,
) -> Result<Vec<String>, String> {
    let hook = hook.as_deref().unwrap_or("Stand out").trim();
    let offer = offer.as_deref().unwrap_or("Get started").trim();
    let model = model.as_deref().map(str::trim).filter(|s| !s.is_empty());

    if let Some(m) = model {
        let prompt = format!(
            "Generate 3 to 5 short ad copy variants. Hook: \"{}\". Offer: \"{}\". Output one variant per line, numbered (1. ... 2. ...). Be concise and varied.",
            hook,
            offer
        );
        let model = m.to_string();
        let reply = tauri::async_runtime::spawn_blocking(move || ollama::ollama_generate(model, prompt, timeout_secs))
            .await
            .map_err(|e| e.to_string())??;
        let lines: Vec<String> = reply
            .lines()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(|line| {
                line.strip_prefix(|c: char| c.is_ascii_digit() || c == '.')
                    .map(str::trim)
                    .unwrap_or(line)
                    .to_string()
            })
            .filter(|s| s.len() > 5)
            .take(10)
            .collect();
        Ok(if lines.is_empty() {
            vec![
                format!("{} — {}. Join thousands of satisfied users.", hook, offer),
                format!("{} today. {}. No credit card required.", hook, offer),
                format!("Why wait? {} and {}. Limited time.", hook, offer),
            ]
        } else {
            lines
        })
    } else {
        let out = vec![
            format!("{} — {}. Join thousands of satisfied users.", hook, offer),
            format!("{} today. {}. No credit card required.", hook, offer),
            format!("Why wait? {} and {}. Limited time.", hook, offer),
        ];
        Ok(out)
    }
}

/// List Ollama model names. Fails if Ollama is not running.
#[tauri::command]
async fn ollama_list_models(ollama_base_url: Option<String>) -> Result<Vec<String>, String> {
    let base = ollama_base_url.filter(|s| !s.trim().is_empty());
    tauri::async_runtime::spawn_blocking(move || ollama::ollama_list_models(base.as_deref()))
        .await
        .map_err(|e| e.to_string())?
}

/// Chat: routes to cloud API (when use_cloud) or local Ollama. Cloud uses full context (no RAG limit).
#[tauri::command]
async fn ollama_chat(
    state: tauri::State<'_, AppState>,
    model: String,
    user_message: String,
    timeout_secs: Option<u64>,
    system_prompt: Option<String>,
    sec_summary_model: Option<String>,
    ollama_base_url: Option<String>,
    num_ctx: Option<u32>,
    num_predict: Option<u32>,
    use_cloud: Option<bool>,
    cloud_provider: Option<String>,
    cloud_api_key: Option<String>,
    cloud_model: Option<String>,
    cloud_base_url: Option<String>,
) -> Result<String, String> {
    let use_cloud = use_cloud.unwrap_or(false);
    if use_cloud {
        let api_key = cloud_api_key.as_deref().unwrap_or("").to_string();
        let db_path = state.db_path.clone();
        let sec_model = sec_summary_model.clone();
        let context = tauri::async_runtime::spawn_blocking(move || {
            build_chat_context(&db_path, None, None, sec_model.as_deref(), true).unwrap_or_default()
        })
        .await
        .map_err(|e| e.to_string())?;
        let user_content = ollama::build_chat_prompt(None, &context, &user_message);
        let max_tokens = num_predict.or(Some(2048));
        let base_url = cloud_base_url.as_deref().filter(|s| !s.trim().is_empty());
        let provider = if base_url.is_none() {
            cloud_provider
                .as_deref()
                .and_then(CloudProvider::from_str)
        } else {
            None
        };
        remote_chat(
            &api_key,
            provider,
            cloud_model.filter(|s| !s.is_empty()),
            system_prompt,
            user_content,
            max_tokens,
            base_url,
        )
        .await
    } else {
        let sec_model = sec_summary_model.as_deref();
        let context = build_chat_context(&state.db_path, Some(&user_message), Some("nomic-embed-text"), sec_model, false).unwrap_or_default();
        let base = ollama_base_url.filter(|s| !s.trim().is_empty());
        let out = tauri::async_runtime::spawn_blocking(move || {
            ollama::ollama_chat(model, user_message, context, timeout_secs, system_prompt, base.as_deref(), num_ctx, num_predict)
        })
        .await
        .map_err(|e| e.to_string())??;
        Ok(out)
    }
}

/// Pre-warm: load the model into memory so the next chat is fast. Call when user selects a model.
#[tauri::command]
async fn ollama_prewarm(model: String, ollama_base_url: Option<String>) -> Result<(), String> {
    let model = model.trim().to_string();
    if model.is_empty() {
        return Ok(());
    }
    let base = ollama_base_url.filter(|s| !s.trim().is_empty());
    tauri::async_runtime::spawn_blocking(move || ollama::ollama_prewarm(model, base.as_deref()))
        .await
        .map_err(|e| e.to_string())?
}

/// Analyze an image with an Ollama vision model. Pass either image_path (file path) or image_base64.
/// Returns the model's text description. Use a vision-capable model (e.g. llava, llama3.2-vision).
#[tauri::command]
async fn ollama_vision(
    model: String,
    prompt: Option<String>,
    image_path: Option<String>,
    image_base64: Option<String>,
    ollama_base_url: Option<String>,
    num_ctx: Option<u32>,
    num_predict: Option<u32>,
) -> Result<String, String> {
    let model = model.trim().to_string();
    if model.is_empty() {
        return Err("Vision model name required (e.g. llava)".to_string());
    }
    let image_b64 = match (image_path, image_base64) {
        (Some(path), None) => {
            let bytes = fs::read(&path).map_err(|e| format!("Read image: {}", e))?;
            base64::engine::general_purpose::STANDARD.encode(&bytes)
        }
        (None, Some(b64)) => b64,
        _ => return Err("Provide either image_path or image_base64".to_string()),
    };
    let prompt = prompt
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| "Describe this image in detail.".to_string());
    let base = ollama_base_url.filter(|s| !s.trim().is_empty());
    tauri::async_runtime::spawn_blocking(move || {
        ollama::ollama_vision_analyze(model, prompt, image_b64, Some(120), base.as_deref(), num_ctx, num_predict)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Chat stream: routes to cloud (single response then done) or local Ollama (token stream).
#[tauri::command]
async fn ollama_chat_stream(
    window: tauri::Window,
    state: tauri::State<'_, AppState>,
    model: String,
    user_message: String,
    system_prompt: Option<String>,
    sec_summary_model: Option<String>,
    ollama_base_url: Option<String>,
    num_ctx: Option<u32>,
    num_predict: Option<u32>,
    use_cloud: Option<bool>,
    cloud_provider: Option<String>,
    cloud_api_key: Option<String>,
    cloud_model: Option<String>,
    cloud_base_url: Option<String>,
) -> Result<(), String> {
    let use_cloud = use_cloud.unwrap_or(false);
    if use_cloud {
        let api_key = cloud_api_key.as_deref().unwrap_or("").to_string();
        let db_path = state.db_path.clone();
        let sec_model = sec_summary_model.clone();
        let context = tauri::async_runtime::spawn_blocking(move || {
            build_chat_context(&db_path, None, None, sec_model.as_deref(), true).unwrap_or_default()
        })
        .await
        .map_err(|e| e.to_string())?;
        let user_content = ollama::build_chat_prompt(None, &context, &user_message);
        let base_url = cloud_base_url.as_deref().filter(|s| !s.trim().is_empty());
        let provider = if base_url.is_none() {
            cloud_provider
                .as_deref()
                .and_then(CloudProvider::from_str)
        } else {
            None
        };
        let reply = remote_chat(
            &api_key,
            provider,
            cloud_model.filter(|s| !s.is_empty()),
            system_prompt.clone(),
            user_content,
            num_predict.or(Some(2048)),
            base_url,
        )
        .await?;
        let _ = window.emit("ollama-chunk", &reply);
        let _ = window.emit("ollama-done", ());
        return Ok(());
    }

    use futures_util::StreamExt;
    use ollama::OLLAMA_BASE;

    let base = ollama_base_url
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| OLLAMA_BASE.to_string());
    let ctx = num_ctx.unwrap_or(4096);
    let pred = num_predict.unwrap_or(2048);

    let db_path = state.db_path.clone();
    let user_msg = user_message.clone();
    let sec_model = sec_summary_model.clone();
    let context = tauri::async_runtime::spawn_blocking(move || {
        build_chat_context(&db_path, Some(&user_msg), Some("nomic-embed-text"), sec_model.as_deref(), false).unwrap_or_default()
    })
    .await
    .map_err(|e| e.to_string())?;
    let prompt = ollama::build_chat_prompt(
        system_prompt.as_deref(),
        &context,
        &user_message,
    );

    let body = serde_json::json!({
        "model": model,
        "prompt": prompt,
        "stream": true,
        "options": {
            "num_ctx": ctx,
            "num_predict": pred
        },
        "keep_alive": "24h"
    });

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| e.to_string())?;

    let res = client
        .post(format!("{}/api/generate", base))
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        let status = res.status();
        let text = res.text().await.unwrap_or_default();
        return Err(format!("Ollama {}: {}", status, text));
    }

    let mut stream = res.bytes_stream();
    let mut buf: Vec<u8> = Vec::new();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| e.to_string())?;
        buf.extend(&chunk);
        while let Some(i) = buf.iter().position(|&b| b == b'\n') {
            let line_bytes: Vec<u8> = buf.drain(..=i).collect();
            let line = String::from_utf8_lossy(&line_bytes);
            let line = line.trim();
            if line.is_empty() {
                continue;
            }
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(line) {
                if let Some(s) = json.get("response").and_then(|v| v.as_str()) {
                    let _ = window.emit("ollama-chunk", s);
                }
                if json.get("done").and_then(|v| v.as_bool()).unwrap_or(false) {
                    let _ = window.emit("ollama-done", ());
                    return Ok(());
                }
            }
        }
    }
    let _ = window.emit("ollama-done", ());
    Ok(())
}

/// SEC EDGAR: fetch company tickers (ticker, CIK, title). No API key; User-Agent required.
#[tauri::command]
fn sec_fetch_company_tickers() -> Result<Vec<CompanyTickerRow>, String> {
    fetch_company_tickers()
}

/// SEC EDGAR: recent filings (10-K, 10-Q, S-1, 8-K, DEF 14A) for a ticker or CIK.
#[tauri::command]
fn sec_company_filings(ticker_or_cik: String) -> Result<Vec<FilingSummary>, String> {
    let tickers = fetch_company_tickers()?;
    let cik = resolve_cik(&ticker_or_cik, &tickers)
        .ok_or_else(|| format!("Company or CIK not found: {}", ticker_or_cik))?;
    fetch_submissions(&cik)
}

/// List verified emails with pagination and optional status/search. Returns items and total count.
#[tauri::command]
fn get_verified_emails(
    state: tauri::State<AppState>,
    limit: Option<i32>,
    offset: Option<i32>,
    status_filter: Option<String>,
    search: Option<String>,
) -> Result<serde_json::Value, String> {
    let conn = Connection::open(&state.db_path).map_err(|e| e.to_string())?;
    let limit = limit.unwrap_or(100).clamp(1, 500);
    let offset = offset.unwrap_or(0).max(0);
    let status = status_filter.as_deref().map(str::trim).filter(|s| !s.is_empty());
    let search = search.as_deref().map(str::trim).filter(|s| !s.is_empty());
    let items = list_verified_emails(&conn, status, search, limit, offset).map_err(|e| e.to_string())?;
    let total = count_verified_emails(&conn, status, search).map_err(|e| e.to_string())?;
    Ok(serde_json::json!({ "items": items, "total": total }))
}

/// Fetch URL content (GET). Used by chat after user allows. Only https allowed. Timeout 15s.
#[tauri::command]
fn fetch_url(url: String) -> Result<String, String> {
    let url = url.trim();
    if !url.starts_with("https://") {
        return Err("Only https URLs are allowed".to_string());
    }
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .user_agent("MarketingIntelligenceEngine/1.0")
        .build()
        .map_err(|e| e.to_string())?;
    let res = client.get(url).send().map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("HTTP {}", res.status()));
    }
    let body = res.text().map_err(|e| e.to_string())?;
    // Truncate to avoid huge payloads (e.g. 100k chars)
    let max_len = 100_000;
    Ok(if body.len() > max_len {
        format!("{}... [truncated]", &body[..max_len])
    } else {
        body
    })
}

/// Write export file content to a user-chosen path (e.g. CSV export).
#[tauri::command]
fn write_export_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content).map_err(|e| e.to_string())
}

/// Write an Ollama Modelfile (e.g. Modelfile.qwen) with FROM qwen2.5, SYSTEM prompt, and default PARAMETERs.
#[tauri::command]
fn write_modelfile(path: String, name: String, system_prompt: String) -> Result<(), String> {
    let content = format!(
        "# {name}\nFROM qwen2.5\n\nSYSTEM \"\"\"{system_prompt}\"\"\"\n\nPARAMETER temperature 0.7\nPARAMETER num_ctx 4096\nPARAMETER num_predict 2048\n# PARAMETER kv_cache_type q8_0  # Uncomment for smaller KV cache on M3 / Apple Silicon\n",
        name = name.trim(),
        system_prompt = system_prompt.trim()
    );
    std::fs::write(&path, content).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let path_resolver = app.path().clone();
            let app_data_dir = path_resolver
                .app_data_dir()
                .expect("failed to resolve app data dir");
            std::fs::create_dir_all(&app_data_dir).expect("failed to create app data dir");
            let db_path = app_data_dir.join("engine.db");
            init_db(&db_path).expect("failed to init database");
            app.manage(AppState {
                db_path: db_path.clone(),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
        greet,
        scrape_ads,
        clear_ads,
        list_ads_cmd,
        index_ads_embeddings,
        analyze_patterns,
        get_pattern_stats_cmd,
        verify_email_cmd,
        verify_email_and_store,
        verify_bulk,
        get_verified_emails,
        write_export_file,
        write_modelfile,
        fetch_url,
        run_strategy_agent_cmd,
        generate_copy_variants,
        ollama_list_models,
        ollama_chat,
        ollama_chat_stream,
        ollama_vision,
        ollama_prewarm,
        sec_fetch_company_tickers,
        sec_company_filings,
    ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
