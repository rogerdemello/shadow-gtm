import type { Company, Signal } from "../types";
import type { Store } from "../store.supabase";
import { logger } from "../logger";
import { sendSlackMessage } from "./slack";
import { dispatchWebhook } from "./webhooks";

// Fan out a company's high-opportunity signals to the org's enabled integration
// channels (Slack, outbound webhooks). Best-effort — never throws into the scan.

const log = logger.child({ module: "dispatch" });

function slackText(company: Company, alerts: Signal[]): string {
  const lines = alerts
    .slice(0, 5)
    .map((s) => `• *${s.type}* (opp ${s.opportunityScore}) — ${s.description}\n   ↳ ${s.recommendedAction}`);
  return `*🎯 ${company.name}: ${alerts.length} high-opportunity signal${alerts.length === 1 ? "" : "s"}*\n${lines.join("\n")}`;
}

/** Dispatch to Slack and/or webhooks per the org's selected channels. */
export async function dispatchSignalIntegrations(
  store: Store,
  company: Company,
  alerts: Signal[],
  channels: string[],
): Promise<void> {
  // Slack
  if (channels.includes("slack")) {
    const integ = await store.getIntegration("slack");
    const url = integ?.enabled ? (integ.config.webhookUrl as string | undefined) : undefined;
    if (url) {
      await sendSlackMessage(url, slackText(company, alerts)).catch((e) =>
        log.warn("slack dispatch failed", { error: (e as Error).message }),
      );
    }
  }

  // Outbound webhooks
  if (channels.includes("webhook")) {
    const targets = await store.listWebhookTargets();
    const payload = {
      event: "signals.alert",
      company: { id: company.id, name: company.name, domain: company.domain },
      signals: alerts.map((s) => ({
        id: s.id,
        type: s.type,
        description: s.description,
        impact: s.impact,
        opportunityScore: s.opportunityScore,
        reasoning: s.reasoning,
        recommendedAction: s.recommendedAction,
        sourceUrl: s.sourceUrl,
      })),
      at: new Date().toISOString(),
    };
    await Promise.all(
      targets.map(async (t) => {
        const status = await dispatchWebhook(t.url, t.secret, payload);
        await store.recordWebhookResult(t.id, status).catch(() => {});
      }),
    );
  }
}
