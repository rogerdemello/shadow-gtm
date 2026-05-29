import { NextResponse } from "next/server";
import { getCompany, listSignals } from "@/lib/store";
import { streamAttackPlan } from "@/lib/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// War Room: stream the attack plan token-by-token as Claude reasons over
// the live signals. Same SSE shape as /api/battlecard for client reuse.
export async function POST(req: Request) {
  let body: { directive?: string; companyId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const directive = body.directive?.trim();
  if (!directive) {
    return NextResponse.json({ error: "directive required" }, { status: 400 });
  }

  const allSignals = await listSignals();
  let companyName: string | null = null;
  let signals = allSignals;

  if (body.companyId) {
    const company = await getCompany(body.companyId);
    if (company) {
      companyName = company.name;
      signals = allSignals.filter((s) => s.companyId === body.companyId);
    }
  }

  const encoder = new TextEncoder();
  const target = companyName;

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
        for await (const chunk of streamAttackPlan(directive, target, signals)) {
          if (closed) break;
          buffer += chunk;
          send({ type: "delta", text: chunk });
        }
        if (!closed) {
          send({
            type: "done",
            plan: {
              directive,
              companyName: target,
              markdown: buffer.trim(),
            },
          });
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
