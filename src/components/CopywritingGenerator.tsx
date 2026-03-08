import { useState, useEffect } from "react";
import { api } from "../api/client";
import { getAITimeouts } from "../lib/settings";
import { useTaskStatus } from "../contexts/TaskStatusContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

const MODULE_ID = "copywriting-generator";

export default function CopywritingGenerator() {
  const { setTaskStatus } = useTaskStatus();
  const [hook, setHook] = useState("");
  const [offer, setOffer] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [loadingModels, setLoadingModels] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [variants, setVariants] = useState<string[]>([]);

  useEffect(() => {
    api.ollamaListModels().then((list) => {
      setModels(list);
      if (list.length > 0 && !selectedModel) setSelectedModel(list[0]);
    }).catch(() => setModels([])).finally(() => setLoadingModels(false));
  }, []);

  useEffect(() => {
    if (selectedModel?.trim()) api.ollamaPrewarm(selectedModel.trim()).catch(() => {});
  }, [selectedModel]);

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    setVariants([]);
    setTaskStatus(MODULE_ID, "running");
    try {
      const result = await api.generateCopyVariants({
        hook: hook.trim() || undefined,
        offer: offer.trim() || undefined,
        model: selectedModel && models.length > 0 ? selectedModel : null,
        timeoutSecs: getAITimeouts().copywriting,
      });
      setVariants(result ?? []);
      setTaskStatus(MODULE_ID, "success");
      toast.success(result?.length ? `Generated ${result.length} variant(s)` : "Copy variants generated");
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
      <h2 className="text-xl font-semibold tracking-tight">Copywriting Generator</h2>
      <p className="text-sm text-muted-foreground">
        Generate ad copy variants from hooks and offers (template-based).
      </p>

      <Card>
        <CardHeader>
          <CardTitle>Generate variants</CardTitle>
          <CardDescription>Enter a hook and/or offer. Optionally select an LLM for richer, model-generated copy.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Hook</span>
              <Input
                className="h-11 min-h-[44px] w-48"
                placeholder="e.g. Save time"
                value={hook}
                onChange={(e) => setHook(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Offer</span>
              <Input
                className="h-11 min-h-[44px] w-48"
                placeholder="e.g. Free trial"
                value={offer}
                onChange={(e) => setOffer(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Model (optional)</span>
              {loadingModels ? (
                <Skeleton className="h-11 w-40" />
              ) : (
                <select
                  className="h-11 min-h-[44px] w-48 rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring dark:bg-input/30"
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                >
                  <option value="">Template only</option>
                  {models.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              )}
            </label>
            <Button className="min-h-[44px]" onClick={handleGenerate} disabled={loading}>
              {loading ? "Generating…" : "Generate variants"}
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

      {variants.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Variants</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {variants.map((v, i) => (
              <p key={i} className="text-sm text-foreground">{v}</p>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
