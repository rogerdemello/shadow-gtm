import { Type } from "@google/genai";
import type { Content, FunctionDeclaration } from "@google/genai";
import type { Store } from "./store.supabase";
import { getEnv } from "./env";
import { geminiClient, runGemini, friendlyGeminiError } from "./gemini";
import { searchWeb } from "./retrieval";
import { computeMomentum } from "./trends";
import { withRetry, isTransient } from "./retry";
import { logger } from "./logger";

// ── Conversational analyst agent ──────────────────────────────────────────────
// A Gemini function-calling loop: the model answers GTM questions by calling
// tools over the workspace's own intelligence (signals, trends, dossiers, the
// watchlist) and the live web (grounded search). It decides which tools to use
// and loops until it can answer — grounded, not hallucinated. Tools are custom
// functions (grounding tools can't be combined with function calling), so
// web_search internally runs its own grounded Gemini call.

const log = logger.child({ module: "agent" });
const model = (): string => getEnv().GEMINI_MODEL;
const MAX_STEPS = 6;

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export type AgentEvent =
  | { type: "tool"; name: string; args: Record<string, unknown> }
  | { type: "answer"; text: string }
  | { type: "error"; error: string };

const SYSTEM = `You are Shadow, a senior GTM competitive-intelligence analyst embedded in this workspace. Answer the operator's questions by USING THE TOOLS to ground every claim — never guess.
- Prefer the workspace's own data: list_companies, search_signals, get_trends, get_dossier.
- Use web_search for fresh external facts not in the workspace.
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
];

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

  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      const res = await withRetry(
        () =>
          runGemini(() =>
            geminiClient().models.generateContent({
              model: model(),
              contents,
              config: {
                systemInstruction: SYSTEM,
                tools: [{ functionDeclarations: DECLARATIONS }],
                maxOutputTokens: 4096,
              },
            }),
          ),
        { label: "agent:step", shouldRetry: isTransient },
      );

      const calls = res.functionCalls ?? [];
      if (calls.length === 0) {
        yield { type: "answer", text: (res.text ?? "").trim() || "I couldn't find enough to answer that." };
        return;
      }

      // Record the model's tool-calling turn, then run each tool and feed results back.
      const modelContent = res.candidates?.[0]?.content;
      if (modelContent) contents.push(modelContent);

      const responseParts = [];
      for (const call of calls) {
        const args = (call.args ?? {}) as Record<string, unknown>;
        yield { type: "tool", name: call.name ?? "?", args };
        const result = await executeTool(store, call.name ?? "", args);
        responseParts.push({
          functionResponse: { name: call.name ?? "", response: result },
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
  }
}
