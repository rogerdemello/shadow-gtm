import type { Company, Signal } from "../types";

// ── Email templates ────────────────────────────────────────────────────────
// Self-contained, inline-styled HTML (email clients ignore <style>/external CSS).
// Pure functions of their inputs → unit-testable without a mail provider.

const BRAND = "#0f766e"; // accessible green for light email backgrounds
const INK = "#0a0e14";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function shell(title: string, bodyHtml: string, ctaUrl: string, ctaLabel: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f4f5f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a212d">
  <div style="max-width:560px;margin:0 auto;padding:24px">
    <div style="font-family:ui-monospace,SFMono-Regular,monospace;font-weight:700;font-size:18px;color:${INK};margin-bottom:16px">◢ Shadow GTM</div>
    <div style="background:#ffffff;border:1px solid #e2e5ea;border-radius:12px;padding:24px">
      <h1 style="margin:0 0 12px;font-size:18px;color:${INK}">${esc(title)}</h1>
      ${bodyHtml}
      <div style="margin-top:20px">
        <a href="${esc(ctaUrl)}" style="display:inline-block;background:${BRAND};color:#fff;text-decoration:none;font-weight:600;padding:10px 18px;border-radius:8px;font-size:14px">${esc(ctaLabel)}</a>
      </div>
    </div>
    <p style="color:#8a93a3;font-size:11px;margin-top:16px">You're receiving this because alerts are enabled for your Shadow GTM workspace.</p>
  </div></body></html>`;
}

function signalRow(s: Signal): string {
  return `<div style="border-left:3px solid ${BRAND};padding:8px 12px;margin:10px 0;background:#f9fafb;border-radius:0 6px 6px 0">
    <div style="font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#8a93a3">${esc(s.type)} · opportunity ${s.opportunityScore}</div>
    <div style="font-weight:600;margin:2px 0">${esc(s.description)}</div>
    <div style="font-size:13px;color:#3a4250">${esc(s.reasoning)}</div>
    <div style="font-size:13px;margin-top:4px"><strong>Play:</strong> ${esc(s.recommendedAction)}</div>
  </div>`;
}

/** Alert email for a company's high-opportunity signals from a scan. */
export function signalAlertEmail(
  company: Company,
  signals: Signal[],
  ctaUrl: string,
): { subject: string; html: string } {
  const top = signals[0]?.opportunityScore ?? 0;
  const subject = `🎯 ${company.name}: ${signals.length} high-opportunity signal${signals.length === 1 ? "" : "s"} (top ${top})`;
  const body = `<p style="margin:0 0 8px;color:#3a4250">New movement detected for <strong>${esc(company.name)}</strong> that crossed your alert threshold:</p>
    ${signals.map(signalRow).join("")}`;
  return { subject, html: shell(`${company.name} — new signals`, body, ctaUrl, "Open dashboard") };
}

/** Weekly digest of the top plays across the watchlist. */
export function weeklyDigestEmail(
  orgName: string,
  topPlays: Signal[],
  companyCount: number,
  ctaUrl: string,
): { subject: string; html: string } {
  const subject = `Shadow GTM weekly brief — ${topPlays.length} top plays`;
  const intro = `<p style="margin:0 0 8px;color:#3a4250">Your competitive intelligence brief for <strong>${esc(orgName)}</strong> — ${companyCount} competitor${companyCount === 1 ? "" : "s"} tracked.</p>`;
  const body = topPlays.length
    ? intro + topPlays.map((s) => signalRow({ ...s, description: `${s.companyName}: ${s.description}` })).join("")
    : intro + `<p style="color:#8a93a3">No signals captured this week. Add competitors or run a scan to start tracking.</p>`;
  return { subject, html: shell("Your weekly competitive brief", body, ctaUrl, "View full brief") };
}
