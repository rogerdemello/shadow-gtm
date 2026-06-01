// Live smoke test for the Gemini-native retrieval path (replaces Bright Data).
// Verifies the two grounding tools the scan loop depends on work against the
// live API with the configured key:
//   • URL context   → factual brief of a real page (used for diff + extraction)
//   • Google Search → grounded, cited findings
// Mirrors the prompts in lib/retrieval.ts. Run: node scripts/smoke-gemini.mjs
import { readFileSync } from "node:fs";
import { GoogleGenAI } from "@google/genai";

try {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
} catch {}

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("GEMINI_API_KEY not set");
  process.exit(1);
}
const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const ai = new GoogleGenAI({ apiKey });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function withRetry(fn) {
  for (let i = 1; i <= 4; i++) {
    try {
      return await fn();
    } catch (e) {
      const msg = e?.message || String(e);
      if (/503|UNAVAILABLE|overloaded|high demand|429/i.test(msg) && i < 4) {
        await sleep(i * 2500);
        continue;
      }
      throw e;
    }
  }
}

async function main() {
  console.log(`model: ${model}\n`);

  console.log("── URL context: factual brief of https://www.anthropic.com/pricing ──");
  const page = await withRetry(() =>
    ai.models.generateContent({
      model,
      contents:
        "Using the content of this web page, write a factual brief of what it presents. List each plan/tier or product with its price or fee, key features or limits, and any headline claims. Use short labelled lines and quote prices and plan names exactly. Output ONLY the brief.\n\nURL: https://www.anthropic.com/pricing",
      config: { tools: [{ urlContext: {} }] },
    }),
  );
  const pageText = (page.text ?? "").trim();
  console.log(`length: ${pageText.length} · finish: ${page.candidates?.[0]?.finishReason}`);
  console.log(pageText.slice(0, 300).replace(/\n+/g, " "), "\n");

  console.log("── Google Search grounding: recent OpenAI news ──");
  const search = await withRetry(() =>
    ai.models.generateContent({
      model,
      contents:
        "Use Google Search to find the most recent developments about OpenAI (pricing, product launches, funding). Return up to 5 findings, one per line, EXACTLY as: TITLE :: URL :: one-sentence snippet",
      config: { tools: [{ googleSearch: {} }] },
    }),
  );
  const findings = (search.text ?? "").trim();
  const lines = findings
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.includes("::") && /https?:\/\//.test(l));
  console.log(`parsed ${lines.length} grounded finding(s)`);
  console.log(lines.slice(0, 3).join("\n").slice(0, 400));

  if (pageText.length > 200 && lines.length > 0) {
    console.log("\n✅ Gemini-native retrieval works end-to-end.");
  } else {
    console.log("\n⚠ Retrieval returned thin output — inspect above.");
    process.exitCode = 2;
  }
}

main().catch((e) => {
  console.error("\n❌ smoke test failed:", e?.message || e);
  process.exit(1);
});
