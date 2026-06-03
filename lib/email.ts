import { Resend } from "resend";
import { env, emailConfigured } from "./env";
import { logger } from "./logger";
import { withRetry, isTransient } from "./retry";

// ── Email delivery (Resend) ───────────────────────────────────────────────────
// Behind the emailConfigured() flag: when no RESEND_API_KEY/EMAIL_FROM is set,
// sendEmail() logs and no-ops so scans, digests, and the build all run keyless.
// Mirrors the geminiConfigured()/supabaseConfigured() pattern.

const log = logger.child({ module: "email" });

let _resend: Resend | null = null;
function client(): Resend {
  if (!_resend) _resend = new Resend(env.RESEND_API_KEY!);
  return _resend;
}

export interface EmailMessage {
  to: string | string[];
  subject: string;
  html: string;
}

/** Send an email. Returns { sent } — false when unconfigured or on failure
 *  (never throws; email must never break a scan or worker run). */
export async function sendEmail(msg: EmailMessage): Promise<{ sent: boolean }> {
  const recipients = Array.isArray(msg.to) ? msg.to : [msg.to];
  if (recipients.length === 0) return { sent: false };

  if (!emailConfigured()) {
    log.info("email skipped (not configured)", { subject: msg.subject, to: recipients.length });
    return { sent: false };
  }

  try {
    // Retry transient provider failures (5xx/timeouts/429) a few times before
    // giving up. A returned `error` is treated as retryable via a thrown wrapper.
    await withRetry(
      async () => {
        const { error } = await client().emails.send({
          from: env.EMAIL_FROM!,
          to: recipients,
          subject: msg.subject,
          html: msg.html,
        });
        if (error) throw new Error((error as { message?: string }).message ?? "email send error");
      },
      { label: "email.send", shouldRetry: isTransient },
    );
    return { sent: true };
  } catch (err) {
    log.error("email send failed", err as Error, { subject: msg.subject });
    return { sent: false };
  }
}

export { emailConfigured };
