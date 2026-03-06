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

/// Initialize or upgrade database schema.
pub fn init_db(db_path: &Path) -> Result<(), rusqlite::Error> {
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent).expect("failed to create app data dir");
    }
    let conn = Connection::open(db_path)?;
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
    Ok(())
}

/// Single ad row for JSON serialization.
#[derive(Debug, serde::Serialize)]
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

/// Insert or replace verified email result.
pub fn upsert_verified_email(
    conn: &Connection,
    email: &str,
    status: &str,
    quality: &str,
) -> Result<(), rusqlite::Error> {
    conn.execute(
        "INSERT OR REPLACE INTO verified_emails (email, status, quality, verified_at) VALUES (?1, ?2, ?3, datetime('now'))",
        rusqlite::params![email, status, quality],
    )?;
    Ok(())
}

/// List verified emails with optional status filter.
#[derive(Debug, serde::Serialize)]
pub struct VerifiedEmailRow {
    pub email: String,
    pub status: String,
    pub quality: String,
    pub verified_at: Option<String>,
}

pub fn list_verified_emails(
    conn: &Connection,
    status_filter: Option<&str>,
    limit: i32,
) -> Result<Vec<VerifiedEmailRow>, rusqlite::Error> {
    let limit = limit.clamp(1, 50_000);
    let mut out = Vec::new();
    if let Some(s) = status_filter {
        let mut stmt = conn.prepare(
            "SELECT email, status, quality, verified_at FROM verified_emails WHERE status = ?1 ORDER BY verified_at DESC LIMIT ?2",
        )?;
        let rows = stmt.query_map(rusqlite::params![s, limit], |row| {
            Ok(VerifiedEmailRow {
                email: row.get(0)?,
                status: row.get(1)?,
                quality: row.get(2)?,
                verified_at: row.get(3)?,
            })
        })?;
        for row in rows {
            out.push(row?);
        }
    } else {
        let mut stmt = conn.prepare(
            "SELECT email, status, quality, verified_at FROM verified_emails ORDER BY verified_at DESC LIMIT ?1",
        )?;
        let rows = stmt.query_map(rusqlite::params![limit], |row| {
            Ok(VerifiedEmailRow {
                email: row.get(0)?,
                status: row.get(1)?,
                quality: row.get(2)?,
                verified_at: row.get(3)?,
            })
        })?;
        for row in rows {
            out.push(row?);
        }
    }
    Ok(out)
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
