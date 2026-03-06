//! Email verification: syntax, DNS/MX, disposable detection, optional SMTP ping.
//! MillionVerifier-style flow for single and bulk.

use regex::Regex;
use trust_dns_resolver::config::{ResolverConfig, ResolverOpts};
use trust_dns_resolver::TokioAsyncResolver;

/// Verification result status.
#[derive(Debug, Clone, serde::Serialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum VerifyStatus {
    Ok,
    Invalid,
    Disposable,
    CatchAll,
    Unknown,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct VerifyResult {
    pub email: String,
    pub status: VerifyStatus,
    pub quality: String, // "good" | "bad" | "risky"
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
        };
    }
    if !check_syntax(&email) {
        return VerifyResult {
            email: email.clone(),
            status: VerifyStatus::Invalid,
            quality: "bad".to_string(),
        };
    }
    let domain = email.split('@').nth(1).unwrap_or("");
    if is_disposable_domain(domain) {
        return VerifyResult {
            email: email.clone(),
            status: VerifyStatus::Disposable,
            quality: "bad".to_string(),
        };
    }
    let has_mx = check_mx(domain).await;
    if !has_mx {
        return VerifyResult {
            email: email.clone(),
            status: VerifyStatus::Invalid,
            quality: "bad".to_string(),
        };
    }
    // Could add SMTP RCPT TO here; for now we report Ok if MX exists.
    VerifyResult {
        email: email.clone(),
        status: VerifyStatus::Ok,
        quality: "good".to_string(),
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
