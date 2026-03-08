/**
 * TanStack Query hooks for backend data: caching, dedup, and invalidation.
 * Use these instead of ad-hoc useState + api calls for list_ads, pattern_stats, verified_emails.
 */

import { useQuery, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import type { ListAdsInput } from "@/shared/schema";

const QUERY_KEY_ADS = "ads" as const;
const QUERY_KEY_PATTERN_STATS = "patternStats" as const;
const QUERY_KEY_VERIFIED_EMAILS = "verifiedEmails" as const;

export function useListAds(input?: ListAdsInput) {
  return useQuery({
    queryKey: [QUERY_KEY_ADS, input?.sourceFilter ?? null, input?.limit ?? 500],
    queryFn: () => api.listAds(input),
  });
}

export function usePatternStats() {
  return useQuery({
    queryKey: [QUERY_KEY_PATTERN_STATS],
    queryFn: () => api.getPatternStats(),
  });
}

const VERIFIED_EMAILS_PAGE_SIZE = 100;

export function useVerifiedEmails(params: {
  statusFilter?: string;
  search?: string;
}) {
  const { statusFilter, search } = params;
  return useInfiniteQuery({
    queryKey: [QUERY_KEY_VERIFIED_EMAILS, statusFilter ?? null, search ?? null],
    queryFn: ({ pageParam }) =>
      api.getVerifiedEmails({
        limit: VERIFIED_EMAILS_PAGE_SIZE,
        offset: pageParam as number,
        statusFilter: statusFilter || undefined,
        search: search || undefined,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const offsetSoFar = allPages.reduce((sum, p) => sum + p.items.length, 0);
      if (lastPage.items.length === 0 || offsetSoFar >= lastPage.total) return undefined;
      return offsetSoFar;
    },
  });
}

/** Invalidate ads and pattern stats (call after scrape, analyze, or index). */
export function useInvalidateAds() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: [QUERY_KEY_ADS] });
    queryClient.invalidateQueries({ queryKey: [QUERY_KEY_PATTERN_STATS] });
  };
}

/** Invalidate verified emails (call after verify and store, bulk verify). */
export function useInvalidateVerifiedEmails() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: [QUERY_KEY_VERIFIED_EMAILS] });
  };
}
