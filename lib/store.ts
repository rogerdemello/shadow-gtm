import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import type {
  Battlecard,
  Company,
  Scan,
  Signal,
  Snapshot,
} from "./types";

// ── Tiny JSON-file store ────────────────────────────────────────────────────
// Zero-dependency persistence so the MVP runs anywhere with no DB to provision.
// Everything goes through this module, so swapping in Postgres/Turso later is a
// single-file change. Data volumes here are tiny (a handful of companies).

interface DB {
  companies: Company[];
  snapshots: Snapshot[];
  signals: Signal[];
  scans: Scan[];
  battlecards: Battlecard[];
}

// Vercel's project filesystem is read-only at runtime; only /tmp is writable.
// On Vercel we use a tmp dir (persists within a warm instance — fine for a demo
// session). Locally we use ./data. For durable prod persistence, swap this
// module for Postgres/Turso — everything goes through here.
const DATA_DIR = process.env.VERCEL
  ? path.join(os.tmpdir(), "shadow-gtm")
  : path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "db.json");

const EMPTY_DB: DB = {
  companies: [],
  snapshots: [],
  signals: [],
  scans: [],
  battlecards: [],
};

// Serialize writes within a single process so concurrent route handlers don't
// clobber each other's read-modify-write.
let writeChain: Promise<void> = Promise.resolve();

async function readDb(): Promise<DB> {
  try {
    const raw = await fs.readFile(DB_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<DB>;
    return { ...EMPTY_DB, ...parsed };
  } catch {
    return structuredClone(EMPTY_DB);
  }
}

async function writeDb(db: DB): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(DB_PATH, JSON.stringify(db, null, 2), "utf8");
}

/** Read-modify-write the DB under a process-local lock. Returns mutator result. */
async function mutate<T>(fn: (db: DB) => T | Promise<T>): Promise<T> {
  let result!: T;
  writeChain = writeChain.then(async () => {
    const db = await readDb();
    result = await fn(db);
    await writeDb(db);
  });
  await writeChain;
  return result;
}

export const id = () => crypto.randomUUID();
export const hash = (s: string) =>
  crypto.createHash("sha256").update(s).digest("hex").slice(0, 16);

// ── Companies ───────────────────────────────────────────────────────────────
export async function listCompanies(): Promise<Company[]> {
  return (await readDb()).companies;
}

export async function addCompany(input: {
  name: string;
  domain: string;
  pricingUrl?: string;
  renderJs?: boolean;
}): Promise<Company> {
  const domain = input.domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const company: Company = {
    id: id(),
    name: input.name.trim(),
    domain,
    pricingUrl: input.pricingUrl?.trim() || `https://${domain}/pricing`,
    renderJs: Boolean(input.renderJs),
    createdAt: new Date().toISOString(),
  };
  return mutate((db) => {
    db.companies.push(company);
    return company;
  });
}

export async function removeCompany(companyId: string): Promise<void> {
  return mutate((db) => {
    db.companies = db.companies.filter((c) => c.id !== companyId);
    db.signals = db.signals.filter((s) => s.companyId !== companyId);
    db.snapshots = db.snapshots.filter((s) => s.companyId !== companyId);
    db.battlecards = db.battlecards.filter((b) => b.companyId !== companyId);
  });
}

export async function getCompany(companyId: string): Promise<Company | undefined> {
  return (await readDb()).companies.find((c) => c.id === companyId);
}

// ── Snapshots (for "what changed since last scan?") ──────────────────────────
export async function latestSnapshot(
  companyId: string,
  pageType: Snapshot["pageType"],
): Promise<Snapshot | undefined> {
  const snaps = (await readDb()).snapshots
    .filter((s) => s.companyId === companyId && s.pageType === pageType)
    .sort((a, b) => b.fetchedAt.localeCompare(a.fetchedAt));
  return snaps[0];
}

export async function saveSnapshot(snap: Snapshot): Promise<void> {
  return mutate((db) => {
    db.snapshots.push(snap);
    // Keep only the two most recent per (company,page) — enough to diff.
    const keep = new Map<string, Snapshot[]>();
    for (const s of db.snapshots) {
      const k = `${s.companyId}:${s.pageType}`;
      keep.set(k, [...(keep.get(k) ?? []), s]);
    }
    db.snapshots = [...keep.values()].flatMap((arr) =>
      arr.sort((a, b) => b.fetchedAt.localeCompare(a.fetchedAt)).slice(0, 2),
    );
  });
}

// ── Signals ───────────────────────────────────────────────────────────────
export async function listSignals(): Promise<Signal[]> {
  return (await readDb()).signals.sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
}

/** Replace a company's signals with the latest scan's output (keeps the current
 *  intelligence picture coherent and bounded across re-scans). */
export async function replaceCompanySignals(
  companyId: string,
  signals: Signal[],
): Promise<void> {
  return mutate((db) => {
    db.signals = db.signals.filter((s) => s.companyId !== companyId);
    db.signals.push(...signals);
  });
}

// ── Scans ───────────────────────────────────────────────────────────────────
export async function createScan(companyIds: string[]): Promise<Scan> {
  const scan: Scan = {
    id: id(),
    startedAt: new Date().toISOString(),
    companyIds,
    signalCount: 0,
  };
  return mutate((db) => {
    db.scans.push(scan);
    return scan;
  });
}

// ── Battlecards ───────────────────────────────────────────────────────────
export async function saveBattlecard(card: Battlecard): Promise<void> {
  return mutate((db) => {
    db.battlecards = db.battlecards.filter((b) => b.companyId !== card.companyId);
    db.battlecards.push(card);
  });
}

export async function getBattlecard(
  companyId: string,
): Promise<Battlecard | undefined> {
  return (await readDb()).battlecards.find((b) => b.companyId === companyId);
}
