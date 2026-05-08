"use client";

/**
 * Browser chat with the operating CFO. POSTs the conversation to the
 * Hono API at /api/agent/chat and renders the assistant's reply with
 * inline citation badges (snapshot/flag/anomaly/memory ids).
 *
 * v1 uses a JSON request/response. SSE streaming is a TODO.
 */

import { Badge } from "@ai-cfo/design-system/components/ui/badge";
import { Button } from "@ai-cfo/design-system/components/ui/button";
import { Card, CardContent } from "@ai-cfo/design-system/components/ui/card";
import { Input } from "@ai-cfo/design-system/components/ui/input";
import { cn } from "@ai-cfo/design-system/lib/utils";
import { Loader2Icon, SendIcon } from "lucide-react";
import {
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  useState,
} from "react";

interface ChatMessage {
  readonly content: string;
  readonly role: "user" | "assistant";
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3002";

const CITATION_RE = /\[(snapshot|flag|anomaly|memory):([A-Za-z0-9_:.-]+)\]/g;

const badgeToneClass = (kind: string): string => {
  if (kind === "flag") {
    return "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30";
  }
  if (kind === "anomaly") {
    return "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30";
  }
  if (kind === "memory") {
    return "bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30";
  }
  return "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30";
};

const renderWithCitations = (text: string): ReactNode[] => {
  const out: ReactNode[] = [];
  let cursor = 0;
  let key = 0;
  for (const m of text.matchAll(CITATION_RE)) {
    if (m.index === undefined) {
      continue;
    }
    if (m.index > cursor) {
      out.push(<span key={`t-${key++}`}>{text.slice(cursor, m.index)}</span>);
    }
    const kind = m[1];
    const id = m[2];
    out.push(
      <Badge
        className={cn(
          "mx-0.5 align-baseline font-mono text-xs",
          badgeToneClass(kind)
        )}
        key={`c-${key++}`}
        variant="outline"
      >
        {kind}:{id.length > 12 ? `${id.slice(0, 8)}…` : id}
      </Badge>
    );
    cursor = m.index + m[0].length;
  }
  if (cursor < text.length) {
    out.push(<span key={`t-${key++}`}>{text.slice(cursor)}</span>);
  }
  return out;
};

const MessageRow = ({ msg }: { msg: ChatMessage }) => (
  <Card
    className={cn(
      msg.role === "user"
        ? "ml-auto max-w-[85%] bg-primary text-primary-foreground"
        : "mr-auto max-w-[85%]"
    )}
  >
    <CardContent className="whitespace-pre-wrap p-4 text-sm leading-relaxed">
      {msg.role === "assistant"
        ? renderWithCitations(msg.content)
        : msg.content}
    </CardContent>
  </Card>
);

export const AnalystChat = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e?: FormEvent<HTMLFormElement>) => {
    e?.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || loading) {
      return;
    }
    const next: ChatMessage[] = [
      ...messages,
      { role: "user", content: trimmed },
    ];
    setMessages(next);
    setInput("");
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/agent/chat`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      if (!res.ok) {
        throw new Error(`request failed: ${res.status}`);
      }
      const data = (await res.json()) as { message: string };
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.message },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "unknown error");
    } finally {
      setLoading(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit().catch(() => {
        // surfaced via state error; nothing to do here
      });
    }
  };

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex flex-1 flex-col gap-3">
        {messages.length === 0 ? (
          <div className="text-muted-foreground text-sm">
            Try “What was revenue yesterday?” or “Show me open reconciliation
            flags.” Every numeric claim will carry a
            snapshot/flag/anomaly/memory citation.
          </div>
        ) : null}
        {messages.map((m, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: stable list, append-only
          <MessageRow key={i} msg={m} />
        ))}
        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2Icon className="h-4 w-4 animate-spin" />
            Thinking…
          </div>
        ) : null}
        {error ? (
          <p className="text-rose-600 text-sm dark:text-rose-400">{error}</p>
        ) : null}
      </div>
      <form className="flex items-center gap-2" onSubmit={submit}>
        <Input
          disabled={loading}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Ask anything about your business…"
          value={input}
        />
        <Button
          aria-label="Send message"
          disabled={loading || !input.trim()}
          type="submit"
        >
          <SendIcon className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
};
