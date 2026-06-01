import { NextResponse } from "next/server";
import { contextOrError } from "@/lib/store-context";
import { generateApiKey } from "@/lib/apikey";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// List API keys (metadata only — never the secret) — any member.
export async function GET() {
  const r = await contextOrError();
  if (r.res) return r.res;
  return NextResponse.json({ apiKeys: await r.ctx.store.listApiKeys() });
}

// Mint a new API key (owner/admin). The plaintext is returned exactly once.
export async function POST(req: Request) {
  let body: { name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const name = (body.name ?? "").trim() || "API key";

  const r = await contextOrError(["owner", "admin"]);
  if (r.res) return r.res;

  const { plaintext, hash, prefix } = generateApiKey();
  const apiKey = await r.ctx.store.createApiKey({
    name,
    keyHash: hash,
    prefix,
    createdBy: r.ctx.userId,
  });
  return NextResponse.json({ apiKey, key: plaintext }, { status: 201 });
}
