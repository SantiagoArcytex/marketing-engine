import { useState, useEffect } from "react";
import { Plus, Trash2, FileDown, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAITimeouts, setAITimeouts, AI_TIMEOUT_LIMITS, getScrapeSettings, setScrapeSettings, getChatSettings, setChatSettings, type ScrapeSettings, type ChatSettings } from "@/lib/settings";
import {
  getCustomModes,
  addCustomMode,
  removeCustomMode,
  type CustomAgentMode,
} from "@/lib/agentModes";
import { api } from "@/api/client";
import { toast } from "sonner";

export default function SettingsScreen() {
  const [timeouts, setTimeouts] = useState(getAITimeouts);
  const [customModes, setCustomModes] = useState<CustomAgentMode[]>(() => getCustomModes());
  const [addOpen, setAddOpen] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newPrompt, setNewPrompt] = useState("");
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [scrapeSettings, setScrapeSettingsState] = useState<ScrapeSettings>(() => getScrapeSettings());
  const [chatSettings, setChatSettingsState] = useState<ChatSettings>(() => getChatSettings());

  useEffect(() => {
    setTimeouts(getAITimeouts());
  }, []);

  const updateScrapeSettings = (next: Partial<ScrapeSettings>) => {
    const updated = setScrapeSettings(next);
    setScrapeSettingsState(updated);
  };

  const updateChatSettings = (next: Partial<ChatSettings>) => {
    const updated = setChatSettings(next);
    setChatSettingsState(updated);
  };

  const updateTimeout = (key: "copywriting" | "chat" | "strategy", value: number) => {
    const next = setAITimeouts({ [key]: value });
    setTimeouts(next);
  };

  const handleAddMode = () => {
    const label = newLabel.trim();
    const systemPrompt = newPrompt.trim();
    if (!label || !systemPrompt) {
      toast.error("Name and system prompt are required.");
      return;
    }
    addCustomMode(label, systemPrompt);
    setCustomModes(getCustomModes());
    setAddOpen(false);
    setNewLabel("");
    setNewPrompt("");
    toast.success("Agent added.");
  };

  const handleRemoveMode = (id: string) => {
    removeCustomMode(id);
    setCustomModes(getCustomModes());
    toast.success("Mode removed.");
  };

  const handleCreateModelfile = async (mode: CustomAgentMode) => {
    setExportingId(mode.id);
    try {
      const path = await api.writeModelfile(mode.label, mode.systemPrompt);
      if (path != null) toast.success(`Modelfile saved to ${path}`);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setExportingId(null);
    }
  };

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Settings</h2>
        <p className="text-muted-foreground mt-1">AI timeouts, scraping options, and custom agents.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Scraping</CardTitle>
          <CardDescription>
            Optional proxy for scrape requests (e.g. http://proxy:port or socks5://…). Rate limit caps requests per minute when scraping multiple URLs.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <label className="grid gap-1.5">
            <span className="text-sm font-medium">Proxy URL (optional)</span>
            <Input
              type="url"
              placeholder="http://… or socks5://…"
              value={scrapeSettings.proxyUrl}
              onChange={(e) => updateScrapeSettings({ proxyUrl: e.target.value })}
            />
          </label>
          <label className="grid gap-1.5">
            <span className="text-sm font-medium">Rate limit (requests per minute, 0 = no limit)</span>
            <Input
              type="number"
              min={0}
              max={60}
              value={scrapeSettings.rateLimitPerMinute || ""}
              onChange={(e) => updateScrapeSettings({ rateLimitPerMinute: parseInt(e.target.value, 10) || 0 })}
              placeholder="0"
            />
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>AI timeouts</CardTitle>
          <CardDescription>
            Maximum time for each AI request. Shorter = faster but may cut off long answers. Changes are saved automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <label className="grid gap-1.5">
            <span className="text-sm font-medium">Copywriting (quick ideas), seconds</span>
            <Input
              type="number"
              min={AI_TIMEOUT_LIMITS.copywriting.min}
              max={AI_TIMEOUT_LIMITS.copywriting.max}
              value={timeouts.copywriting}
              onChange={(e) => updateTimeout("copywriting", parseInt(e.target.value, 10) || 15)}
            />
          </label>
          <label className="grid gap-1.5">
            <span className="text-sm font-medium">Chat, seconds</span>
            <Input
              type="number"
              min={AI_TIMEOUT_LIMITS.chat.min}
              max={AI_TIMEOUT_LIMITS.chat.max}
              value={timeouts.chat}
              onChange={(e) => updateTimeout("chat", parseInt(e.target.value, 10) || 60)}
            />
          </label>
          <label className="grid gap-1.5">
            <span className="text-sm font-medium">Strategy & analysis, seconds</span>
            <Input
              type="number"
              min={AI_TIMEOUT_LIMITS.strategy.min}
              max={AI_TIMEOUT_LIMITS.strategy.max}
              value={timeouts.strategy}
              onChange={(e) => updateTimeout("strategy", parseInt(e.target.value, 10) || 120)}
            />
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Chat backend</CardTitle>
          <CardDescription>
            Choose between a local Ollama model or cloud APIs (Gemini, Groq, OpenRouter) for chat. Local is in development.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <fieldset className="grid gap-4">
            <legend className="text-sm font-medium sr-only">Chat backend</legend>
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="chat-backend"
                  checked={!chatSettings.useCloud}
                  onChange={() => updateChatSettings({ useCloud: false })}
                  className="border-input"
                />
                <span className="text-sm">Local (Ollama) — In development</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="chat-backend"
                  checked={chatSettings.useCloud}
                  onChange={() => updateChatSettings({ useCloud: true })}
                  className="border-input"
                />
                <span className="text-sm">Cloud API (Gemini, Groq, OpenRouter)</span>
              </label>
            </div>

            {!chatSettings.useCloud && (
              <Card className="bg-muted/30">
                <CardHeader className="py-3">
                  <CardTitle className="text-sm">Local (Ollama) options</CardTitle>
                  <CardDescription className="text-xs">
                    Local inference is experimental and may change.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 pt-0">
                  <label className="grid gap-1.5">
                    <span className="text-sm font-medium">SEC summary model (optional)</span>
                    <Input
                      type="text"
                      placeholder="e.g. llama3.2 (leave empty for raw SEC list)"
                      value={chatSettings.secSummaryModel}
                      onChange={(e) => updateChatSettings({ secSummaryModel: e.target.value })}
                    />
                    <p className="text-xs text-muted-foreground">
                      When set, SEC filings in chat context are summarized into 2–3 key points per company. Saves context tokens; requires an extra Ollama call per message.
                    </p>
                  </label>
                  <div className="space-y-4">
                    <p className="text-sm font-medium">Inference / speed</p>
                    <p className="text-xs text-muted-foreground">
                      Lower context and max tokens = faster replies. Use defaults unless you need longer context or answers.
                    </p>
                    <label className="grid gap-1.5">
                      <span className="text-sm font-medium">Context size (num_ctx)</span>
                      <Input
                        type="number"
                        min={512}
                        max={16384}
                        value={chatSettings.numCtx}
                        onChange={(e) => updateChatSettings({ numCtx: parseInt(e.target.value, 10) || 4096 })}
                      />
                      <p className="text-xs text-muted-foreground">Lower = faster, less context.</p>
                    </label>
                    <label className="grid gap-1.5">
                      <span className="text-sm font-medium">Max tokens (num_predict)</span>
                      <Input
                        type="number"
                        min={256}
                        max={4096}
                        value={chatSettings.numPredict}
                        onChange={(e) => updateChatSettings({ numPredict: parseInt(e.target.value, 10) || 2048 })}
                      />
                      <p className="text-xs text-muted-foreground">Lower = faster, shorter replies.</p>
                    </label>
                    <label className="grid gap-1.5">
                      <span className="text-sm font-medium">Ollama URL</span>
                      <Input
                        type="url"
                        placeholder="http://localhost:11434"
                        value={chatSettings.ollamaBaseUrl}
                        onChange={(e) => updateChatSettings({ ollamaBaseUrl: e.target.value })}
                      />
                      <p className="text-xs text-muted-foreground">Leave default unless you use a different server or port.</p>
                    </label>
                  </div>
                </CardContent>
              </Card>
            )}

            {chatSettings.useCloud && (
              <Card className="bg-muted/30">
                <CardHeader className="py-3">
                  <CardTitle className="text-sm">Cloud API options</CardTitle>
                  <CardDescription className="text-xs">
                    Use any LLM API: add your API key and the model name. Optionally set an API base URL for OpenAI-compatible endpoints. Do not send sensitive client data to free-tier APIs.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 pt-0">
                  <label className="grid gap-1.5">
                    <span className="text-sm font-medium">API key</span>
                    <Input
                      type="password"
                      placeholder="Paste your API key"
                      value={chatSettings.cloudApiKey}
                      onChange={(e) => updateChatSettings({ cloudApiKey: e.target.value })}
                    />
                  </label>
                  <label className="grid gap-1.5">
                    <span className="text-sm font-medium">Model name</span>
                    <Input
                      type="text"
                      placeholder="e.g. gpt-4o, gemini-2.0-flash, llama-4-scout-17b-16e-instant"
                      value={chatSettings.cloudModel}
                      onChange={(e) => updateChatSettings({ cloudModel: e.target.value })}
                    />
                    <p className="text-xs text-muted-foreground">
                      Name of the model to use. Required when using a custom API base URL.
                    </p>
                  </label>
                  <label className="grid gap-1.5">
                    <span className="text-sm font-medium">API base URL (optional)</span>
                    <Input
                      type="url"
                      placeholder="e.g. https://api.openai.com/v1 or https://openrouter.ai/api/v1"
                      value={chatSettings.cloudBaseUrl}
                      onChange={(e) => updateChatSettings({ cloudBaseUrl: e.target.value })}
                    />
                    <p className="text-xs text-muted-foreground">
                      Leave empty to use a default (OpenRouter). Set this to use any OpenAI-compatible API.
                    </p>
                  </label>
                </CardContent>
              </Card>
            )}
          </fieldset>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Custom agents</CardTitle>
          <CardDescription>
            Add and name custom agents that appear in the chat persona selector. Give each agent a name and a system prompt; you can export a Modelfile for Ollama.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button variant="outline" size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="size-4 mr-2" />
            Add custom agent
          </Button>
          {customModes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No custom agents yet. Add one and name them to use in chat.</p>
          ) : (
            <ul className="space-y-3">
              {customModes.map((mode) => (
                <li
                  key={mode.id}
                  className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2"
                >
                  <Sparkles className="size-4 text-muted-foreground shrink-0" />
                  <span className="flex-1 min-w-0 truncate font-medium">{mode.label}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0 h-8"
                    onClick={() => handleCreateModelfile(mode)}
                    disabled={exportingId !== null}
                  >
                    {exportingId === mode.id ? "Saving…" : (
                      <>
                        <FileDown className="size-4 mr-1" />
                        Create Modelfile
                      </>
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0 h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => handleRemoveMode(mode.id)}
                    aria-label={`Remove ${mode.label}`}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={addOpen} onOpenChange={(open) => setAddOpen(open)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add custom agent</DialogTitle>
            <DialogDescription>
              Name your agent and set its system prompt. It will appear in the chat persona selector; you can export a Modelfile for Ollama.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <label className="grid gap-1.5">
              <span className="text-sm font-medium">Name</span>
              <Input
                placeholder="e.g. Brand voice, SaaS expert"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
              />
            </label>
            <label className="grid gap-1.5">
              <span className="text-sm font-medium">System prompt</span>
              <textarea
                className="flex min-h-[120px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                placeholder="You are a…"
                value={newPrompt}
                onChange={(e) => setNewPrompt(e.target.value)}
              />
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddMode}>
              Add mode
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
