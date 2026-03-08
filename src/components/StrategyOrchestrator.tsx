import { useState, useEffect } from "react";
import { api } from "../api/client";
import { getAITimeouts } from "../lib/settings";
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
    api.ollamaListModels().then((list) => {
      setModels(list);
      if (list.length > 0 && !selectedModel) setSelectedModel(list[0]);
    }).catch(() => setModels([])).finally(() => setLoadingModels(false));
  }, []);

  useEffect(() => {
    if (selectedModel?.trim()) api.ollamaPrewarm(selectedModel.trim()).catch(() => {});
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
        <CardHeader>
          <CardTitle>Report</CardTitle>
          <CardDescription>Strategy and takeaways from the agent.</CardDescription>
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
