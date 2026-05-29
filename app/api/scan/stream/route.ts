import { createScan, listCompanies } from "@/lib/store";
import { scanCompany } from "@/lib/workflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Server-Sent Events scan: one GET runs the whole queue and streams results as
// each competitor completes, so the dashboard feed fills in live from a single
// connection. (scanCompany never throws — per-company errors ride on the event.)
export async function GET() {
  const companies = await listCompanies();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (ev: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(ev)}\n\n`));
        } catch {
          // Client disconnected mid-stream — stop trying to write.
          closed = true;
        }
      };

      try {
        if (companies.length === 0) {
          send({ type: "error", error: "Add at least one competitor before scanning." });
          send({ type: "done" });
          return;
        }

        const scan = await createScan(companies.map((c) => c.id));
        send({
          type: "start",
          scanId: scan.id,
          queue: companies.map((c) => ({ id: c.id, name: c.name })),
        });

        for (const company of companies) {
          if (closed) break;
          send({ type: "company-start", companyId: company.id, name: company.name });
          const result = await scanCompany(company, scan.id);
          send({ type: "company-done", result });
        }

        send({ type: "done" });
      } catch (err) {
        send({ type: "error", error: (err as Error).message });
        send({ type: "done" });
      } finally {
        if (!closed) {
          try {
            controller.close();
          } catch {
            // Already closed by the runtime — ignore.
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
      // Disable proxy buffering (nginx/Cloudflare/some Vercel paths) — keeps
      // the per-company events arriving in real time on the client.
      "X-Accel-Buffering": "no",
    },
  });
}
