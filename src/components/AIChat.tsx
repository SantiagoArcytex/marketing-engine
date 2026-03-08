import { useState, useEffect, useRef } from "react";
import { api } from "../api/client";
import { getAITimeouts, getChatSettings } from "../lib/settings";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

type Message = { role: "user" | "assistant"; content: string };

export default function AIChat() {
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [loadingModels, setLoadingModels] = useState(true);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const loadModels = async () => {
    setLoadingModels(true);
    setModelsError(null);
    try {
      const list = await api.ollamaListModels(getChatSettings().ollamaBaseUrl);
      setModels(list);
      if (list.length > 0 && !selectedModel) setSelectedModel(list[0]);
    } catch (e) {
      setModelsError("Ollama not available. Start Ollama and refresh.");
      setModels([]);
    } finally {
      setLoadingModels(false);
    }
  };

  useEffect(() => {
    loadModels();
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo(0, listRef.current.scrollHeight);
  }, [messages]);

  async function handleSend() {
    const text = input.trim();
    if (!text || !selectedModel || sending) return;
    setInput("");
    setSendError(null);
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setSending(true);
    try {
      const settings = getChatSettings();
      const reply = await api.ollamaChat(
        selectedModel,
        text,
        getAITimeouts().chat,
        undefined,
        settings.secSummaryModel || undefined,
        settings.ollamaBaseUrl,
        settings.numCtx,
        settings.numPredict,
        settings.useCloud,
        settings.cloudProvider,
        settings.cloudApiKey,
        settings.cloudModel || undefined,
        settings.cloudBaseUrl || undefined
      );
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch (e) {
      setSendError(String(e));
      setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${String(e)}` }]);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold tracking-tight">AI Chat</h2>
      <p className="text-sm text-muted-foreground">
        Chat with a local Ollama model. Context from your ads, patterns, and verified emails is included so the AI can verify, validate, and suggest using your data.
      </p>

      <Card>
        <CardHeader>
          <CardTitle>Chat</CardTitle>
          <CardDescription>Select a model and ask questions about your marketing data.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Model</span>
              {loadingModels ? (
                <Skeleton className="h-11 w-48" />
              ) : (
                <select
                  className="h-11 min-h-[44px] w-56 rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring dark:bg-input/30"
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                >
                  {models.length === 0 ? (
                    <option value="">No models</option>
                  ) : (
                    models.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))
                  )}
                </select>
              )}
            </label>
            <Button variant="outline" size="sm" className="min-h-[44px]" onClick={loadModels} disabled={loadingModels}>
              Refresh models
            </Button>
          </div>
          {modelsError && (
            <p className="text-sm text-destructive">{modelsError}</p>
          )}

          <div
            ref={listRef}
            className="flex min-h-[280px] flex-col gap-3 overflow-auto rounded-lg border border-border bg-muted/30 p-4"
          >
            {messages.length === 0 && !sendError && (
              <p className="text-sm text-muted-foreground">Send a message to start. The AI has access to your ads, pattern stats, and email verification summary.</p>
            )}
            {messages.map((msg, i) => (
              <div
                key={i}
                className={msg.role === "user" ? "ml-auto max-w-[85%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground" : "mr-auto max-w-[85%] rounded-lg border border-border bg-background px-3 py-2 text-sm"}
              >
                <p className="whitespace-pre-wrap">{msg.content}</p>
              </div>
            ))}
            {sending && (
              <div className="mr-auto max-w-[85%] rounded-lg border border-border bg-background px-3 py-2 text-sm text-muted-foreground">
                Thinking…
              </div>
            )}
          </div>

          {sendError && (
            <p className="text-sm text-destructive">{sendError}</p>
          )}

          <div className="flex gap-2">
            <Input
              className="min-h-[44px] flex-1"
              placeholder="Ask about your ads, patterns, or email data…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
              disabled={sending || !selectedModel || models.length === 0}
            />
            <Button className="min-h-[44px]" onClick={handleSend} disabled={sending || !input.trim() || !selectedModel || models.length === 0}>
              {sending ? "Sending…" : "Send"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
