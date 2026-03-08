const STORAGE_KEY = "ai-timeouts";

export type AITimeouts = {
  copywriting: number;
  chat: number;
  strategy: number;
};

const DEFAULTS: AITimeouts = {
  copywriting: 15,
  chat: 60,
  strategy: 120,
};

const MIN_MAX = {
  copywriting: { min: 5, max: 120 },
  chat: { min: 10, max: 300 },
  strategy: { min: 30, max: 600 },
} as const;

function clamp(value: number, key: keyof AITimeouts): number {
  const { min, max } = MIN_MAX[key];
  return Math.min(max, Math.max(min, value));
}

export function getAITimeouts(): AITimeouts {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<AITimeouts>;
    return {
      copywriting: clamp(Number(parsed.copywriting) || DEFAULTS.copywriting, "copywriting"),
      chat: clamp(Number(parsed.chat) || DEFAULTS.chat, "chat"),
      strategy: clamp(Number(parsed.strategy) || DEFAULTS.strategy, "strategy"),
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function setAITimeouts(next: Partial<AITimeouts>): AITimeouts {
  const current = getAITimeouts();
  const merged: AITimeouts = {
    copywriting: next.copywriting !== undefined ? clamp(next.copywriting, "copywriting") : current.copywriting,
    chat: next.chat !== undefined ? clamp(next.chat, "chat") : current.chat,
    strategy: next.strategy !== undefined ? clamp(next.strategy, "strategy") : current.strategy,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  } catch {
    // ignore
  }
  return merged;
}

export const AI_TIMEOUT_LIMITS = MIN_MAX;

// --- Scraping ---
const SCRAPE_STORAGE_KEY = "scrape-settings";

export type ScrapeSettings = {
  proxyUrl: string;
  rateLimitPerMinute: number; // 0 = no limit
};

const SCRAPE_DEFAULTS: ScrapeSettings = {
  proxyUrl: "",
  rateLimitPerMinute: 0,
};

export function getScrapeSettings(): ScrapeSettings {
  try {
    const raw = localStorage.getItem(SCRAPE_STORAGE_KEY);
    if (!raw) return { ...SCRAPE_DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<ScrapeSettings>;
    return {
      proxyUrl: typeof parsed.proxyUrl === "string" ? parsed.proxyUrl : SCRAPE_DEFAULTS.proxyUrl,
      rateLimitPerMinute: Math.max(0, Math.min(60, Number(parsed.rateLimitPerMinute) || 0)),
    };
  } catch {
    return { ...SCRAPE_DEFAULTS };
  }
}

export function setScrapeSettings(next: Partial<ScrapeSettings>): ScrapeSettings {
  const current = getScrapeSettings();
  const merged: ScrapeSettings = {
    proxyUrl: next.proxyUrl !== undefined ? next.proxyUrl : current.proxyUrl,
    rateLimitPerMinute: next.rateLimitPerMinute !== undefined ? Math.max(0, Math.min(60, next.rateLimitPerMinute)) : current.rateLimitPerMinute,
  };
  try {
    localStorage.setItem(SCRAPE_STORAGE_KEY, JSON.stringify(merged));
  } catch {
    // ignore
  }
  return merged;
}

// --- Chat context (SEC summarization) ---
const CHAT_SETTINGS_KEY = "chat-settings";

const NUM_CTX_MIN = 512;
const NUM_CTX_MAX = 16384;
const NUM_PREDICT_MIN = 256;
const NUM_PREDICT_MAX = 4096;

export type ChatSettings = {
  /** When set, SEC filings in chat context are summarized with this Ollama model (10-K highlights). */
  secSummaryModel: string;
  /** Context window size (num_ctx). Lower = faster, less context. */
  numCtx: number;
  /** Max tokens to generate (num_predict). Lower = faster, shorter replies. */
  numPredict: number;
  /** Ollama server URL. Use default unless you use a different server or port. */
  ollamaBaseUrl: string;
};

const CHAT_DEFAULTS: ChatSettings = {
  secSummaryModel: "",
  numCtx: 4096,
  numPredict: 2048,
  ollamaBaseUrl: "http://localhost:11434",
};

function clampNumCtx(n: number): number {
  return Math.max(NUM_CTX_MIN, Math.min(NUM_CTX_MAX, n));
}
function clampNumPredict(n: number): number {
  return Math.max(NUM_PREDICT_MIN, Math.min(NUM_PREDICT_MAX, n));
}

/** Validate Ollama base URL: must be http or https, no trailing slash. */
export function normalizeOllamaBaseUrl(url: string): string {
  const u = url.trim();
  if (!u) return CHAT_DEFAULTS.ollamaBaseUrl;
  const lower = u.toLowerCase();
  if (!lower.startsWith("http://") && !lower.startsWith("https://")) return CHAT_DEFAULTS.ollamaBaseUrl;
  return u.replace(/\/+$/, "");
}

export function getChatSettings(): ChatSettings {
  try {
    const raw = localStorage.getItem(CHAT_SETTINGS_KEY);
    if (!raw) return { ...CHAT_DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<ChatSettings>;
    return {
      secSummaryModel: typeof parsed.secSummaryModel === "string" ? parsed.secSummaryModel.trim() : CHAT_DEFAULTS.secSummaryModel,
      numCtx: clampNumCtx(Number(parsed.numCtx) || CHAT_DEFAULTS.numCtx),
      numPredict: clampNumPredict(Number(parsed.numPredict) || CHAT_DEFAULTS.numPredict),
      ollamaBaseUrl: typeof parsed.ollamaBaseUrl === "string" ? normalizeOllamaBaseUrl(parsed.ollamaBaseUrl) : CHAT_DEFAULTS.ollamaBaseUrl,
    };
  } catch {
    return { ...CHAT_DEFAULTS };
  }
}

export function setChatSettings(next: Partial<ChatSettings>): ChatSettings {
  const current = getChatSettings();
  const merged: ChatSettings = {
    secSummaryModel: next.secSummaryModel !== undefined ? next.secSummaryModel.trim() : current.secSummaryModel,
    numCtx: next.numCtx !== undefined ? clampNumCtx(next.numCtx) : current.numCtx,
    numPredict: next.numPredict !== undefined ? clampNumPredict(next.numPredict) : current.numPredict,
    ollamaBaseUrl: next.ollamaBaseUrl !== undefined ? normalizeOllamaBaseUrl(next.ollamaBaseUrl) : current.ollamaBaseUrl,
  };
  try {
    localStorage.setItem(CHAT_SETTINGS_KEY, JSON.stringify(merged));
  } catch {
    // ignore
  }
  return merged;
}
