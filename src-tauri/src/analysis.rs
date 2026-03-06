//! Pattern extraction for ad copy: hooks, emotions, offers, audience.
//! Uses regex and keyword lists; optional candle/ML can be added later.

use std::collections::HashMap;

/// Keyword lists for pattern detection (lowercase match).
const HOOK_PATTERNS: &[(&str, &str)] = &[
    ("save time", "Save time"),
    ("free trial", "Free trial"),
    ("get started", "Get started fast"),
    ("limited time", "Limited time"),
    ("don't miss", "Urgency"),
    ("join", "Join"),
    ("discover", "Discover"),
    ("transform", "Transform"),
    ("unlock", "Unlock"),
];

const EMOTION_PATTERNS: &[(&str, &str)] = &[
    ("relief", "relief"),
    ("fear", "fear"),
    ("fomo", "fomo"),
    ("trust", "trust"),
    ("excitement", "excitement"),
    ("curiosity", "curiosity"),
    ("guilt", "guilt"),
];

const OFFER_PATTERNS: &[(&str, &str)] = &[
    ("free trial", "Free trial"),
    ("discount", "Discount"),
    ("% off", "Percent off"),
    ("free", "Free"),
    ("bonus", "Bonus"),
    ("guarantee", "Guarantee"),
    ("no credit card", "No credit card"),
];

const AUDIENCE_PATTERNS: &[(&str, &str)] = &[
    ("startup", "startups"),
    ("founder", "founders"),
    ("marketer", "marketers"),
    ("developer", "developers"),
    ("small business", "small business"),
    ("enterprise", "enterprise"),
];

/// Result of analyzing one ad copy.
#[derive(Debug, Clone, Default, serde::Serialize)]
pub struct PatternAnalysis {
    pub hook: Option<String>,
    pub emotion: Option<String>,
    pub offer: Option<String>,
    pub audience: Option<String>,
}

/// Analyze ad copy and return extracted patterns (first match per category).
pub fn analyze_ad_copy(content: &str) -> PatternAnalysis {
    let lower = content.to_lowercase();
    let mut out = PatternAnalysis::default();

    for (pattern, label) in HOOK_PATTERNS {
        if lower.contains(pattern) {
            out.hook = Some((*label).to_string());
            break;
        }
    }
    for (pattern, label) in EMOTION_PATTERNS {
        if lower.contains(pattern) {
            out.emotion = Some((*label).to_string());
            break;
        }
    }
    for (pattern, label) in OFFER_PATTERNS {
        if lower.contains(pattern) {
            out.offer = Some((*label).to_string());
            break;
        }
    }
    for (pattern, label) in AUDIENCE_PATTERNS {
        if lower.contains(pattern) {
            out.audience = Some((*label).to_string());
            break;
        }
    }

    out
}

/// Returns a HashMap suitable for JSON (key -> value string).
pub fn analyze_ad_copy_map(content: &str) -> HashMap<String, String> {
    let a = analyze_ad_copy(content);
    let mut m = HashMap::new();
    if let Some(v) = a.hook {
        m.insert("hook".to_string(), v);
    }
    if let Some(v) = a.emotion {
        m.insert("emotion".to_string(), v);
    }
    if let Some(v) = a.offer {
        m.insert("offer".to_string(), v);
    }
    if let Some(v) = a.audience {
        m.insert("audience".to_string(), v);
    }
    m
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_analyze_ad_copy() {
        let text = "Save time and grow your business. Free trial — no credit card required. Built for startups.";
        let a = analyze_ad_copy(text);
        assert_eq!(a.hook.as_deref(), Some("Save time"));
        assert_eq!(a.offer.as_deref(), Some("Free trial"));
        assert_eq!(a.audience.as_deref(), Some("startups"));
    }
}
