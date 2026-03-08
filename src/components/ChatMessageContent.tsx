import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const markdownComponents: React.ComponentProps<typeof ReactMarkdown>["components"] = {
  p: ({ children }) => <p className="mb-2 last:mb-0 text-foreground">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
  ul: ({ children }) => <ul className="my-2 list-disc pl-5 space-y-0.5 text-foreground">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 list-decimal pl-5 space-y-0.5 text-foreground">{children}</ol>,
  li: ({ children }) => <li className="text-foreground">{children}</li>,
  h1: ({ children }) => <h3 className="mt-2 mb-1 text-sm font-semibold text-foreground">{children}</h3>,
  h2: ({ children }) => <h3 className="mt-2 mb-1 text-sm font-semibold text-foreground">{children}</h3>,
  h3: ({ children }) => <h3 className="mt-2 mb-1 text-sm font-semibold text-foreground">{children}</h3>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-border pl-3 my-2 text-muted-foreground">{children}</blockquote>
  ),
  code: ({ children }) => (
    <code className="rounded bg-muted px-1 py-0.5 text-xs font-mono text-foreground">{children}</code>
  ),
  pre: ({ children }) => (
    <pre className="overflow-x-auto rounded-md bg-muted p-2 my-2 text-xs text-foreground">{children}</pre>
  ),
};

/** Split assistant content into main and reasoning (e.g. "**Reasoning:**" or "Reasoning:") */
export function splitReasoning(content: string): { main: string; reasoning: string | null } {
  const patterns = [
    /\n\s*\*\*Reasoning:\*\*\s*\n?/i,
    /\n\s*Reasoning:\s*\n?/i,
    /\n\s*\*\*Reasoning\*\*:\s*\n?/i,
  ];
  for (const re of patterns) {
    const idx = content.search(re);
    if (idx !== -1) {
      const match = content.match(re);
      const end = match ? idx + match[0].length : idx;
      return {
        main: content.slice(0, idx).trim(),
        reasoning: content.slice(end).trim() || null,
      };
    }
  }
  return { main: content, reasoning: null };
}

type ChatMessageContentProps = {
  role: "user" | "assistant";
  content: string;
  className?: string;
};

export function ChatMessageContent({ role, content, className }: ChatMessageContentProps) {
  if (role === "user") {
    return <p className={cn("whitespace-pre-wrap text-inherit", className)}>{content}</p>;
  }

  const { main, reasoning } = splitReasoning(content);

  return (
    <div className={cn("space-y-2 text-left", className)}>
      <div className="chat-markdown [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
          {main}
        </ReactMarkdown>
      </div>
      {reasoning && (
        <ReasoningCollapsible reasoning={reasoning} />
      )}
    </div>
  );
}

function ReasoningCollapsible({ reasoning }: { reasoning: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mt-2">
      <CollapsibleTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 text-muted-foreground hover:text-foreground text-xs"
          />
        }
      >
        <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
        <span>{open ? "Hide reasoning" : "Show reasoning"}</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="rounded-md border border-border bg-muted/30 p-2 mt-1 chat-markdown text-xs text-muted-foreground [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {reasoning}
          </ReactMarkdown>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
