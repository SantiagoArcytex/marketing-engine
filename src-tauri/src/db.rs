//! Database access and schema for the Marketing Intelligence Engine.

use rusqlite::Connection;
use std::path::Path;

/// Ensures the ads table has all required columns (idempotent).
fn migrate_ads_schema(conn: &Connection) -> Result<(), rusqlite::Error> {
    for col in &["emotion TEXT", "offer TEXT", "audience TEXT"] {
        let sql = format!("ALTER TABLE ads ADD COLUMN {}", col);
        let _ = conn.execute(&sql, []);
    }
    Ok(())
}

/// Add verified_emails test columns if missing (idempotent). 0 = fail, 1 = pass, NULL = unknown.
fn migrate_verified_emails_tests(conn: &Connection) -> Result<(), rusqlite::Error> {
    for col in &["syntax_ok INTEGER", "mx_ok INTEGER", "disposable_ok INTEGER"] {
        let sql = format!("ALTER TABLE verified_emails ADD COLUMN {}", col);
        if let Err(e) = conn.execute(&sql, []) {
            let msg = e.to_string();
            if !msg.contains("duplicate column") {
                return Err(e);
            }
        }
    }
    Ok(())
}

/// Initialize or upgrade database schema.
pub fn init_db(db_path: &Path) -> Result<(), rusqlite::Error> {
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent).expect("failed to create app data dir");
    }
    let conn = Connection::open(db_path)?;
    // PRAGMA journal_mode returns a row; use execute_batch so we don't need to consume it.
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;")?;
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS ads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            content TEXT,
            hook TEXT,
            emotion TEXT,
            offer TEXT,
            audience TEXT,
            source TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS verified_emails (
            email TEXT PRIMARY KEY,
            status TEXT,
            quality TEXT,
            verified_at TEXT DEFAULT (datetime('now'))
        );
        ",
    )?;
    migrate_ads_schema(&conn)?;
    migrate_verified_emails_tests(&conn)?;
    conn.execute(
        "CREATE TABLE IF NOT EXISTS ad_embeddings (ad_id INTEGER PRIMARY KEY REFERENCES ads(id), embedding TEXT NOT NULL)",
        [],
    )?;
    Ok(())
}

/// Single ad row for JSON serialization.
#[derive(Debug, serde::Serialize, ts_rs::TS)]
#[ts(export)]
pub struct AdRow {
    pub id: i64,
    pub content: Option<String>,
    pub hook: Option<String>,
    pub emotion: Option<String>,
    pub offer: Option<String>,
    pub audience: Option<String>,
    pub source: Option<String>,
    pub created_at: Option<String>,
}

/// Delete all ads. Returns number of rows deleted.
pub fn clear_all_ads(conn: &Connection) -> Result<usize, rusqlite::Error> {
    let n = conn.execute("DELETE FROM ads", [])?;
    Ok(n)
}

/// Delete ads whose source exactly matches the given string (e.g. query). Used for replace mode.
pub fn delete_ads_by_source(conn: &Connection, source: &str) -> Result<usize, rusqlite::Error> {
    let n = conn.execute("DELETE FROM ads WHERE source = ?1", rusqlite::params![source])?;
    Ok(n)
}

/// Insert a batch of ads in a transaction.
pub fn insert_ads(
    conn: &Connection,
    ads: &[(Option<String>, Option<String>, Option<String>, Option<String>, Option<String>, Option<String>)],
) -> Result<usize, rusqlite::Error> {
    if ads.is_empty() {
        return Ok(0);
    }
    let mut stmt = conn.prepare(
        "INSERT INTO ads (content, hook, emotion, offer, audience, source) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
    )?;
    let mut count = 0;
    for (content, hook, emotion, offer, audience, source) in ads {
        stmt.execute(rusqlite::params![
            content,
            hook,
            emotion,
            offer,
            audience,
            source,
        ])?;
        count += 1;
    }
    Ok(count)
}

/// List ads with optional filter by source (e.g. query string). Limit 1000.
pub fn list_ads(
    conn: &Connection,
    source_filter: Option<&str>,
    limit: i32,
) -> Result<Vec<AdRow>, rusqlite::Error> {
    let limit = limit.clamp(1, 10_000);
    let mut out = Vec::new();
    if let Some(s) = source_filter {
        let pattern = format!("%{}%", s);
        let mut stmt = conn.prepare(
            "SELECT id, content, hook, emotion, offer, audience, source, created_at FROM ads WHERE source LIKE ?1 ORDER BY id DESC LIMIT ?2",
        )?;
        let rows = stmt.query_map(rusqlite::params![pattern, limit], row_to_ad)?;
        for row in rows {
            out.push(row?);
        }
    } else {
        let mut stmt = conn.prepare(
            "SELECT id, content, hook, emotion, offer, audience, source, created_at FROM ads ORDER BY id DESC LIMIT ?1",
        )?;
        let rows = stmt.query_map(rusqlite::params![limit], row_to_ad)?;
        for row in rows {
            out.push(row?);
        }
    }
    Ok(out)
}

fn row_to_ad(row: &rusqlite::Row<'_>) -> Result<AdRow, rusqlite::Error> {
    Ok(AdRow {
        id: row.get(0)?,
        content: row.get(1)?,
        hook: row.get(2)?,
        emotion: row.get(3)?,
        offer: row.get(4)?,
        audience: row.get(5)?,
        source: row.get(6)?,
        created_at: row.get(7)?,
    })
}

/// Update pattern fields for one ad.
pub fn update_ad_patterns(
    conn: &Connection,
    id: i64,
    hook: Option<&str>,
    emotion: Option<&str>,
    offer: Option<&str>,
    audience: Option<&str>,
) -> Result<(), rusqlite::Error> {
    conn.execute(
        "UPDATE ads SET hook = ?1, emotion = ?2, offer = ?3, audience = ?4 WHERE id = ?5",
        rusqlite::params![hook, emotion, offer, audience, id],
    )?;
    Ok(())
}

/// Fetch ad ids and content for analysis (by ids or all).
pub fn get_ads_content(
    conn: &Connection,
    ad_ids: Option<&[i64]>,
) -> Result<Vec<(i64, Option<String>)>, rusqlite::Error> {
    let mut out = Vec::new();
    if let Some(ids) = ad_ids {
        if ids.is_empty() {
            return Ok(out);
        }
        let placeholders = ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let sql = format!(
            "SELECT id, content FROM ads WHERE id IN ({})",
            placeholders
        );
        let mut stmt = conn.prepare(&sql)?;
        let params: Vec<&dyn rusqlite::ToSql> = ids.iter().map(|i| i as &dyn rusqlite::ToSql).collect();
        let rows = stmt.query_map(rusqlite::params_from_iter(params), |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, Option<String>>(1)?))
        })?;
        for row in rows {
            out.push(row?);
        }
    } else {
        let mut stmt = conn.prepare("SELECT id, content FROM ads")?;
        let rows = stmt.query_map([], |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, Option<String>>(1)?))
        })?;
        for row in rows {
            out.push(row?);
        }
    }
    Ok(out)
}

/// Aggregated counts for charts: hook, emotion, offer (label -> count).
#[derive(Debug, serde::Serialize)]
pub struct PatternStats {
    pub hooks: Vec<(String, i64)>,
    pub emotions: Vec<(String, i64)>,
    pub offers: Vec<(String, i64)>,
}

/// Insert or replace verified email result. Test flags: 1 = pass, 0 = fail (optional for backward compat).
pub fn upsert_verified_email(
    conn: &Connection,
    email: &str,
    status: &str,
    quality: &str,
    syntax_ok: Option<bool>,
    mx_ok: Option<bool>,
    disposable_ok: Option<bool>,
) -> Result<(), rusqlite::Error> {
    let s = syntax_ok.map(|b| if b { 1i32 } else { 0 });
    let m = mx_ok.map(|b| if b { 1i32 } else { 0 });
    let d = disposable_ok.map(|b| if b { 1i32 } else { 0 });
    conn.execute(
        "INSERT OR REPLACE INTO verified_emails (email, status, quality, verified_at, syntax_ok, mx_ok, disposable_ok) VALUES (?1, ?2, ?3, datetime('now'), ?4, ?5, ?6)",
        rusqlite::params![email, status, quality, s, m, d],
    )?;
    Ok(())
}

/// List verified emails with optional status filter.
#[derive(Debug, serde::Serialize, ts_rs::TS)]
#[ts(export)]
pub struct VerifiedEmailRow {
    pub email: String,
    pub status: String,
    pub quality: String,
    pub verified_at: Option<String>,
    /// 1 = pass, 0 = fail, NULL = unknown (old row)
    pub syntax_ok: Option<i32>,
    pub mx_ok: Option<i32>,
    pub disposable_ok: Option<i32>,
}

fn row_to_verified_email(row: &rusqlite::Row) -> Result<VerifiedEmailRow, rusqlite::Error> {
    Ok(VerifiedEmailRow {
        email: row.get(0)?,
        status: row.get(1)?,
        quality: row.get(2)?,
        verified_at: row.get(3)?,
        syntax_ok: row.get::<_, Option<i32>>(4)?,
        mx_ok: row.get::<_, Option<i32>>(5)?,
        disposable_ok: row.get::<_, Option<i32>>(6)?,
    })
}

pub fn list_verified_emails(
    conn: &Connection,
    status_filter: Option<&str>,
    search: Option<&str>,
    limit: i32,
    offset: i32,
) -> Result<Vec<VerifiedEmailRow>, rusqlite::Error> {
    let limit = limit.clamp(1, 50_000);
    let offset = offset.max(0);
    let sel = "SELECT email, status, quality, verified_at, syntax_ok, mx_ok, disposable_ok FROM verified_emails";
    let order_limit = format!(" ORDER BY verified_at DESC LIMIT {} OFFSET {}", limit, offset);
    let rows = match (status_filter, search) {
        (Some(s), Some(q)) => {
            let sql = format!("{} WHERE status = ?1 AND email LIKE ?2 {}", sel, order_limit);
            let like = format!("%{}%", q);
            conn.prepare(&sql)?
                .query_map(rusqlite::params![s, like], |row| row_to_verified_email(row))?
                .collect::<Result<Vec<_>, _>>()?
        }
        (Some(s), None) => {
            let sql = format!("{} WHERE status = ?1 {}", sel, order_limit);
            conn.prepare(&sql)?
                .query_map(rusqlite::params![s], |row| row_to_verified_email(row))?
                .collect::<Result<Vec<_>, _>>()?
        }
        (None, Some(q)) => {
            let sql = format!("{} WHERE email LIKE ?1 {}", sel, order_limit);
            let like = format!("%{}%", q);
            conn.prepare(&sql)?
                .query_map(rusqlite::params![like], |row| row_to_verified_email(row))?
                .collect::<Result<Vec<_>, _>>()?
        }
        (None, None) => {
            let sql = format!("{}{}", sel, order_limit);
            conn.prepare(&sql)?
                .query_map([], |row| row_to_verified_email(row))?
                .collect::<Result<Vec<_>, _>>()?
        }
    };
    Ok(rows)
}

/// Count verified emails with same filters as list_verified_emails.
pub fn count_verified_emails(
    conn: &Connection,
    status_filter: Option<&str>,
    search: Option<&str>,
) -> Result<i64, rusqlite::Error> {
    let count_sql = "SELECT COUNT(*) FROM verified_emails";
    let count: i64 = match (status_filter, search) {
        (Some(s), Some(q)) => {
            let like = format!("%{}%", q);
            conn.query_row(
                &format!("{} WHERE status = ?1 AND email LIKE ?2", count_sql),
                rusqlite::params![s, like],
                |row| row.get(0),
            )?
        }
        (Some(s), None) => {
            conn.query_row(
                &format!("{} WHERE status = ?1", count_sql),
                rusqlite::params![s],
                |row| row.get(0),
            )?
        }
        (None, Some(q)) => {
            let like = format!("%{}%", q);
            conn.query_row(
                &format!("{} WHERE email LIKE ?1", count_sql),
                rusqlite::params![like],
                |row| row.get(0),
            )?
        }
        (None, None) => conn.query_row(count_sql, [], |row| row.get(0))?,
    };
    Ok(count)
}

pub fn get_pattern_stats(conn: &Connection) -> Result<PatternStats, rusqlite::Error> {
    let hooks = {
        let mut stmt = conn.prepare("SELECT hook, COUNT(*) FROM ads WHERE hook IS NOT NULL AND hook != '' GROUP BY hook ORDER BY COUNT(*) DESC LIMIT 20")?;
        let rows = stmt.query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?)))?;
        rows.collect::<Result<Vec<_>, _>>()?
    };
    let emotions = {
        let mut stmt = conn.prepare("SELECT emotion, COUNT(*) FROM ads WHERE emotion IS NOT NULL AND emotion != '' GROUP BY emotion ORDER BY COUNT(*) DESC LIMIT 20")?;
        let rows = stmt.query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?)))?;
        rows.collect::<Result<Vec<_>, _>>()?
    };
    let offers = {
        let mut stmt = conn.prepare("SELECT offer, COUNT(*) FROM ads WHERE offer IS NOT NULL AND offer != '' GROUP BY offer ORDER BY COUNT(*) DESC LIMIT 20")?;
        let rows = stmt.query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?)))?;
        rows.collect::<Result<Vec<_>, _>>()?
    };
    Ok(PatternStats { hooks, emotions, offers })
}

/// Store or replace embedding for an ad. Embedding is stored as JSON array of f64.
pub fn upsert_ad_embedding(conn: &Connection, ad_id: i64, embedding: &[f32]) -> Result<(), rusqlite::Error> {
    let json: String = serde_json::to_string(
        &embedding
            .iter()
            .map(|&f| f as f64)
            .collect::<Vec<_>>(),
    )
    .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    conn.execute("INSERT OR REPLACE INTO ad_embeddings (ad_id, embedding) VALUES (?1, ?2)", rusqlite::params![ad_id, json])?;
    Ok(())
}

/// Get ad content, hook, offer for given ad ids. Preserves order of ids.
pub fn get_ads_by_ids(conn: &Connection, ids: &[i64]) -> Result<Vec<(String, String, String)>, rusqlite::Error> {
    let mut out = Vec::with_capacity(ids.len());
    for &id in ids {
        let row = conn.query_row(
            "SELECT content, hook, offer FROM ads WHERE id = ?1",
            rusqlite::params![id],
            |row| {
                Ok((
                    row.get::<_, Option<String>>(0)?.unwrap_or_default(),
                    row.get::<_, Option<String>>(1)?.unwrap_or_default(),
                    row.get::<_, Option<String>>(2)?.unwrap_or_default(),
                ))
            },
        )?;
        out.push(row);
    }
    Ok(out)
}

/// Load all ad embeddings for similarity search. Returns (ad_id, embedding).
pub fn get_all_ad_embeddings(conn: &Connection) -> Result<Vec<(i64, Vec<f32>)>, rusqlite::Error> {
    let mut stmt = conn.prepare("SELECT ad_id, embedding FROM ad_embeddings")?;
    let rows = stmt.query_map([], |row| {
        let ad_id: i64 = row.get(0)?;
        let json: String = row.get(1)?;
        let vec: Vec<f64> = serde_json::from_str(&json).map_err(|_| rusqlite::Error::InvalidQuery)?;
        Ok((ad_id, vec.into_iter().map(|f| f as f32).collect()))
    })?;
    rows.collect()
}
