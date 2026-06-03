import { Type } from "@google/genai";
import type { Content, FunctionDeclaration } from "@google/genai";
import type { Store } from "./store.supabase";
import { geminiClient, runGemini, friendlyGeminiError, usageOf, withModelFallback } from "./gemini";
import { searchWeb } from "./retrieval";
import { computeMomentum } from "./trends";
import { logger } from "./logger";

// ── Conversational analyst agent ──────────────────────────────────────────────
// A Gemini function-calling loop: the model answers GTM questions by calling
// tools over the workspace's own intelligence (signals, trends, dossiers, the
// watchlist) and the live web (grounded search). It decides which tools to use
// and loops until it can answer — grounded, not hallucinated. Tools are custom
// functions (grounding tools can't be combined with function calling), so
// web_search internally runs its own grounded Gemini call.

const log = logger.child({ module: "agent" });
const MAX_STEPS = 4; // tool rounds before the agent must answer (free-tier friendly)

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** A proposed mutating action, surfaced for the user to Confirm/Cancel in chat. */
export interface ActionProposal {
  tool: string;
  args: Record<string, unknown>;
  summary: string;
  /** "server" → executed via POST /api/agent/act; "client" → drives an existing UI. */
  executor: "server" | "client";
}

export type AgentEvent =
  | { type: "tool"; name: string; args: Record<string, unknown> }
  | { type: "proposal"; proposals: ActionProposal[] }
  | { type: "answer"; text: string }
  | { type: "error"; error: string };

const SYSTEM = `You are Shadow, a senior GTM competitive-intelligence analyst embedded in this workspace. Answer the operator's questions by USING THE TOOLS to ground every claim — never guess.
- Prefer the workspace's own data: list_companies, search_signals, get_trends, get_dossier.
- Use web_search for fresh external facts not in the workspace.
- You can also TAKE ACTIONS when the operator asks (or it clearly helps): add_competitor, run_scan, run_deep_dive, generate_battlecard, set_signal_status, set_alert_threshold. These are proposed to the operator for one-click confirmation — call the tool when appropriate; the system handles the confirmation.
- You may call several tools (in sequence) before answering.
- Cite the companies and sources you used. If the data is thin, say so plainly.
Be concise, specific, and action-oriented — you're briefing a revenue team.`;

const DECLARATIONS: FunctionDeclaration[] = [
  {
    name: "list_companies",
    description: "List the competitors on the workspace watchlist.",
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: "search_signals",
    description:
      "Get current intelligence signals from the workspace. Optionally filter by competitor or signal type.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        companyName: { type: Type.STRING, description: "Filter to this competitor (name)." },
        type: {
          type: Type.STRING,
          description: "Filter by signal type (pricing, product, hiring, sentiment, funding, messaging, intent, risk).",
        },
      },
    },
  },
  {
    name: "get_trends",
    description: "Momentum + history for a competitor (signal velocity, pricing moves, trend).",
    parameters: {
      type: Type.OBJECT,
      properties: { companyName: { type: Type.STRING } },
      required: ["companyName"],
    },
  },
  {
    name: "get_dossier",
    description: "Fetch the saved deep-dive research dossier for a competitor, if one exists.",
    parameters: {
      type: Type.OBJECT,
      properties: { companyName: { type: Type.STRING } },
      required: ["companyName"],
    },
  },
  {
    name: "web_search",
    description: "Search the live web (grounded) for fresh facts not in the workspace.",
    parameters: {
      type: Type.OBJECT,
      properties: { query: { type: Type.STRING } },
      required: ["query"],
    },
  },
  // ── Action tools (mutating — proposed for confirmation, never auto-run) ──────
  {
    name: "add_competitor",
    description: "Add a competitor to the watchlist. Use when the operator wants to track a new company.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING },
        domain: { type: Type.STRING, description: "Root domain, e.g. notion.so" },
        pricingUrl: { type: Type.STRING, description: "Optional pricing page URL to monitor." },
      },
      required: ["name", "domain"],
    },
  },
  {
    name: "run_scan",
    description: "Run an intelligence scan. Omit companyName to scan the whole watchlist.",
    parameters: {
      type: Type.OBJECT,
      properties: { companyName: { type: Type.STRING } },
    },
  },
  {
    name: "run_deep_dive",
    description: "Run the deep-dive research agent on a competitor to build a full dossier.",
    parameters: {
      type: Type.OBJECT,
      properties: { companyName: { type: Type.STRING } },
      required: ["companyName"],
    },
  },
  {
    name: "generate_battlecard",
    description: "Generate a sales battlecard for a competitor from its signals.",
    parameters: {
      type: Type.OBJECT,
      properties: { companyName: { type: Type.STRING } },
      required: ["companyName"],
    },
  },
  {
    name: "set_signal_status",
    description: "Mark a signal handled or dismissed. Identify it by competitor + a snippet of its description.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        companyName: { type: Type.STRING },
        description: { type: Type.STRING, description: "Part of the signal's description to match." },
        status: { type: Type.STRING, description: "active | handled | dismissed" },
      },
      required: ["status"],
    },
  },
  {
    name: "set_alert_threshold",
    description: "Set the org's opportunity-score alert threshold (0–100).",
    parameters: {
      type: Type.OBJECT,
      properties: { value: { type: Type.NUMBER } },
      required: ["value"],
    },
  },
];

// Action tools are NOT executed in the loop — they're surfaced as proposals the
// user confirms. "server" actions run via POST /api/agent/act; "client" actions
// drive an existing streamed UI (scan / deep dive / battlecard).
const ACTION_TOOLS: Record<
  string,
  { executor: "server" | "client"; summarize: (a: Record<string, unknown>) => string }
> = {
  add_competitor: {
    executor: "server",
    summarize: (a) => `Add **${a.name}** (${a.domain}) to the watchlist`,
  },
  set_signal_status: {
    executor: "server",
    summarize: (a) =>
      `Mark ${a.companyName ? `**${a.companyName}** ` : ""}signal "${String(a.description ?? "").slice(0, 40)}" as **${a.status}**`,
  },
  set_alert_threshold: {
    executor: "server",
    summarize: (a) => `Set the alert threshold to **${a.value}**`,
  },
  run_scan: {
    executor: "client",
    summarize: (a) => `Run an intelligence scan${a.companyName ? ` on **${a.companyName}**` : " on the whole watchlist"}`,
  },
  run_deep_dive: {
    executor: "client",
    summarize: (a) => `Run a deep-dive dossier on **${a.companyName}**`,
  },
  generate_battlecard: {
    executor: "client",
    summarize: (a) => `Generate a battlecard for **${a.companyName}**`,
  },
};

export function isActionTool(name: string): boolean {
  return name in ACTION_TOOLS;
}

/** Every tool name the model is allowed to call (read + action). */
const KNOWN_TOOLS = new Set(
  DECLARATIONS.map((d) => d.name).filter((n): n is string => Boolean(n)),
);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

async function findCompany(store: Store, name?: string) {
  if (!name) return undefined;
  const companies = await store.listCompanies();
  const q = name.trim().toLowerCase();
  return (
    companies.find((c) => c.name.toLowerCase() === q) ||
    companies.find((c) => c.name.toLowerCase().includes(q) || c.domain.includes(q))
  );
}

/** Execute one tool call against the store / live web. Returns a small object. */
async function executeTool(
  store: Store,
  name: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  switch (name) {
    case "list_companies": {
      const companies = await store.listCompanies();
      return { companies: companies.map((c) => ({ name: c.name, domain: c.domain })) };
    }
    case "search_signals": {
      const all = (await store.listSignals()).filter((s) => (s.status ?? "active") !== "dismissed");
      const company = await findCompany(store, args.companyName as string | undefined);
      const type = (args.type as string | undefined)?.toLowerCase();
      const filtered = all
        .filter((s) => (company ? s.companyId === company.id : true))
        .filter((s) => (type ? s.type === type : true))
        .sort((a, b) => b.opportunityScore - a.opportunityScore)
        .slice(0, 8)
        .map((s) => ({
          company: s.companyName,
          type: s.type,
          description: s.description,
          opportunityScore: s.opportunityScore,
          reasoning: s.reasoning,
          recommendedAction: s.recommendedAction,
        }));
      return { signals: filtered, count: filtered.length };
    }
    case "get_trends": {
      const company = await findCompany(store, args.companyName as string | undefined);
      if (!company) return { error: "Company not found on the watchlist." };
      const history = await store.listSignalHistory(company.id);
      return { company: company.name, momentum: computeMomentum(company.id, history) };
    }
    case "get_dossier": {
      const company = await findCompany(store, args.companyName as string | undefined);
      if (!company) return { error: "Company not found on the watchlist." };
      const dossier = await store.getDossier(company.id);
      return dossier
        ? { company: company.name, dossier: dossier.markdown.slice(0, 4000) }
        : { error: "No dossier yet — the operator can run a Deep Dive on this competitor." };
    }
    case "web_search": {
      const results = await searchWeb(String(args.query ?? ""), 6);
      return { results };
    }
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

/** Run the agent loop, yielding tool-call events then the final grounded answer. */
export async function* runAgent(
  store: Store,
  messages: ChatMessage[],
): AsyncGenerator<AgentEvent> {
  const contents: Content[] = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  let tokensIn = 0;
  let tokensOut = 0;

  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      const res = await withModelFallback(
        (m) =>
          runGemini(() =>
            geminiClient().models.generateContent({
              model: m,
              contents,
              config: {
                systemInstruction: SYSTEM,
                tools: [{ functionDeclarations: DECLARATIONS }],
                maxOutputTokens: 4096,
              },
            }),
          ),
        "agent:step",
      );
      const u = usageOf(res);
      tokensIn += u.tokensIn;
      tokensOut += u.tokensOut;

      // Validate tool-call shape against the declarations — Gemini can emit a
      // malformed (no name) or hallucinated (unknown name) call. Drop those so a
      // bad call never crashes the loop or invents an action.
      const rawCalls = res.functionCalls ?? [];
      const calls = rawCalls.filter((c): c is typeof c & { name: string } => {
        if (!c.name || !KNOWN_TOOLS.has(c.name)) {
          log.warn("agent: dropping unknown/malformed tool call", { name: c.name ?? null });
          return false;
        }
        return true;
      });
      if (calls.length === 0) {
        yield { type: "answer", text: (res.text ?? "").trim() || "I couldn't find enough to answer that." };
        return;
      }

      // If the model wants to take a mutating action, don't execute it — surface
      // a proposal for the operator to confirm, and end the turn here.
      const actionCalls = calls.filter((c) => isActionTool(c.name));
      if (actionCalls.length > 0) {
        const proposals: ActionProposal[] = actionCalls.map((c) => {
          const args = isPlainObject(c.args) ? c.args : {};
          const meta = ACTION_TOOLS[c.name];
          return { tool: c.name, args, summary: meta.summarize(args), executor: meta.executor };
        });
        yield { type: "proposal", proposals };
        return;
      }

      // Read tools: record the model's turn, run each, feed results back.
      const modelContent = res.candidates?.[0]?.content;
      if (modelContent) contents.push(modelContent);

      const responseParts = [];
      for (const call of calls) {
        const args = isPlainObject(call.args) ? call.args : {};
        yield { type: "tool", name: call.name, args };
        const result = await executeTool(store, call.name, args);
        responseParts.push({
          functionResponse: { name: call.name, response: result },
        });
      }
      contents.push({ role: "user", parts: responseParts });
    }

    yield {
      type: "answer",
      text: "I ran several research steps but couldn't converge — try narrowing the question.",
    };
  } catch (err) {
    log.warn("agent loop failed", { error: (err as Error).message });
    yield { type: "error", error: friendlyGeminiError(err) };
  } finally {
    // Meter the conversation's token spend (best-effort) so it counts toward the
    // org's monthly budget like every other AI op.
    if (tokensIn || tokensOut) {
      await store
        .recordUsage({ kind: "gemini_agent", units: 1, tokensIn, tokensOut })
        .catch(() => {});
    }
  }
}
