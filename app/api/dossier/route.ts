import { NextResponse } from "next/server";
import { storeOr401 } from "@/lib/store-context";
import { runDossierStream, dossierToSignals } from "@/lib/dossier";
import { id as newId } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Fetch a previously generated dossier for a company.
export async function GET(req: Request) {
  const companyId = new URL(req.url).searchParams.get("companyId");
  if (!companyId) {
    return NextResponse.json({ error: "companyId required" }, { status: 400 });
  }
  const r = await storeOr401();
  if (r.res) return r.res;
  const dossier = await r.store.getDossier(companyId);
  return NextResponse.json({ dossier: dossier ?? null });
}

// Run the deep-dive agent and stream its progress (SSE). Persists on completion.
export async function POST(req: Request) {
  let body: { companyId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.companyId) {
    return NextResponse.json({ error: "companyId required" }, { status: 400 });
  }

  const r = await storeOr401();
  if (r.res) return r.res;
  const store = r.store;

  const company = await store.getCompany(body.companyId);
  if (!company) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

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
        for await (const ev of runDossierStream(company)) {
          send(ev);
          if (ev.type === "done") {
            // Persist the dossier + meter the (heavy) operation. Best-effort.
            await store
              .saveDossier({
                id: newId(),
                companyId: company.id,
                companyName: company.name,
                markdown: ev.markdown,
                createdAt: new Date().toISOString(),
              })
              .catch(() => {});
            await store
              .recordUsage({ kind: "gemini_dossier", companyId: company.id, units: 1 })
              .catch(() => {});
            // Feed the dossier's findings back into the pipeline as signals.
            try {
              const sigs = await dossierToSignals(company, ev.markdown);
              if (sigs.length) {
                await store.addSignals(sigs);
                send({ type: "signals", count: sigs.length });
              }
            } catch {
              /* best-effort */
            }
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
