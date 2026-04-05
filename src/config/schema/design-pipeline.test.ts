import { describe, expect, test } from "bun:test";
import { DesignPipelineConfigSchema } from "./design-pipeline";

describe("DesignPipelineConfigSchema", () => {
  describe("#given empty object", () => {
    test("#when parsed #then returns all defaults", () => {
      const result = DesignPipelineConfigSchema.parse({});

      expect(result.enabled).toBe(true);
      expect(result.confidence_proceed_threshold).toBe(72);
      expect(result.confidence_retry_threshold).toBe(30);
      expect(result.max_variants).toBe(3);
      expect(result.post_render_qa_enabled).toBe(true);
      expect(result.scope_lock_enabled).toBe(true);
      expect(result.pre_gather_enabled).toBe(true);
    });
  });

  describe("#given valid partial config", () => {
    test("#when parsed #then applies defaults for missing fields", () => {
      const result = DesignPipelineConfigSchema.parse({
        confidence_proceed_threshold: 50,
      });

      expect(result.enabled).toBe(true);
      expect(result.confidence_proceed_threshold).toBe(50);
      expect(result.confidence_retry_threshold).toBe(30);
      expect(result.max_variants).toBe(3);
      expect(result.post_render_qa_enabled).toBe(true);
      expect(result.scope_lock_enabled).toBe(true);
      expect(result.pre_gather_enabled).toBe(true);
    });
  });

  describe("#given invalid type", () => {
    test("#when parsed #then throws", () => {
      expect(() =>
        DesignPipelineConfigSchema.parse({
          confidence_proceed_threshold: "high",
        }),
      ).toThrow();
    });
  });

  describe("#given out of range threshold", () => {
    test("#when parsed #then throws", () => {
      expect(() =>
        DesignPipelineConfigSchema.parse({
          confidence_proceed_threshold: 150,
        }),
      ).toThrow();
    });
  });

  describe("#given full valid config", () => {
    test("#when parsed #then returns all provided values", () => {
      const result = DesignPipelineConfigSchema.parse({
        enabled: false,
        confidence_proceed_threshold: 88,
        confidence_retry_threshold: 44,
        max_variants: 5,
        post_render_qa_enabled: false,
        scope_lock_enabled: false,
        pre_gather_enabled: false,
      });

      expect(result).toEqual({
        enabled: false,
        confidence_proceed_threshold: 88,
        confidence_retry_threshold: 44,
        max_variants: 5,
        post_render_qa_enabled: false,
        scope_lock_enabled: false,
        pre_gather_enabled: false,
      });
    });
  });
});
