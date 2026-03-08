import { z } from "zod";

// --- Ads ---
export const AdRowSchema = z.object({
  id: z.number(),
  content: z.string().nullable(),
  hook: z.string().nullable(),
  emotion: z.string().nullable(),
  offer: z.string().nullable(),
  audience: z.string().nullable(),
  source: z.string().nullable(),
  created_at: z.string().nullable(),
});
export type AdRow = z.infer<typeof AdRowSchema>;

export const ListAdsInputSchema = z.object({
  sourceFilter: z.string().optional(),
  limit: z.number().optional(),
});
export type ListAdsInput = z.infer<typeof ListAdsInputSchema>;

// --- Pattern stats ---
export const PatternStatsSchema = z.object({
  hooks: z.array(z.tuple([z.string(), z.number()])),
  emotions: z.array(z.tuple([z.string(), z.number()])),
  offers: z.array(z.tuple([z.string(), z.number()])),
});
export type PatternStats = z.infer<typeof PatternStatsSchema>;

// --- Scrape (Step 2 will add mode; for now query only) ---
export const ScrapeAdsInputSchema = z.object({
  query: z.string(),
  mode: z.enum(["replace", "append"]).optional(),
  limit: z.number().optional(),
});
export type ScrapeAdsInput = z.infer<typeof ScrapeAdsInputSchema>;

// --- Email verification ---
export const VerifyResultSchema = z.object({
  email: z.string(),
  status: z.string(),
  quality: z.string(),
  tests: z
    .object({
      syntax: z.boolean(),
      disposable: z.boolean(),
      mx: z.boolean(),
    })
    .optional(),
});
export type VerifyResult = z.infer<typeof VerifyResultSchema>;

export const VerifiedEmailRowSchema = z.object({
  email: z.string(),
  status: z.string(),
  quality: z.string(),
  verified_at: z.string().nullable(),
  syntax_ok: z.number().nullable().optional(),
  mx_ok: z.number().nullable().optional(),
  disposable_ok: z.number().nullable().optional(),
});
export type VerifiedEmailRow = z.infer<typeof VerifiedEmailRowSchema>;

export const GetVerifiedEmailsInputSchema = z.object({
  limit: z.number().optional(),
  offset: z.number().optional(),
  statusFilter: z.string().optional(),
  search: z.string().optional(),
});
export type GetVerifiedEmailsInput = z.infer<typeof GetVerifiedEmailsInputSchema>;

export const GetVerifiedEmailsResponseSchema = z.object({
  items: z.array(VerifiedEmailRowSchema),
  total: z.number(),
});
export type GetVerifiedEmailsResponse = z.infer<typeof GetVerifiedEmailsResponseSchema>;
