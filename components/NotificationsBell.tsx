"use client";

import { useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/db/browser";

interface Item {
  id: string;
  title: string;
  body: string | null;
  opportunity_score: number | null;
  read_at: string | null;
  created_at: string;
}

// Live alert bell: hydrates from /api/notifications, then subscribes to Supabase
// Realtime so new high-opportunity signals (inserted by background or live scans)
// appear without a refresh. Org isolation is enforced both by the filter and by
// RLS on the Realtime stream.
export default function NotificationsBell({ orgId }: { orgId: string }) {
  const [items, setItems] = useState<Item[]>([]);
  const [open, setOpen] = useState(false);

  const unread = items.filter((i) => !i.read_at).length;

  useEffect(() => {
    let active = true;

    fetch("/api/notifications")
      .then((r) => (r.ok ? r.json() : { notifications: [] }))
      .then((d) => {
        if (!active) return;
        // API returns camelCase; normalize to the row-ish shape used here.
        setItems(
          (d.notifications ?? []).map((n: Record<string, unknown>) => ({
            id: n.id,
            title: n.title,
            body: n.body ?? null,
            opportunity_score: n.opportunityScore ?? null,
            read_at: n.readAt ?? null,
            created_at: n.createdAt,
          })),
        );
      })
      .catch(() => {});

    const supabase = getBrowserClient();
    const channel = supabase
      .channel(`notifications:${orgId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `org_id=eq.${orgId}`,
        },
        (payload) => {
          const n = payload.new as Item;
          setItems((prev) => [n, ...prev].slice(0, 50));
        },
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [orgId]);

  async function markAllRead() {
    const ids = items.filter((i) => !i.read_at).map((i) => i.id);
    if (ids.length === 0) return;
    setItems((prev) => prev.map((i) => ({ ...i, read_at: i.read_at ?? "now" })));
    await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    }).catch(() => {});
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative rounded border border-neutral-800 px-2 py-1 text-neutral-300 transition hover:border-neutral-600"
        aria-label="Notifications"
      >
        ◔ Alerts
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-600 px-1 text-[10px] font-semibold text-white">
            {unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 rounded-lg border border-neutral-800 bg-neutral-950 p-2 shadow-2xl">
          <div className="flex items-center justify-between px-2 py-1">
            <span className="text-xs uppercase tracking-wide text-neutral-500">
              Alerts
            </span>
            {unread > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs text-emerald-400 hover:text-emerald-300"
              >
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-2 py-4 text-center text-xs text-neutral-600">
                No alerts yet. High-opportunity signals will appear here live.
              </p>
            ) : (
              items.map((i) => (
                <div
                  key={i.id}
                  className={`rounded px-2 py-2 text-sm ${
                    i.read_at ? "text-neutral-500" : "text-neutral-200"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium">{i.title}</span>
                    {i.opportunity_score != null && (
                      <span className="shrink-0 rounded bg-neutral-800 px-1 text-[10px] text-emerald-400">
                        {i.opportunity_score}
                      </span>
                    )}
                  </div>
                  {i.body && (
                    <p className="mt-0.5 text-xs text-neutral-500">{i.body}</p>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
