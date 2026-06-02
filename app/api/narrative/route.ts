import { NextResponse } from "next/server";
import { storeOr401 } from "@/lib/store-context";
import { streamNarrative } from "@/lib/narrative";

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
export async function POST() {
  const r = await storeOr401();
  if (r.res) return r.res;
  const store = r.store;

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
        for await (const ev of streamNarrative(store)) {
          send(ev);
          if (ev.type === "done") {
            await store.saveNarrative(ev.markdown).catch(() => {});
            await store.recordUsage({ kind: "gemini_narrative", units: 1 }).catch(() => {});
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
