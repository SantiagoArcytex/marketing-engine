import { useState, useCallback, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { api } from "../api/client";
import { useVerifiedEmails, useInvalidateVerifiedEmails } from "@/hooks/useAdsQueries";
import type { VerifiedEmailRow, VerifyResult } from "../shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { save } from "@tauri-apps/plugin-dialog";
import { CheckCircle2, XCircle } from "lucide-react";
import { DialogFooter } from "@/components/ui/dialog";
import { parseCsvFile, buildCsv } from "../lib/csv";

const PAGE_SIZE = 100;
const ROW_HEIGHT = 44;

function testsPassed(row: VerifiedEmailRow): { passed: number; total: number; hasData: boolean } {
  const s = row.syntax_ok;
  const m = row.mx_ok;
  const d = row.disposable_ok;
  const hasData = s != null && m != null && d != null;
  if (!hasData) return { passed: 0, total: 3, hasData: false };
  const passed = [s, m, d].filter((v) => v === 1).length;
  return { passed, total: 3, hasData: true };
}

const statusColors: Record<string, string> = {
  ok: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border-emerald-500/40",
  invalid: "bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/40",
  disposable: "bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-500/40",
  catch_all: "bg-blue-500/20 text-blue-700 dark:text-blue-400 border-blue-500/40",
  unknown: "bg-muted text-muted-foreground border-border",
};
function StatusChip({ status }: { status: string }) {
  const cls = statusColors[status] ?? statusColors.unknown;
  return <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${cls}`}>{status}</span>;
}

const qualityColors: Record<string, string> = {
  good: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border-emerald-500/40",
  bad: "bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/40",
  risky: "bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-500/40",
};
function QualityChip({ quality }: { quality: string }) {
  const cls = qualityColors[quality] ?? "bg-muted text-muted-foreground border-border";
  return <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${cls}`}>{quality}</span>;
}

function CheckItem({ label, ok }: { label: string; ok: boolean }) {
  return (
    <li className="flex items-center gap-2">
      {ok ? (
        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
      ) : (
        <XCircle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" aria-hidden />
      )}
      <span>{label}</span>
    </li>
  );
}

export default function EmailIntelligence() {
  const [singleEmail, setSingleEmail] = useState("");
  const [singleResult, setSingleResult] = useState<VerifyResult | null>(null);
  const [singleLoading, setSingleLoading] = useState(false);
  const [bulkPath, setBulkPath] = useState("");
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkCount, setBulkCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [qualityFilter, setQualityFilter] = useState("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const {
    data: verifiedData,
    isPending: loadingList,
    isFetchingNextPage: loadingMore,
    fetchNextPage,
    hasNextPage: hasMore,
    refetch: refetchVerifiedEmails,
  } = useVerifiedEmails({ statusFilter: statusFilter || undefined, search: search || undefined });
  const invalidateVerifiedEmails = useInvalidateVerifiedEmails();

  const rows = verifiedData?.pages.flatMap((p) => p.items) ?? [];
  const total = verifiedData?.pages[0]?.total ?? 0;
  const [selectedRow, setSelectedRow] = useState<VerifiedEmailRow | null>(null);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportStatusFilter, setExportStatusFilter] = useState("");
  const [exportQualityFilter, setExportQualityFilter] = useState("");
  const [exportSearch, setExportSearch] = useState("");
  const [exportSavePath, setExportSavePath] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  type CrmFormat = "default" | "hubspot" | "apollo";
  const [exportCrmFormat, setExportCrmFormat] = useState<CrmFormat>("default");
  const scrollRef = useRef<HTMLDivElement>(null);

  // CSV cross-reference cleaner
  const [referenceSource, setReferenceSource] = useState<"current" | "file">("current");
  const [_referenceFile, setReferenceFile] = useState<File | null>(null);
  const [referenceParsed, setReferenceParsed] = useState<{ headers: string[]; rows: Record<string, string>[] } | null>(null);
  const [referenceStatusFilter, setReferenceStatusFilter] = useState("");
  const [referenceQualityFilter, setReferenceQualityFilter] = useState("");
  const [_contactFile, setContactFile] = useState<File | null>(null);
  const [contactHeaders, setContactHeaders] = useState<string[]>([]);
  const [contactRows, setContactRows] = useState<Record<string, string>[]>([]);
  const [contactEmailColumn, setContactEmailColumn] = useState("");
  const [filteredContactRows, setFilteredContactRows] = useState<Record<string, string>[] | null>(null);
  const [crossRefSummary, setCrossRefSummary] = useState<string | null>(null);
  const [savingCrossRef, setSavingCrossRef] = useState(false);

  const handleSearchSubmit = () => {
    setSearch(searchInput.trim());
  };

  const filteredRows = qualityFilter
    ? rows.filter((r) => r.quality === qualityFilter)
    : rows;

  // Cross-reference: reference set size for display
  const referenceEmailCount = (() => {
    if (referenceSource === "current") return filteredRows.length;
    if (!referenceParsed?.rows.length) return 0;
    const hasStatus = referenceParsed.headers.some((h) => h.toLowerCase() === "status");
    const hasQuality = referenceParsed.headers.some((h) => h.toLowerCase() === "quality");
    let refRows = referenceParsed.rows;
    if (hasStatus && referenceStatusFilter)
      refRows = refRows.filter((r) => (r["status"] ?? "").toLowerCase() === referenceStatusFilter.toLowerCase());
    if (hasQuality && referenceQualityFilter)
      refRows = refRows.filter((r) => (r["quality"] ?? "").toLowerCase() === referenceQualityFilter.toLowerCase());
    return refRows.length;
  })();

  const referenceSetEmpty = referenceSource === "current" ? filteredRows.length === 0 : referenceEmailCount === 0;
  const contactReady = contactHeaders.length > 0 && contactRows.length >= 0 && contactEmailColumn !== "";
  const crossRefCanRun = !referenceSetEmpty && contactReady;
  const crossRefResultReady = filteredContactRows !== null;

  function openExportModal() {
    setExportStatusFilter(statusFilter);
    setExportQualityFilter(qualityFilter);
    setExportSearch(search);
    setExportSavePath(null);
    setExportModalOpen(true);
  }

  async function chooseExportPath() {
    const defaultName = `verified-emails-${new Date().toISOString().slice(0, 10)}.csv`;
    const path = await save({
      defaultPath: defaultName,
      filters: [{ name: "CSV", extensions: ["csv"] }],
      title: "Save export",
    });
    if (path != null) setExportSavePath(path);
  }

  const CRM_HEADERS: Record<CrmFormat, string[]> = {
    default: ["email", "status", "quality", "verified_at", "syntax_ok", "mx_ok", "disposable_ok"],
    hubspot: ["Email", "Status", "Quality", "Verified At", "Syntax OK", "MX OK", "Disposable OK"],
    apollo: ["Contact Email", "Status", "Quality", "Verified At", "Syntax OK", "MX OK", "Disposable OK"],
  };

  function buildCsvFromRows(rowsToExport: VerifiedEmailRow[]): string {
    const headers = CRM_HEADERS[exportCrmFormat];
    const escape = (v: string | number | null | undefined) => {
      const s = v == null ? "" : String(v);
      return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rowValues = (r: VerifiedEmailRow) =>
      [r.email, r.status, r.quality, r.verified_at ?? "", r.syntax_ok ?? "", r.mx_ok ?? "", r.disposable_ok ?? ""];
    const lines = [
      headers.join(","),
      ...rowsToExport.map((r) => rowValues(r).map(escape).join(",")),
    ];
    return lines.join("\n");
  }

  async function runExport() {
    if (!exportSavePath) return;
    setExporting(true);
    try {
      const limit = PAGE_SIZE;
      let offset = 0;
      const allRows: VerifiedEmailRow[] = [];
      let totalFetched = 0;
      let totalCount = 0;
      let lastBatchSize = 0;
      do {
        const res = await api.getVerifiedEmails({
          limit,
          offset,
          statusFilter: exportStatusFilter || undefined,
          search: exportSearch.trim() || undefined,
        });
        totalCount = res.total;
        allRows.push(...res.items);
        lastBatchSize = res.items.length;
        totalFetched += lastBatchSize;
        offset += limit;
      } while (totalFetched < totalCount && lastBatchSize === limit);

      const filtered = exportQualityFilter ? allRows.filter((r) => r.quality === exportQualityFilter) : allRows;
      if (filtered.length === 0) {
        toast.info("No rows match the selected filters.");
        return;
      }
      const csvContent = buildCsvFromRows(filtered);
      await api.writeExportFile(exportSavePath, csvContent);
      setExportModalOpen(false);
      setExportSavePath(null);
      toast.success(`Exported ${filtered.length} emails`);
    } catch (e) {
      const msg = String(e);
      toast.error(msg);
    } finally {
      setExporting(false);
    }
  }

  async function onReferenceFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setReferenceFile(file);
    setReferenceParsed(null);
    try {
      const data = await parseCsvFile(file);
      setReferenceParsed(data);
    } catch (err) {
      toast.error("Failed to parse reference CSV");
      setReferenceFile(null);
    }
  }

  async function onContactFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setContactFile(file);
    setFilteredContactRows(null);
    setCrossRefSummary(null);
    try {
      const data = await parseCsvFile(file);
      setContactHeaders(data.headers);
      setContactRows(data.rows);
      const emailHeader = data.headers.find((h) => h.trim().toLowerCase() === "email");
      setContactEmailColumn(emailHeader ?? "");
    } catch (err) {
      toast.error("Failed to parse contact CSV");
      setContactFile(null);
      setContactHeaders([]);
      setContactRows([]);
      setContactEmailColumn("");
    }
  }

  function runCrossRef() {
    const norm = (s: string) => (s ?? "").trim().toLowerCase();
    let refSet: Set<string>;
    if (referenceSource === "current") {
      refSet = new Set(filteredRows.map((r) => norm(r.email)));
    } else {
      if (!referenceParsed?.rows.length) {
        toast.error("Reference set is empty; add filters or upload a reference CSV with at least one email.");
        return;
      }
      const hasStatus = referenceParsed.headers.some((h) => h.toLowerCase() === "status");
      const hasQuality = referenceParsed.headers.some((h) => h.toLowerCase() === "quality");
      let refRows = referenceParsed.rows;
      if (hasStatus && referenceStatusFilter)
        refRows = refRows.filter((r) => norm(r["status"] ?? "") === referenceStatusFilter.toLowerCase());
      if (hasQuality && referenceQualityFilter)
        refRows = refRows.filter((r) => norm(r["quality"] ?? "") === referenceQualityFilter.toLowerCase());
      const emailCol = referenceParsed.headers.find((h) => h.toLowerCase() === "email") ?? referenceParsed.headers[0];
      if (!emailCol) {
        toast.error("Reference CSV has no email column.");
        return;
      }
      refSet = new Set(refRows.map((r) => norm(r[emailCol] ?? "")));
    }
    const kept = contactRows.filter((row) => refSet.has(norm(row[contactEmailColumn] ?? "")));
    setFilteredContactRows(kept);
    setCrossRefSummary(`${kept.length} of ${contactRows.length} rows kept`);
  }

  async function saveCrossRefResult() {
    if (filteredContactRows === null) return;
    setSavingCrossRef(true);
    try {
      const defaultName = `crossreference-result-${new Date().toISOString().slice(0, 10)}.csv`;
      const path = await save({
        defaultPath: defaultName,
        filters: [{ name: "CSV", extensions: ["csv"] }],
        title: "Save cross-reference result",
      });
      if (path == null) return;
      const csvContent = buildCsv(contactHeaders, filteredContactRows);
      await api.writeExportFile(path, csvContent);
      toast.success("Result saved");
    } catch (e) {
      toast.error(String(e));
    } finally {
      setSavingCrossRef(false);
    }
  }

  const rowVirtualizer = useVirtualizer({
    count: filteredRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 5,
  });

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || !hasMore || loadingMore) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    if (scrollTop + clientHeight >= scrollHeight - 80) {
      fetchNextPage();
    }
  }, [hasMore, loadingMore, fetchNextPage]);

  async function handleVerifySingle() {
    if (!singleEmail.trim()) return;
    setSingleLoading(true);
    setError(null);
    setSingleResult(null);
    try {
      const result = await api.verifyEmailAndStore(singleEmail.trim());
      setSingleResult(result);
      invalidateVerifiedEmails();
      toast.success(`Verified: ${result.status} · ${result.quality}`);
    } catch (e) {
      const msg = String(e);
      setError(msg);
      toast.error(msg);
    } finally {
      setSingleLoading(false);
    }
  }

  async function handleBulkVerify() {
    if (!bulkPath.trim()) {
      const msg = "Enter a file path (one email per line or CSV with email column)";
      setError(msg);
      toast.error(msg);
      return;
    }
    setBulkLoading(true);
    setError(null);
    setBulkCount(null);
    try {
      const count = await api.verifyBulk(bulkPath.trim());
      setBulkCount(count);
      invalidateVerifiedEmails();
      toast.success(`Bulk verification complete: ${count} emails verified`);
    } catch (e) {
      const msg = String(e);
      setError(msg);
      toast.error(msg);
    } finally {
      setBulkLoading(false);
    }
  }

  const { passed, total: totalTests, hasData } = selectedRow ? testsPassed(selectedRow) : { passed: 0, total: 3, hasData: false };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold tracking-tight">Email Intelligence</h2>
      <p className="text-sm text-muted-foreground">
        Verify email deliverability (syntax, MX, disposable). Single or bulk from a file.
      </p>

      <Card>
        <CardHeader>
          <CardTitle>Single verification</CardTitle>
          <CardDescription>Verify one email and store the result.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Email</span>
            <Input
              className="h-11 min-h-[44px] w-80"
              placeholder="user@example.com"
              value={singleEmail}
              onChange={(e) => setSingleEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleVerifySingle()}
            />
          </label>
          <Button
            className="min-h-[44px]"
            onClick={handleVerifySingle}
            disabled={singleLoading || !singleEmail.trim()}
          >
            {singleLoading ? "Verifying…" : "Verify"}
          </Button>
          {singleResult && (
            <p className="text-sm text-muted-foreground">
              Status: {singleResult.status} · Quality: {singleResult.quality}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bulk verification</CardTitle>
          <CardDescription>File path: one email per line or CSV with email column.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">File path</span>
            <Input
              className="h-11 min-h-[44px] w-96"
              placeholder="/path/to/emails.txt"
              value={bulkPath}
              onChange={(e) => setBulkPath(e.target.value)}
            />
          </label>
          <Button
            className="min-h-[44px]"
            onClick={handleBulkVerify}
            disabled={bulkLoading || !bulkPath.trim()}
          >
            {bulkLoading ? "Verifying…" : "Verify bulk"}
          </Button>
          {bulkCount !== null && (
            <p className="text-sm text-muted-foreground">Verified {bulkCount} emails</p>
          )}
        </CardContent>
      </Card>

      {error && (
        <div className="flex items-center justify-between rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <span>{error}</span>
          <button type="button" className="shrink-0 underline focus:outline-none" onClick={() => setError(null)} aria-label="Dismiss">Dismiss</button>
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-4">
          <div>
            <CardTitle>Verified emails</CardTitle>
            <CardDescription>Search, filter by status, or refresh. Click a row to see tests passed.</CardDescription>
          </div>
          <div className="flex min-h-[44px] flex-wrap items-center gap-2">
            <Input
              className="h-9 w-48"
              placeholder="Search email…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearchSubmit()}
            />
            <Button variant="secondary" size="sm" onClick={handleSearchSubmit} className="h-9">
              Search
            </Button>
            <Select value={statusFilter || "all"} onValueChange={(v) => setStatusFilter(v === "all" || v == null ? "" : v)}>
              <SelectTrigger className="min-h-[44px] w-[140px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="ok">Ok</SelectItem>
                <SelectItem value="invalid">Invalid</SelectItem>
                <SelectItem value="disposable">Disposable</SelectItem>
                <SelectItem value="catch_all">Catch-all</SelectItem>
                <SelectItem value="unknown">Unknown</SelectItem>
              </SelectContent>
            </Select>
            <Select value={qualityFilter || "all"} onValueChange={(v) => setQualityFilter(v === "all" || v == null ? "" : v)}>
              <SelectTrigger className="min-h-[44px] w-[120px]">
                <SelectValue placeholder="Quality" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="good">Good</SelectItem>
                <SelectItem value="bad">Bad</SelectItem>
                <SelectItem value="risky">Risky</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => { refetchVerifiedEmails(); toast.success("List refreshed"); }} disabled={loadingList} className="min-h-[44px]">
              Refresh list
            </Button>
            <Button variant="secondary" onClick={openExportModal} className="min-h-[44px]">
              Export CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loadingList ? (
            <div className="flex flex-col gap-2 rounded-lg border border-border p-4">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-4/5" />
            </div>
          ) : rows.length === 0 ? (
            <div className="flex min-h-[200px] flex-col items-center justify-center rounded-lg border border-border py-12 text-center text-muted-foreground">
              <p className="font-medium">No verified emails yet</p>
              <p className="mt-1 text-sm">Verify a single email or run bulk verification above.</p>
            </div>
          ) : (
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 px-3 py-2 border-b border-border text-xs font-medium text-muted-foreground bg-muted/50">
                <span>Email</span>
                <span className="w-20">Status</span>
                <span className="w-14">Quality</span>
                <span className="w-28">Verified at</span>
              </div>
              <div
                ref={scrollRef}
                className="overflow-auto max-h-[400px] min-h-[200px]"
                style={{ contain: "strict" }}
                onScroll={onScroll}
              >
                <div
                  style={{
                    height: `${rowVirtualizer.getTotalSize()}px`,
                    width: "100%",
                    position: "relative",
                  }}
                >
                  {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                    const row = filteredRows[virtualRow.index];
                    if (!row) return null;
                    return (
                      <div
                        key={row.email}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedRow(row)}
                        onKeyDown={(e) => e.key === "Enter" && setSelectedRow(row)}
                        className="grid grid-cols-[1fr_auto_auto_auto] gap-2 px-3 py-2 items-center border-b border-border/50 text-sm cursor-pointer hover:bg-muted/50 focus:outline-none focus:bg-muted/50"
                        style={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          width: "100%",
                          height: `${virtualRow.size}px`,
                          transform: `translateY(${virtualRow.start}px)`,
                        }}
                      >
                        <span className="truncate" title={row.email}>{row.email}</span>
                        <span className="w-20 shrink-0">
                          <StatusChip status={row.status} />
                        </span>
                        <span className="w-14 shrink-0">
                          <QualityChip quality={row.quality} />
                        </span>
                        <span className="w-28 shrink-0 text-muted-foreground">{row.verified_at ?? "—"}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="flex items-center justify-between px-3 py-2 border-t border-border text-xs text-muted-foreground">
                <span>
                  Showing {filteredRows.length} of {total}
                </span>
                {loadingMore && <span>Loading more…</span>}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedRow} onOpenChange={(open) => !open && setSelectedRow(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Verification details</DialogTitle>
            <DialogDescription>
              {selectedRow?.email}
            </DialogDescription>
          </DialogHeader>
          {selectedRow && (
            <div className="space-y-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground">Status:</span>
                <StatusChip status={selectedRow.status} />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground">Quality:</span>
                <QualityChip quality={selectedRow.quality} />
              </div>
              <div className="flex gap-4">
                <span className="text-muted-foreground">Verified at:</span>
                <span>{selectedRow.verified_at ?? "—"}</span>
              </div>
              <div className="pt-2 border-t border-border">
                <p className="font-medium text-foreground mb-2">Tests passed</p>
                {hasData ? (
                  <div className="space-y-2">
                    <p className="text-muted-foreground text-xs">
                      {passed}/{totalTests} checks passed
                    </p>
                    <ul className="space-y-1.5">
                      <CheckItem label="Syntax" ok={selectedRow.syntax_ok === 1} />
                      <CheckItem label="MX (mail server)" ok={selectedRow.mx_ok === 1} />
                      <CheckItem label="Not disposable" ok={selectedRow.disposable_ok === 1} />
                    </ul>
                  </div>
                ) : (
                  <p className="text-muted-foreground">
                    Re-verify this email to see per-check results.
                  </p>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={exportModalOpen} onOpenChange={(open) => !open && setExportModalOpen(false)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Export CSV</DialogTitle>
            <DialogDescription>
              Choose filters and a save location. Data matching the filters will be exported.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">Status</span>
              <Select
                value={exportStatusFilter || "all"}
                onValueChange={(v) => setExportStatusFilter(v === "all" || v == null ? "" : v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="ok">Ok</SelectItem>
                  <SelectItem value="invalid">Invalid</SelectItem>
                  <SelectItem value="disposable">Disposable</SelectItem>
                  <SelectItem value="catch_all">Catch-all</SelectItem>
                  <SelectItem value="unknown">Unknown</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">Quality</span>
              <Select
                value={exportQualityFilter || "all"}
                onValueChange={(v) => setExportQualityFilter(v === "all" || v == null ? "" : v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Quality" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="good">Good</SelectItem>
                  <SelectItem value="bad">Bad</SelectItem>
                  <SelectItem value="risky">Risky</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">Search (optional)</span>
              <Input
                placeholder="Filter by email search…"
                value={exportSearch}
                onChange={(e) => setExportSearch(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">Export for CRM</span>
              <Select
                value={exportCrmFormat}
                onValueChange={(v) => setExportCrmFormat(v as CrmFormat)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Default (raw columns)</SelectItem>
                  <SelectItem value="hubspot">HubSpot CSV</SelectItem>
                  <SelectItem value="apollo">Apollo.io CSV</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {exportCrmFormat === "default" && "Standard column names."}
                {exportCrmFormat === "hubspot" && "Headers match HubSpot contact import (Email, Status, Quality, etc.)."}
                {exportCrmFormat === "apollo" && "Headers match Apollo.io contact import (Contact Email, Status, etc.)."}
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">Save location</span>
              <Button variant="outline" onClick={chooseExportPath} className="w-full justify-center">
                Choose save location…
              </Button>
              <p className="text-xs text-muted-foreground truncate" title={exportSavePath ?? undefined}>
                {exportSavePath ?? "No location chosen"}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExportModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={runExport} disabled={!exportSavePath || exporting}>
              {exporting ? "Exporting…" : "Export"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle>CSV cross-reference cleaner</CardTitle>
          <CardDescription>
            Filter a contact CSV to only rows whose email appears in your verified list (or a reference CSV). Output keeps the structure of your contact file.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">Reference source</span>
            <Select
              value={referenceSource}
              onValueChange={(v) => {
                setReferenceSource(v as "current" | "file");
                if (v === "current") {
                  setReferenceFile(null);
                  setReferenceParsed(null);
                }
                setFilteredContactRows(null);
                setCrossRefSummary(null);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="current">Use current filtered list</SelectItem>
                <SelectItem value="file">Upload reference CSV</SelectItem>
              </SelectContent>
            </Select>
            {referenceSource === "current" && (
              <p className="text-xs text-muted-foreground">
                {filteredRows.length === 0
                  ? "Load and filter the list above, or upload a reference CSV."
                  : `Reference: ${filteredRows.length} emails (current list).`}
              </p>
            )}
            {referenceSource === "file" && (
              <>
                <div className="flex flex-col gap-1">
                  <input
                    type="file"
                    accept=".csv"
                    onChange={onReferenceFileChange}
                    className="text-sm file:mr-2 file:rounded file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-primary-foreground"
                  />
                  {referenceParsed && (
                    <>
                      <p className="text-xs text-muted-foreground">Reference: {referenceEmailCount} emails</p>
                      {referenceParsed.headers.some((h) => h.toLowerCase() === "status") && (
                        <div className="flex flex-col gap-1">
                          <span className="text-xs font-medium">Status filter (optional)</span>
                          <Select
                            value={referenceStatusFilter || "all"}
                            onValueChange={(v) => setReferenceStatusFilter(v === "all" || v == null ? "" : v)}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="All" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All</SelectItem>
                              <SelectItem value="ok">Ok</SelectItem>
                              <SelectItem value="invalid">Invalid</SelectItem>
                              <SelectItem value="disposable">Disposable</SelectItem>
                              <SelectItem value="catch_all">Catch-all</SelectItem>
                              <SelectItem value="unknown">Unknown</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      {referenceParsed.headers.some((h) => h.toLowerCase() === "quality") && (
                        <div className="flex flex-col gap-1">
                          <span className="text-xs font-medium">Quality filter (optional)</span>
                          <Select
                            value={referenceQualityFilter || "all"}
                            onValueChange={(v) => setReferenceQualityFilter(v === "all" || v == null ? "" : v)}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="All" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All</SelectItem>
                              <SelectItem value="good">Good</SelectItem>
                              <SelectItem value="bad">Bad</SelectItem>
                              <SelectItem value="risky">Risky</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </>
                  )}
                </div>
                {referenceSetEmpty && referenceSource === "file" && referenceParsed && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">Reference set is empty; add filters or use a CSV with at least one email.</p>
                )}
              </>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">Contact file</span>
            <input
              type="file"
              accept=".csv"
              onChange={onContactFileChange}
              className="text-sm file:mr-2 file:rounded file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-primary-foreground"
            />
            {contactHeaders.length > 0 && (
              <>
                <p className="text-xs text-muted-foreground">{contactRows.length} rows in contact file</p>
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium">Email column</span>
                  <Select value={contactEmailColumn} onValueChange={(v) => v != null && setContactEmailColumn(v)}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select column" />
                    </SelectTrigger>
                    <SelectContent>
                      {contactHeaders.map((h) => (
                        <SelectItem key={h} value={h}>
                          {h}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
          </div>

          {referenceSetEmpty && referenceSource === "current" && (
            <p className="text-xs text-amber-600 dark:text-amber-400">Reference set is empty; load and filter the list above, or upload a reference CSV.</p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={runCrossRef} disabled={!crossRefCanRun}>
              Run cross-reference
            </Button>
            {crossRefSummary && <span className="text-sm text-muted-foreground">{crossRefSummary}</span>}
          </div>

          {crossRefResultReady && (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={saveCrossRefResult} disabled={savingCrossRef}>
                {savingCrossRef ? "Saving…" : "Save result"}
              </Button>
              {filteredContactRows?.length === 0 && (
                <span className="text-xs text-muted-foreground">No rows to save (output will have headers only).</span>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
