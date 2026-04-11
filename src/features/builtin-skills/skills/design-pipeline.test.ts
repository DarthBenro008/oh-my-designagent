import { describe, expect, test } from "bun:test";
import { createDesignPipelineSkill } from "./design-pipeline";

describe("createDesignPipelineSkill", () => {
  test("returns the builtin skill object shape", () => {
    const skill = createDesignPipelineSkill();

    expect(skill).toHaveProperty("name");
    expect(skill).toHaveProperty("description");
    expect(skill).toHaveProperty("template");
  });

  test("uses the expected skill name", () => {
    const skill = createDesignPipelineSkill();

    expect(skill.name).toBe("design-pipeline");
  });

  test("includes all required workflow guidance in the template", () => {
    const skill = createDesignPipelineSkill();

    expect(skill.template).toMatch(/phase 1/i);
    expect(skill.template).toContain("PHASE 2");
    expect(skill.template).toContain("PHASE 3");
    expect(skill.template).toContain("PHASE 4");
    expect(skill.template).toMatch(/classify/i);
    expect(skill.template).toMatch(/execute/i);

    expect(skill.template).toContain("copy_change");
    expect(skill.template).toContain("token_bind");
    expect(skill.template).toContain("color_update");
    expect(skill.template).toContain("spacing_fix");
    expect(skill.template).toContain("typography_update");
    expect(skill.template).toContain("layout_change");
    expect(skill.template).toContain("new_component");
    expect(skill.template).toContain("design_improvement");

    expect(skill.template).toContain("node_only");
    expect(skill.template).toContain("subtree");
    expect(skill.template).toContain("Edit Intent");
    expect(skill.template).toContain("text_only");
    expect(skill.template).toContain("frame_props_only");
    expect(skill.template).toContain("create_variants");
    expect(skill.template).toContain("72");
    expect(skill.template).toContain("30");
    expect(skill.template).toContain("figma-daemon comment add");
    expect(skill.template).not.toContain("figma-daemon comment resolve");
    expect(skill.template).toContain("leave it open for human review");
    expect(skill.template).toContain("WHOLE comment thread");
    expect(skill.template).toContain("--reply <threadRootId>");
    expect(skill.template).toContain("reply on the thread with 1-3 precise clarification questions");
    expect(skill.template).toMatch(/ONLY modify|scope lock|scope_lock/);
    expect(skill.template).toContain("## Design Plan");
    expect(skill.template).toContain("Plan Mode");
    expect(skill.template).toContain("Mutation Steps");
    expect(skill.template).toContain("export jsx");
    expect(skill.template).toContain("Clone the source frame/component into sibling variants first");
  });
});
