import { NextResponse } from "next/server";
import { getCompany, listSignals } from "@/lib/store";
import { generateAttackPlan } from "@/lib/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// War Room: turn an operator directive + live signals into an attack plan.
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

  try {
    const markdown = await generateAttackPlan(directive, companyName, signals);
    return NextResponse.json({ plan: { directive, companyName, markdown } });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
