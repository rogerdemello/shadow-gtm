-- ============================================================================
-- Right to erasure: allow owners to delete their org
-- ----------------------------------------------------------------------------
-- The org row had no DELETE policy, so RLS denied deletion to everyone. Add an
-- owner-only delete policy; FKs cascade to all org-scoped data (companies,
-- signals, snapshots, evidence, members, subscriptions, integrations, …).
-- ============================================================================

create policy "orgs_owner_delete" on orgs
  for delete using (has_org_role(id, array['owner']::member_role[]));
