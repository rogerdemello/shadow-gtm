"use client";

import { useEffect, useRef, useState } from "react";
import { readSSE } from "@/lib/sse";
import type { ActionProposal } from "@/lib/agent";
import type { ConversationSummary } from "@/lib/types";
import Markdown from "./Markdown";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

type AgentEvent =
  | { type: "tool"; name: string; args: Record<string, unknown> }
  | { type: "proposal"; proposals: ActionProposal[] }
  | { type: "answer"; text: string }
  | { type: "error"; error: string };

const SUGGESTIONS = [
  "Which competitor has the most momentum right now?",
  "Where can we win against the field this week?",
  "What pricing moves have competitors made recently?",
];

const TOOL_LABEL: Record<string, string> = {
  list_companies: "checking the watchlist",
  search_signals: "searching workspace signals",
  get_trends: "analyzing momentum",
  get_dossier: "reading the dossier",
  web_search: "searching the live web",
};

export default function AnalystModal({
  onClose,
  onAction,
  onActed,
}: {
  onClose: () => void;
  /** Run a confirmed client-side action (run_scan / run_deep_dive / generate_battlecard). */
  onAction?: (tool: string, args: Record<string, unknown>) => void;
  /** Called after a confirmed server action so the dashboard can refresh. */
  onActed?: () => void;
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<string[]>([]);
  const [pending, setPending] = useState<ActionProposal[] | null>(null);
  const [convId, setConvId] = useState<string | null>(null);
  const [convList, setConvList] = useState<ConversationSummary[]>([]);
  const bodyRef = useRef<HTMLDivElement>(null);
  const acRef = useRef<AbortController | null>(null);
  const creatingRef = useRef(false);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight });
  }, [messages, steps]);

  useEffect(() => () => acRef.current?.abort(), []);

  const loadConvList = () =>
    fetch("/api/conversations")
      .then((r) => (r.ok ? r.json() : { conversations: [] }))
      .then((d) => setConvList(d.conversations ?? []))
      .catch(() => {});

  useEffect(() => {
    loadConvList();
  }, []);

  // Persist the conversation after each settled turn (create then update).
  // Best-effort: keyless/demo workspaces just keep the chat ephemeral.
  useEffect(() => {
    if (busy || messages.length === 0) return;
    (async () => {
      try {
        if (!convId) {
          if (creatingRef.current) return;
          creatingRef.current = true;
          const res = await fetch("/api/conversations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: messages[0]?.content?.slice(0, 80) ?? "Chat", messages }),
          });
          creatingRef.current = false;
          if (res.ok) {
            const d = await res.json();
            setConvId(d.conversation?.id ?? null);
            loadConvList();
          }
        } else {
          await fetch(`/api/conversations/${convId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messages }),
          });
        }
      } catch {
        creatingRef.current = false;
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, messages]);

  function newConversation() {
    acRef.current?.abort();
    setMessages([]);
    setConvId(null);
    setPending(null);
    setSteps([]);
  }

  async function loadConversation(id: string) {
    if (id === convId) return;
    try {
      const res = await fetch(`/api/conversations/${id}`);
      if (!res.ok) return;
      const d = await res.json();
      setPending(null);
      setSteps([]);
      setMessages(d.conversation?.messages ?? []);
      setConvId(id);
    } catch {
      /* ignore */
    }
  }

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    const next: Msg[] = [...messages, { role: "user", content: q }];
    setMessages(next);
    setInput("");
    setBusy(true);
    setSteps([]);

    const ac = new AbortController();
    acRef.current = ac;
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
        signal: ac.signal,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Agent failed (${res.status})`);
      }
      for await (const ev of readSSE<AgentEvent>(res, ac.signal)) {
        if (ac.signal.aborted) return;
        if (ev.type === "tool") {
          setSteps((s) => [...s, TOOL_LABEL[ev.name] ?? ev.name]);
        } else if (ev.type === "proposal") {
          setPending(ev.proposals);
          setSteps([]);
        } else if (ev.type === "answer") {
          setMessages((m) => [...m, { role: "assistant", content: ev.text }]);
          setSteps([]);
        } else if (ev.type === "error") {
          setMessages((m) => [...m, { role: "assistant", content: `**Error:** ${ev.error}` }]);
          setSteps([]);
        }
      }
    } catch (e) {
      if (ac.signal.aborted) return;
      setMessages((m) => [...m, { role: "assistant", content: `**Error:** ${(e as Error).message}` }]);
    } finally {
      if (acRef.current === ac) acRef.current = null;
      setBusy(false);
    }
  }

  async function confirmProposal(p: ActionProposal) {
    setPending(null);
    if (p.executor === "client") {
      onAction?.(p.tool, p.args);
      setMessages((m) => [...m, { role: "assistant", content: `✓ ${p.summary} — opening.` }]);
      return;
    }
    // Server action: execute via the act endpoint.
    try {
      const res = await fetch("/api/agent/act", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool: p.tool, args: p.args }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Action failed (${res.status})`);
      setMessages((m) => [...m, { role: "assistant", content: `✓ ${data.summary ?? p.summary}` }]);
      onActed?.();
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", content: `**Error:** ${(e as Error).message}` }]);
    }
  }

  function cancelProposals() {
    setPending(null);
    setMessages((m) => [...m, { role: "assistant", content: "Okay — cancelled." }]);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Ask the analyst"
        className="flex h-[85vh] w-full max-w-2xl flex-col rounded-xl border border-accent/40 bg-ink-800 shadow-glow"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-ink-500/60 px-5 py-3">
          <h2 className="font-mono text-xs uppercase tracking-widest text-accent">
            ✦ Ask Shadow · analyst
          </h2>
          <div className="flex items-center gap-2">
            {convList.length > 0 && (
              <select
                value={convId ?? ""}
                onChange={(e) => (e.target.value ? loadConversation(e.target.value) : newConversation())}
                className="max-w-[160px] rounded border border-ink-500 bg-ink-900 px-2 py-1 font-mono text-[11px] text-slate-300 outline-none focus:border-accent/60"
                aria-label="Past conversations"
              >
                <option value="">+ New conversation</option>
                {convList.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title.slice(0, 40)}
                  </option>
                ))}
              </select>
            )}
            <button
              onClick={newConversation}
              title="New conversation"
              className="rounded border border-ink-500 px-2 py-0.5 font-mono text-xs text-slate-400 hover:text-accent"
            >
              + New
            </button>
            <button
              onClick={onClose}
              aria-label="Close analyst"
              className="rounded border border-ink-500 px-2 py-0.5 font-mono text-xs text-slate-400 hover:text-slate-100"
            >
              esc ✕
            </button>
          </div>
        </div>

        <div ref={bodyRef} className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {messages.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
              <p className="max-w-sm text-sm text-slate-500">
                Ask about your competitive landscape. I&apos;ll ground answers in your
                signals, trends, and dossiers — and search the live web when needed.
              </p>
              <div className="flex flex-col gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => ask(s)}
                    className="rounded-lg border border-ink-500 px-3 py-1.5 text-left text-[13px] text-slate-300 transition hover:border-accent/50 hover:text-accent"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="flex justify-end">
                <div className="max-w-[85%] rounded-lg rounded-br-sm bg-accent/15 px-3 py-2 text-sm text-slate-100">
                  {m.content}
                </div>
              </div>
            ) : (
              <div key={i} className="flex justify-start">
                <div className="max-w-[90%] rounded-lg rounded-bl-sm border border-ink-500/60 bg-ink-700/40 px-3 py-2 text-sm text-slate-200">
                  <Markdown source={m.content} />
                </div>
              </div>
            ),
          )}

          {busy && (
            <div className="flex items-center gap-2 font-mono text-[11px] text-accent/80">
              <span className="h-1.5 w-1.5 animate-pulseDot rounded-full bg-accent" />
              {steps.length > 0 ? steps[steps.length - 1] + "…" : "thinking…"}
            </div>
          )}
        </div>

        {pending && pending.length > 0 && (
          <div className="border-t border-accent/30 bg-accent/5 px-4 py-3">
            <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-accent">
              Confirm action{pending.length > 1 ? "s" : ""}
            </p>
            <ul className="mb-2 space-y-1">
              {pending.map((p, i) => (
                <li key={i} className="text-sm text-slate-200">
                  <Markdown source={`• ${p.summary}`} />
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <button
                onClick={() => pending.forEach(confirmProposal)}
                className="rounded-lg bg-accent px-4 py-1.5 text-sm font-bold text-ink-900 transition hover:brightness-110"
              >
                Confirm
              </button>
              <button
                onClick={cancelProposals}
                className="rounded-lg border border-ink-500 px-4 py-1.5 text-sm text-slate-300 transition hover:border-slate-500"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask(input);
          }}
          className="flex gap-2 border-t border-ink-500/60 p-3"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={busy}
            placeholder="Ask about a competitor, a trend, or the market…"
            className="flex-1 rounded-lg border border-ink-500 bg-ink-900 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-accent/60 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-bold text-ink-900 transition hover:brightness-110 disabled:opacity-40"
          >
            Ask
          </button>
        </form>
      </div>
    </div>
  );
}
