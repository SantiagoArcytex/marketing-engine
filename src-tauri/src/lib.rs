//! Marketing Intelligence Engine - Rust backend
//! SQLite init, Tauri commands, and app setup.

mod analysis;
mod db;
mod email_verify;
mod scrape;
mod strategy_agent;

use analysis::analyze_ad_copy;
use db::{
    delete_ads_by_source, get_ads_content, get_pattern_stats, init_db, insert_ads, list_ads,
    list_verified_emails, update_ad_patterns, upsert_verified_email, AdRow, PatternStats,
    VerifiedEmailRow,
};
use email_verify::{verify_email as verify_email_impl, VerifyResult};
use rusqlite::Connection;
use scrape::fetch_ads_for_query;
use std::path::PathBuf;
use strategy_agent::run_strategy_agent;
use tauri::Manager;

/// Application state: path to the SQLite database.
pub struct AppState {
    pub db_path: PathBuf,
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! Welcome to the Marketing Intelligence Engine.", name)
}

/// Scrape ads for a query keyword. Mode: "replace" = delete existing ads for this source then insert; "append" = insert only.
/// Limit caps how many ads to insert per run (default 50); demo batch is larger but trimmed by limit.
#[tauri::command]
fn scrape_ads(
    state: tauri::State<AppState>,
    query: String,
    mode: Option<String>,
    limit: Option<usize>,
) -> Result<usize, String> {
    let query = query.trim().to_string();
    if query.is_empty() {
        return Ok(0);
    }
    let replace = mode.as_deref().map(|m| m.eq_ignore_ascii_case("replace")).unwrap_or(true);
    let cap = limit.unwrap_or(50).clamp(1, 500);
    let conn = Connection::open(&state.db_path).map_err(|e| e.to_string())?;
    if replace {
        let _ = delete_ads_by_source(&conn, &query).map_err(|e| e.to_string())?;
    }
    let snippets = fetch_ads_for_query(&query, Some(cap))?;
    let rows: Vec<_> = snippets
        .into_iter()
        .map(|s| (s.content, s.hook, s.emotion, s.offer, s.audience, s.source))
        .collect();
    insert_ads(&conn, &rows).map_err(|e| e.to_string())
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

/// Verify a single email (syntax, MX, disposable). Async for DNS.
#[tauri::command]
async fn verify_email_cmd(email: String) -> Result<VerifyResult, String> {
    let result = verify_email_impl(&email).await;
    Ok(result)
}

/// Verify single email and store result in DB.
#[tauri::command]
async fn verify_email_and_store(state: tauri::State<'_, AppState>, email: String) -> Result<VerifyResult, String> {
    let result = verify_email_impl(&email).await;
    let conn = Connection::open(&state.db_path).map_err(|e| e.to_string())?;
    let status = match &result.status {
        email_verify::VerifyStatus::Ok => "ok",
        email_verify::VerifyStatus::Invalid => "invalid",
        email_verify::VerifyStatus::Disposable => "disposable",
        email_verify::VerifyStatus::CatchAll => "catch_all",
        email_verify::VerifyStatus::Unknown => "unknown",
    };
    upsert_verified_email(&conn, &result.email, status, &result.quality).map_err(|e| e.to_string())?;
    Ok(result)
}

/// Bulk verify: read emails from file path (one per line or CSV). Returns count verified.
#[tauri::command]
async fn verify_bulk(state: tauri::State<'_, AppState>, file_path: String) -> Result<usize, String> {
    let contents = std::fs::read_to_string(&file_path).map_err(|e| e.to_string())?;
    let emails: Vec<String> = contents
        .lines()
        .map(|s| s.trim().to_string())
        .filter(|s| s.contains('@'))
        .collect();
    let conn = Connection::open(&state.db_path).map_err(|e| e.to_string())?;
    let mut count = 0;
    for email in emails {
        let result = verify_email_impl(&email).await;
        let status = match &result.status {
            email_verify::VerifyStatus::Ok => "ok",
            email_verify::VerifyStatus::Invalid => "invalid",
            email_verify::VerifyStatus::Disposable => "disposable",
            email_verify::VerifyStatus::CatchAll => "catch_all",
            email_verify::VerifyStatus::Unknown => "unknown",
        };
        let _ = upsert_verified_email(&conn, &result.email, status, &result.quality);
        count += 1;
    }
    Ok(count)
}

/// Run strategy agent: gather ads, patterns, emails and return markdown report.
#[tauri::command]
fn run_strategy_agent_cmd(state: tauri::State<AppState>, query: String) -> Result<String, String> {
    run_strategy_agent(&state.db_path, &query)
}

/// Generate copy variants from hook/offer (template-based).
#[tauri::command]
fn generate_copy_variants(hook: Option<String>, offer: Option<String>) -> Result<Vec<String>, String> {
    let hook = hook.as_deref().unwrap_or("Stand out");
    let offer = offer.as_deref().unwrap_or("Get started");
    let out = vec![
        format!("{} — {}. Join thousands of satisfied users.", hook, offer),
        format!("{} today. {}. No credit card required.", hook, offer),
        format!("Why wait? {} and {}. Limited time.", hook, offer),
    ];
    Ok(out)
}

/// List verified emails with optional status filter.
#[tauri::command]
fn get_verified_emails(
    state: tauri::State<AppState>,
    status_filter: Option<String>,
    limit: Option<i32>,
) -> Result<Vec<VerifiedEmailRow>, String> {
    let conn = Connection::open(&state.db_path).map_err(|e| e.to_string())?;
    list_verified_emails(&conn, status_filter.as_deref(), limit.unwrap_or(1000)).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
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
        list_ads_cmd,
        analyze_patterns,
        get_pattern_stats_cmd,
        verify_email_cmd,
        verify_email_and_store,
        verify_bulk,
        get_verified_emails,
        run_strategy_agent_cmd,
        generate_copy_variants,
    ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
