import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { basename, join, relative } from "node:path";
import { buildDesignPlanBlock, type DesignPlanArtifact } from "../../shared/design-plan";

export const DESIGN_PLAN_MIRROR_MARKER = "<!-- design-plan-compat-mirror -->";

interface CanonicalDesignPlanMirror {
  canonicalPath: string;
  mirrorPath: string;
  planName: string;
  artifact: DesignPlanArtifact;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isDesignPlanStatus(value: unknown): value is DesignPlanArtifact["status"] {
  return value === "draft"
    || value === "ready"
    || value === "executing"
    || value === "reviewed"
    || value === "clarify"
    || value === "complete";
}

function isDesignPlanMode(value: unknown): value is DesignPlanArtifact["planMode"] {
  return value === "micro" || value === "full";
}

function isDesignPlanSourceType(value: unknown): value is DesignPlanArtifact["sourceType"] {
  return value === "comment" || value === "direct-design-task";
}

function isDesignPlanArtifact(value: unknown): value is DesignPlanArtifact {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return typeof record.requestId === "string"
    && isDesignPlanSourceType(record.sourceType)
    && typeof record.requestType === "string"
    && typeof record.editIntent === "string"
    && typeof record.difficulty === "string"
    && isDesignPlanMode(record.planMode)
    && isStringArray(record.mutationSteps)
    && isStringArray(record.verificationSteps)
    && isStringArray(record.reviewRequirements)
    && isStringArray(record.memoryContextRefs)
    && typeof record.createdByAgent === "string"
    && isDesignPlanStatus(record.status);
}

function extractDesignPlanArtifact(value: unknown): DesignPlanArtifact | undefined {
  if (isDesignPlanArtifact(value)) {
    return value;
  }

  if (typeof value !== "object" || value === null) {
    return undefined;
  }

  for (const nestedValue of Object.values(value as Record<string, unknown>)) {
    const nestedArtifact = extractDesignPlanArtifact(nestedValue);
    if (nestedArtifact) {
      return nestedArtifact;
    }
  }

  return undefined;
}

function readCanonicalDesignPlan(path: string): DesignPlanArtifact | undefined {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    return extractDesignPlanArtifact(parsed);
  } catch {
    return undefined;
  }
}

function walkJsonFiles(root: string): string[] {
  if (!existsSync(root)) {
    return [];
  }

  const discovered: string[] = [];
  const stack = [root];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const fullPath = join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }

      if (entry.isFile() && entry.name.endsWith(".json")) {
        discovered.push(fullPath);
      }
    }
  }

  return discovered.sort();
}

function sanitizePlanName(value: string): string {
  const trimmed = value.trim().replace(/\.[^.]+$/, "");
  const normalized = trimmed.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-");
  return normalized.replace(/^-|-$/g, "") || "design-plan";
}

function derivePlanName(path: string, artifact: DesignPlanArtifact): string {
  const baseName = sanitizePlanName(basename(path, ".json"));
  if (baseName === "state" || baseName === "plan" || baseName === "design-plan") {
    return sanitizePlanName(artifact.requestId);
  }

  return baseName;
}

function createChecklistItems(prefix: string, steps: string[], checked: boolean): string[] {
  return steps.map((step) => `- [${checked ? "x" : " "}] ${prefix}: ${step}`);
}

function buildLegacyMirrorMarkdown(
  directory: string,
  artifactPath: string,
  artifact: DesignPlanArtifact,
  planName: string,
): string {
  const relativeCanonicalPath = relative(directory, artifactPath) || artifactPath;
  const isComplete = artifact.status === "complete";
  const lines = [
    DESIGN_PLAN_MIRROR_MARKER,
    `# ${planName}`,
    "",
    "Legacy/manual compatibility mirror for `/start-work`.",
    "Normal design sessions should continue automatically after planning.",
    `Canonical source: \`${relativeCanonicalPath}\``,
    "",
    buildDesignPlanBlock(artifact),
    "",
    "## Execution Checklist",
    ...createChecklistItems("Mutation", artifact.mutationSteps, isComplete),
    ...createChecklistItems("Verification", artifact.verificationSteps, isComplete),
    ...createChecklistItems("Review", artifact.reviewRequirements, isComplete),
  ];

  return lines.join("\n");
}

function toCanonicalMirror(
  directory: string,
  path: string,
  artifact: DesignPlanArtifact,
): CanonicalDesignPlanMirror | undefined {
  if (artifact.status === "draft" || artifact.status === "clarify") {
    return undefined;
  }

  const planName = derivePlanName(path, artifact);
  const mirrorPath = join(directory, ".sisyphus", "plans", `${planName}.md`);
  mkdirSync(join(directory, ".sisyphus", "plans"), { recursive: true });
  writeFileSync(
    mirrorPath,
    buildLegacyMirrorMarkdown(directory, path, artifact, planName),
    "utf8",
  );

  return {
    canonicalPath: path,
    mirrorPath,
    planName,
    artifact,
  };
}

export function syncCanonicalDesignPlansToLegacyPlans(
  directory: string,
): CanonicalDesignPlanMirror[] {
  const canonicalRoot = join(directory, ".omx", "state");
  const mirrors: CanonicalDesignPlanMirror[] = [];

  for (const path of walkJsonFiles(canonicalRoot)) {
    const artifact = readCanonicalDesignPlan(path);
    if (!artifact) {
      continue;
    }

    const mirror = toCanonicalMirror(directory, path, artifact);
    if (mirror) {
      mirrors.push(mirror);
    }
  }

  return mirrors;
}
