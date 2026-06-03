import { Type } from "@google/genai";
import { z } from "zod";
import type { Company, Signal } from "./types";
import { geminiClient, runGemini, withModelFallback } from "./gemini";
import { logger } from "./logger";

// ── Post-scan triage agent ────────────────────────────────────────────────────
// Runs autonomously in the worker after a scheduled scan surfaces high-opportunity
// signals. It judges whether the movement is genuinely alert-worthy, drafts a
// one-line recommended move, and flags whether a deep-dive dossier is warranted.

const log = logger.child({ module: "autonomy" });

export interface TriageVerdict {
  worthy: boolean;
  recommendation: string;
  deepDive: boolean;
}

const VerdictZ = z.object({
  worthy: z.boolean(),
  recommendation: z.string(),
  deepDive: z.boolean(),
});

const SCHEMA = {
  type: Type.OBJECT,
  properties: {
    worthy: { type: Type.BOOLEAN, description: "Is this genuinely worth the team's attention now?" },
    recommendation: { type: Type.STRING, description: "One sharp, specific next move for the revenue team." },
    deepDive: { type: Type.BOOLEAN, description: "Does this warrant a full deep-dive dossier?" },
  },
  required: ["worthy", "recommendation", "deepDive"],
} as const;

const SYSTEM =
  "You are an autonomous GTM intelligence triage analyst. Given a competitor and the new high-opportunity signals from the latest scan, decide if it's genuinely alert-worthy (not noise), write ONE specific recommended move, and judge whether the shift is significant enough to warrant a full deep-dive dossier. Be conservative: only flag deepDive for clear, strategically important movement.";

function digest(signals: Signal[]): string {
  return signals
    .slice(0, 8)
    .map((s) => `- [${s.type}, opp ${s.opportunityScore}] ${s.description} — ${s.reasoning}`)
    .join("\n");
}

/** Judge a scan's high-opportunity signals. Returns null on any failure (caller skips). */
export async function runTriage(
  company: Company,
  signals: Signal[],
): Promise<TriageVerdict | null> {
  if (signals.length === 0) return null;
  try {
    const res = await withModelFallback(
      (model) =>
        runGemini(() =>
          geminiClient().models.generateContent({
            model,
            contents: `Competitor: ${company.name} (${company.domain})\n\nNew high-opportunity signals:\n${digest(signals)}\n\nTriage this.`,
            config: {
              systemInstruction: SYSTEM,
              responseMimeType: "application/json",
              responseSchema: SCHEMA,
              maxOutputTokens: 512,
            },
          }),
        ),
      "autonomy:triage",
    );
    const v = VerdictZ.parse(JSON.parse(res.text ?? "{}"));
    const verdict = { worthy: v.worthy, recommendation: v.recommendation.trim(), deepDive: v.deepDive };
    log.info("triage verdict", {
      company: company.name,
      worthy: verdict.worthy,
      deepDive: verdict.deepDive,
      signals: signals.length,
    });
    return verdict;
  } catch (err) {
    log.warn("triage failed", { company: company.name, error: (err as Error).message });
    return null;
  }
}
