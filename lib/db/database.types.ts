// ── Supabase schema types ────────────────────────────────────────────────────
// Hand-authored to match supabase/migrations/*.sql so the DB clients and the
// store rewrite are type-safe before the project exists. Once the project is
// provisioned, regenerate the authoritative version with:
//
//   npx supabase gen types typescript --project-id <ref> > lib/db/database.types.ts
//
// and delete this header. The shapes below should stay in lock-step with the
// migrations until then.

export type SignalTypeEnum =
  | "pricing" | "product" | "hiring" | "sentiment"
  | "funding" | "messaging" | "intent" | "risk";
export type ImpactEnum = "high" | "medium" | "low";
export type PageTypeEnum = "pricing" | "homepage";
export type MemberRoleEnum = "owner" | "admin" | "member";
export type JobStatusEnum = "pending" | "running" | "done" | "failed";
export type ScheduleCadenceEnum = "hourly" | "daily" | "weekly";

type Timestamp = string;

// The shape supabase-js expects per table — Relationships is required (left
// empty here; the generated types would populate it from foreign keys).
interface Table<Row, Insert, Update> {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
}

export interface Database {
  public: {
    Tables: {
      profiles: Table<
        { id: string; email: string | null; full_name: string | null; created_at: Timestamp },
        { id: string; email?: string | null; full_name?: string | null },
        { email?: string | null; full_name?: string | null }
      >;
      orgs: Table<
        { id: string; name: string; slug: string | null; created_by: string | null; created_at: Timestamp },
        { id?: string; name: string; slug?: string | null; created_by?: string | null },
        { name?: string; slug?: string | null }
      >;
      org_members: Table<
        { org_id: string; user_id: string; role: MemberRoleEnum; created_at: Timestamp },
        { org_id: string; user_id: string; role?: MemberRoleEnum },
        { role?: MemberRoleEnum }
      >;
      companies: Table<
        {
          id: string; org_id: string; name: string; domain: string;
          pricing_url: string; render_js: boolean; created_by: string | null; created_at: Timestamp;
        },
        {
          id?: string; org_id: string; name: string; domain: string;
          pricing_url: string; render_js?: boolean; created_by?: string | null;
          created_at?: Timestamp;
        },
        { name?: string; domain?: string; pricing_url?: string; render_js?: boolean }
      >;
      snapshots: Table<
        {
          id: string; org_id: string; company_id: string; page_type: PageTypeEnum;
          url: string; text: string; hash: string; fetched_at: Timestamp;
        },
        {
          id?: string; org_id: string; company_id: string; page_type: PageTypeEnum;
          url: string; text: string; hash: string; fetched_at?: Timestamp;
        },
        Record<string, never>
      >;
      scans: Table<
        {
          id: string; org_id: string; started_at: Timestamp; finished_at: Timestamp | null;
          company_ids: string[]; signal_count: number;
        },
        {
          id?: string; org_id: string; started_at?: Timestamp; finished_at?: Timestamp | null;
          company_ids?: string[]; signal_count?: number;
        },
        { finished_at?: Timestamp | null; signal_count?: number }
      >;
      signals: Table<
        {
          id: string; org_id: string; company_id: string; company_name: string;
          scan_id: string | null; type: SignalTypeEnum; description: string; impact: ImpactEnum;
          confidence: number; opportunity_score: number; reasoning: string;
          recommended_action: string; source_url: string; quote: string | null;
          is_current: boolean; created_at: Timestamp;
        },
        {
          id?: string; org_id: string; company_id: string; company_name: string;
          scan_id?: string | null; type: SignalTypeEnum; description: string; impact: ImpactEnum;
          confidence: number; opportunity_score: number; reasoning: string;
          recommended_action: string; source_url: string; quote?: string | null;
          is_current?: boolean; created_at?: Timestamp;
        },
        { is_current?: boolean }
      >;
      scan_evidence: Table<
        {
          id: string; org_id: string; company_id: string; scan_id: string | null;
          change_summary: string | null; serp: unknown; sources: unknown; created_at: Timestamp;
        },
        {
          id?: string; org_id: string; company_id: string; scan_id?: string | null;
          change_summary?: string | null; serp?: unknown; sources?: unknown; created_at?: Timestamp;
        },
        Record<string, never>
      >;
      battlecards: Table<
        {
          id: string; org_id: string; company_id: string; company_name: string;
          markdown: string; created_at: Timestamp;
        },
        {
          id?: string; org_id: string; company_id: string; company_name: string;
          markdown: string; created_at?: Timestamp;
        },
        { markdown?: string; company_name?: string }
      >;
      usage_events: Table<
        {
          id: string; org_id: string; kind: string; tokens_in: number;
          tokens_out: number; units: number; scan_id: string | null;
          company_id: string | null; created_at: Timestamp;
        },
        {
          id?: string; org_id: string; kind: string; tokens_in?: number;
          tokens_out?: number; units?: number; scan_id?: string | null;
          company_id?: string | null; created_at?: Timestamp;
        },
        Record<string, never>
      >;
      schedules: Table<
        {
          id: string; org_id: string; company_id: string | null;
          cadence: ScheduleCadenceEnum; enabled: boolean;
          last_run_at: Timestamp | null; next_run_at: Timestamp; created_at: Timestamp;
        },
        {
          id?: string; org_id: string; company_id?: string | null;
          cadence?: ScheduleCadenceEnum; enabled?: boolean;
          last_run_at?: Timestamp | null; next_run_at?: Timestamp; created_at?: Timestamp;
        },
        {
          cadence?: ScheduleCadenceEnum; enabled?: boolean;
          last_run_at?: Timestamp | null; next_run_at?: Timestamp;
        }
      >;
      scan_jobs: Table<
        {
          id: string; org_id: string; company_id: string; scan_id: string | null;
          status: JobStatusEnum; run_at: Timestamp; attempts: number;
          max_attempts: number; error: string | null; started_at: Timestamp | null;
          finished_at: Timestamp | null; created_at: Timestamp;
        },
        {
          id?: string; org_id: string; company_id: string; scan_id?: string | null;
          status?: JobStatusEnum; run_at?: Timestamp; attempts?: number;
          max_attempts?: number; error?: string | null; started_at?: Timestamp | null;
          finished_at?: Timestamp | null; created_at?: Timestamp;
        },
        {
          status?: JobStatusEnum; scan_id?: string | null; attempts?: number;
          error?: string | null; run_at?: Timestamp; started_at?: Timestamp | null;
          finished_at?: Timestamp | null;
        }
      >;
    };
    Functions: {
      is_org_member: { Args: { target_org: string }; Returns: boolean };
      has_org_role: { Args: { target_org: string; roles: MemberRoleEnum[] }; Returns: boolean };
      create_org_with_owner: {
        Args: { org_name: string; org_slug?: string | null };
        Returns: Database["public"]["Tables"]["orgs"]["Row"];
      };
      set_signals_not_current: { Args: { target_company: string }; Returns: undefined };
    };
    Views: { [_ in never]: never };
    Enums: {
      signal_type: SignalTypeEnum;
      impact_level: ImpactEnum;
      page_type: PageTypeEnum;
      member_role: MemberRoleEnum;
    };
    CompositeTypes: { [_ in never]: never };
  };
}
