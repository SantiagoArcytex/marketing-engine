import { useState, useCallback, useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { api } from "../api/client";
import { getScrapeSettings } from "@/lib/settings";
import { useListAds, usePatternStats, useInvalidateAds } from "@/hooks/useAdsQueries";
import type { AdRow } from "../shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import PatternCharts from "./PatternCharts";

const TABLE_ROW_HEIGHT = 52;
const CARD_ROW_HEIGHT = 140;
const CARDS_PER_ROW = 3;

function truncate(s: string | null | undefined, max: number): string {
  if (s == null) return "—";
  return s.length <= max ? s : s.slice(0, max) + "…";
}

type ViewTab = "overview" | "by-source" | "all-ads";

function VirtualizedAdsList({
  data,
  scrollRef,
  listViewMode,
  loadingList,
  onSelectAd,
  onSelectSource,
}: {
  data: AdRow[];
  scrollRef: React.RefObject<HTMLDivElement | null>;
  listViewMode: "table" | "cards";
  loadingList: boolean;
  onSelectAd: (id: number) => void;
  onSelectSource: (source: string) => void;
}) {
  const tableVirtualizer = useVirtualizer({
    count: data.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => TABLE_ROW_HEIGHT,
    overscan: 5,
  });
  const cardRowCount = Math.ceil(data.length / CARDS_PER_ROW);
  const cardsVirtualizer = useVirtualizer({
    count: cardRowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => CARD_ROW_HEIGHT,
    overscan: 2,
  });

  if (loadingList) {
    return (
      <div className="flex h-[400px] items-center justify-center rounded-lg border border-border">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-[200px]" />
          <Skeleton className="h-8 w-[180px]" />
          <Skeleton className="h-8 w-[220px]" />
        </div>
      </div>
    );
  }
  if (data.length === 0) {
    return (
      <div className="flex h-[200px] items-center justify-center rounded-lg border border-border text-muted-foreground">
        No ads to show. Run a scrape or adjust filters.
      </div>
    );
  }

  if (listViewMode === "table") {
    const virtualItems = tableVirtualizer.getVirtualItems();
    const totalSize = tableVirtualizer.getTotalSize();
    return (
      <div className="rounded-lg border border-border overflow-hidden" style={{ minHeight: totalSize }}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40%]">Content</TableHead>
              <TableHead>Hook</TableHead>
              <TableHead>Emotion</TableHead>
              <TableHead>Offer</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody style={{ height: totalSize, position: "relative" }}>
            {virtualItems.map((virtualRow) => {
              const row = data[virtualRow.index];
              return (
                <TableRow
                  key={row.id}
                  className="min-h-[44px] cursor-pointer absolute left-0 w-full"
                  style={{
                    height: TABLE_ROW_HEIGHT,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                  onClick={() => onSelectAd(row.id)}
                >
                  <TableCell className="max-w-[320px] truncate align-middle" title={row.content ?? undefined}>
                    {truncate(row.content, 80)}
                  </TableCell>
                  <TableCell className="align-middle">{row.hook ?? "—"}</TableCell>
                  <TableCell className="align-middle">{row.emotion ?? "—"}</TableCell>
                  <TableCell className="align-middle">{row.offer ?? "—"}</TableCell>
                  <TableCell
                    className="align-middle text-primary underline decoration-primary/50 underline-offset-2"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (row.source) onSelectSource(row.source);
                    }}
                  >
                    {row.source ?? "—"}
                  </TableCell>
                  <TableCell className="align-middle text-muted-foreground">{row.created_at ?? "—"}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    );
  }

  const cardVirtualItems = cardsVirtualizer.getVirtualItems();
  const cardsTotalSize = cardsVirtualizer.getTotalSize();
  return (
    <div
      style={{ height: cardsTotalSize, position: "relative" }}
      className="w-full"
    >
      {cardVirtualItems.map((virtualRow) => {
        const start = virtualRow.index * CARDS_PER_ROW;
        const rowAds = data.slice(start, start + CARDS_PER_ROW);
        return (
          <div
            key={virtualRow.key}
            className="absolute left-0 grid w-full gap-4 sm:grid-cols-2 lg:grid-cols-3"
            style={{
              height: CARD_ROW_HEIGHT,
              transform: `translateY(${virtualRow.start}px)`,
            }}
          >
            {rowAds.map((row) => (
              <Card
                key={row.id}
                className="min-h-[44px] cursor-pointer transition-colors hover:bg-muted/50"
                onClick={() => onSelectAd(row.id)}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium truncate" title={row.source ?? undefined}>
                    {row.source ?? "—"}
                  </CardTitle>
                  <CardDescription className="line-clamp-2 text-xs">{truncate(row.content, 80)}</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-1.5 pt-0 text-xs text-muted-foreground">
                  {row.hook && <span className="rounded bg-muted px-1.5 py-0.5">{row.hook}</span>}
                  {row.emotion && <span className="rounded bg-muted px-1.5 py-0.5">{row.emotion}</span>}
                  {row.offer && <span className="rounded bg-muted px-1.5 py-0.5">{row.offer}</span>}
                </CardContent>
              </Card>
            ))}
          </div>
        );
      })}
    </div>
  );
}

export default function AdExplorer() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [indexingEmbeddings, setIndexingEmbeddings] = useState(false);
  const [embeddingModel, setEmbeddingModel] = useState("nomic-embed-text");
  const [error, setError] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState("");
  const [hookFilter, setHookFilter] = useState<string>("");
  const [emotionFilter, setEmotionFilter] = useState<string>("");
  const [offerFilter, setOfferFilter] = useState<string>("");
  const [viewTab, setViewTab] = useState<ViewTab>("overview");
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [lastScrapeResult, setLastScrapeResult] = useState<{
    mode: "replace" | "append";
    count: number;
    query: string;
  } | null>(null);
  const [selectedAdId, setSelectedAdId] = useState<number | null>(null);
  const [listViewMode, setListViewMode] = useState<"table" | "cards">("table");
  const [batchKeywords, setBatchKeywords] = useState("");
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number; keyword: string } | null>(null);
  const [powerMode, setPowerMode] = useState(false);
  const [browserUrl, setBrowserUrl] = useState("");
  const adsListScrollRef = useRef<HTMLDivElement>(null);

  const { data: adsData, isPending: adsLoading, error: adsError, refetch: refetchAds } = useListAds({
    sourceFilter: sourceFilter || undefined,
    limit: 500,
  });
  const { data: patternStats } = usePatternStats();
  const invalidateAds = useInvalidateAds();

  const rows = adsData ?? [];
  const loadingList = adsLoading;
  const displayError = error ?? (adsError ? String(adsError) : null);

  const filteredRowsAllAds = useMemo(() => {
    let r = rows;
    if (sourceFilter) r = r.filter((row) => (row.source ?? "").toLowerCase().includes(sourceFilter.toLowerCase()));
    if (hookFilter) r = r.filter((row) => row.hook === hookFilter);
    if (emotionFilter) r = r.filter((row) => row.emotion === emotionFilter);
    if (offerFilter) r = r.filter((row) => row.offer === offerFilter);
    return r;
  }, [rows, sourceFilter, hookFilter, emotionFilter, offerFilter]);

  const filteredRowsBySource = useMemo(() => {
    if (!selectedSource) return rows;
    return rows.filter((row) => row.source === selectedSource);
  }, [rows, selectedSource]);

  const uniqueHooks = useMemo(() => [...new Set(rows.map((r) => r.hook).filter(Boolean))] as string[], [rows]);
  const uniqueEmotions = useMemo(() => [...new Set(rows.map((r) => r.emotion).filter(Boolean))] as string[], [rows]);
  const uniqueOffers = useMemo(() => [...new Set(rows.map((r) => r.offer).filter(Boolean))] as string[], [rows]);

  const uniqueSources = useMemo(() => {
    const bySource = new Map<string, { count: number; latest: string }>();
    for (const row of rows) {
      const s = row.source ?? "";
      if (!s) continue;
      const cur = bySource.get(s);
      const date = row.created_at ?? "";
      if (!cur) bySource.set(s, { count: 1, latest: date });
      else bySource.set(s, { count: cur.count + 1, latest: date > cur.latest ? date : cur.latest });
    }
    return [...bySource.entries()]
      .map(([source, { count, latest }]) => ({ source, count, latest }))
      .sort((a, b) => (b.latest || "").localeCompare(a.latest || ""))
      .slice(0, 10);
  }, [rows]);

  const totalAds = rows.length;
  const uniqueSourceCount = useMemo(() => new Set(rows.map((r) => r.source).filter(Boolean)).size, [rows]);
  const topHook = patternStats?.hooks?.[0]?.[0] ?? "—";

  async function handleScrape(mode: "replace" | "append") {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setLastScrapeResult(null);
    try {
      const scrapeSettings = getScrapeSettings();
      const count = await api.scrapeAds({
        query: query.trim(),
        mode,
        scrapeMode: powerMode ? "browser" : "static",
        url: powerMode ? browserUrl.trim() || undefined : undefined,
        proxy: scrapeSettings.proxyUrl?.trim() || undefined,
      });
      setLastScrapeResult({ mode, count, query: query.trim() });
      invalidateAds();
      toast.success(mode === "replace" ? `Scraped ${count} ads (replaced)` : `Scraped ${count} ads (appended)`);
    } catch (e) {
      const msg = String(e);
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleBatchScrape(mode: "replace" | "append") {
    const keywords = batchKeywords
      .split(/\n/)
      .map((k) => k.trim())
      .filter(Boolean);
    if (keywords.length === 0) return;
    setLoading(true);
    setError(null);
    setBatchProgress({ current: 0, total: keywords.length, keyword: keywords[0] });
    try {
      let totalCount = 0;
      for (let i = 0; i < keywords.length; i++) {
        setBatchProgress({ current: i + 1, total: keywords.length, keyword: keywords[i] });
        const scrapeSettings = getScrapeSettings();
        const count = await api.scrapeAds({
          query: keywords[i],
          mode: i === 0 ? mode : "append",
          scrapeMode: powerMode ? "browser" : "static",
          url: powerMode ? browserUrl.trim() || undefined : undefined,
          proxy: scrapeSettings.proxyUrl?.trim() || undefined,
        });
        totalCount += count;
        if (scrapeSettings.rateLimitPerMinute > 0 && i < keywords.length - 1) {
          await new Promise((r) => setTimeout(r, 60000 / scrapeSettings.rateLimitPerMinute));
        }
      }
      setLastScrapeResult({ mode, count: totalCount, query: `${keywords.length} keywords` });
      invalidateAds();
      toast.success(`Batch scrape complete: ${totalCount} ads from ${keywords.length} keywords`);
    } catch (e) {
      const msg = String(e);
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
      setBatchProgress(null);
    }
  }

  async function handleAnalyze() {
    setAnalyzing(true);
    setError(null);
    try {
      await api.analyzePatterns(null);
      invalidateAds();
      toast.success("Pattern analysis complete");
    } catch (e) {
      const msg = String(e);
      setError(msg);
      toast.error(msg);
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleIndexEmbeddings() {
    const model = embeddingModel.trim() || "nomic-embed-text";
    setIndexingEmbeddings(true);
    setError(null);
    try {
      const count = await api.indexAdsEmbeddings(model);
      toast.success(`Indexed ${count} ads for semantic search. Chat will use RAG when available.`);
    } catch (e) {
      const msg = String(e);
      setError(msg);
      toast.error(msg);
    } finally {
      setIndexingEmbeddings(false);
    }
  }

  const selectedAd = useMemo(
    () => (selectedAdId != null ? rows.find((r) => r.id === selectedAdId) ?? null : null),
    [rows, selectedAdId]
  );

  const handleSelectSource = useCallback((source: string) => {
    setSelectedSource(source);
    setViewTab("by-source");
  }, []);

  function renderAdsList(data: AdRow[]) {
    return (
      <div
        ref={adsListScrollRef}
        className="h-[60vh] min-h-[400px] overflow-auto rounded-lg border border-border"
      >
        <VirtualizedAdsList
          data={data}
          scrollRef={adsListScrollRef}
          listViewMode={listViewMode}
          loadingList={loadingList}
          onSelectAd={setSelectedAdId}
          onSelectSource={handleSelectSource}
        />
      </div>
    );
  }

  return (
    <div className="relative space-y-6">
      {loading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <Card className="w-80 p-6 shadow-lg">
            <CardContent className="flex flex-col items-center gap-4 pt-6">
              <Skeleton className="h-10 w-10 rounded-full" />
              <p className="text-sm font-medium">
                {batchProgress ? `Scraping ${batchProgress.current} of ${batchProgress.total}…` : "Scraping ads…"}
              </p>
              {batchProgress && (
                <p className="text-xs text-muted-foreground truncate max-w-full" title={batchProgress.keyword}>
                  {batchProgress.keyword}
                </p>
              )}
              <p className="text-xs text-muted-foreground">Loading results next.</p>
            </CardContent>
          </Card>
        </div>
      )}
      <h2 className="text-xl font-semibold tracking-tight">Ad Explorer</h2>

      {/* Scrape controls: Replace / Append */}
      <Card>
        <CardHeader>
          <CardTitle>Scrape ads</CardTitle>
          <CardDescription className="sr-only">
            Fetch demo ad snippets for a keyword. New search replaces previous results; Add more appends.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Keyword</span>
              <Input
                className="h-11 min-h-[44px] w-64"
                placeholder="e.g. AI tools, CRM software"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleScrape("replace")}
              />
            </label>
            <div className="flex min-h-[44px] items-center gap-2">
              <Button
                size="lg"
                className="min-h-[44px]"
                onClick={() => handleScrape("replace")}
                disabled={loading || !query.trim() || (powerMode && !browserUrl.trim())}
              >
                {loading ? "Scraping…" : "New search (replace)"}
              </Button>
              <Button
                size="lg"
                variant="secondary"
                className="min-h-[44px]"
                onClick={() => handleScrape("append")}
                disabled={loading || !query.trim() || (powerMode && !browserUrl.trim())}
              >
                Add more (append)
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={powerMode}
                onChange={(e) => setPowerMode(e.target.checked)}
                className="rounded border-input"
              />
              <span className="text-sm font-medium">Use browser (Power Mode)</span>
            </label>
            {powerMode && (
              <label className="flex flex-col gap-1.5 min-w-[280px]">
                <span className="text-sm font-medium">URL to scrape (JS-heavy pages)</span>
                <Input
                  className="h-11 min-h-[44px]"
                  placeholder="https://…"
                  value={browserUrl}
                  onChange={(e) => setBrowserUrl(e.target.value)}
                />
              </label>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            New search (replace) clears previous results for this keyword. Add more keeps existing ads and adds new ones.
            Power Mode uses headless Chrome for JavaScript-rendered pages; enter a valid URL when enabled.
          </p>
          <div className="space-y-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Batch: keywords (one per line)</span>
              <textarea
                className="min-h-[80px] w-full max-w-md rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                placeholder="AI tools&#10;CRM software&#10;Marketing"
                value={batchKeywords}
                onChange={(e) => setBatchKeywords(e.target.value)}
                rows={3}
              />
            </label>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleBatchScrape("replace")}
                disabled={loading || !batchKeywords.trim() || (powerMode && !browserUrl.trim())}
              >
                Scrape all (replace)
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleBatchScrape("append")}
                disabled={loading || !batchKeywords.trim() || (powerMode && !browserUrl.trim())}
              >
                Scrape all (append)
              </Button>
            </div>
          </div>
          {lastScrapeResult && (
            <p className="text-sm text-primary">
              {lastScrapeResult.mode === "replace"
                ? `Replaced previous results with ${lastScrapeResult.count} ads for "${lastScrapeResult.query}".`
                : `Added ${lastScrapeResult.count} ads for "${lastScrapeResult.query}".`}
            </p>
          )}
        </CardContent>
      </Card>

      {displayError && (
        <div className="flex items-center justify-between rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <span>{displayError}</span>
          <button type="button" className="shrink-0 underline focus:outline-none" onClick={() => setError(null)} aria-label="Dismiss">Dismiss</button>
        </div>
      )}

      <Tabs
        value={viewTab}
        onValueChange={(v) => setViewTab(v as ViewTab)}
        className="w-full"
      >
        <TabsList className="h-11 min-h-[44px] w-full justify-start">
          <TabsTrigger value="overview" className="min-h-[44px] px-4">
            Overview
          </TabsTrigger>
          <TabsTrigger value="by-source" className="min-h-[44px] px-4">
            By source
          </TabsTrigger>
          <TabsTrigger value="all-ads" className="min-h-[44px] px-4">
            All ads
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6 space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card size="sm">
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">Total ads</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">{totalAds}</p>
              </CardContent>
            </Card>
            <Card size="sm">
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">Unique sources</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">{uniqueSourceCount}</p>
              </CardContent>
            </Card>
            <Card size="sm">
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">Top hook</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-lg font-semibold truncate" title={topHook}>{topHook}</p>
              </CardContent>
            </Card>
          </div>
          <PatternCharts stats={patternStats ?? null} />
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <div>
                <CardTitle>Recent runs</CardTitle>
                <CardDescription>Last 10 sources (keyword runs). Click a source to view its ads.</CardDescription>
              </div>
              {uniqueSources.length > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  className="min-h-[44px] shrink-0"
                  onClick={async () => {
                    if (!window.confirm("Clear all ads? This cannot be undone.")) return;
                    setError(null);
                    try {
                      await api.clearAds();
                      invalidateAds();
                      setLastScrapeResult(null);
                      setSelectedSource(null);
                    } catch (e) {
                      setError(String(e));
                    }
                  }}
                >
                  Clear recent runs
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {uniqueSources.length === 0 ? (
                <p className="text-sm text-muted-foreground">No scrape runs yet. Run a search above.</p>
              ) : (
                <ul className="space-y-2">
                  {uniqueSources.map(({ source, count, latest }) => (
                    <li key={source}>
                      <button
                        type="button"
                        className="flex w-full items-center justify-between rounded-lg border border-transparent px-3 py-2 text-left text-sm hover:bg-muted min-h-[44px]"
                        onClick={() => {
                          setSelectedSource(source);
                          setViewTab("by-source");
                        }}
                      >
                        <span className="font-medium">{source}</span>
                        <span className="text-muted-foreground">{count} ads · {latest ? new Date(latest).toLocaleDateString() : ""}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="by-source" className="mt-6 space-y-4">
          {uniqueSources.length === 0 ? (
            <p className="text-muted-foreground">No sources yet. Run a scrape from the Overview.</p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                {selectedSource ? `Showing ads for source: ${selectedSource}` : "Select a source below to filter ads."}
              </p>
              <div className="flex flex-wrap gap-2">
                {uniqueSources.map(({ source }) => (
                  <Button
                    key={source}
                    variant={selectedSource === source ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedSource(selectedSource === source ? null : source)}
                  >
                    {source} ({rows.filter((r) => r.source === source).length})
                  </Button>
                ))}
              </div>
              <div className="flex gap-2">
                <Button
                  variant={listViewMode === "table" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setListViewMode("table")}
                >
                  Table
                </Button>
                <Button
                  variant={listViewMode === "cards" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setListViewMode("cards")}
                >
                  Cards
                </Button>
              </div>
              {renderAdsList(filteredRowsBySource)}
            </>
          )}
        </TabsContent>

        <TabsContent value="all-ads" className="mt-6 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Filter by source</span>
              <Input
                className="h-11 min-h-[44px] w-40"
                placeholder="Optional"
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
              />
            </label>
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Hook</span>
              <Select value={hookFilter || "all"} onValueChange={(v) => setHookFilter(v === "all" || v == null ? "" : v)}>
                <SelectTrigger className="min-h-[44px] w-[140px]">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {uniqueHooks.map((h) => (
                    <SelectItem key={h} value={h}>{h}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Emotion</span>
              <Select value={emotionFilter || "all"} onValueChange={(v) => setEmotionFilter(v === "all" || v == null ? "" : v)}>
                <SelectTrigger className="min-h-[44px] w-[140px]">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {uniqueEmotions.map((e) => (
                    <SelectItem key={e} value={e}>{e}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Offer</span>
              <Select value={offerFilter || "all"} onValueChange={(v) => setOfferFilter(v === "all" || v == null ? "" : v)}>
                <SelectTrigger className="min-h-[44px] w-[140px]">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {uniqueOffers.map((o) => (
                    <SelectItem key={o} value={o}>{o}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex min-h-[44px] items-end gap-2">
              <Button variant="outline" onClick={() => refetchAds()} disabled={loadingList}>
                Refresh list
              </Button>
              <Button variant="outline" onClick={handleAnalyze} disabled={analyzing || loadingList}>
                {analyzing ? "Analyzing…" : "Analyze patterns"}
              </Button>
              <div className="flex items-center gap-2">
                <Input
                  className="h-9 w-[180px] font-mono text-sm"
                  placeholder="nomic-embed-text"
                  value={embeddingModel}
                  onChange={(e) => setEmbeddingModel(e.target.value)}
                  title="Ollama embedding model for semantic search"
                />
                <Button
                  variant="outline"
                  onClick={handleIndexEmbeddings}
                  disabled={indexingEmbeddings || loadingList || rows.length === 0}
                  title="Index ad content for RAG; requires the embedding model in Ollama"
                >
                  {indexingEmbeddings ? "Indexing…" : "Index for semantic search"}
                </Button>
              </div>
              <div className="flex gap-1">
                <Button
                  variant={listViewMode === "table" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setListViewMode("table")}
                >
                  Table
                </Button>
                <Button
                  variant={listViewMode === "cards" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setListViewMode("cards")}
                >
                  Cards
                </Button>
              </div>
            </div>
          </div>
          {renderAdsList(filteredRowsAllAds)}
        </TabsContent>
      </Tabs>

      <Sheet open={selectedAdId != null} onOpenChange={(open) => !open && setSelectedAdId(null)}>
        <SheetContent side="right" className="flex min-h-full w-full flex-col sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Ad detail</SheetTitle>
          </SheetHeader>
          {selectedAd && (
            <div className="flex flex-1 flex-col gap-4 overflow-auto px-1">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Content</p>
                <p className="mt-1 whitespace-pre-wrap text-sm">{selectedAd.content ?? "—"}</p>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Hook</p>
                  <p>{selectedAd.hook ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Emotion</p>
                  <p>{selectedAd.emotion ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Offer</p>
                  <p>{selectedAd.offer ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Audience</p>
                  <p>{selectedAd.audience ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Source</p>
                  <p>{selectedAd.source ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Date</p>
                  <p>{selectedAd.created_at ?? "—"}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {selectedAd.source && (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-fit"
                    onClick={() => {
                      setSelectedSource(selectedAd.source ?? null);
                      setViewTab("by-source");
                      setSelectedAdId(null);
                    }}
                  >
                    View all from this source
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-fit"
                  onClick={() => {
                    if (selectedAd.content) {
                      void navigator.clipboard.writeText(selectedAd.content);
                    }
                  }}
                >
                  Copy content
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

