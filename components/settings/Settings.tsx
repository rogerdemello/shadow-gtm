"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  AlertRule,
  ApiKey,
  Invitation,
  Member,
  MemberRole,
  Plan,
  PlanId,
  Schedule,
  Subscription,
  UsageSummary,
  WebhookEndpoint,
} from "@/lib/types";
import CopyButton from "../CopyButton";

const TABS = [
  "Organization",
  "Team",
  "Billing",
  "Integrations",
  "Alerts",
  "Schedules",
  "Usage",
  "Audit",
] as const;
type Tab = (typeof TABS)[number];

const isAdmin = (role: MemberRole) => role === "owner" || role === "admin";

async function jsonOrThrow(res: Response): Promise<Record<string, unknown>> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  }
  return data as Record<string, unknown>;
}

export default function Settings({
  role,
  me,
  initialOrg,
}: {
  role: MemberRole;
  me: string;
  initialOrg: { name: string; slug: string | null };
}) {
  const [tab, setTab] = useState<Tab>("Organization");

  return (
    <div>
      <nav className="mb-4 flex gap-1 border-b border-ink-500/60">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-3 py-2 font-mono text-xs uppercase tracking-wider transition ${
              tab === t
                ? "border-accent text-accent"
                : "border-transparent text-slate-500 hover:text-slate-300"
            }`}
          >
            {t}
          </button>
        ))}
      </nav>

      {tab === "Organization" && <OrgTab role={role} initialOrg={initialOrg} />}
      {tab === "Team" && <TeamTab role={role} me={me} />}
      {tab === "Billing" && <BillingTab role={role} />}
      {tab === "Integrations" && <IntegrationsTab role={role} />}
      {tab === "Alerts" && <AlertsTab />}
      {tab === "Schedules" && <SchedulesTab role={role} />}
      {tab === "Usage" && <UsageTab role={role} />}
      {tab === "Audit" && <AuditTab />}
    </div>
  );
}

// ── Shared bits ────────────────────────────────────────────────────────────

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-ink-500/60 bg-ink-800/60 p-4">{children}</div>
  );
}

function Notice({ kind, children }: { kind: "error" | "ok"; children: React.ReactNode }) {
  const cls =
    kind === "error"
      ? "border-signal-high/40 bg-signal-high/10 text-signal-high"
      : "border-accent/40 bg-accent/10 text-accent";
  return <div className={`mb-3 rounded-lg border px-3 py-2 text-xs ${cls}`}>{children}</div>;
}

const ROLE_BADGE: Record<MemberRole, string> = {
  owner: "text-accent",
  admin: "text-signal-info",
  member: "text-slate-400",
};

// ── Organization ────────────────────────────────────────────────────────────

function OrgTab({
  role,
  initialOrg,
}: {
  role: MemberRole;
  initialOrg: { name: string; slug: string | null };
}) {
  const [name, setName] = useState(initialOrg.name);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "error" | "ok"; text: string } | null>(null);
  const canEdit = isAdmin(role);

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      await jsonOrThrow(
        await fetch("/api/org", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        }),
      );
      setMsg({ kind: "ok", text: "Saved." });
    } catch (e) {
      setMsg({ kind: "error", text: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      <label className="mb-1 block font-mono text-[10px] uppercase tracking-widest text-slate-500">
        Workspace name
      </label>
      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={!canEdit}
          maxLength={80}
          className="flex-1 rounded border border-ink-500 bg-ink-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-accent/60 disabled:opacity-50"
        />
        {canEdit && (
          <button
            onClick={save}
            disabled={saving || !name.trim() || name === initialOrg.name}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-bold text-ink-900 transition hover:brightness-110 disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        )}
      </div>
      {!canEdit && (
        <p className="mt-2 text-xs text-slate-600">Only owners/admins can rename the workspace.</p>
      )}

      {/* Data export + danger zone */}
      <div className="mt-6 border-t border-ink-500/40 pt-4">
        <h3 className="mb-2 font-mono text-[10px] uppercase tracking-widest text-slate-500">
          Your data
        </h3>
        {canEdit && (
          <a
            href="/api/export"
            className="inline-block rounded-lg border border-ink-500 px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-slate-300 transition hover:border-accent/50 hover:text-accent"
          >
            ⬇ Export workspace data (JSON)
          </a>
        )}
        {role === "owner" && <DeleteOrg name={initialOrg.name} />}
      </div>
    </Panel>
  );
}

function DeleteOrg({ name }: { name: string }) {
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function del() {
    setBusy(true);
    setErr(null);
    try {
      await jsonOrThrow(await fetch("/api/org/delete", { method: "POST" }));
      window.location.href = "/";
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 rounded-lg border border-signal-high/30 bg-signal-high/5 p-3">
      <p className="mb-1 font-mono text-[10px] uppercase tracking-widest text-signal-high">
        Danger zone
      </p>
      <p className="mb-2 text-xs text-slate-400">
        Permanently delete this workspace and all its data. Type the workspace name to confirm.
      </p>
      {err && <Notice kind="error">{err}</Notice>}
      <div className="flex flex-wrap gap-2">
        <input
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder={name}
          className="min-w-[180px] flex-1 rounded border border-ink-500 bg-ink-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-signal-high/60"
        />
        <button
          onClick={del}
          disabled={busy || confirm !== name}
          className="rounded-lg border border-signal-high/50 px-3 py-2 text-sm font-bold text-signal-high transition hover:bg-signal-high/10 disabled:opacity-40"
        >
          {busy ? "Deleting…" : "Delete workspace"}
        </button>
      </div>
    </div>
  );
}

// ── Audit ─────────────────────────────────────────────────────────────────

interface AuditSnapshot {
  pageType: string;
  url: string;
  hash: string;
  fetchedAt: string;
}

function AuditTab() {
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [snapshots, setSnapshots] = useState<AuditSnapshot[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/companies")
      .then(jsonOrThrow)
      .then((d) => {
        const cs = (d.companies as { id: string; name: string }[]) ?? [];
        setCompanies(cs);
        if (cs[0]) setSelected(cs[0].id);
      })
      .catch((e) => setErr((e as Error).message));
  }, []);

  useEffect(() => {
    if (!selected) return;
    fetch(`/api/audit?companyId=${encodeURIComponent(selected)}`)
      .then(jsonOrThrow)
      .then((d) => setSnapshots((d.snapshots as AuditSnapshot[]) ?? []))
      .catch((e) => setErr((e as Error).message));
  }, [selected]);

  return (
    <Panel>
      {err && <Notice kind="error">{err}</Notice>}
      <p className="mb-3 text-xs text-slate-500">
        Immutable trail: every page we fetched, with its content fingerprint (SHA-256) and
        timestamp — so every signal can be traced to a verifiable source.
      </p>
      {companies.length === 0 ? (
        <p className="text-sm text-slate-600">No competitors yet.</p>
      ) : (
        <>
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="mb-3 rounded border border-ink-500 bg-ink-900 px-2 py-1 font-mono text-[11px] text-slate-300 outline-none focus:border-accent/60"
          >
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {snapshots.length === 0 ? (
            <p className="text-sm text-slate-600">No captures recorded yet.</p>
          ) : (
            <ul className="space-y-1.5 font-mono text-[11px]">
              {snapshots.map((s, i) => (
                <li key={i} className="rounded border border-ink-500/40 bg-ink-900/40 px-2 py-1.5">
                  <div className="flex justify-between text-slate-400">
                    <span className="uppercase">{s.pageType}</span>
                    <span>{new Date(s.fetchedAt).toLocaleString()}</span>
                  </div>
                  <div className="truncate text-slate-500">{s.url}</div>
                  <div className="text-slate-600">sha256:{s.hash}</div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Panel>
  );
}

// ── Team ──────────────────────────────────────────────────────────────────

function TeamTab({ role, me }: { role: MemberRole; me: string }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const admin = isAdmin(role);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const m = await jsonOrThrow(await fetch("/api/members"));
      setMembers((m.members as Member[]) ?? []);
      if (admin) {
        const i = await jsonOrThrow(await fetch("/api/invitations"));
        setInvites(((i.invitations as Invitation[]) ?? []).filter((x) => !x.acceptedAt));
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [admin]);

  useEffect(() => {
    load();
  }, [load]);

  async function changeRole(userId: string, newRole: MemberRole) {
    setErr(null);
    try {
      await jsonOrThrow(
        await fetch(`/api/members/${userId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: newRole }),
        }),
      );
      await load();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function remove(userId: string) {
    setErr(null);
    try {
      await jsonOrThrow(await fetch(`/api/members/${userId}`, { method: "DELETE" }));
      await load();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  if (loading) return <Panel>Loading team…</Panel>;

  return (
    <div className="space-y-4">
      {err && <Notice kind="error">{err}</Notice>}

      <Panel>
        <h2 className="mb-3 font-mono text-[10px] uppercase tracking-widest text-slate-500">
          Members ({members.length})
        </h2>
        <ul className="divide-y divide-ink-500/40">
          {members.map((m) => (
            <li key={m.userId} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <div className="truncate text-sm text-slate-200">
                  {m.email ?? m.userId}
                  {m.userId === me && <span className="ml-2 text-[10px] text-slate-600">(you)</span>}
                </div>
                {m.fullName && <div className="text-xs text-slate-600">{m.fullName}</div>}
              </div>
              <div className="flex items-center gap-2">
                {admin && m.userId !== me ? (
                  <select
                    value={m.role}
                    onChange={(e) => changeRole(m.userId, e.target.value as MemberRole)}
                    className="rounded border border-ink-500 bg-ink-900 px-2 py-1 font-mono text-[11px] text-slate-300 outline-none focus:border-accent/60"
                  >
                    <option value="owner">owner</option>
                    <option value="admin">admin</option>
                    <option value="member">member</option>
                  </select>
                ) : (
                  <span className={`font-mono text-[11px] uppercase ${ROLE_BADGE[m.role]}`}>
                    {m.role}
                  </span>
                )}
                {admin && m.userId !== me && (
                  <button
                    onClick={() => remove(m.userId)}
                    className="rounded border border-ink-500 px-2 py-1 font-mono text-[10px] text-slate-500 transition hover:border-signal-high/60 hover:text-signal-high"
                    title="Remove member"
                  >
                    ×
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Panel>

      {admin && <InviteForm onInvited={load} invites={invites} onRevoke={load} />}
    </div>
  );
}

function InviteForm({
  onInvited,
  invites,
  onRevoke,
}: {
  onInvited: () => void;
  invites: Invitation[];
  onRevoke: () => void;
}) {
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<MemberRole>("member");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [lastLink, setLastLink] = useState<string | null>(null);

  async function invite() {
    setBusy(true);
    setErr(null);
    setLastLink(null);
    try {
      const data = await jsonOrThrow(
        await fetch("/api/invitations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, role: inviteRole }),
        }),
      );
      const inv = data.invitation as Invitation;
      setLastLink(`${window.location.origin}/invite/${inv.token}`);
      setEmail("");
      onInvited();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    await fetch(`/api/invitations/${id}`, { method: "DELETE" });
    onRevoke();
  }

  return (
    <Panel>
      <h2 className="mb-3 font-mono text-[10px] uppercase tracking-widest text-slate-500">
        Invite a teammate
      </h2>
      {err && <Notice kind="error">{err}</Notice>}
      <div className="flex flex-wrap gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="teammate@company.com"
          className="min-w-[220px] flex-1 rounded border border-ink-500 bg-ink-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-accent/60"
        />
        <select
          value={inviteRole}
          onChange={(e) => setInviteRole(e.target.value as MemberRole)}
          className="rounded border border-ink-500 bg-ink-900 px-2 py-2 font-mono text-xs text-slate-300 outline-none focus:border-accent/60"
        >
          <option value="member">member</option>
          <option value="admin">admin</option>
        </select>
        <button
          onClick={invite}
          disabled={busy || !email.trim()}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-bold text-ink-900 transition hover:brightness-110 disabled:opacity-40"
        >
          {busy ? "Inviting…" : "Invite"}
        </button>
      </div>

      {lastLink && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-accent/30 bg-accent/5 px-3 py-2">
          <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-slate-300">
            {lastLink}
          </span>
          <CopyButton text={lastLink} label="Copy link" />
        </div>
      )}

      {invites.length > 0 && (
        <div className="mt-4">
          <h3 className="mb-1.5 font-mono text-[10px] uppercase tracking-widest text-slate-500">
            Pending ({invites.length})
          </h3>
          <ul className="divide-y divide-ink-500/40">
            {invites.map((inv) => (
              <li key={inv.id} className="flex items-center justify-between gap-2 py-2">
                <span className="truncate text-sm text-slate-300">
                  {inv.email}{" "}
                  <span className="font-mono text-[10px] uppercase text-slate-600">{inv.role}</span>
                </span>
                <div className="flex items-center gap-2">
                  <CopyButton
                    text={`${typeof window !== "undefined" ? window.location.origin : ""}/invite/${inv.token}`}
                    label="Link"
                  />
                  <button
                    onClick={() => revoke(inv.id)}
                    className="rounded border border-ink-500 px-2 py-0.5 font-mono text-[10px] text-slate-500 transition hover:border-signal-high/60 hover:text-signal-high"
                  >
                    Revoke
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}

// ── Billing ───────────────────────────────────────────────────────────────

interface BillingData {
  subscription: Subscription;
  plan: Plan;
  quota: { used: number; limit: number | null; remaining: number | null; over: boolean };
  companies: number;
  plans: Record<PlanId, Plan>;
  checkoutPlans: PlanId[];
  billingEnabled: boolean;
}

function BillingTab({ role }: { role: MemberRole }) {
  const [data, setData] = useState<BillingData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const admin = isAdmin(role);

  useEffect(() => {
    fetch("/api/billing")
      .then(jsonOrThrow)
      .then((d) => setData(d as unknown as BillingData))
      .catch((e) => setErr((e as Error).message));
  }, []);

  async function go(url: string, body?: unknown, key?: string) {
    setBusy(key ?? url);
    setErr(null);
    try {
      const d = await jsonOrThrow(
        await fetch(url, {
          method: "POST",
          headers: body ? { "Content-Type": "application/json" } : undefined,
          body: body ? JSON.stringify(body) : undefined,
        }),
      );
      window.location.href = d.url as string;
    } catch (e) {
      setErr((e as Error).message);
      setBusy(null);
    }
  }

  if (!data) return <Panel>{err ? <Notice kind="error">{err}</Notice> : "Loading…"}</Panel>;

  const { plan, quota, subscription } = data;
  const pct =
    quota.limit === null ? 0 : Math.min(100, Math.round((quota.used / quota.limit) * 100));

  return (
    <div className="space-y-4">
      {err && <Notice kind="error">{err}</Notice>}
      {!data.billingEnabled && (
        <Notice kind="ok">
          Billing isn&apos;t configured on this deployment — every workspace runs on the Free
          plan. Quotas still apply.
        </Notice>
      )}

      <Panel>
        <div className="flex items-center justify-between">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
              Current plan
            </div>
            <div className="text-lg font-bold text-slate-100">
              {plan.name}{" "}
              <span className="font-mono text-xs text-slate-500">({subscription.status})</span>
            </div>
          </div>
          {admin && data.billingEnabled && subscription.stripeCustomerId && (
            <button
              onClick={() => go("/api/billing/portal", undefined, "portal")}
              disabled={busy === "portal"}
              className="rounded-lg border border-ink-500 px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-slate-300 transition hover:border-accent/50 hover:text-accent disabled:opacity-40"
            >
              {busy === "portal" ? "Opening…" : "Manage billing"}
            </button>
          )}
        </div>

        {/* Scan quota bar */}
        <div className="mt-4">
          <div className="mb-1 flex justify-between font-mono text-[11px] text-slate-400">
            <span>Scans this month</span>
            <span className={quota.over ? "text-signal-high" : ""}>
              {quota.used} / {quota.limit === null ? "∞" : quota.limit}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-ink-900">
            <div
              className={`h-full ${quota.over ? "bg-signal-high" : "bg-accent"}`}
              style={{ width: `${quota.limit === null ? 4 : pct}%` }}
            />
          </div>
        </div>

        <div className="mt-3 font-mono text-[11px] text-slate-500">
          Competitors: {data.companies}
          {plan.limits.maxCompanies !== null ? ` / ${plan.limits.maxCompanies}` : " (unlimited)"}
        </div>
      </Panel>

      {data.billingEnabled && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {data.checkoutPlans.map((pid) => {
            const p = data.plans[pid];
            const current = plan.id === pid;
            return (
              <div key={pid} className="rounded-xl border border-ink-500/60 bg-ink-800/60 p-4">
                <div className="flex items-baseline justify-between">
                  <span className="text-base font-bold text-slate-100">{p.name}</span>
                  <span className="font-mono text-sm text-slate-300">${p.priceMonthly}/mo</span>
                </div>
                <p className="mt-1 text-xs text-slate-500">{p.blurb}</p>
                <ul className="mt-2 space-y-0.5 font-mono text-[11px] text-slate-400">
                  <li>{p.limits.monthlyScans} scans/mo</li>
                  <li>{p.limits.maxCompanies} competitors</li>
                  <li>{p.limits.maxMembers} seats</li>
                </ul>
                {admin && (
                  <button
                    onClick={() => go("/api/billing/checkout", { plan: pid }, pid)}
                    disabled={current || busy === pid}
                    className="mt-3 w-full rounded-lg bg-accent px-3 py-2 text-sm font-bold text-ink-900 transition hover:brightness-110 disabled:opacity-40"
                  >
                    {current ? "Current plan" : busy === pid ? "Redirecting…" : `Upgrade to ${p.name}`}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Integrations ─────────────────────────────────────────────────────────────

function IntegrationsTab({ role }: { role: MemberRole }) {
  const admin = isAdmin(role);
  return (
    <div className="space-y-4">
      <SlackCard admin={admin} />
      <WebhooksCard admin={admin} />
      <ApiKeysCard admin={admin} />
    </div>
  );
}

function SlackCard({ admin }: { admin: boolean }) {
  const [url, setUrl] = useState("");
  const [connected, setConnected] = useState(false);
  const [msg, setMsg] = useState<{ kind: "error" | "ok"; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await jsonOrThrow(await fetch("/api/integrations/slack"));
      setConnected(Boolean(d.connected));
      setUrl((d.webhookUrl as string) ?? "");
    } catch {
      /* members without admin get 403 — leave blank */
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    setMsg(null);
    try {
      await jsonOrThrow(
        await fetch("/api/integrations/slack", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ webhookUrl: url, enabled: true }),
        }),
      );
      setConnected(true);
      setMsg({ kind: "ok", text: "Slack connected." });
    } catch (e) {
      setMsg({ kind: "error", text: (e as Error).message });
    }
  }
  async function disconnect() {
    await fetch("/api/integrations/slack", { method: "DELETE" });
    setConnected(false);
    setUrl("");
  }

  return (
    <Panel>
      <h2 className="mb-2 font-mono text-[10px] uppercase tracking-widest text-slate-500">
        Slack {connected && <span className="text-accent">· connected</span>}
      </h2>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      <p className="mb-2 text-xs text-slate-500">
        Paste an{" "}
        <a
          href="https://api.slack.com/messaging/webhooks"
          target="_blank"
          rel="noreferrer"
          className="text-accent hover:underline"
        >
          incoming-webhook URL
        </a>{" "}
        and enable the &quot;Slack&quot; alert channel to get high-opportunity signals in a channel.
      </p>
      {admin ? (
        <div className="flex flex-wrap gap-2">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://hooks.slack.com/services/…"
            className="min-w-[240px] flex-1 rounded border border-ink-500 bg-ink-900 px-3 py-2 font-mono text-xs text-slate-100 outline-none focus:border-accent/60"
          />
          <button
            onClick={save}
            disabled={!url.trim()}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-bold text-ink-900 transition hover:brightness-110 disabled:opacity-40"
          >
            Save
          </button>
          {connected && (
            <button
              onClick={disconnect}
              className="rounded-lg border border-ink-500 px-3 py-2 font-mono text-[11px] uppercase text-slate-400 transition hover:border-signal-high/60 hover:text-signal-high"
            >
              Disconnect
            </button>
          )}
        </div>
      ) : (
        <p className="text-xs text-slate-600">Only owners/admins can manage integrations.</p>
      )}
    </Panel>
  );
}

function WebhooksCard({ admin }: { admin: boolean }) {
  const [hooks, setHooks] = useState<WebhookEndpoint[]>([]);
  const [url, setUrl] = useState("");
  const [secret, setSecret] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await jsonOrThrow(await fetch("/api/webhooks"));
      setHooks((d.webhooks as WebhookEndpoint[]) ?? []);
    } catch (e) {
      setErr((e as Error).message);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function add() {
    setErr(null);
    setSecret(null);
    try {
      const d = await jsonOrThrow(
        await fetch("/api/webhooks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        }),
      );
      setSecret(d.secret as string);
      setUrl("");
      load();
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  async function del(id: string) {
    await fetch(`/api/webhooks/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <Panel>
      <h2 className="mb-2 font-mono text-[10px] uppercase tracking-widest text-slate-500">
        Outbound webhooks
      </h2>
      {err && <Notice kind="error">{err}</Notice>}
      <p className="mb-2 text-xs text-slate-500">
        POSTs signed JSON (HMAC-SHA256 in the <code>x-shadowgtm-signature</code> header) on new
        high-opportunity signals. Enable the &quot;Webhook&quot; alert channel.
      </p>
      {secret && (
        <div className="mb-3 rounded-lg border border-accent/30 bg-accent/5 px-3 py-2">
          <p className="mb-1 text-[11px] text-slate-400">Signing secret (shown once):</p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-slate-200">
              {secret}
            </code>
            <CopyButton text={secret} label="Copy" />
          </div>
        </div>
      )}
      {admin && (
        <div className="mb-3 flex flex-wrap gap-2">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://your-app.com/hooks/shadow-gtm"
            className="min-w-[240px] flex-1 rounded border border-ink-500 bg-ink-900 px-3 py-2 font-mono text-xs text-slate-100 outline-none focus:border-accent/60"
          />
          <button
            onClick={add}
            disabled={!url.trim()}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-bold text-ink-900 transition hover:brightness-110 disabled:opacity-40"
          >
            Add
          </button>
        </div>
      )}
      <ul className="divide-y divide-ink-500/40">
        {hooks.map((h) => (
          <li key={h.id} className="flex items-center justify-between gap-2 py-2">
            <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-slate-300">{h.url}</span>
            <span className="font-mono text-[10px] text-slate-600">
              {h.lastStatus ? `last ${h.lastStatus}` : "no delivery"}
            </span>
            {admin && (
              <button
                onClick={() => del(h.id)}
                className="rounded border border-ink-500 px-2 py-0.5 font-mono text-[10px] text-slate-500 transition hover:border-signal-high/60 hover:text-signal-high"
              >
                Delete
              </button>
            )}
          </li>
        ))}
        {hooks.length === 0 && <li className="py-2 text-xs text-slate-600">No endpoints yet.</li>}
      </ul>
    </Panel>
  );
}

function ApiKeysCard({ admin }: { admin: boolean }) {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [name, setName] = useState("");
  const [fresh, setFresh] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await jsonOrThrow(await fetch("/api/api-keys"));
      setKeys((d.apiKeys as ApiKey[]) ?? []);
    } catch (e) {
      setErr((e as Error).message);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function create() {
    setErr(null);
    setFresh(null);
    try {
      const d = await jsonOrThrow(
        await fetch("/api/api-keys", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        }),
      );
      setFresh(d.key as string);
      setName("");
      load();
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  async function revoke(id: string) {
    await fetch(`/api/api-keys/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <Panel>
      <h2 className="mb-2 font-mono text-[10px] uppercase tracking-widest text-slate-500">
        API keys
      </h2>
      {err && <Notice kind="error">{err}</Notice>}
      <p className="mb-2 text-xs text-slate-500">
        Authenticate the public REST API (<code>/api/v1/*</code>) with{" "}
        <code>Authorization: Bearer &lt;key&gt;</code>.
      </p>
      {fresh && (
        <div className="mb-3 rounded-lg border border-accent/30 bg-accent/5 px-3 py-2">
          <p className="mb-1 text-[11px] text-slate-400">New key (shown once):</p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-slate-200">{fresh}</code>
            <CopyButton text={fresh} label="Copy" />
          </div>
        </div>
      )}
      {admin && (
        <div className="mb-3 flex flex-wrap gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Key name (e.g. Zapier)"
            className="min-w-[200px] flex-1 rounded border border-ink-500 bg-ink-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-accent/60"
          />
          <button
            onClick={create}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-bold text-ink-900 transition hover:brightness-110"
          >
            Create key
          </button>
        </div>
      )}
      <ul className="divide-y divide-ink-500/40">
        {keys.map((k) => (
          <li key={k.id} className="flex items-center justify-between gap-2 py-2">
            <span className="min-w-0">
              <span className="text-sm text-slate-300">{k.name}</span>{" "}
              <code className="font-mono text-[10px] text-slate-600">{k.prefix}…</code>
              {k.revokedAt && <span className="ml-2 text-[10px] text-signal-high">revoked</span>}
            </span>
            {admin && !k.revokedAt && (
              <button
                onClick={() => revoke(k.id)}
                className="rounded border border-ink-500 px-2 py-0.5 font-mono text-[10px] text-slate-500 transition hover:border-signal-high/60 hover:text-signal-high"
              >
                Revoke
              </button>
            )}
          </li>
        ))}
        {keys.length === 0 && <li className="py-2 text-xs text-slate-600">No keys yet.</li>}
      </ul>
    </Panel>
  );
}

// ── Alerts ──────────────────────────────────────────────────────────────────

const CHANNELS: { id: string; label: string; note?: string }[] = [
  { id: "in_app", label: "In-app" },
  { id: "email", label: "Email", note: "needs Resend" },
  { id: "slack", label: "Slack", note: "needs integration" },
  { id: "webhook", label: "Webhook", note: "needs endpoint" },
];

function AlertsTab() {
  const [rule, setRule] = useState<AlertRule | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "error" | "ok"; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/alert-rules")
      .then(jsonOrThrow)
      .then((d) => setRule(d.rule as AlertRule))
      .catch((e) => setMsg({ kind: "error", text: (e as Error).message }));
  }, []);

  if (!rule) return <Panel>{msg ? <Notice kind="error">{msg.text}</Notice> : "Loading…"}</Panel>;

  function toggleChannel(id: string) {
    setRule((r) =>
      r
        ? {
            ...r,
            channels: r.channels.includes(id)
              ? r.channels.filter((c) => c !== id)
              : [...r.channels, id],
          }
        : r,
    );
  }

  async function save() {
    if (!rule) return;
    setSaving(true);
    setMsg(null);
    try {
      await jsonOrThrow(
        await fetch("/api/alert-rules", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(rule),
        }),
      );
      setMsg({ kind: "ok", text: "Saved." });
    } catch (e) {
      setMsg({ kind: "error", text: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}

      <label className="mb-1 block font-mono text-[10px] uppercase tracking-widest text-slate-500">
        Alert threshold — opportunity score ≥ {rule.minOpportunity}
      </label>
      <input
        type="range"
        min={0}
        max={100}
        value={rule.minOpportunity}
        onChange={(e) => setRule({ ...rule, minOpportunity: Number(e.target.value) })}
        className="w-full accent-[#3ddc97]"
      />

      <div className="mt-4">
        <p className="mb-1.5 font-mono text-[10px] uppercase tracking-widest text-slate-500">
          Channels
        </p>
        <div className="flex flex-wrap gap-2">
          {CHANNELS.map((c) => {
            const on = rule.channels.includes(c.id);
            return (
              <button
                key={c.id}
                onClick={() => toggleChannel(c.id)}
                className={`rounded-lg border px-3 py-1.5 font-mono text-[11px] transition ${
                  on
                    ? "border-accent/60 bg-accent/10 text-accent"
                    : "border-ink-500 text-slate-400 hover:border-slate-600"
                }`}
                title={c.note}
              >
                {on ? "✓ " : ""}
                {c.label}
                {c.note && <span className="ml-1 text-[9px] text-slate-600">({c.note})</span>}
              </button>
            );
          })}
        </div>
      </div>

      <label className="mt-4 flex items-center gap-2 text-sm text-slate-300">
        <input
          type="checkbox"
          checked={rule.digestEnabled}
          onChange={(e) => setRule({ ...rule, digestEnabled: e.target.checked })}
          className="accent-[#3ddc97]"
        />
        Weekly digest email
      </label>

      <div className="mt-4">
        <p className="mb-1 font-mono text-[10px] uppercase tracking-widest text-slate-500">
          Autonomy — what the agent does after a scheduled scan
        </p>
        <select
          value={rule.autonomyLevel}
          onChange={(e) =>
            setRule({ ...rule, autonomyLevel: e.target.value as AlertRule["autonomyLevel"] })
          }
          className="w-full rounded border border-ink-500 bg-ink-900 px-2 py-2 text-sm text-slate-200 outline-none focus:border-accent/60"
        >
          <option value="none">Off — just raise alerts</option>
          <option value="triage">Triage — draft a recommended move on alert-worthy movement</option>
          <option value="deep_dive">Deep dive — also auto-research spiking competitors</option>
        </select>
        <p className="mt-1 text-[11px] text-slate-600">
          Runs in the background worker; uses extra Gemini calls only when signals cross the
          threshold.
        </p>
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="mt-4 rounded-lg bg-accent px-4 py-2 text-sm font-bold text-ink-900 transition hover:brightness-110 disabled:opacity-40"
      >
        {saving ? "Saving…" : "Save alert settings"}
      </button>
    </Panel>
  );
}

// ── Schedules ────────────────────────────────────────────────────────────────

const CADENCE_LABEL: Record<string, string> = {
  hourly: "Hourly",
  daily: "Daily",
  weekly: "Weekly",
};

function SchedulesTab({ role }: { role: MemberRole }) {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [companyId, setCompanyId] = useState<string>(""); // "" = whole watchlist
  const [cadence, setCadence] = useState<"hourly" | "daily" | "weekly">("daily");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "error" | "ok"; text: string } | null>(null);
  const admin = isAdmin(role);

  const load = useCallback(async () => {
    try {
      const [s, c] = await Promise.all([
        jsonOrThrow(await fetch("/api/schedules")),
        jsonOrThrow(await fetch("/api/companies")),
      ]);
      setSchedules((s.schedules as Schedule[]) ?? []);
      setCompanies((c.companies as { id: string; name: string }[]) ?? []);
    } catch (e) {
      setMsg({ kind: "error", text: (e as Error).message });
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const nameFor = (id: string | null) =>
    id ? companies.find((c) => c.id === id)?.name ?? "(removed competitor)" : "Whole watchlist";

  async function create() {
    setBusy(true);
    setMsg(null);
    try {
      await jsonOrThrow(
        await fetch("/api/schedules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ companyId: companyId || null, cadence }),
        }),
      );
      setMsg({ kind: "ok", text: "Schedule created." });
      await load();
    } catch (e) {
      setMsg({ kind: "error", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function toggle(s: Schedule) {
    setMsg(null);
    try {
      await jsonOrThrow(
        await fetch(`/api/schedules/${s.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled: !s.enabled }),
        }),
      );
      await load();
    } catch (e) {
      setMsg({ kind: "error", text: (e as Error).message });
    }
  }

  async function setCadenceFor(s: Schedule, value: string) {
    setMsg(null);
    try {
      await jsonOrThrow(
        await fetch(`/api/schedules/${s.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cadence: value }),
        }),
      );
      await load();
    } catch (e) {
      setMsg({ kind: "error", text: (e as Error).message });
    }
  }

  async function remove(id: string) {
    setMsg(null);
    try {
      await jsonOrThrow(await fetch(`/api/schedules/${id}`, { method: "DELETE" }));
      await load();
    } catch (e) {
      setMsg({ kind: "error", text: (e as Error).message });
    }
  }

  return (
    <Panel>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      <p className="mb-3 text-xs text-slate-500">
        Background re-scans run automatically on a cadence. A schedule can target one competitor
        or the whole watchlist; the worker drains the queue and the autonomy setting (Alerts tab)
        decides what the agent does with what it finds.
      </p>

      {admin && (
        <div className="mb-4 flex flex-wrap items-end gap-2 border-b border-ink-500/40 pb-4">
          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-widest text-slate-500">
              Target
            </label>
            <select
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              className="rounded border border-ink-500 bg-ink-900 px-2 py-2 text-sm text-slate-200 outline-none focus:border-accent/60"
            >
              <option value="">Whole watchlist</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-widest text-slate-500">
              Cadence
            </label>
            <select
              value={cadence}
              onChange={(e) => setCadence(e.target.value as "hourly" | "daily" | "weekly")}
              className="rounded border border-ink-500 bg-ink-900 px-2 py-2 text-sm text-slate-200 outline-none focus:border-accent/60"
            >
              <option value="hourly">Hourly</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </select>
          </div>
          <button
            onClick={create}
            disabled={busy}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-bold text-ink-900 transition hover:brightness-110 disabled:opacity-40"
          >
            {busy ? "Adding…" : "Add schedule"}
          </button>
        </div>
      )}

      {schedules.length === 0 ? (
        <p className="text-sm text-slate-600">No schedules yet — scans run only when triggered.</p>
      ) : (
        <ul className="divide-y divide-ink-500/40">
          {schedules.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div className="min-w-0">
                <div className="truncate text-sm text-slate-200">{nameFor(s.companyId)}</div>
                <div className="font-mono text-[10px] text-slate-600">
                  next run {new Date(s.nextRunAt).toLocaleString()}
                  {s.lastRunAt && ` · last ${new Date(s.lastRunAt).toLocaleString()}`}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {admin ? (
                  <select
                    value={s.cadence}
                    onChange={(e) => setCadenceFor(s, e.target.value)}
                    className="rounded border border-ink-500 bg-ink-900 px-2 py-1 font-mono text-[11px] text-slate-300 outline-none focus:border-accent/60"
                  >
                    <option value="hourly">Hourly</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                  </select>
                ) : (
                  <span className="font-mono text-[11px] text-slate-400">
                    {CADENCE_LABEL[s.cadence] ?? s.cadence}
                  </span>
                )}
                <button
                  onClick={() => admin && toggle(s)}
                  disabled={!admin}
                  className={`rounded-lg border px-2 py-1 font-mono text-[10px] uppercase tracking-wider transition disabled:opacity-60 ${
                    s.enabled
                      ? "border-accent/60 bg-accent/10 text-accent"
                      : "border-ink-500 text-slate-500"
                  }`}
                  title={admin ? "Toggle" : undefined}
                >
                  {s.enabled ? "Enabled" : "Paused"}
                </button>
                {admin && (
                  <button
                    onClick={() => remove(s.id)}
                    className="rounded border border-ink-500 px-2 py-1 font-mono text-[10px] text-slate-500 transition hover:border-signal-high/60 hover:text-signal-high"
                    title="Delete schedule"
                  >
                    ×
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {!admin && (
        <p className="mt-3 text-xs text-slate-600">Only owners/admins can change schedules.</p>
      )}
    </Panel>
  );
}

// ── Usage ──────────────────────────────────────────────────────────────────

function UsageTab({ role }: { role: MemberRole }) {
  const [days, setDays] = useState(30);
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setSummary(null);
    fetch(`/api/usage?days=${days}`)
      .then(jsonOrThrow)
      .then((d) => setSummary(d.summary as UsageSummary))
      .catch((e) => setErr((e as Error).message));
  }, [days]);

  return (
    <div className="space-y-4">
    <Panel>
      {err && <Notice kind="error">{err}</Notice>}
      <div className="mb-4 flex items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">Window</span>
        {[7, 30, 90].map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={`rounded border px-2 py-1 font-mono text-[11px] transition ${
              days === d ? "border-accent/60 text-accent" : "border-ink-500 text-slate-400"
            }`}
          >
            {d}d
          </button>
        ))}
      </div>

      {!summary ? (
        "Loading…"
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <UsageStat label="events" value={summary.events} />
            <UsageStat label="units" value={summary.units} />
            <UsageStat label="tokens in" value={summary.tokensIn} />
            <UsageStat label="tokens out" value={summary.tokensOut} />
          </div>
          {Object.keys(summary.byKind).length > 0 && (
            <div className="mt-4">
              <p className="mb-1.5 font-mono text-[10px] uppercase tracking-widest text-slate-500">
                By kind
              </p>
              <ul className="space-y-1">
                {Object.entries(summary.byKind)
                  .sort((a, b) => b[1] - a[1])
                  .map(([kind, n]) => (
                    <li key={kind} className="flex justify-between font-mono text-xs text-slate-400">
                      <span>{kind}</span>
                      <span className="text-slate-200">{n}</span>
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </>
      )}
    </Panel>
    <JobsPanel role={role} />
    </div>
  );
}

function JobsPanel({ role }: { role: MemberRole }) {
  interface FailedJobRow {
    id: string;
    companyId: string;
    attempts: number;
    error: string | null;
    finishedAt: string | null;
    createdAt: string;
  }
  const [jobs, setJobs] = useState<FailedJobRow[]>([]);
  const admin = isAdmin(role);

  const load = useCallback(async () => {
    try {
      const d = await jsonOrThrow(await fetch("/api/jobs"));
      setJobs((d.failed as FailedJobRow[]) ?? []);
    } catch {
      /* non-fatal */
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function retry(id: string) {
    await fetch(`/api/jobs/${id}/retry`, { method: "POST" });
    load();
  }

  return (
    <Panel>
      <h2 className="mb-2 font-mono text-[10px] uppercase tracking-widest text-slate-500">
        Failed scan jobs {jobs.length > 0 && <span className="text-signal-high">({jobs.length})</span>}
      </h2>
      {jobs.length === 0 ? (
        <p className="text-xs text-slate-600">No failed jobs — the scan queue is healthy.</p>
      ) : (
        <ul className="divide-y divide-ink-500/40">
          {jobs.map((j) => (
            <li key={j.id} className="flex items-center justify-between gap-2 py-2">
              <span className="min-w-0">
                <span className="font-mono text-[11px] text-slate-400">
                  {j.attempts} attempt{j.attempts === 1 ? "" : "s"}
                </span>
                <span className="ml-2 truncate text-xs text-signal-high">
                  {j.error ?? "unknown error"}
                </span>
              </span>
              {admin && (
                <button
                  onClick={() => retry(j.id)}
                  className="rounded border border-ink-500 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-slate-300 transition hover:border-accent/50 hover:text-accent"
                >
                  Retry
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function UsageStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-ink-500/60 bg-ink-900/60 px-3 py-2">
      <div className="font-mono text-[10px] uppercase tracking-widest text-slate-500">{label}</div>
      <div className="font-mono text-lg font-bold text-slate-100">{value.toLocaleString()}</div>
    </div>
  );
}
