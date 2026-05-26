import { NextResponse } from "next/server";
import {
  getBattlecard,
  getCompany,
  id as newId,
  listSignals,
  saveBattlecard,
} from "@/lib/store";
import { generateBattlecard } from "@/lib/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: Request) {
  const companyId = new URL(req.url).searchParams.get("companyId");
  if (!companyId) {
    return NextResponse.json({ error: "companyId required" }, { status: 400 });
  }
  const card = await getBattlecard(companyId);
  return NextResponse.json({ battlecard: card ?? null });
}

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

  const company = await getCompany(companyId);
  if (!company) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  const signals = (await listSignals()).filter((s) => s.companyId === companyId);

  try {
    const markdown = await generateBattlecard(company, signals);
    const card = {
      id: newId(),
      companyId,
      companyName: company.name,
      markdown,
      createdAt: new Date().toISOString(),
    };
    await saveBattlecard(card);
    return NextResponse.json({ battlecard: card });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
