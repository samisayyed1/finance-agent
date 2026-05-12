"use client";

/**
 * /analyst chat — Day-11 Cockpit port from Stitch project
 * 275623396639891029 screens aef7…03b (empty state) and 6715…61d
 * (conversation active).
 *
 * Two states in one component:
 *  1. Empty — eyebrow + 48px Inter Light headline + suggested pills.
 *  2. Active — conversation rendered as typeset turns above a fixed
 *     bottom input. Every monetary token in the assistant's reply is
 *     wrapped as a receipt pill (same component as /today's briefing).
 *
 * Wire intact: POST to `${NEXT_PUBLIC_API_URL}/api/agent/chat`. SSE
 * streaming remains a Day-N TODO (per STATUS.md known limitations).
 */

import { CornerDownLeftIcon } from "lucide-react";
import { useSearchParams } from "next/navigation";
import {
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useState,
} from "react";

interface ChatMessage {
  readonly content: string;
  readonly role: "user" | "assistant";
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3002";

// Same regex as the grounding validator. The UI never out-renders the
// trust boundary — pills only appear for tokens that the agent
// runtime emitted as valid citations.
const CITATION_RE = /\[(snapshot|flag|anomaly|memory):([A-Za-z0-9_:.-]+)\]/g;

const SUGGESTED_QUESTIONS = [
  "Why did Meta ROAS drop?",
  "Show me refund spikes",
  "My best product last week",
  "Cashflow next 14 days",
];

/* --------------------------------------------------------------------- */
/* ReceiptPill — same visual contract as /today's GroundedSummary.       */
/* --------------------------------------------------------------------- */
const ReceiptPill = ({ children }: { children: ReactNode }) => (
  <span className="inline-flex h-[22px] cursor-help items-baseline rounded-[6px] border border-white/[0.08] bg-white/[0.04] px-2 align-baseline font-medium font-mono text-[12px] text-zinc-100 tabular-nums leading-[20px] transition-colors hover:border-white/[0.16] hover:bg-white/[0.08]">
    {children}
  </span>
);

/* Convert citation tokens in the assistant's prose into receipt pills.
   Tokens without a matching kind fall through as plain text. */
const renderWithPills = (text: string): ReactNode[] => {
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
    const id = m[2] ?? "";
    out.push(
      <ReceiptPill key={`c-${key++}`}>
        {id.length > 8 ? `${id.slice(0, 8)}…` : id}
      </ReceiptPill>
    );
    cursor = m.index + m[0].length;
  }
  if (cursor < text.length) {
    out.push(<span key={`t-${key++}`}>{text.slice(cursor)}</span>);
  }
  return out;
};

/* --------------------------------------------------------------------- */
/* Turn renderers                                                         */
/* --------------------------------------------------------------------- */

const UserTurn = ({ content }: { content: string }) => (
  <div className="space-y-2">
    <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-[0.16em]">
      YOU
    </p>
    <p className="text-[16px] text-zinc-300 leading-[1.75]">{content}</p>
  </div>
);

const AgentTurn = ({ content }: { content: string }) => (
  <div className="space-y-2">
    <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-[0.16em]">
      OPERATOR&apos;S CFO
    </p>
    <p className="max-w-[640px] text-[16px] text-zinc-200 leading-[1.75]">
      {renderWithPills(content)}
    </p>
    <div className="flex flex-wrap gap-2 pt-2">
      <button
        className="h-8 rounded-md border border-white/[0.08] px-3 font-medium font-mono text-[11px] text-zinc-300 transition-colors hover:border-white/[0.16] hover:text-zinc-50"
        type="button"
      >
        See the receipts →
      </button>
      <button
        className="h-8 rounded-md border border-white/[0.08] px-3 font-medium font-mono text-[11px] text-zinc-300 transition-colors hover:border-white/[0.16] hover:text-zinc-50"
        type="button"
      >
        Make this an alert
      </button>
      <button
        className="h-8 rounded-md border border-white/[0.08] px-3 font-medium font-mono text-[11px] text-zinc-300 transition-colors hover:border-white/[0.16] hover:text-zinc-50"
        type="button"
      >
        Export to CSV
      </button>
    </div>
  </div>
);

/* --------------------------------------------------------------------- */
/* The chat shell                                                         */
/* --------------------------------------------------------------------- */

export const AnalystChat = () => {
  const params = useSearchParams();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Allow /today's "Ask anything" form to deep-link a prefilled question.
  useEffect(() => {
    const q = params.get("q");
    if (q && messages.length === 0) {
      setInput(q);
    }
  }, [messages.length, params]);

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
      submit();
    }
  };

  const isEmpty = messages.length === 0 && !loading;

  /* ----- Empty state ----- */
  if (isEmpty) {
    return (
      <div className="mx-auto w-full max-w-[760px] px-8 pt-24 pb-32">
        <div className="mb-16 flex flex-col items-center text-center">
          <p className="mb-6 font-medium font-mono text-[10px] text-zinc-500 uppercase tracking-[0.16em]">
            ASK · OPERATOR-GRADE
          </p>
          <h1 className="mb-4 font-light text-[48px] text-zinc-50 leading-tight tracking-[-0.02em]">
            What do you want to know?
          </h1>
          <p className="text-[16px] text-zinc-400">
            Plain English. The answer cites every receipt.
          </p>
        </div>

        <form
          className="relative mx-auto mb-8 w-full max-w-2xl"
          onSubmit={submit}
        >
          <input
            aria-label="Ask the CFO anything"
            className="h-[64px] w-full rounded-[8px] border border-white/[0.06] bg-[#111114] px-4 text-[16px] text-white placeholder:text-zinc-500 focus:border-white/[0.16] focus:outline-none"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="What was my best product yesterday?"
            type="text"
            value={input}
          />
          <div className="absolute top-1/2 right-4 flex -translate-y-1/2 items-center justify-center rounded border border-white/[0.06] px-1.5 py-0.5">
            <span className="font-mono text-[10px] text-zinc-700">⏎</span>
          </div>
        </form>

        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-center gap-3">
          {SUGGESTED_QUESTIONS.map((q) => (
            <button
              className="h-8 rounded-full border border-white/[0.06] bg-transparent px-4 font-mono text-[11px] text-zinc-300 transition-all hover:border-white/[0.16] hover:bg-white/[0.02]"
              key={q}
              onClick={() => setInput(q)}
              type="button"
            >
              {q}
            </button>
          ))}
        </div>
      </div>
    );
  }

  /* ----- Conversation state ----- */
  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[760px] space-y-8 px-8 pt-24 pb-40">
          {messages.map((msg, i) => {
            // biome-ignore lint/suspicious/noArrayIndexKey: messages array is append-only and order-stable for the lifetime of the conversation; combining index + first 16 chars of content is sufficient to disambiguate React keys without dragging a uuid generator into a hot client path.
            const key = `${msg.role}-${i}-${msg.content.slice(0, 16)}`;
            return msg.role === "user" ? (
              <UserTurn content={msg.content} key={key} />
            ) : (
              <AgentTurn content={msg.content} key={key} />
            );
          })}
          {loading ? (
            <div className="space-y-2">
              <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-[0.16em]">
                OPERATOR&apos;S CFO
              </p>
              <p className="text-[16px] text-zinc-500 leading-[1.75]">
                Thinking
                <span className="inline-block w-6 animate-pulse">…</span>
              </p>
            </div>
          ) : null}
          {error ? <p className="text-[#FB7185] text-[13px]">{error}</p> : null}
        </div>
      </div>

      <div className="fixed bottom-8 left-[calc(50%+100px)] z-40 w-full max-w-[760px] -translate-x-1/2 px-8">
        <form className="relative w-full" onSubmit={submit}>
          <input
            aria-label="Ask the CFO anything"
            className="h-[64px] w-full rounded-[8px] border border-white/[0.06] bg-[#111114] px-4 text-[16px] text-white placeholder:text-zinc-500 focus:border-white/[0.16] focus:outline-none"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Ask anything about your money…"
            type="text"
            value={input}
          />
          <div className="absolute top-1/2 right-4 flex -translate-y-1/2 items-center gap-2">
            <span className="font-mono text-[10px] text-zinc-700">
              ⌘K to start over · ⌘↩ to send
            </span>
            <button
              aria-label="Send"
              className="flex h-7 w-7 items-center justify-center rounded border border-white/[0.06] text-zinc-500 hover:border-white/[0.16] hover:text-zinc-200"
              type="submit"
            >
              <CornerDownLeftIcon className="h-3 w-3" strokeWidth={1.75} />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
