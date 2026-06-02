import { describe, expect, it } from "vitest";
import { isActionTool } from "../../lib/agent";

describe("isActionTool", () => {
  it("classifies mutating tools as actions", () => {
    for (const t of [
      "add_competitor",
      "run_scan",
      "run_deep_dive",
      "generate_battlecard",
      "set_signal_status",
      "set_alert_threshold",
    ]) {
      expect(isActionTool(t)).toBe(true);
    }
  });

  it("classifies read tools as non-actions", () => {
    for (const t of ["list_companies", "search_signals", "get_trends", "get_dossier", "web_search"]) {
      expect(isActionTool(t)).toBe(false);
    }
    expect(isActionTool("nonexistent")).toBe(false);
  });
});
