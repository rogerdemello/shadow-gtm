import { contextOrError } from "@/lib/store-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GDPR data-portability: download the org's full data as JSON (owner/admin).
export async function GET() {
  const r = await contextOrError(["owner", "admin"]);
  if (r.res) return r.res;

  const data = await r.ctx.store.exportData();
  const today = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="shadow-gtm-export-${today}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
