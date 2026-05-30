import { NextResponse } from "next/server";
import { id as newId } from "@/lib/store";
import { storeOr401 } from "@/lib/store-context";
import { streamBattlecard } from "@/lib/ai";

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
      try {
        for await (const chunk of streamBattlecard(company, signals)) {
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
          await store.saveBattlecard(card);
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
