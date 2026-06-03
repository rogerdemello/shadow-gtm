import { NextResponse } from "next/server";
import { storeOr401 } from "@/lib/store-context";
import type { ConversationMessage } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Load a conversation's full message history.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const r = await storeOr401();
  if (r.res) return r.res;
  const conversation = await r.store.getConversation(id);
  if (!conversation) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ conversation });
}

// Replace a conversation's messages (append-on-client, save-whole).
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let body: { messages?: ConversationMessage[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (
    !Array.isArray(body.messages) ||
    !body.messages.every(
      (m) =>
        m &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string",
    )
  ) {
    return NextResponse.json(
      { error: "messages must be an array of { role: user|assistant, content: string }" },
      { status: 400 },
    );
  }
  const r = await storeOr401();
  if (r.res) return r.res;
  await r.store.updateConversation(id, body.messages);
  return NextResponse.json({ ok: true });
}

// Delete a conversation.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const r = await storeOr401();
  if (r.res) return r.res;
  await r.store.deleteConversation(id);
  return NextResponse.json({ ok: true });
}
