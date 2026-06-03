import { NextResponse } from "next/server";
import { storeOr401 } from "@/lib/store-context";
import { streamNarrative } from "@/lib/narrative";
import { persistWithRetry } from "@/lib/retry";
import { tokenBudgetOr402 } from "@/lib/budget";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Fetch the saved market memo.
export async function GET() {
  const r = await storeOr401();
  if (r.res) return r.res;
  return NextResponse.json({ narrative: (await r.store.getNarrative()) ?? null });
}

// Generate a fresh state-of-the-market memo (SSE), persisting on completion.
export async function POST(req: Request) {
  const r = await storeOr401();
  if (r.res) return r.res;
  const store = r.store;

  const over = await tokenBudgetOr402(store);
  if (over) return over;

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
      try {
        for await (const ev of streamNarrative(store, req.signal)) {
          send(ev);
          if (ev.type === "done") {
            await persistWithRetry(
              () => store.saveNarrative(ev.markdown),
              (err) => send({ type: "persist_failed", error: err.message }),
              "saveNarrative",
            );
            await store
              .recordUsage({
                kind: "gemini_narrative",
                units: 1,
                tokensIn: ev.tokensIn,
                tokensOut: ev.tokensOut,
              })
              .catch(() => {});
          }
        }
      } catch (err) {
        send({ type: "error", error: (err as Error).message });
      } finally {
        if (!closed) controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
