import { NextResponse } from "next/server";
import { id as newId } from "@/lib/store";
import { storeOr401 } from "@/lib/store-context";
import { streamBattlecard } from "@/lib/ai";
import { persistWithRetry } from "@/lib/retry";
import { tokenBudgetOr402 } from "@/lib/budget";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: Request) {
  const companyId = new URL(req.url).searchParams.get("companyId");
  if (!companyId) {
    return NextResponse.json({ error: "companyId required" }, { status: 400 });
  }
  const r = await storeOr401();
  if (r.res) return r.res;
  const card = await r.store.getBattlecard(companyId);
  return NextResponse.json({ battlecard: card ?? null });
}

// SSE-streaming battlecard generation. The client receives markdown deltas as
// they leave the model, then a final {type:"done", battlecard} event with the
// persisted artifact.
export async function POST(req: Request) {
  let body: { companyId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { companyId } = body;
  if (!companyId) {
    return NextResponse.json({ error: "companyId required" }, { status: 400 });
  }

  const r = await storeOr401();
  if (r.res) return r.res;
  const store = r.store;

  const company = await store.getCompany(companyId);
  if (!company) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  const over = await tokenBudgetOr402(store);
  if (over) return over;

  const signals = (await store.listSignals()).filter((s) => s.companyId === companyId);
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (ev: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(ev)}\n\n`));
        } catch {
          closed = true;
        }
      };

      let buffer = "";
      let usage = { promptTokens: 0, outputTokens: 0, totalTokens: 0 };
      try {
        for await (const chunk of streamBattlecard(company, signals, (u) => {
          usage = u;
        }, req.signal)) {
          if (closed) break;
          buffer += chunk;
          send({ type: "delta", text: chunk });
        }
        if (!closed) {
          const card = {
            id: newId(),
            companyId,
            companyName: company.name,
            markdown: buffer.trim(),
            createdAt: new Date().toISOString(),
          };
          await persistWithRetry(
            () => store.saveBattlecard(card),
            (err) => send({ type: "persist_failed", error: err.message }),
            "saveBattlecard",
          );
          await store
            .recordUsage({
              kind: "gemini_battlecard",
              companyId,
              units: 1,
              tokensIn: usage.promptTokens,
              tokensOut: usage.outputTokens,
            })
            .catch(() => {});
          send({ type: "done", battlecard: card });
        }
      } catch (err) {
        send({ type: "error", error: (err as Error).message });
      } finally {
        if (!closed) {
          try {
            controller.close();
          } catch {
            // already closed
          }
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
