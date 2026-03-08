const STORAGE_KEY = "ai-timeouts";

export type AITimeouts = {
  copywriting: number;
  chat: number;
  strategy: number;
};

const DEFAULTS: AITimeouts = {
  copywriting: 15,
  chat: 60,
  strategy: 120,
};

const MIN_MAX = {
  copywriting: { min: 5, max: 120 },
  chat: { min: 10, max: 300 },
  strategy: { min: 30, max: 600 },
} as const;

function clamp(value: number, key: keyof AITimeouts): number {
  const { min, max } = MIN_MAX[key];
  return Math.min(max, Math.max(min, value));
}

export function getAITimeouts(): AITimeouts {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<AITimeouts>;
    return {
      copywriting: clamp(Number(parsed.copywriting) || DEFAULTS.copywriting, "copywriting"),
      chat: clamp(Number(parsed.chat) || DEFAULTS.chat, "chat"),
      strategy: clamp(Number(parsed.strategy) || DEFAULTS.strategy, "strategy"),
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function setAITimeouts(next: Partial<AITimeouts>): AITimeouts {
  const current = getAITimeouts();
  const merged: AITimeouts = {
    copywriting: next.copywriting !== undefined ? clamp(next.copywriting, "copywriting") : current.copywriting,
    chat: next.chat !== undefined ? clamp(next.chat, "chat") : current.chat,
    strategy: next.strategy !== undefined ? clamp(next.strategy, "strategy") : current.strategy,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  } catch {
    // ignore
  }
  return merged;
}

export const AI_TIMEOUT_LIMITS = MIN_MAX;
