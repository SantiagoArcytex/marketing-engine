import { useState, useEffect } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { api } from "../api/client";
import { getAITimeouts, getChatSettings } from "../lib/settings";
import { useTaskStatus } from "../contexts/TaskStatusContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

const MODULE_ID = "strategy-orchestrator";

export default function StrategyOrchestrator() {
  const { setTaskStatus } = useTaskStatus();
  const [query, setQuery] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [loadingModels, setLoadingModels] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<string>("");

  useEffect(() => {
    api.ollamaListModels(getChatSettings().ollamaBaseUrl).then((list) => {
      setModels(list);
      if (list.length > 0 && !selectedModel) setSelectedModel(list[0]);
    }).catch(() => setModels([])).finally(() => setLoadingModels(false));
  }, []);

  useEffect(() => {
    if (selectedModel?.trim()) api.ollamaPrewarm(selectedModel.trim(), getChatSettings().ollamaBaseUrl).catch(() => {});
  }, [selectedModel]);

  async function handleRun() {
    setLoading(true);
    setError(null);
    setReport("");
    setTaskStatus(MODULE_ID, "running");
    try {
      const result = await api.runStrategyAgent(
        query.trim() || "General marketing strategy",
        selectedModel && models.length > 0 ? selectedModel : null,
        getAITimeouts().strategy
      );
      setReport(result ?? "");
      setTaskStatus(MODULE_ID, "success");
      toast.success("Strategy report generated");
    } catch (e) {
      const msg = String(e);
      setError(msg);
      setTaskStatus(MODULE_ID, "idle");
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleExportMarkdown() {
    if (!report.trim()) return;
    try {
      const path = await save({
        defaultPath: "market-intelligence-report.md",
        filters: [{ name: "Markdown", extensions: ["md"] }],
        title: "Export report (Markdown)",
      });
      if (path) {
        await api.writeExportFile(path, report);
        toast.success("Report saved");
      }
    } catch (e) {
      toast.error(String(e));
    }
  }

  function handleExportPdf() {
    if (!report.trim()) return;
    const win = window.open("", "_blank", "noopener,noreferrer");
    if (!win) {
      toast.error("Allow pop-ups to export PDF");
      return;
    }
    win.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Market Intelligence Report</title>
          <style>
            body { font-family: system-ui, sans-serif; max-width: 720px; margin: 2rem auto; padding: 0 1rem; line-height: 1.6; color: #1a1a1a; }
            pre { white-space: pre-wrap; background: #f4f4f4; padding: 1rem; border-radius: 6px; }
            h1 { font-size: 1.5rem; margin-top: 1.5rem; }
            h2 { font-size: 1.2rem; margin-top: 1.2rem; }
            strong { font-weight: 600; }
          </style>
        </head>
        <body>
          <pre>${report.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre>
        </body>
      </html>
    `);
    win.document.close();
    win.focus();
    setTimeout(() => {
      win.print();
      win.close();
    }, 300);
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold tracking-tight">Strategy Orchestrator</h2>
      <p className="text-sm text-muted-foreground">
        Get data-driven strategy and key takeaways from your ads and email verification data.
      </p>

      <Card>
        <CardHeader>
          <CardTitle>Run strategy agent</CardTitle>
          <CardDescription>Enter a query or focus area. Select an LLM for data-driven, model-generated report.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-3">
            <label className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span className="text-sm font-medium">Query or focus</span>
              <textarea
                className="min-h-[88px] w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 dark:bg-input/30"
                placeholder="e.g. B2B SaaS launch, ecommerce hooks"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleRun()}
                rows={3}
              />
            </label>
            <label className="flex flex-col gap-1.5 shrink-0">
              <span className="text-sm font-medium">Model (optional)</span>
              {loadingModels ? (
                <Skeleton className="h-11 w-40" />
              ) : (
                <select
                  className="h-11 min-h-[44px] w-40 rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring dark:bg-input/30"
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                >
                  <option value="">Static report</option>
                  {models.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              )}
            </label>
            <Button
              className="min-h-[44px] shrink-0"
              onClick={handleRun}
              disabled={loading}
            >
              {loading ? "Running…" : "Run agent"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="flex items-center justify-between rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <span>{error}</span>
          <button type="button" className="shrink-0 underline focus:outline-none" onClick={() => setError(null)} aria-label="Dismiss">Dismiss</button>
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Report</CardTitle>
            <CardDescription>Strategy and takeaways from the agent.</CardDescription>
          </div>
          {report.trim() && (
            <div className="flex gap-2 shrink-0">
              <Button variant="outline" size="sm" onClick={handleExportMarkdown}>
                Export Markdown
              </Button>
              <Button variant="outline" size="sm" onClick={handleExportPdf}>
                Export PDF
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-4/5" />
            </div>
          ) : !report ? (
            <div className="flex min-h-[200px] flex-col items-center justify-center rounded-lg border border-border py-12 text-center text-muted-foreground">
              <p className="font-medium">No report yet</p>
              <p className="mt-1 text-sm">Run the agent above to generate a strategy report.</p>
            </div>
          ) : (
            <pre className="whitespace-pre-wrap rounded-lg border border-border bg-muted/30 p-4 font-mono text-sm">
              {report}
            </pre>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
