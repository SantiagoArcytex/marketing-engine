import { useState, useEffect, useRef, useCallback } from "react";
import {
  MessageSquare,
  PanelRightClose,
  PanelBottomClose,
  X,
  User,
  Bot,
  Plus,
  MessageCircle,
  PenLine,
  Brain,
  GitBranch,
  Radio,
  Sparkles,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import { api } from "../api/client";
import { getAllAgentModes, getSystemPromptForMode, getAgentModeIconName } from "@/lib/agentModes";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const AGENT_MODE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  PenLine,
  Brain,
  GitBranch,
  Radio,
  MessageSquare,
  Sparkles,
};
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ChatMessageContent } from "@/components/ChatMessageContent";
import { cn } from "@/lib/utils";

const STORAGE_KEY_POSITION = "ai-chat-overlay-position";
const STORAGE_KEY_SESSIONS = "chat-sessions";
const TITLE_MAX_LEN = 40;
type OverlayPosition = "side" | "bottom";

type Message = { id: string; role: "user" | "assistant"; content: string };
type Chat = { id: string; title: string; messages: Message[] };

function genId(prefix = "id") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function getStoredPosition(): OverlayPosition {
  try {
    const v = localStorage.getItem(STORAGE_KEY_POSITION);
    if (v === "side" || v === "bottom") return v;
  } catch (_) {}
  return "side";
}

function setStoredPosition(pos: OverlayPosition) {
  try {
    localStorage.setItem(STORAGE_KEY_POSITION, pos);
  } catch (_) {}
}

function loadChatSessions(): Chat[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SESSIONS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((c: { id?: string; title?: string; messages?: unknown[] }) => ({
      id: typeof c.id === "string" ? c.id : genId("chat"),
      title: typeof c.title === "string" ? c.title : "New chat",
      messages: Array.isArray(c.messages)
        ? (c.messages as Message[]).filter(
            (m) => m && typeof m.id === "string" && typeof m.role === "string" && typeof m.content === "string"
          )
        : [],
    }));
  } catch (_) {
    return [];
  }
}

function saveChatSessions(chats: Chat[]) {
  try {
    localStorage.setItem(STORAGE_KEY_SESSIONS, JSON.stringify(chats));
  } catch (_) {}
}

const TYPING_CHUNK = 3;
const TYPING_INTERVAL_MS = 25;

/** Parse [CLARIFY: option1 | option2 | option3] from end of assistant message. */
function parseClarify(content: string): { main: string; options: string[] } {
  const match = content.match(/\n\[CLARIFY:\s*(.+?)\]\s*$/s);
  if (!match) return { main: content.trim(), options: [] };
  const main = content.slice(0, match.index).trim();
  const options = match[1].split("|").map((s) => s.trim()).filter(Boolean);
  return { main, options };
}

const FETCH_MARKER_RE = /\[FETCH:\s*(https:\/\/[^\]\s]+)\]/;
/** Parse first [FETCH: https://...] from content. Returns URL and content with marker removed for display. */
function parseFetch(content: string): { fetchUrl: string | null; contentWithoutMarker: string } {
  const match = content.match(FETCH_MARKER_RE);
  if (!match) return { fetchUrl: null, contentWithoutMarker: content };
  const fetchUrl = match[1];
  const contentWithoutMarker = content.replace(FETCH_MARKER_RE, "").trim().replace(/\s{2,}/g, " ");
  return { fetchUrl, contentWithoutMarker };
}

export default function ChatOverlay() {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<OverlayPosition>(getStoredPosition);
  const [chats, setChats] = useState<Chat[]>(() => loadChatSessions());
  const [activeChatId, setActiveChatId] = useState<string | null>(() => {
    const loaded = loadChatSessions();
    return loaded.length > 0 ? loaded[0].id : null;
  });
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [selectedAgentMode, setSelectedAgentMode] = useState<string>("general");
  const [loadingModels, setLoadingModels] = useState(true);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [pendingTyping, setPendingTyping] = useState<{
    chatId: string;
    messageId: string;
    full: string;
  } | null>(null);
  const [fetchingForMessageId, setFetchingForMessageId] = useState<string | null>(null);
  const [menuChatId, setMenuChatId] = useState<string | null>(null);
  const [renameChatId, setRenameChatId] = useState<string | null>(null);
  const [renameTitle, setRenameTitle] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  const activeChat = activeChatId ? chats.find((c) => c.id === activeChatId) : null;
  const messages = activeChat?.messages ?? [];

  const addChat = useCallback(() => {
    const newChat: Chat = { id: genId("chat"), title: "New chat", messages: [] };
    setChats((prev) => {
      const next = [...prev, newChat];
      saveChatSessions(next);
      return next;
    });
    setActiveChatId(newChat.id);
    setSendError(null);
  }, []);

  const updateChat = useCallback((chatId: string, updater: (c: Chat) => Chat) => {
    setChats((prev) => {
      const next = prev.map((c) => (c.id === chatId ? updater(c) : c));
      saveChatSessions(next);
      return next;
    });
  }, []);

  const deleteChat = useCallback((chatId: string) => {
    setMenuChatId(null);
    setChats((prev) => {
      const next = prev.filter((c) => c.id !== chatId);
      saveChatSessions(next);
      if (activeChatId === chatId) {
        setActiveChatId(next.length > 0 ? next[0].id : null);
      }
      return next;
    });
  }, [activeChatId]);

  const openRename = useCallback((c: Chat) => {
    setMenuChatId(null);
    setRenameChatId(c.id);
    setRenameTitle(c.title);
  }, []);

  const saveRename = useCallback(() => {
    if (!renameChatId) return;
    const title = renameTitle.trim() || "New chat";
    updateChat(renameChatId, (c) => ({ ...c, title }));
    setRenameChatId(null);
    setRenameTitle("");
  }, [renameChatId, renameTitle, updateChat]);

  const loadModels = async () => {
    setLoadingModels(true);
    setModelsError(null);
    try {
      const list = await api.ollamaListModels();
      setModels(list);
      if (list.length > 0) {
        const mode = getAllAgentModes().find((m) => m.id === selectedAgentMode);
        const recommended = mode?.recommendedModelName;
        const hasRecommended = recommended && list.includes(recommended);
        if (hasRecommended && (!selectedModel || !list.includes(selectedModel))) {
          setSelectedModel(recommended);
        } else if (!selectedModel || !list.includes(selectedModel)) {
          setSelectedModel(list[0]);
        }
      }
    } catch (e) {
      setModelsError("Ollama not available. Start Ollama and refresh.");
      setModels([]);
    } finally {
      setLoadingModels(false);
    }
  };

  useEffect(() => {
    if (open) loadModels();
  }, [open]);

  /** When persona changes, prefer recommended model for that mode if it's in the list. */
  useEffect(() => {
    if (models.length === 0) return;
    const mode = getAllAgentModes().find((m) => m.id === selectedAgentMode);
    const recommended = mode?.recommendedModelName;
    if (recommended && models.includes(recommended)) setSelectedModel(recommended);
  }, [selectedAgentMode]);

  /** Pre-warm selected model so the first message is fast (no cold start). */
  useEffect(() => {
    if (!selectedModel?.trim()) return;
    api.ollamaPrewarm(selectedModel.trim()).catch(() => {});
  }, [selectedModel]);

  useEffect(() => {
    listRef.current?.scrollTo(0, listRef.current.scrollHeight);
  }, [messages, pendingTyping]);

  const chatLoading = open && (sending || loadingModels);
  useEffect(() => {
    if (chatLoading) document.body.classList.add("chat-loading");
    else document.body.classList.remove("chat-loading");
    return () => document.body.classList.remove("chat-loading");
  }, [chatLoading]);

  const setPositionAndStore = (pos: OverlayPosition) => {
    setPosition(pos);
    setStoredPosition(pos);
  };

  const sendUserMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || !selectedModel || sending || !activeChatId) return;
      setSendError(null);

      const isFirstMessage = messages.length === 0;
      const userMsg: Message = { id: genId("msg"), role: "user", content: text.trim() };
      const assistantId = genId("msg");
      updateChat(activeChatId, (c) => ({
        ...c,
        title: isFirstMessage ? (text.trim().slice(0, TITLE_MAX_LEN) + (text.trim().length > TITLE_MAX_LEN ? "…" : "")) : c.title,
        messages: [...c.messages, userMsg, { id: assistantId, role: "assistant", content: "" }],
      }));

      setSending(true);
      const chatId = activeChatId;

      const unlistenChunk = await listen<string>("ollama-chunk", (event) => {
        const chunk = typeof event.payload === "string" ? event.payload : "";
        if (!chunk) return;
        updateChat(chatId, (c) => ({
          ...c,
          messages: c.messages.map((m) =>
            m.id === assistantId ? { ...m, content: m.content + chunk } : m
          ),
        }));
      });
      const unlistenDone = await listen("ollama-done", () => {
        unlistenChunk();
        unlistenDone();
        setSending(false);
      });

      try {
        await api.ollamaChatStream(
          selectedModel,
          text.trim(),
          getSystemPromptForMode(selectedAgentMode)
        );
      } catch (e) {
        setSendError(String(e));
        updateChat(chatId, (c) => ({
          ...c,
          messages: c.messages.map((m) =>
            m.id === assistantId ? { ...m, content: `Error: ${String(e)}` } : m
          ),
        }));
      } finally {
        unlistenChunk();
        unlistenDone();
        setSending(false);
      }
    },
    [activeChatId, selectedModel, selectedAgentMode, sending, messages.length, updateChat]
  );

  async function handleSend() {
    const text = input.trim();
    if (!text) return;
    setInput("");
    await sendUserMessage(text);
  }

  const handleFetchAllow = useCallback(
    async (chatId: string, messageId: string, url: string) => {
      if (!activeChatId || fetchingForMessageId) return;
      setFetchingForMessageId(messageId);
      try {
        const content = await api.fetchUrl(url);
        const truncated = content.length > 2000 ? content.slice(0, 2000) + "…" : content;
        updateChat(chatId, (c) => ({
          ...c,
          messages: c.messages.map((m) =>
            m.id === messageId
              ? { ...m, content: m.content.replace(FETCH_MARKER_RE, " (User allowed fetch). ") }
              : m
          ),
        }));
        const userContent = `[Fetched content from URL]:\n${truncated}`;
        await sendUserMessage(userContent);
      } catch (e) {
        setSendError(String(e));
      } finally {
        setFetchingForMessageId(null);
      }
    },
    [activeChatId, fetchingForMessageId, updateChat, sendUserMessage]
  );

  const handleFetchDeny = useCallback(
    (chatId: string, messageId: string) => {
      updateChat(chatId, (c) => ({
        ...c,
        messages: c.messages.map((m) =>
          m.id === messageId
            ? { ...m, content: m.content.replace(FETCH_MARKER_RE, " (User denied fetch). ") }
            : m
        ),
      }));
    },
    [updateChat]
  );

  useEffect(() => {
    if (!pendingTyping) return;
    const { chatId, messageId, full } = pendingTyping;
    let pos = 0;
    const id = setInterval(() => {
      pos = Math.min(pos + TYPING_CHUNK, full.length);
      updateChat(chatId, (c) => ({
        ...c,
        messages: c.messages.map((m) =>
          m.id === messageId ? { ...m, content: full.slice(0, pos) } : m
        ),
      }));
      if (pos >= full.length) {
        clearInterval(id);
        setPendingTyping(null);
      }
    }, TYPING_INTERVAL_MS);
    return () => clearInterval(id);
  }, [pendingTyping?.chatId, pendingTyping?.messageId, pendingTyping?.full]);

  useEffect(() => {
    if (!open) return;
    if (chats.length === 0) {
      const newChat: Chat = { id: genId("chat"), title: "New chat", messages: [] };
      setChats(() => {
        saveChatSessions([newChat]);
        return [newChat];
      });
      setActiveChatId(newChat.id);
    }
  }, [open]);

  if (!open) {
    return (
      <Button
        size="icon"
        className="fixed bottom-6 right-6 z-40 size-14 rounded-full shadow-lg"
        onClick={() => setOpen(true)}
        aria-label="Open chat"
      >
        <MessageSquare className="size-6" />
      </Button>
    );
  }

  const showSidebar = position === "side";
  const showTabBar = position === "bottom";

  return (
    <>
      <Button
        size="icon"
        className="fixed bottom-6 right-6 z-40 size-14 rounded-full shadow-lg"
        onClick={() => setOpen(true)}
        aria-label="Open chat"
      >
        <MessageSquare className="size-6" />
      </Button>

      <div
        role="dialog"
        aria-labelledby="chat-overlay-title"
        aria-describedby="chat-overlay-desc"
        className={cn(
          "fixed z-50 flex flex-col bg-background text-sm shadow-xl border border-border",
          position === "side" && "inset-y-0 right-0 h-full border-l rounded-l-xl max-w-lg sm:max-w-xl",
          position === "bottom" && "inset-x-0 bottom-0 max-h-[85vh] border-t rounded-t-xl",
          chatLoading && "cursor-default"
        )}
      >
        <header className="shrink-0 border-b border-border px-3 py-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <h2 id="chat-overlay-title" className="text-sm font-medium text-foreground truncate">
              Chat
            </h2>
            <span
              id="chat-overlay-desc"
              className="text-xs text-muted-foreground truncate"
              title="Uses your ads, patterns, and emails when you ask about them"
            >
              Market expert
            </span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant={position === "side" ? "secondary" : "ghost"}
              size="sm"
              className="size-8 p-0"
              onClick={() => setPositionAndStore("side")}
              title="Panel on side"
            >
              <PanelRightClose className="size-4" />
            </Button>
            <Button
              variant={position === "bottom" ? "secondary" : "ghost"}
              size="sm"
              className="size-8 p-0"
              onClick={() => setPositionAndStore("bottom")}
              title="Panel at bottom"
            >
              <PanelBottomClose className="size-4" />
            </Button>
            <Button variant="ghost" size="icon" className="size-8" onClick={() => setOpen(false)} aria-label="Close">
              <X className="size-4" />
            </Button>
          </div>
        </header>

        <div className="flex flex-1 min-h-0 overflow-hidden">
          {showSidebar && (
            <aside className="w-36 shrink-0 border-r border-border flex flex-col">
              <Button
                variant="ghost"
                size="sm"
                className="justify-start gap-2 rounded-none h-9"
                onClick={addChat}
              >
                <Plus className="size-4" />
                New chat
              </Button>
              <div className="flex-1 overflow-auto">
                {chats.map((c) => (
                  <div
                    key={c.id}
                    className={cn(
                      "group flex items-center gap-0 border-b border-border/50",
                      activeChatId === c.id && "bg-sidebar-accent text-sidebar-accent-foreground"
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setActiveChatId(c.id);
                        setSendError(null);
                        setMenuChatId(null);
                      }}
                      className={cn(
                        "flex-1 min-w-0 text-left px-3 py-2 text-xs rounded-none truncate",
                        activeChatId === c.id
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "text-muted-foreground hover:bg-muted/50"
                      )}
                      title={c.title}
                    >
                      <MessageCircle className="size-3.5 inline mr-1.5 shrink-0 align-middle" />
                      {c.title}
                    </button>
                    <div className="relative shrink-0 pr-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 opacity-70 hover:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuChatId((id) => (id === c.id ? null : c.id));
                        }}
                        aria-label="Chat options"
                      >
                        <MoreHorizontal className="size-3.5" />
                      </Button>
                      {menuChatId === c.id && (
                        <>
                          <div
                            className="fixed inset-0 z-10"
                            aria-hidden
                            onClick={() => setMenuChatId(null)}
                          />
                          <div className="absolute right-0 top-full z-20 mt-0.5 min-w-[120px] rounded-md border border-border bg-popover py-1 shadow-md">
                            <button
                              type="button"
                              className="flex w-full items-center gap-2 px-2 py-1.5 text-xs hover:bg-accent"
                              onClick={() => openRename(c)}
                            >
                              <Pencil className="size-3.5" />
                              Rename
                            </button>
                            <button
                              type="button"
                              className="flex w-full items-center gap-2 px-2 py-1.5 text-xs text-destructive hover:bg-accent"
                              onClick={() => deleteChat(c.id)}
                            >
                              <Trash2 className="size-3.5" />
                              Delete
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </aside>
          )}

          <div className="flex-1 flex flex-col min-w-0">
            {showTabBar && (
              <div className="shrink-0 flex items-center gap-0.5 border-b border-border px-2 py-1 overflow-x-auto">
                <Button variant="ghost" size="sm" className="h-7 gap-1 shrink-0" onClick={addChat}>
                  <Plus className="size-3.5" />
                  New
                </Button>
                {chats.map((c) => (
                  <div key={c.id} className="relative flex items-center shrink-0 group/tab">
                    <Button
                      variant={activeChatId === c.id ? "secondary" : "ghost"}
                      size="sm"
                      className="h-7 max-w-[120px] shrink-0 truncate text-xs pr-6"
                      onClick={() => {
                        setActiveChatId(c.id);
                        setSendError(null);
                        setMenuChatId(null);
                      }}
                    >
                      {c.title}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-1/2 -translate-y-1/2 h-6 w-6 opacity-70 hover:opacity-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuChatId((id) => (id === c.id ? null : c.id));
                      }}
                      aria-label="Chat options"
                    >
                      <MoreHorizontal className="size-3.5" />
                    </Button>
                    {menuChatId === c.id && (
                      <>
                        <div
                          className="fixed inset-0 z-10"
                          aria-hidden
                          onClick={() => setMenuChatId(null)}
                        />
                        <div className="absolute left-0 top-full z-20 mt-0.5 min-w-[120px] rounded-md border border-border bg-popover py-1 shadow-md">
                          <button
                            type="button"
                            className="flex w-full items-center gap-2 px-2 py-1.5 text-xs hover:bg-accent"
                            onClick={() => openRename(c)}
                          >
                            <Pencil className="size-3.5" />
                            Rename
                          </button>
                          <button
                            type="button"
                            className="flex w-full items-center gap-2 px-2 py-1.5 text-xs text-destructive hover:bg-accent"
                            onClick={() => deleteChat(c.id)}
                          >
                            <Trash2 className="size-3.5" />
                            Delete
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-border shrink-0">
              <Select
                value={selectedAgentMode}
                onValueChange={(v) => v != null && setSelectedAgentMode(v)}
              >
                <SelectTrigger size="sm" className="h-8 text-xs w-fit min-w-[140px]" title="Agent persona">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {getAllAgentModes().map((m) => {
                    const IconComponent = AGENT_MODE_ICONS[getAgentModeIconName(m.id)] ?? MessageSquare;
                    return (
                      <SelectItem key={m.id} value={m.id}>
                        <IconComponent className="size-4 shrink-0" />
                        <span>{m.label}</span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {loadingModels ? (
                <Skeleton className="h-8 w-32" />
              ) : (
                <select
                  className="h-8 rounded-md border border-input bg-transparent px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring dark:bg-input/30"
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
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={loadModels} disabled={loadingModels}>
                Refresh
              </Button>
            </div>
            {modelsError && <p className="px-3 text-xs text-destructive">{modelsError}</p>}

            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              <div ref={listRef} className="flex-1 space-y-4 overflow-auto p-4">
                {!activeChatId && (
                  <p className="text-sm text-muted-foreground">Start a conversation. Create a new chat or select one.</p>
                )}
                {activeChatId && messages.length === 0 && !sendError && (
                  <p className="text-sm text-muted-foreground">Start a conversation.</p>
                )}
                {messages.map((msg) => {
                  const isAssistant = msg.role === "assistant";
                  const { main: displayContent, options: clarifyOptions } = isAssistant
                    ? parseClarify(msg.content)
                    : { main: msg.content, options: [] as string[] };
                  const { fetchUrl, contentWithoutMarker: contentForBubble } = isAssistant
                    ? parseFetch(displayContent)
                    : { fetchUrl: null as string | null, contentWithoutMarker: displayContent };
                  return (
                    <div
                      key={msg.id}
                      className={cn(
                        "flex gap-2 items-start max-w-[90%]",
                        msg.role === "user" ? "ml-auto flex-row-reverse" : "mr-auto"
                      )}
                    >
                      <div
                        className={cn(
                          "flex size-8 shrink-0 items-center justify-center rounded-full",
                          msg.role === "user"
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground"
                        )}
                      >
                        {msg.role === "user" ? <User className="size-4" /> : <Bot className="size-4" />}
                      </div>
                      <div className="flex flex-col gap-2 min-w-0">
                        <div
                          className={cn(
                            "rounded-xl px-3 py-2.5 text-sm min-h-[44px]",
                            msg.role === "user"
                              ? "bg-primary text-primary-foreground"
                              : "border border-border bg-muted/50 text-foreground"
                          )}
                        >
                          <ChatMessageContent role={msg.role} content={contentForBubble} />
                        </div>
                        {fetchUrl != null && (
                          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 px-2 py-1.5 text-xs">
                            <span className="text-muted-foreground">Agent wants to fetch:</span>
                            <a
                              href={fetchUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="truncate max-w-[200px] text-primary underline"
                            >
                              {fetchUrl}
                            </a>
                            <div className="flex gap-1">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => handleFetchAllow(activeChatId!, msg.id, fetchUrl)}
                                disabled={sending || !activeChatId || fetchingForMessageId != null}
                              >
                                {fetchingForMessageId === msg.id ? "…" : "Allow"}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => handleFetchDeny(activeChatId!, msg.id)}
                                disabled={!activeChatId}
                              >
                                Deny
                              </Button>
                            </div>
                          </div>
                        )}
                        {clarifyOptions.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {clarifyOptions.map((opt) => (
                              <Button
                                key={opt}
                                variant="outline"
                                size="sm"
                                className="text-xs h-8"
                                onClick={() => sendUserMessage(opt)}
                                disabled={sending || !selectedModel || !activeChatId}
                              >
                                {opt}
                              </Button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                {sending && activeChatId && (
                  <div className="flex gap-2 items-start mr-auto max-w-[90%]">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                      <Bot className="size-4" />
                    </div>
                    <div className="rounded-xl border border-border bg-muted/50 px-3 py-2.5 min-h-[44px] flex items-center gap-1.5 text-muted-foreground text-sm">
                      <span className="flex gap-1 items-center" aria-hidden>
                        <span className="size-2 rounded-full bg-muted-foreground/80 animate-bounce [animation-delay:0ms]" />
                        <span className="size-2 rounded-full bg-muted-foreground/80 animate-bounce [animation-delay:150ms]" />
                        <span className="size-2 rounded-full bg-muted-foreground/80 animate-bounce [animation-delay:300ms]" />
                      </span>
                      <span className="text-xs">Thinking…</span>
                    </div>
                  </div>
                )}
              </div>

              {sendError && <p className="px-4 text-sm text-destructive">{sendError}</p>}

              <div className="shrink-0 flex gap-2 border-t border-border p-4">
                <Input
                  className="min-h-[44px] flex-1"
                  placeholder="Ask anything…"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                  disabled={sending || !selectedModel || models.length === 0 || !activeChatId}
                />
                <Button
                  className="min-h-[44px]"
                  onClick={handleSend}
                  disabled={
                    sending || !input.trim() || !selectedModel || models.length === 0 || !activeChatId
                  }
                >
                  {sending ? "…" : "Send"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={renameChatId != null} onOpenChange={(open) => !open && (setRenameChatId(null), setRenameTitle(""))}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rename chat</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Input
              value={renameTitle}
              onChange={(e) => setRenameTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (saveRename(), setRenameChatId(null))}
              placeholder="Chat title"
              maxLength={TITLE_MAX_LEN}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRenameChatId(null); setRenameTitle(""); }}>
              Cancel
            </Button>
            <Button onClick={() => { saveRename(); setRenameChatId(null); }}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
