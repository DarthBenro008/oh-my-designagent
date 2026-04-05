import { describe, test, expect } from "bun:test";
import {
  getConfidenceRouting,
  TASK_TYPE_PROFILES,
} from "./comment-classification";

describe("getConfidenceRouting", () => {
  describe("#given score above proceed threshold", () => {
    test("#when called #then returns proceed", () => {
      expect(getConfidenceRouting(85, { proceed: 72, retry: 30 })).toBe(
        "proceed",
      );
    });
  });

  describe("#given score between retry and proceed thresholds", () => {
    test("#when called #then returns retry_with_variants", () => {
      expect(getConfidenceRouting(50, { proceed: 72, retry: 30 })).toBe(
        "retry_with_variants",
      );
    });
  });

  describe("#given score below retry threshold", () => {
    test("#when called #then returns clarify", () => {
      expect(getConfidenceRouting(20, { proceed: 72, retry: 30 })).toBe(
        "clarify",
      );
    });
  });

  describe("#given score on proceed boundary", () => {
    test("#when called #then returns proceed", () => {
      expect(getConfidenceRouting(72, { proceed: 72, retry: 30 })).toBe(
        "proceed",
      );
    });
  });

  describe("#given score on retry boundary", () => {
    test("#when called #then returns retry_with_variants", () => {
      expect(getConfidenceRouting(30, { proceed: 72, retry: 30 })).toBe(
        "retry_with_variants",
      );
    });
  });
});

describe("TASK_TYPE_PROFILES", () => {
  test("#when checked #then copy_change is node_only", () => {
    expect(TASK_TYPE_PROFILES["copy_change"].scopeMode).toBe("node_only");
  });

  test("#when checked #then new_component is subtree", () => {
    expect(TASK_TYPE_PROFILES["new_component"].scopeMode).toBe("subtree");
  });

  test("#when checked #then has exactly eight keys", () => {
    expect(Object.keys(TASK_TYPE_PROFILES)).toHaveLength(8);
  });

  test("#when checked #then each profile has required fields", () => {
    for (const profile of Object.values(TASK_TYPE_PROFILES)) {
      expect(profile).toHaveProperty("difficultyHint");
      expect(profile).toHaveProperty("scopeMode");
      expect(profile).toHaveProperty("requiresMemory");
      expect(profile).toHaveProperty("lensProfile");
    }
  });
});
