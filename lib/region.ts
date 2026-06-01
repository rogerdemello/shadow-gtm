import { getEnv } from "./env";

// ── Region / data-residency config ───────────────────────────────────────────
// Env-driven so no region is hardcoded in app logic. The actual placement of
// the database + worker is a deploy-time infrastructure choice (e.g. a Supabase
// project in the chosen region, read replicas); this exposes the active region
// for reporting (health, DPA) and keeps the door open to multi-region routing.

export interface Region {
  id: string;
  label: string;
}

export const REGIONS: Region[] = [
  { id: "us", label: "United States" },
  { id: "eu", label: "European Union" },
];

export const defaultRegion = "us";

/** The region this deployment runs in (from APP_REGION; defaults to us). */
export function activeRegion(): string {
  return getEnv().APP_REGION || defaultRegion;
}

export function regionLabel(id: string): string {
  return REGIONS.find((r) => r.id === id)?.label ?? id;
}
