/**
 * Agent modes (personas) for the FAB chat.
 * Built-in modes plus custom modes (stored in localStorage) that the user can create in Settings.
 */

export const AGENT_MODE_IDS = [
  "create_copy",
  "strategy",
  "funnel",
  "competitor",
  "general",
] as const;

export type AgentModeId = (typeof AGENT_MODE_IDS)[number];

export interface AgentMode {
  id: string;
  label: string;
  recommendedModelName: string;
  systemPrompt: string;
  /** Lucide icon name for the mode selector (e.g. "PenLine", "Brain"). */
  icon: string;
}

/** Custom mode shape stored in localStorage (id is "custom-<slug>"). */
export interface CustomAgentMode {
  id: string;
  label: string;
  systemPrompt: string;
  recommendedModelName: string;
}

const STORAGE_KEY_CUSTOM_MODES = "custom-agent-modes";

const MODE_SYSTEM_PROMPTS: Record<AgentModeId, string> = {
  create_copy:
    "You are a copywriting expert for the Marketing Intelligence Engine. Generate ad variants and headlines; use hooks and offers from the context when relevant. Ask for clarification when the goal or audience is unclear. When you need the user to choose, end your message with a newline and exactly: [CLARIFY: option1 | option2 | option3]. If you need to look something up online, use [FETCH: https://url] and the app will ask the user for permission.",
  strategy:
    "You are a marketing strategy analyst for the Marketing Intelligence Engine. Use the provided data (ads, pattern stats, verified emails, SEC filings) when the user asks about their data. Produce clear strategy recommendations and key takeaways. Ask for clarification when scope or objectives are ambiguous. When you need the user to choose, end your message with a newline and exactly: [CLARIFY: option1 | option2 | option3]. If you need to look something up online, use [FETCH: https://url] and the app will ask the user for permission.",
  funnel:
    "You are a funnel and conversion analyst for the Marketing Intelligence Engine. Analyze ad-to-landing-to-offer flows and CTAs using the provided data. Ask for clarification when the funnel stage or competitor is unclear. When you need the user to choose, end your message with a newline and exactly: [CLARIFY: option1 | option2 | option3]. If you need to look something up online, use [FETCH: https://url] and the app will ask the user for permission.",
  competitor:
    "You are a competitor intelligence analyst for the Marketing Intelligence Engine. Use the provided ads, patterns, and data to compare competitors and suggest positioning. Ask for clarification when which competitor or metric is unclear. When you need the user to choose, end your message with a newline and exactly: [CLARIFY: option1 | option2 | option3]. If you need to look something up online, use [FETCH: https://url] and the app will ask the user for permission.",
  general:
    "You are a helpful marketing expert for the Marketing Intelligence Engine. Use the provided data (ads, patterns, emails, filings) only when the user explicitly asks about it. Otherwise answer normally. When you need clarification from the user, end your message with a newline and exactly: [CLARIFY: option1 | option2 | option3]. If you need to look something up online, use [FETCH: https://url] and the app will ask the user for permission.",
};

const BUILTIN_ICONS: Record<AgentModeId, string> = {
  create_copy: "PenLine",
  strategy: "Brain",
  funnel: "GitBranch",
  competitor: "Radio",
  general: "MessageSquare",
};

export const AGENT_MODES: AgentMode[] = AGENT_MODE_IDS.map((id) => ({
  id,
  label:
    id === "create_copy"
      ? "Create copy"
      : id === "strategy"
        ? "Strategy"
        : id === "funnel"
          ? "Funnel analysis"
          : id === "competitor"
            ? "Competitor analysis"
            : "General",
  recommendedModelName: `ads-engine-${id === "create_copy" ? "copy" : id === "strategy" ? "strategy" : id === "funnel" ? "funnel" : id === "competitor" ? "competitor" : "general"}`,
  systemPrompt: MODE_SYSTEM_PROMPTS[id],
  icon: BUILTIN_ICONS[id],
}));

function loadCustomModes(): CustomAgentMode[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CUSTOM_MODES);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (m: unknown): m is CustomAgentMode =>
        typeof m === "object" &&
        m != null &&
        typeof (m as CustomAgentMode).id === "string" &&
        typeof (m as CustomAgentMode).label === "string" &&
        typeof (m as CustomAgentMode).systemPrompt === "string" &&
        typeof (m as CustomAgentMode).recommendedModelName === "string"
    );
  } catch {
    return [];
  }
}

function saveCustomModes(modes: CustomAgentMode[]) {
  try {
    localStorage.setItem(STORAGE_KEY_CUSTOM_MODES, JSON.stringify(modes));
  } catch (_) {}
}

/** All agent modes: built-in + custom (from localStorage). */
export function getAllAgentModes(): AgentMode[] {
  const custom = loadCustomModes().map((m) => ({
    ...m,
    icon: "Sparkles",
  }));
  return [...AGENT_MODES, ...custom];
}

export function getAgentMode(id: string): AgentMode | undefined {
  if (AGENT_MODE_IDS.includes(id as AgentModeId)) {
    return AGENT_MODES.find((x) => x.id === id);
  }
  const custom = loadCustomModes().find((m) => m.id === id);
  return custom ? { ...custom, icon: "Sparkles" } : undefined;
}

export function getSystemPromptForMode(id: string): string {
  const m = getAgentMode(id);
  if (!m) return getAgentMode("general")!.systemPrompt;
  return m.systemPrompt;
}

/** Icon name for the mode (for use with lucide-react). */
export function getAgentModeIconName(id: string): string {
  const m = getAgentMode(id);
  return m?.icon ?? "MessageSquare";
}

// --- Custom mode CRUD (used by Settings) ---

export function getCustomModes(): CustomAgentMode[] {
  return loadCustomModes();
}

function slugFromLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

export function addCustomMode(label: string, systemPrompt: string): CustomAgentMode {
  const modes = loadCustomModes();
  const baseSlug = slugFromLabel(label) || "custom";
  let slug = baseSlug;
  let n = 0;
  while (modes.some((m) => m.id === `custom-${slug}`)) {
    n += 1;
    slug = `${baseSlug}-${n}`;
  }
  const id = `custom-${slug}`;
  const recommendedModelName = `ads-engine-${slug}`;
  const mode: CustomAgentMode = { id, label, systemPrompt, recommendedModelName };
  modes.push(mode);
  saveCustomModes(modes);
  return mode;
}

export function updateCustomMode(id: string, updates: Partial<Pick<CustomAgentMode, "label" | "systemPrompt">>) {
  const modes = loadCustomModes();
  const i = modes.findIndex((m) => m.id === id);
  if (i < 0) return;
  if (updates.label != null) modes[i].label = updates.label;
  if (updates.systemPrompt != null) modes[i].systemPrompt = updates.systemPrompt;
  saveCustomModes(modes);
}

export function removeCustomMode(id: string) {
  const modes = loadCustomModes().filter((m) => m.id !== id);
  saveCustomModes(modes);
}
