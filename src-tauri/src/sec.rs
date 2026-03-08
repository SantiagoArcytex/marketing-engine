//! SEC EDGAR API client. No API key required; User-Agent header required.
//! Rate limit: 10 requests per second. See https://www.sec.gov/developer.

use reqwest::blocking::Client;
use serde::Deserialize;
use std::collections::HashMap;
use std::time::Duration;

const USER_AGENT: &str = "MarketingIntelligenceEngine/1.0 contact@example.com";
const COMPANY_TICKERS_URL: &str = "https://www.sec.gov/files/company_tickers.json";
const SUBMISSIONS_BASE: &str = "https://data.sec.gov/submissions";

/// One row from SEC company_tickers.json (ticker symbol -> CIK, title).
#[derive(Debug, Clone, serde::Serialize, ts_rs::TS)]
#[ts(export)]
pub struct CompanyTickerRow {
    pub cik_str: u32,
    pub ticker: String,
    pub title: String,
}

/// Recent filing metadata from submissions JSON.
#[derive(Debug, Clone, serde::Serialize, ts_rs::TS)]
#[ts(export)]
pub struct FilingSummary {
    pub form: String,
    pub description: String,
    pub filing_date: String,
    pub accession_number: String,
}

#[derive(Debug, Deserialize)]
struct CompanyTickerEntry {
    cik_str: u32,
    ticker: String,
    title: String,
}

#[derive(Debug, Deserialize)]
struct SubmissionsResponse {
    #[serde(rename = "cik")]
    cik: Option<u32>,
    #[serde(rename = "recent")]
    recent: Option<RecentFilings>,
}

#[derive(Debug, Deserialize)]
struct RecentFilings {
    #[serde(rename = "form")]
    form: Option<Vec<String>>,
    #[serde(rename = "primaryDocument")]
    primary_document: Option<Vec<String>>,
    #[serde(rename = "filingDate")]
    filing_date: Option<Vec<String>>,
    #[serde(rename = "accessionNumber")]
    accession_number: Option<Vec<String>>,
    #[serde(rename = "primaryDocDescription")]
    primary_doc_description: Option<Vec<String>>,
}

fn client() -> Result<Client, String> {
    Client::builder()
        .timeout(Duration::from_secs(30))
        .user_agent(USER_AGENT)
        .build()
        .map_err(|e| e.to_string())
}

/// Pad CIK to 10 digits for SEC URLs.
fn pad_cik(cik: u32) -> String {
    format!("{:0>10}", cik)
}

/// Fetch company tickers mapping (ticker/cik/title). SEC requires User-Agent.
pub fn fetch_company_tickers() -> Result<Vec<CompanyTickerRow>, String> {
    let client = client()?;
    let res = client
        .get(COMPANY_TICKERS_URL)
        .send()
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("SEC HTTP {}", res.status()));
    }
    let json: HashMap<String, CompanyTickerEntry> = res.json().map_err(|e| e.to_string())?;
    let mut rows: Vec<CompanyTickerRow> = json
        .into_values()
        .map(|e| CompanyTickerRow {
            cik_str: e.cik_str,
            ticker: e.ticker,
            title: e.title,
        })
        .collect();
    rows.sort_by(|a, b| a.ticker.cmp(&b.ticker));
    Ok(rows)
}

/// Resolve ticker symbol or CIK string to zero-padded CIK. Returns None if not found.
pub fn resolve_cik(ticker_or_cik: &str, tickers: &[CompanyTickerRow]) -> Option<String> {
    let s = ticker_or_cik.trim().to_uppercase();
    if s.is_empty() {
        return None;
    }
    // If it looks like a number (CIK), pad and return.
    if s.chars().all(|c| c.is_ascii_digit()) {
        let cik: u32 = s.parse().ok()?;
        return Some(pad_cik(cik));
    }
    // Look up by ticker.
    for row in tickers {
        if row.ticker.to_uppercase() == s {
            return Some(pad_cik(row.cik_str));
        }
    }
    None
}

/// Fetch submissions (recent filings) for a CIK. CIK must be 10-digit padded.
pub fn fetch_submissions(cik: &str) -> Result<Vec<FilingSummary>, String> {
    let cik_clean = cik.trim().trim_start_matches('0');
    let cik_num: u32 = cik_clean.parse().map_err(|_| "Invalid CIK")?;
    let cik_padded = pad_cik(cik_num);
    let url = format!("{}/CIK{}.json", SUBMISSIONS_BASE, cik_padded);

    std::thread::sleep(Duration::from_millis(150)); // stay under 10 req/s

    let client = client()?;
    let res = client.get(&url).send().map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("SEC HTTP {} for CIK {}", res.status(), cik_padded));
    }
    let sub: SubmissionsResponse = res.json().map_err(|e| e.to_string())?;
    let recent = sub.recent.ok_or("No recent filings in response")?;
    let forms = recent.form.as_deref().unwrap_or(&[]);
    let dates = recent.filing_date.as_deref().unwrap_or(&[]);
    let accessions = recent.accession_number.as_deref().unwrap_or(&[]);
    let descs = recent.primary_doc_description.as_deref().unwrap_or(&[]);

    let important = ["10-K", "10-Q", "S-1", "8-K", "DEF 14A"];
    let mut out = Vec::new();
    for (i, form) in forms.iter().enumerate() {
        let form = form.as_str();
        if !important.contains(&form) {
            continue;
        }
        let description = descs.get(i).map(|s| s.replace(['\n', '\r'], " ")).unwrap_or_default();
        let filing_date = dates.get(i).cloned().unwrap_or_default();
        let accession_number = accessions.get(i).cloned().unwrap_or_default();
        out.push(FilingSummary {
            form: form.to_string(),
            description,
            filing_date,
            accession_number,
        });
        if out.len() >= 15 {
            break;
        }
    }
    Ok(out)
}

/// Build a short SEC context string for the AI: recent filings for given tickers (e.g. ["META", "GOOGL"]).
/// Used by build_chat_context to include SEC data when available.
pub fn build_sec_context(tickers: &[String]) -> String {
    let tickers_list = match fetch_company_tickers() {
        Ok(t) => t,
        Err(_) => return String::new(),
    };
    let mut out = String::new();
    out.push_str("\n## SEC EDGAR (recent filings)\n");
    for ticker in tickers.iter().take(5) {
        let Some(cik) = resolve_cik(ticker, &tickers_list) else {
            continue;
        };
        std::thread::sleep(Duration::from_millis(200));
        let Ok(filings) = fetch_submissions(&cik) else {
            continue;
        };
        let title = tickers_list
            .iter()
            .find(|r| pad_cik(r.cik_str) == cik)
            .map(|r| r.title.as_str())
            .unwrap_or(ticker);
        out.push_str(&format!("**{} ({})**\n", title, ticker));
        for f in filings.iter().take(5) {
            out.push_str(&format!("- {} ({}) {}\n", f.form, f.filing_date, f.description));
        }
        out.push('\n');
    }
    if out.trim_end() == "## SEC EDGAR (recent filings)" {
        out.push_str("(none; add tickers or check network)\n");
    }
    out
}
