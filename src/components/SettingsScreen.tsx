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
import { getAITimeouts, setAITimeouts, AI_TIMEOUT_LIMITS } from "@/lib/settings";
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

  useEffect(() => {
    setTimeouts(getAITimeouts());
  }, []);

  const updateTimeout = (key: "copywriting" | "chat" | "strategy", value: number) => {
    const next = setAITimeouts({ [key]: value });
    setTimeouts(next);
  };

  const handleAddMode = () => {
    const label = newLabel.trim();
    const systemPrompt = newPrompt.trim();
    if (!label || !systemPrompt) {
      toast.error("Label and system prompt are required.");
      return;
    }
    addCustomMode(label, systemPrompt);
    setCustomModes(getCustomModes());
    setAddOpen(false);
    setNewLabel("");
    setNewPrompt("");
    toast.success("Mode added.");
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
        <p className="text-muted-foreground mt-1">AI timeouts and custom chat agent modes.</p>
      </div>

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
          <CardTitle>Custom agent modes</CardTitle>
          <CardDescription>
            Create modes that appear in the chat persona selector. Export a Modelfile (e.g. Modelfile.qwen) to use with Ollama.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button variant="outline" size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="size-4 mr-2" />
            Add mode
          </Button>
          {customModes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No custom modes yet. Add one to prompt your own agent persona.</p>
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
            <DialogTitle>Add custom mode</DialogTitle>
            <DialogDescription>
              Give the mode a label and a system prompt. It will appear in the chat persona selector and you can export a Modelfile for Ollama.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <label className="grid gap-1.5">
              <span className="text-sm font-medium">Label</span>
              <Input
                placeholder="e.g. Brand voice"
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
