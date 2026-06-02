import { NextResponse } from "next/server";
import { storeOr401 } from "@/lib/store-context";
import type { ConversationMessage } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// List the org's saved analyst conversations (newest first).
export async function GET() {
  const r = await storeOr401();
  if (r.res) return r.res;
  return NextResponse.json({ conversations: await r.store.listConversations() });
}

// Create a conversation from the current message history.
export async function POST(req: Request) {
  let body: { title?: string; messages?: ConversationMessage[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const title = (body.title ?? "").trim() || "Untitled";
  const messages = Array.isArray(body.messages) ? body.messages : [];

  const r = await storeOr401();
  if (r.res) return r.res;
  const conversation = await r.store.createConversation(title, messages);
  return NextResponse.json({ conversation }, { status: 201 });
}
