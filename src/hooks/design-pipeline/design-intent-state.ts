import type { PluginInput } from "@opencode-ai/plugin";
import { normalizeSDKResponse } from "../../shared";
import { log } from "../../shared/logger";
import {
  getDefaultEditIntent,
  type CommentEditIntent,
  type CommentRequestType,
} from "../../shared/comment-classification";

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

type CachedDesignIntentState = {
  fetchedAt: number;
  state: {
    isDesignSession: boolean;
    requiresClassification: boolean;
    editIntent?: CommentEditIntent;
    requestType?: CommentRequestType;
    targetNodeId?: string;
    threadId?: string;
    discoveredNodeIds: string[];
    approvedNodeIds: string[];
    variantCloneIds: string[];
  };
};

export type DesignIntentState = {
  isDesignSession: boolean;
  requiresClassification: boolean;
  editIntent?: CommentEditIntent;
  requestType?: CommentRequestType;
  targetNodeId?: string;
  threadId?: string;
  discoveredNodeIds: Set<string>;
  approvedNodeIds: Set<string>;
  variantCloneIds: Set<string>;
};

const approvedNodeIdsBySession = new Map<string, Set<string>>();
const variantCloneIdsBySession = new Map<string, Set<string>>();
const cachedStates = new Map<string, CachedDesignIntentState>();

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
    editIntent: cached.editIntent,
    requestType: cached.requestType,
    targetNodeId: cached.targetNodeId,
    threadId: cached.threadId,
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
      editIntent: state.editIntent,
      requestType: state.requestType,
      targetNodeId: state.targetNodeId,
      threadId: state.threadId,
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

  let messages: SessionMessage[] = [];

  try {
    const response = await ctx.client.session.messages({
      path: { id: sessionID },
    } as never);
    const normalized = normalizeSDKResponse(
      response,
      [] as SessionMessage[],
      { preferResponseOnMissingData: true },
    );
    messages = Array.isArray(normalized) ? normalized : [];
  } catch (error) {
    log("[design-intent-state] Failed to read session messages", {
      sessionID,
      error: String(error),
    });
  }

  const texts = getAllTexts(messages);
  const targetNodeId = extractLatestMatch(texts, [
    /-\s*Target Node:\s*`?(I?\d+:\d+(?:;\d+:\d+)*)`?/i,
    /-\s*Node:\s*`?(I?\d+:\d+(?:;\d+:\d+)*)`?/i,
    /target node:\s*`?(I?\d+:\d+(?:;\d+:\d+)*)`?/i,
  ]);
  const threadId = extractLatestMatch(texts, [
    /-\s*Thread ID:\s*`?([^\n`]+)`?/i,
    /Thread root ID:\s*`?([^\n`]+)`?/i,
  ]);

  const rawRequestType = extractLatestMatch(texts, [
    /-\s*Request Type:\s*([a-z_]+)/i,
  ]);
  const requestType = rawRequestType && isCommentRequestType(rawRequestType)
    ? rawRequestType
    : undefined;

  const rawEditIntent = extractLatestMatch(texts, [
    /-\s*Edit Intent:\s*([a-z_]+)/i,
  ]);
  const editIntent = rawEditIntent && isCommentEditIntent(rawEditIntent)
    ? rawEditIntent
    : requestType
      ? getDefaultEditIntent(requestType)
      : undefined;

  const discoveredNodeIds = collectNodeIds(texts);
  const approvedNodeIds = cloneSet(approvedNodeIdsBySession.get(sessionID));
  const variantCloneIds = cloneSet(variantCloneIdsBySession.get(sessionID));

  const state: DesignIntentState = {
    isDesignSession: isDesignSession(texts, targetNodeId),
    requiresClassification: false,
    editIntent,
    requestType,
    targetNodeId,
    threadId,
    discoveredNodeIds,
    approvedNodeIds,
    variantCloneIds,
  };

  state.requiresClassification = state.isDesignSession && !state.editIntent;

  cacheState(sessionID, state);

  return state;
}
