import { createHmac } from "crypto";
import { logger } from "../logger";
import { withRetry, isTransient } from "../retry";

// Outbound webhooks: POST a JSON payload to a customer URL, signed with an
// HMAC-SHA256 of the body using the endpoint's secret so receivers can verify.

const log = logger.child({ module: "webhooks" });

export const SIGNATURE_HEADER = "x-shadowgtm-signature";

/** HMAC-SHA256 hex of the raw body, for the signature header. */
export function signPayload(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

/** Deliver a payload to one endpoint. Returns the HTTP status (0 on transport
 *  failure). Retries transient failures. Never throws. */
export async function dispatchWebhook(
  url: string,
  secret: string,
  payload: unknown,
): Promise<number> {
  const body = JSON.stringify(payload);
  const signature = signPayload(secret, body);
  try {
    const res = await withRetry(
      () =>
        fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            [SIGNATURE_HEADER]: signature,
          },
          body,
        }),
      { label: "webhook.post", shouldRetry: (e) => isTransient(e) },
    );
    return res.status;
  } catch (err) {
    log.warn("webhook delivery failed", { url, error: (err as Error).message });
    return 0;
  }
}
