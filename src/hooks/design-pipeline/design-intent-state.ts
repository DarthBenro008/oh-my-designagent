import type { PluginInput } from "@opencode-ai/plugin";
import { log } from "../../shared/logger";
import { normalizeSDKResponse } from "../../shared/normalize-sdk-response";
import {
  getDefaultEditIntent,
  type CommentEditIntent,
  type CommentRequestType,
} from "../../shared/comment-classification";
import {
  extractLatestDesignPlan,
  type DesignPlanArtifact,
} from "../../shared/design-plan";

const NODE_ID_PATTERN = /\bI?\d+:\d+(?:;\d+:\d+)*\b/g;
const CACHE_TTL_MS = 1000;

type SessionMessagePart = {
  type?: string;
  text?: string;
};

type SessionMessage = {
  info?: {
    role?: string;
  };
  parts?: SessionMessagePart[];
};

type SessionInfo = {
  parentID?: string;
};

type CachedDesignIntentState = {
  fetchedAt: number;
  state: {
    isDesignSession: boolean;
    requiresClassification: boolean;
    requiresPlan: boolean;
    editIntent?: CommentEditIntent;
    requestType?: CommentRequestType;
    targetNodeId?: string;
    threadId?: string;
    designPlan?: DesignPlanArtifact;
    planAccessSessionIds: string[];
    discoveredNodeIds: string[];
    approvedNodeIds: string[];
    variantCloneIds: string[];
  };
};

export type DesignIntentState = {
  isDesignSession: boolean;
  requiresClassification: boolean;
  requiresPlan: boolean;
  editIntent?: CommentEditIntent;
  requestType?: CommentRequestType;
  targetNodeId?: string;
  threadId?: string;
  designPlan?: DesignPlanArtifact;
  planAccessSessionIds: Set<string>;
  discoveredNodeIds: Set<string>;
  approvedNodeIds: Set<string>;
  variantCloneIds: Set<string>;
};

const approvedNodeIdsBySession = new Map<string, Set<string>>();
const variantCloneIdsBySession = new Map<string, Set<string>>();
const cachedStates = new Map<string, CachedDesignIntentState>();
const SESSION_LINEAGE_DEPTH_LIMIT = 6;

function cloneSet(values?: Iterable<string>): Set<string> {
  return new Set(values ?? []);
}

function touchStringSet(
  store: Map<string, Set<string>>,
  sessionID: string,
  ids: Iterable<string>,
): Set<string> {
  let current = store.get(sessionID);
  if (!current) {
    current = new Set<string>();
    store.set(sessionID, current);
  }

  for (const id of ids) {
    current.add(id);
  }

  return current;
}

function extractMessageText(message: SessionMessage): string {
  return (message.parts ?? [])
    .filter(
      (part): part is SessionMessagePart & { text: string } =>
        part.type === "text" && typeof part.text === "string",
    )
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join("\n");
}

function getAllTexts(messages: SessionMessage[]): string[] {
  return messages.map(extractMessageText).filter(Boolean);
}

async function loadSessionMessages(
  ctx: PluginInput,
  sessionID: string,
): Promise<SessionMessage[]> {
  try {
    const response = await ctx.client.session.messages({
      path: { id: sessionID },
    } as never);
    const normalized = normalizeSDKResponse(
      response,
      [] as SessionMessage[],
      { preferResponseOnMissingData: true },
    );
    return Array.isArray(normalized) ? normalized : [];
  } catch (error) {
    log("[design-intent-state] Failed to read session messages", {
      sessionID,
      error: String(error),
    });
    return [];
  }
}

async function loadSessionInfo(
  ctx: PluginInput,
  sessionID: string,
): Promise<SessionInfo | undefined> {
  if (!ctx.client.session.get) {
    return undefined;
  }

  try {
    const response = await ctx.client.session.get({
      path: { id: sessionID },
    } as never);
    const normalized = normalizeSDKResponse(
      response,
      {} as SessionInfo,
      { preferResponseOnMissingData: true },
    );
    if (!normalized || typeof normalized !== "object") {
      return undefined;
    }

    const candidate = normalized as SessionInfo & {
      data?: SessionInfo;
    };
    return candidate.parentID !== undefined
      ? candidate
      : candidate.data
        ? candidate.data
        : undefined;
  } catch (error) {
    log("[design-intent-state] Failed to read session info", {
      sessionID,
      error: String(error),
    });
    return undefined;
  }
}

async function loadSessionLineage(
  ctx: PluginInput,
  sessionID: string,
): Promise<string[]> {
  const lineage = [sessionID];
  const visited = new Set(lineage);
  let nextSessionID = sessionID;

  for (let depth = 0; depth < SESSION_LINEAGE_DEPTH_LIMIT; depth++) {
    const sessionInfo = await loadSessionInfo(ctx, nextSessionID);
    const parentID = sessionInfo?.parentID;
    if (!parentID || visited.has(parentID)) {
      break;
    }

    lineage.push(parentID);
    visited.add(parentID);
    nextSessionID = parentID;
  }

  return lineage;
}

function extractLatestMatch(
  texts: string[],
  patterns: RegExp[],
): string | undefined {
  for (let index = texts.length - 1; index >= 0; index--) {
    const text = texts[index];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match?.[1]) {
        return match[1].trim();
      }
    }
  }

  return undefined;
}

function extractLatestMatchFromGroups(
  textGroups: string[][],
  patterns: RegExp[],
): string | undefined {
  for (const texts of textGroups) {
    const match = extractLatestMatch(texts, patterns);
    if (match) {
      return match;
    }
  }

  return undefined;
}

function collectNodeIdsFromGroups(textGroups: string[][]): Set<string> {
  const ids = new Set<string>();

  for (const texts of textGroups) {
    for (const id of collectNodeIds(texts)) {
      ids.add(id);
    }
  }

  return ids;
}

function collectNodeIds(texts: string[]): Set<string> {
  const ids = new Set<string>();

  for (const text of texts) {
    const matches = text.matchAll(NODE_ID_PATTERN);
    for (const match of matches) {
      if (match[0]) {
        ids.add(match[0]);
      }
    }
  }

  return ids;
}

function isCommentRequestType(value: string): value is CommentRequestType {
  return [
    "copy_change",
    "token_bind",
    "color_update",
    "spacing_fix",
    "typography_update",
    "layout_change",
    "new_component",
    "design_improvement",
  ].includes(value);
}

function isCommentEditIntent(value: string): value is CommentEditIntent {
  return [
    "full_redesign",
    "text_only",
    "frame_props_only",
    "create_variants",
  ].includes(value);
}

function toRuntimeState(
  cached: CachedDesignIntentState["state"],
): DesignIntentState {
  return {
    isDesignSession: cached.isDesignSession,
    requiresClassification: cached.requiresClassification,
    requiresPlan: cached.requiresPlan,
    editIntent: cached.editIntent,
    requestType: cached.requestType,
    targetNodeId: cached.targetNodeId,
    threadId: cached.threadId,
    designPlan: cached.designPlan,
    planAccessSessionIds: cloneSet(cached.planAccessSessionIds),
    discoveredNodeIds: cloneSet(cached.discoveredNodeIds),
    approvedNodeIds: cloneSet(cached.approvedNodeIds),
    variantCloneIds: cloneSet(cached.variantCloneIds),
  };
}

function cacheState(sessionID: string, state: DesignIntentState): void {
  cachedStates.set(sessionID, {
    fetchedAt: Date.now(),
    state: {
      isDesignSession: state.isDesignSession,
      requiresClassification: state.requiresClassification,
      requiresPlan: state.requiresPlan,
      editIntent: state.editIntent,
      requestType: state.requestType,
      targetNodeId: state.targetNodeId,
      threadId: state.threadId,
      designPlan: state.designPlan,
      planAccessSessionIds: [...state.planAccessSessionIds],
      discoveredNodeIds: [...state.discoveredNodeIds],
      approvedNodeIds: [...state.approvedNodeIds],
      variantCloneIds: [...state.variantCloneIds],
    },
  });
}

function isDesignSession(texts: string[], targetNodeId?: string): boolean {
  if (targetNodeId) {
    return true;
  }

  return texts.some((text) =>
    text.includes("Resolve this Figma comment.")
    || text.includes("Resolve this design task.")
    || text.includes("## Direct Design Task")
    || text.includes("Source Type: direct-design-task")
    || text.includes("## Design Plan")
    || (
      text.includes("Follow the structured design pipeline")
      && text.includes("## Target")
    )
    || (
      text.includes("## Classification")
      && text.includes("Request Type:")
    ),
  );
}

export function recordApprovedNodeIds(
  sessionID: string,
  ids: Iterable<string>,
  options?: { variantClones?: boolean },
): void {
  const normalizedIds = [...ids].filter(Boolean);
  if (normalizedIds.length === 0) {
    return;
  }

  touchStringSet(approvedNodeIdsBySession, sessionID, normalizedIds);
  if (options?.variantClones) {
    touchStringSet(variantCloneIdsBySession, sessionID, normalizedIds);
  }

  cachedStates.delete(sessionID);
}

export function clearDesignIntentState(sessionID: string): void {
  approvedNodeIdsBySession.delete(sessionID);
  variantCloneIdsBySession.delete(sessionID);
  cachedStates.delete(sessionID);
}

export async function resolveDesignIntentState(
  ctx: PluginInput,
  sessionID: string,
): Promise<DesignIntentState> {
  const cached = cachedStates.get(sessionID);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return toRuntimeState(cached.state);
  }

  const sessionLineage = await loadSessionLineage(ctx, sessionID);
  const textGroups = await Promise.all(
    sessionLineage.map(async (lineageSessionID) =>
      getAllTexts(await loadSessionMessages(ctx, lineageSessionID))),
  );
  const [texts = []] = textGroups;

  const designPlan = textGroups
    .map((group, index) => extractLatestDesignPlan(group, {
      ownerSessionId: sessionLineage[index],
    }))
    .find((plan) => Boolean(plan));
  const targetNodeId = designPlan?.targetNodeId
    ?? extractLatestMatchFromGroups(textGroups, [
    /-\s*Target Node:\s*`?(I?\d+:\d+(?:;\d+:\d+)*)`?/i,
    /-\s*Node:\s*`?(I?\d+:\d+(?:;\d+:\d+)*)`?/i,
    /target node:\s*`?(I?\d+:\d+(?:;\d+:\d+)*)`?/i,
  ]);
  const threadId = designPlan?.threadId
    ?? extractLatestMatchFromGroups(textGroups, [
    /-\s*Thread ID:\s*`?([^\n`]+)`?/i,
    /Thread root ID:\s*`?([^\n`]+)`?/i,
  ]);

  const rawRequestType = extractLatestMatchFromGroups(textGroups, [
    /-\s*Request Type:\s*([a-z_]+)/i,
  ]);
  const requestType = designPlan?.requestType
    ?? (
      rawRequestType && isCommentRequestType(rawRequestType)
        ? rawRequestType
        : undefined
    );

  const rawEditIntent = extractLatestMatchFromGroups(textGroups, [
    /-\s*Edit Intent:\s*([a-z_]+)/i,
  ]);
  const editIntent = designPlan?.editIntent
    ?? (
      rawEditIntent && isCommentEditIntent(rawEditIntent)
        ? rawEditIntent
        : requestType
          ? getDefaultEditIntent(requestType)
          : undefined
    );

  const discoveredNodeIds = collectNodeIdsFromGroups(textGroups);
  const approvedNodeIds = cloneSet(approvedNodeIdsBySession.get(sessionID));
  const variantCloneIds = cloneSet(variantCloneIdsBySession.get(sessionID));

  const state: DesignIntentState = {
    isDesignSession: isDesignSession(texts, targetNodeId),
    requiresClassification: false,
    requiresPlan: false,
    editIntent,
    requestType,
    targetNodeId,
    threadId,
    designPlan,
    planAccessSessionIds: cloneSet(sessionLineage),
    discoveredNodeIds,
    approvedNodeIds,
    variantCloneIds,
  };

  state.requiresClassification = state.isDesignSession && !state.editIntent;
  state.requiresPlan = state.isDesignSession && !state.designPlan;

  cacheState(sessionID, state);

  return state;
}
