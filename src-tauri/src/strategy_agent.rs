//! Strategy orchestrator: gather data via "tool" style calls and synthesize report.
//! MCP-style tools as Rust functions; agent produces Optimal Strategy + Key Takeaways.

use rusqlite::Connection;
use std::path::Path;
use crate::ollama;
use crate::sec;

/// Tool: query ads (recent N).
fn tool_query_ads(conn: &Connection, limit: i32) -> Result<Vec<(String, String, String)>, String> {
    let mut stmt = conn
        .prepare("SELECT content, hook, offer FROM ads ORDER BY id DESC LIMIT ?1")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(rusqlite::params![limit], |row| {
            Ok((
                row.get::<_, Option<String>>(0)?.unwrap_or_default(),
                row.get::<_, Option<String>>(1)?.unwrap_or_default(),
                row.get::<_, Option<String>>(2)?.unwrap_or_default(),
            ))
        })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

/// Tool: get pattern stats (top hooks, emotions, offers).
fn tool_pattern_stats(conn: &Connection) -> Result<(Vec<(String, i64)>, Vec<(String, i64)>, Vec<(String, i64)>), String> {
    let hooks = {
        let mut stmt = conn.prepare(
            "SELECT hook, COUNT(*) FROM ads WHERE hook IS NOT NULL AND hook != '' GROUP BY hook ORDER BY COUNT(*) DESC LIMIT 10",
        ).map_err(|e| e.to_string())?;
        let rows = stmt.query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))).map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?
    };
    let emotions = {
        let mut stmt = conn.prepare(
            "SELECT emotion, COUNT(*) FROM ads WHERE emotion IS NOT NULL AND emotion != '' GROUP BY emotion ORDER BY COUNT(*) DESC LIMIT 10",
        ).map_err(|e| e.to_string())?;
        let rows = stmt.query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))).map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?
    };
    let offers = {
        let mut stmt = conn.prepare(
            "SELECT offer, COUNT(*) FROM ads WHERE offer IS NOT NULL AND offer != '' GROUP BY offer ORDER BY COUNT(*) DESC LIMIT 10",
        ).map_err(|e| e.to_string())?;
        let rows = stmt.query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))).map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?
    };
    Ok((hooks, emotions, offers))
}

/// Tool: get verified email counts by status.
fn tool_verified_emails_summary(conn: &Connection) -> Result<Vec<(String, i64)>, String> {
    let mut stmt = conn
        .prepare("SELECT status, COUNT(*) FROM verified_emails GROUP BY status")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?)))
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

/// Build a context string from DB for the AI chat (ads, patterns, emails summary).
pub fn build_chat_context(db_path: &Path) -> Result<String, String> {
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;
    let ads = tool_query_ads(&conn, 20)?;
    let (hooks, emotions, offers) = tool_pattern_stats(&conn)?;
    let email_summary = tool_verified_emails_summary(&conn).unwrap_or_default();

    let mut ctx = String::new();
    ctx.push_str("## Ads (recent, content | hook | offer)\n");
    for (content, hook, offer) in ads.iter().take(15) {
        let content_preview = content.chars().take(100).collect::<String>();
        ctx.push_str(&format!("- {} | Hook: {} | Offer: {}\n", content_preview, hook, offer));
    }
    ctx.push_str("\n## Pattern stats (top)\n");
    ctx.push_str("Hooks: ");
    ctx.push_str(&hooks.iter().take(5).map(|(h, c)| format!("{} ({})", h, c)).collect::<Vec<_>>().join(", "));
    ctx.push_str("\nEmotions: ");
    ctx.push_str(&emotions.iter().take(5).map(|(e, c)| format!("{} ({})", e, c)).collect::<Vec<_>>().join(", "));
    ctx.push_str("\nOffers: ");
    ctx.push_str(&offers.iter().take(5).map(|(o, c)| format!("{} ({})", o, c)).collect::<Vec<_>>().join(", "));
    ctx.push_str("\n\n## Verified emails summary\n");
    if email_summary.is_empty() {
        ctx.push_str("(none)\n");
    } else {
        for (s, c) in &email_summary {
            ctx.push_str(&format!("{}: {}\n", s, c));
        }
    }
    // SEC EDGAR: recent filings for reference companies (no API key required).
    let sec_tickers: Vec<String> = vec!["AAPL".into(), "META".into()];
    ctx.push_str(&sec::build_sec_context(&sec_tickers));
    Ok(ctx)
}

/// Run the strategy agent: gather data and produce a markdown report.
pub fn run_strategy_agent(db_path: &Path, query: &str) -> Result<String, String> {
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    let ads = tool_query_ads(&conn, 20)?;
    let (hooks, emotions, offers) = tool_pattern_stats(&conn)?;
    let email_summary = tool_verified_emails_summary(&conn).unwrap_or_default();

    let mut report = String::new();
    report.push_str("# Strategy Report\n\n");
    report.push_str(&format!("**Query:** {}\n\n", query));
    report.push_str("## Optimal Strategy\n\n");
    if hooks.is_empty() && emotions.is_empty() && offers.is_empty() {
        report.push_str("- Scrape more ads for your niche to populate pattern data.\n");
        report.push_str("- Run **Analyze patterns** in Ad Explorer after scraping.\n");
        report.push_str("- Use Email Intelligence to verify lists before campaigns.\n");
    } else {
        if !hooks.is_empty() {
            report.push_str("- **Top hooks to test:** ");
            report.push_str(&hooks.iter().take(5).map(|(h, _)| h.as_str()).collect::<Vec<_>>().join(", "));
            report.push_str(".\n");
        }
        if !emotions.is_empty() {
            report.push_str("- **Emotions that resonate:** ");
            report.push_str(&emotions.iter().take(5).map(|(e, _)| e.as_str()).collect::<Vec<_>>().join(", "));
            report.push_str(".\n");
        }
        if !offers.is_empty() {
            report.push_str("- **Strong offers:** ");
            report.push_str(&offers.iter().take(5).map(|(o, _)| o.as_str()).collect::<Vec<_>>().join(", "));
            report.push_str(".\n");
        }
    }
    report.push_str("\n## Key Takeaways\n\n");
    report.push_str(&format!("- Ads in database: {} (sample used for patterns).\n", ads.len()));
    if !email_summary.is_empty() {
        report.push_str("- Verified emails summary: ");
        report.push_str(&email_summary.iter().map(|(s, c)| format!("{}={}", s, c)).collect::<Vec<_>>().join(", "));
        report.push_str(".\n");
    }
    report.push_str("- Focus on relief and trust angles for B2B; use free trial offers where relevant.\n");
    report.push_str("- Re-run this agent after scraping new ads to refresh recommendations.\n");

    report.push_str("\n## Sample ad copy (recent)\n\n");
    for (i, (content, hook, offer)) in ads.iter().take(5).enumerate() {
        let content_preview = content.chars().take(120).collect::<String>();
        report.push_str(&format!("{}. {} | Hook: {} | Offer: {}\n", i + 1, content_preview, hook, offer));
    }

    Ok(report)
}

/// Run the strategy agent with an LLM: build context and ask Ollama for a markdown report.
pub fn run_strategy_agent_llm(
    db_path: &Path,
    query: &str,
    model: &str,
    timeout_secs: Option<u64>,
) -> Result<String, String> {
    let context = build_chat_context(db_path).unwrap_or_default();
    let prompt = format!(
        "Given the following marketing data, produce a concise strategy report for this query. Output markdown with sections: **Optimal Strategy**, **Key Takeaways**, and optional **Sample ad copy**. Be actionable and specific.\n\nQuery: {}",
        query.trim()
    );
    ollama::ollama_chat(model.to_string(), prompt, context, timeout_secs, None)
}
