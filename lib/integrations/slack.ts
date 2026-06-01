import { logger } from "../logger";
import { withRetry, isTransient } from "../retry";

// Slack delivery via an Incoming Webhook URL (stored per-org in `integrations`).
// No global env/secret needed — the webhook URL is the credential.

const log = logger.child({ module: "slack" });

/** Post a message to a Slack incoming webhook. Returns true on 2xx. Best-effort. */
export async function sendSlackMessage(webhookUrl: string, text: string): Promise<boolean> {
  try {
    const res = await withRetry(
      () =>
        fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        }),
      { label: "slack.post", shouldRetry: (e) => isTransient(e) },
    );
    if (!res.ok) {
      log.warn("slack post non-2xx", { status: res.status });
      return false;
    }
    return true;
  } catch (err) {
    log.warn("slack post failed", { error: (err as Error).message });
    return false;
  }
}
