"use client";

import { useCallback, useEffect, useState } from "react";
import type { AlertRule, Invitation, Member, MemberRole, UsageSummary } from "@/lib/types";
import CopyButton from "../CopyButton";

const TABS = ["Organization", "Team", "Alerts", "Usage"] as const;
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
      {tab === "Alerts" && <AlertsTab />}
      {tab === "Usage" && <UsageTab />}
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

// ── Usage ──────────────────────────────────────────────────────────────────

function UsageTab() {
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
