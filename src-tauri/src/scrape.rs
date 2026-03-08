//! Scraping layer: fetch pages, parse HTML, extract ad-like content.
//! Uses reqwest for HTTP and scraper for HTML. headless_chrome for JS-heavy "Power Mode".

use headless_chrome::Browser;
use scraper::{Html, Selector};
use std::time::Duration;

/// One ad snippet to be stored in the DB.
pub struct AdSnippet {
    pub content: Option<String>,
    pub hook: Option<String>,
    pub emotion: Option<String>,
    pub offer: Option<String>,
    pub audience: Option<String>,
    pub source: Option<String>,
}

/// Fetches HTML at `url` with a 15s timeout. Returns body text or error.
pub fn fetch_url_html(url: &str) -> Result<String, String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(15))
        .user_agent("MarketingIntelligenceEngine/1.0")
        .build()
        .map_err(|e| e.to_string())?;
    let res = client
        .get(url)
        .send()
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("HTTP {}", res.status()));
    }
    let body = res.text().map_err(|e| e.to_string())?;
    Ok(body)
}

/// Parses HTML and returns text snippets that look like ad copy (e.g. from common containers).
/// Looks for p, h1-h3, and elements with common ad-like class substrings.
pub fn parse_ad_snippets(html: &str) -> Vec<String> {
    let document = Html::parse_document(html);
    let mut snippets = Vec::new();

    for selector in &["p", "h1", "h2", "h3", "[class*='ad']", "[class*='copy']"] {
        if let Ok(sel) = Selector::parse(selector) {
            for el in document.select(&sel) {
                let text = el.text().collect::<String>();
                let text = text.trim();
                if text.len() >= 10 && text.len() <= 2000 {
                    snippets.push(text.to_string());
                }
            }
        }
    }

    // Dedupe by content
    snippets.sort();
    snippets.dedup();
    snippets
}

/// Demo snippets: varied hooks, emotions, offers, audiences for pattern charts.
const DEMO_SNIPPETS: &[(&str, &str, &str, &str, &str)] = &[
    ("Save time and grow your business with our solution.", "Save time", "", "", ""),
    ("Free trial — no credit card required. Join 10k+ users.", "Free trial", "relief", "Free trial", ""),
    ("Get started in 5 minutes. Built for startups.", "Get started fast", "", "", "startups"),
    ("Stop wasting time. Automate your workflow today.", "Stop wasting time", "frustration", "Automation", "busy professionals"),
    ("Limited offer: 50% off for the first 100 signups.", "Limited offer", "urgency", "50% off", ""),
    ("Join thousands of satisfied customers. See why they switched.", "Join thousands", "trust", "Switch today", ""),
    ("The easiest way to get results. No setup required.", "Easiest way", "relief", "No setup", ""),
    ("Don't miss out. Exclusive deal ends soon.", "Don't miss out", "urgency", "Exclusive deal", ""),
    ("Built for teams like yours. Scale without the hassle.", "Built for teams", "", "Scale", "teams"),
    ("Why wait? Start your free trial in under 2 minutes.", "Why wait?", "impatience", "Free trial", ""),
    ("Trusted by 500+ companies. Join them today.", "Trusted by 500+", "trust", "Join today", ""),
    ("Finally, a solution that just works. Try it free.", "Finally", "relief", "Try free", ""),
    ("Get more done in less time. Built for productivity.", "Get more done", "", "Productivity", "professionals"),
    ("Special launch pricing — lock in your rate now.", "Special launch", "urgency", "Launch pricing", ""),
    ("See results in 24 hours or your money back.", "See results in 24h", "confidence", "Money-back", ""),
    ("The only tool you need. Replace 5 apps with one.", "The only tool", "", "All-in-one", ""),
    ("Join 50k+ users who already switched. You're next.", "Join 50k+", "FOMO", "Switch", ""),
    ("No credit card required. Start free, upgrade when ready.", "No credit card", "relief", "Start free", ""),
];

/// Scrape mode: "static" = demo/reqwest HTML, "browser" = headless Chrome for JS-heavy pages.
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum ScrapeMode {
    Static,
    Browser,
}

/// Scrapes "ads" for a given query. For now uses a demo flow: generate placeholder rows
/// so the pipeline is testable without hitting Meta. Replace with headless_chrome + Ad Library when needed.
/// `limit` caps how many snippets to return (e.g. 50 for future real scraping); None = use all demo snippets.
pub fn fetch_ads_for_query(query: &str, limit: Option<usize>) -> Result<Vec<AdSnippet>, String> {
    let source = query.to_string();
    let mut out: Vec<AdSnippet> = DEMO_SNIPPETS
        .iter()
        .map(|(content, hook, emotion, offer, audience)| AdSnippet {
            content: Some(format!("{} for \"{}\". {}", query, query, content)),
            hook: Some((*hook).to_string()),
            emotion: if emotion.is_empty() { None } else { Some((*emotion).to_string()) },
            offer: if offer.is_empty() { None } else { Some((*offer).to_string()) },
            audience: if audience.is_empty() { None } else { Some((*audience).to_string()) },
            source: Some(source.clone()),
        })
        .collect();
    if let Some(max) = limit {
        out.truncate(max);
    }
    Ok(out)
}

/// Fetch HTML from a URL using headless Chrome (for JS-rendered pages). Waits briefly then returns body innerHTML.
/// proxy_url: optional proxy (e.g. "http://proxy:8080" or "socks5://…"). Must be http/https/socks5.
pub fn fetch_html_browser(url: &str, proxy_url: Option<&str>) -> Result<String, String> {
    let browser = if let Some(proxy) = proxy_url {
        let proxy = proxy.trim();
        if proxy.is_empty() {
            Browser::default().map_err(|e| e.to_string())?
        } else {
            let opts = headless_chrome::browser::LaunchOptionsBuilder::default()
                .proxy_server(Some(proxy))
                .build()
                .map_err(|e| e.to_string())?;
            Browser::new(opts).map_err(|e| e.to_string())?
        }
    } else {
        Browser::default().map_err(|e| e.to_string())?
    };
    let tab = browser.new_tab().map_err(|e| e.to_string())?;
    tab.navigate_to(url).map_err(|e| e.to_string())?;
    tab.wait_for_element("body").map_err(|e| e.to_string())?;
    std::thread::sleep(Duration::from_secs(2));
    let html = tab
        .evaluate("document.body ? document.body.innerHTML : document.documentElement.outerHTML", false)
        .map_err(|e| e.to_string())?
        .value
        .and_then(|v| v.as_str().map(String::from))
        .ok_or_else(|| "Failed to get HTML".to_string())?;
    Ok(html)
}

/// Scrape ad snippets from a URL using headless browser, then run pattern analysis on each snippet.
/// Source label is set to the query (e.g. the keyword or a short URL label).
pub fn fetch_ads_from_url_browser(
    url: &str,
    source_label: &str,
    limit: Option<usize>,
    proxy_url: Option<&str>,
) -> Result<Vec<AdSnippet>, String> {
    let html = fetch_html_browser(url, proxy_url)?;
    let snippets = parse_ad_snippets(&html);
    let analysis = crate::analysis::analyze_ad_copy;
    let source = Some(source_label.to_string());
    let mut out: Vec<AdSnippet> = snippets
        .into_iter()
        .map(|content| {
            let parsed = analysis(&content);
            AdSnippet {
                content: Some(content),
                hook: parsed.hook,
                emotion: parsed.emotion,
                offer: parsed.offer,
                audience: parsed.audience,
                source: source.clone(),
            }
        })
        .collect();
    if let Some(max) = limit {
        out.truncate(max);
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_ad_snippets() {
        let html = r#"
        <html><body>
        <p>Save time and grow your business with our solution.</p>
        <h2>Free trial — no credit card required.</h2>
        <div class="ad-copy">Get started in 5 minutes. Built for startups.</div>
        </body></html>
        "#;
        let snippets = parse_ad_snippets(html);
        assert!(!snippets.is_empty());
        assert!(snippets.iter().any(|s| s.contains("Save time")));
        assert!(snippets.iter().any(|s| s.contains("Free trial")));
    }

    #[test]
    fn test_fetch_ads_for_query_returns_demo_data() {
        let result = fetch_ads_for_query("AI tools", None).unwrap();
        assert!(result.len() >= 10);
        assert!(result.iter().all(|s| s.source.as_deref() == Some("AI tools")));
    }

    #[test]
    fn test_fetch_ads_for_query_respects_limit() {
        let result = fetch_ads_for_query("test", Some(5)).unwrap();
        assert_eq!(result.len(), 5);
    }
}
