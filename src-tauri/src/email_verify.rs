//! Email verification: syntax, DNS/MX, disposable detection, optional SMTP ping.
//! MillionVerifier-style flow for single and bulk.

use regex::Regex;
use trust_dns_resolver::config::{ResolverConfig, ResolverOpts};
use trust_dns_resolver::TokioAsyncResolver;

/// Verification result status.
#[derive(Debug, Clone, serde::Serialize, PartialEq, ts_rs::TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum VerifyStatus {
    Ok,
    Invalid,
    Disposable,
    CatchAll,
    Unknown,
}

/// Per-check results: which verification tests passed (syntax, not disposable, MX).
#[derive(Debug, Clone, serde::Serialize, ts_rs::TS)]
#[ts(export)]
pub struct VerifyTests {
    pub syntax: bool,
    pub disposable: bool, // true = not disposable (pass)
    pub mx: bool,
}

#[derive(Debug, Clone, serde::Serialize, ts_rs::TS)]
#[ts(export)]
pub struct VerifyResult {
    pub email: String,
    pub status: VerifyStatus,
    pub quality: String, // "good" | "bad" | "risky"
    pub tests: VerifyTests,
}

/// Basic RFC-style email syntax check (simplified).
fn check_syntax(email: &str) -> bool {
    let re = Regex::new(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$").unwrap();
    re.is_match(email.trim()) && email.len() <= 254
}

/// Common disposable/temporary email domains (subset).
const DISPOSABLE_DOMAINS: &[&str] = &[
    "tempmail.com",
    "throwaway.email",
    "guerrillamail.com",
    "mailinator.com",
    "10minutemail.com",
    "temp-mail.org",
    "fakeinbox.com",
    "trashmail.com",
    "yopmail.com",
    "getnada.com",
];

fn is_disposable_domain(domain: &str) -> bool {
    let d = domain.to_lowercase();
    DISPOSABLE_DOMAINS.iter().any(|&s| d == s || d.ends_with(&format!(".{}", s)))
}

/// Check MX records for domain (async). Returns true if at least one MX exists.
async fn check_mx(domain: &str) -> bool {
    let resolver = TokioAsyncResolver::tokio(ResolverConfig::default(), ResolverOpts::default());
    let name = match domain.parse::<trust_dns_resolver::Name>() {
        Ok(n) => n,
        Err(_) => return false,
    };
    match resolver.mx_lookup(name).await {
        Ok(lookup) => lookup.iter().next().is_some(),
        Err(_) => false,
    }
}

/// Verify a single email (syntax, disposable, MX). SMTP ping is optional and can be added later.
pub async fn verify_email(email: &str) -> VerifyResult {
    let email = email.trim().to_string();
    if email.is_empty() {
        return VerifyResult {
            email: email.clone(),
            status: VerifyStatus::Invalid,
            quality: "bad".to_string(),
            tests: VerifyTests { syntax: false, disposable: false, mx: false },
        };
    }
    let syntax_ok = check_syntax(&email);
    if !syntax_ok {
        return VerifyResult {
            email: email.clone(),
            status: VerifyStatus::Invalid,
            quality: "bad".to_string(),
            tests: VerifyTests { syntax: false, disposable: false, mx: false },
        };
    }
    let domain = email.split('@').nth(1).unwrap_or("");
    let disposable_ok = !is_disposable_domain(domain);
    if !disposable_ok {
        return VerifyResult {
            email: email.clone(),
            status: VerifyStatus::Disposable,
            quality: "bad".to_string(),
            tests: VerifyTests { syntax: true, disposable: false, mx: false },
        };
    }
    let has_mx = check_mx(domain).await;
    if !has_mx {
        return VerifyResult {
            email: email.clone(),
            status: VerifyStatus::Invalid,
            quality: "bad".to_string(),
            tests: VerifyTests { syntax: true, disposable: true, mx: false },
        };
    }
    VerifyResult {
        email: email.clone(),
        status: VerifyStatus::Ok,
        quality: "good".to_string(),
        tests: VerifyTests { syntax: true, disposable: true, mx: true },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_syntax() {
        assert!(check_syntax("a@b.co"));
        assert!(check_syntax("user+tag@example.com"));
        assert!(!check_syntax("invalid"));
        assert!(!check_syntax("@nodomain.com"));
    }

    #[test]
    fn test_disposable() {
        assert!(is_disposable_domain("tempmail.com"));
        assert!(is_disposable_domain("sub.mailinator.com"));
        assert!(!is_disposable_domain("gmail.com"));
    }
}
