import { invoke } from "@tauri-apps/api/core";
import {
  AdRowSchema,
  GetVerifiedEmailsResponseSchema,
  PatternStatsSchema,
  VerifyResultSchema,
} from "../shared/schema";
import type {
  AdRow,
  GetVerifiedEmailsInput,
  GetVerifiedEmailsResponse,
  ListAdsInput,
  PatternStats,
  ScrapeAdsInput,
  VerifyResult,
} from "../shared/schema";

function parseOrThrow<T>(schema: { parse: (v: unknown) => T }, value: unknown): T {
  return schema.parse(value);
}

export const api = {
  async scrapeAds(input: ScrapeAdsInput): Promise<number> {
    const result = await invoke<number>("scrape_ads", {
      query: input.query,
      mode: input.mode ?? "replace",
      limit: input.limit ?? undefined,
    });
    return typeof result === "number" ? result : 0;
  },

  async clearAds(source?: string): Promise<number> {
    const result = await invoke<number>("clear_ads", { source: source ?? null });
    return typeof result === "number" ? result : 0;
  },

  async listAds(input?: ListAdsInput): Promise<AdRow[]> {
    const payload = {
      source_filter: input?.sourceFilter ?? undefined,
      limit: input?.limit ?? 500,
    };
    const raw = await invoke<unknown>("list_ads_cmd", payload);
    const arr = Array.isArray(raw) ? raw : [];
    return arr.map((row) => parseOrThrow(AdRowSchema, row));
  },

  async analyzePatterns(adIds?: number[] | null): Promise<number> {
    const result = await invoke<number>("analyze_patterns", { ad_ids: adIds ?? null });
    return typeof result === "number" ? result : 0;
  },

  async getPatternStats(): Promise<PatternStats | null> {
    const raw = await invoke<unknown>("get_pattern_stats_cmd");
    if (raw == null) return null;
    return parseOrThrow(PatternStatsSchema, raw);
  },

  async verifyEmail(email: string): Promise<VerifyResult> {
    const raw = await invoke<unknown>("verify_email_cmd", { email });
    return parseOrThrow(VerifyResultSchema, raw);
  },

  async verifyEmailAndStore(email: string): Promise<VerifyResult> {
    const raw = await invoke<unknown>("verify_email_and_store", { email });
    return parseOrThrow(VerifyResultSchema, raw);
  },

  async verifyBulk(filePath: string): Promise<number> {
    const result = await invoke<number>("verify_bulk", { file_path: filePath });
    return typeof result === "number" ? result : 0;
  },

  async getVerifiedEmails(input?: GetVerifiedEmailsInput): Promise<GetVerifiedEmailsResponse> {
    const payload = {
      limit: input?.limit ?? 100,
      offset: input?.offset ?? 0,
      status_filter: input?.statusFilter ?? undefined,
      search: input?.search ?? undefined,
    };
    const raw = await invoke<unknown>("get_verified_emails", payload);
    return parseOrThrow(GetVerifiedEmailsResponseSchema, raw);
  },

  /** Write export content to a user-chosen path (e.g. CSV). */
  async writeExportFile(path: string, content: string): Promise<void> {
    await invoke("write_export_file", { path, content });
  },

  /** Open save dialog and write an Ollama Modelfile (e.g. Modelfile.qwen). Returns path if saved. */
  async writeModelfile(name: string, systemPrompt: string): Promise<string | null> {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const path = await save({
      defaultPath: `Modelfile.${name.replace(/\s+/g, "-").toLowerCase() || "qwen"}`,
      filters: [{ name: "Modelfile", extensions: [] }],
      title: "Save Modelfile",
    });
    if (path == null) return null;
    await invoke("write_modelfile", { path, name, systemPrompt });
    return path;
  },

  /** Fetch URL content (GET). Only used after user allows; backend allows https only. */
  async fetchUrl(url: string): Promise<string> {
    const result = await invoke<string>("fetch_url", { url: url.trim() });
    return typeof result === "string" ? result : "";
  },

  async runStrategyAgent(
    query: string,
    model?: string | null,
    timeoutSecs?: number | null
  ): Promise<string> {
    const result = await invoke<string>("run_strategy_agent_cmd", {
      query,
      model: model && model.trim() ? model.trim() : null,
      timeout_secs: timeoutSecs ?? undefined,
    });
    return typeof result === "string" ? result : "";
  },

  async generateCopyVariants(params?: {
    hook?: string;
    offer?: string;
    model?: string | null;
    timeoutSecs?: number | null;
  }): Promise<string[]> {
    const raw = await invoke<unknown>("generate_copy_variants", {
      hook: params?.hook ?? undefined,
      offer: params?.offer ?? undefined,
      model: params?.model && params.model.trim() ? params.model.trim() : null,
      timeout_secs: params?.timeoutSecs ?? undefined,
    });
    const arr = Array.isArray(raw) ? raw : [];
    return arr.map((s) => (typeof s === "string" ? s : String(s)));
  },

  async ollamaListModels(): Promise<string[]> {
    const raw = await invoke<unknown>("ollama_list_models");
    const arr = Array.isArray(raw) ? raw : [];
    return arr.map((s) => (typeof s === "string" ? s : String(s)));
  },

  async ollamaChat(
    model: string,
    userMessage: string,
    timeoutSecs?: number | null,
    systemPrompt?: string | null
  ): Promise<string> {
    const result = await invoke<string>("ollama_chat", {
      model,
      userMessage,
      timeout_secs: timeoutSecs ?? undefined,
      system_prompt: systemPrompt && systemPrompt.trim() ? systemPrompt.trim() : undefined,
    });
    return typeof result === "string" ? result : "";
  },

  /** Stream chat: invoke and subscribe to "ollama-chunk" (payload: string) and "ollama-done" (no payload). */
  async ollamaChatStream(
    model: string,
    userMessage: string,
    systemPrompt?: string | null
  ): Promise<void> {
    await invoke("ollama_chat_stream", {
      model,
      userMessage,
      system_prompt: systemPrompt && systemPrompt.trim() ? systemPrompt.trim() : undefined,
    });
  },

  /** Pre-warm: load model into memory so the next request is fast. */
  async ollamaPrewarm(model: string): Promise<void> {
    if (!model?.trim()) return;
    await invoke("ollama_prewarm", { model: model.trim() });
  },

  /** SEC EDGAR: company tickers (no API key). */
  async secFetchCompanyTickers(): Promise<SecCompanyTickerRow[]> {
    const raw = await invoke<unknown>("sec_fetch_company_tickers");
    const arr = Array.isArray(raw) ? raw : [];
    return arr.map((row) => ({
      cik_str: Number((row as { cik_str?: number }).cik_str),
      ticker: String((row as { ticker?: string }).ticker ?? ""),
      title: String((row as { title?: string }).title ?? ""),
    }));
  },

  /** SEC EDGAR: recent filings (10-K, 10-Q, S-1, etc.) for a ticker or CIK. */
  async secCompanyFilings(tickerOrCik: string): Promise<SecFilingSummary[]> {
    const raw = await invoke<unknown>("sec_company_filings", {
      ticker_or_cik: tickerOrCik,
    });
    const arr = Array.isArray(raw) ? raw : [];
    return arr.map((row) => ({
      form: String((row as { form?: string }).form ?? ""),
      description: String((row as { description?: string }).description ?? ""),
      filing_date: String((row as { filing_date?: string }).filing_date ?? ""),
      accession_number: String((row as { accession_number?: string }).accession_number ?? ""),
    }));
  },
};

export type SecCompanyTickerRow = {
  cik_str: number;
  ticker: string;
  title: string;
};

export type SecFilingSummary = {
  form: string;
  description: string;
  filing_date: string;
  accession_number: string;
};
