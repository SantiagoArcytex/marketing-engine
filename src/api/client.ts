import { invoke } from "@tauri-apps/api/core";
import {
  AdRowSchema,
  PatternStatsSchema,
  VerifyResultSchema,
  VerifiedEmailRowSchema,
} from "../shared/schema";
import type {
  AdRow,
  ListAdsInput,
  PatternStats,
  ScrapeAdsInput,
  VerifyResult,
  VerifiedEmailRow,
  GetVerifiedEmailsInput,
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

  async getVerifiedEmails(input?: GetVerifiedEmailsInput): Promise<VerifiedEmailRow[]> {
    const payload = {
      status_filter: input?.statusFilter ?? undefined,
      limit: input?.limit ?? 1000,
    };
    const raw = await invoke<unknown>("get_verified_emails", payload);
    const arr = Array.isArray(raw) ? raw : [];
    return arr.map((row) => parseOrThrow(VerifiedEmailRowSchema, row));
  },

  async runStrategyAgent(query: string): Promise<string> {
    const result = await invoke<string>("run_strategy_agent_cmd", { query });
    return typeof result === "string" ? result : "";
  },

  async generateCopyVariants(params?: { hook?: string; offer?: string }): Promise<string[]> {
    const raw = await invoke<unknown>("generate_copy_variants", {
      hook: params?.hook ?? undefined,
      offer: params?.offer ?? undefined,
    });
    const arr = Array.isArray(raw) ? raw : [];
    return arr.map((s) => (typeof s === "string" ? s : String(s)));
  },
};
