const SESSION_BUDGET_ENV_VAR = "OPENCODE_SESSION_BUDGET_USD"

type RootBudgetState = {
  totalUsd: number
  aborted: boolean
  messageCosts: Map<string, number>
}

export type SessionBudgetOutcome = {
  enabled: boolean
  rootSessionID: string
  totalUsd: number
  limitUsd: number
  exceeded: boolean
  firstExceeded: boolean
  abortSessionIDs: string[]
  messageCostUsd: number
}

const sessionParents = new Map<string, string | undefined>()
const rootBudgets = new Map<string, RootBudgetState>()

function formatUsdAmount(value: number): string {
  const fractionDigits = value >= 1 ? 2 : 4
  return `$${value.toFixed(fractionDigits)}`
}

function getOrCreateRootBudget(rootSessionID: string): RootBudgetState {
  const existing = rootBudgets.get(rootSessionID)
  if (existing) return existing

  const created: RootBudgetState = {
    totalUsd: 0,
    aborted: false,
    messageCosts: new Map<string, number>(),
  }
  rootBudgets.set(rootSessionID, created)
  return created
}

function hasAncestor(sessionID: string, ancestorID: string): boolean {
  let current = sessionID
  const visited = new Set<string>()

  while (true) {
    if (current === ancestorID) return true
    if (visited.has(current)) return false
    visited.add(current)

    const parent = sessionParents.get(current)
    if (!parent) return false
    current = parent
  }
}

function resolveRootSessionID(sessionID: string): string {
  let current = sessionID
  const visited = new Set<string>()

  while (true) {
    if (visited.has(current)) return current
    visited.add(current)

    const parent = sessionParents.get(current)
    if (!parent) return current
    current = parent
  }
}

function mergeRootBudgets(sourceRootID: string, targetRootID: string): void {
  if (sourceRootID === targetRootID) return

  const source = rootBudgets.get(sourceRootID)
  if (!source) return

  const target = getOrCreateRootBudget(targetRootID)

  for (const [messageID, messageCost] of source.messageCosts.entries()) {
    const previousCost = target.messageCosts.get(messageID) ?? 0
    if (messageCost <= previousCost) continue

    target.messageCosts.set(messageID, messageCost)
    target.totalUsd += messageCost - previousCost
  }

  target.aborted ||= source.aborted
  rootBudgets.delete(sourceRootID)
}

export function getSessionBudgetLimitUsd(
  env: Record<string, string | undefined> = process.env,
): number | null {
  const raw = env[SESSION_BUDGET_ENV_VAR]?.trim()
  if (!raw) return null

  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed <= 0) return null

  return parsed
}

export function getSessionBudgetExceededMessage(totalUsd: number, limitUsd: number): string {
  return `Budget exceeded: spent ${formatUsdAmount(totalUsd)} over limit ${formatUsdAmount(limitUsd)}. Session aborted.`
}

export function registerSessionBudgetSession(sessionID: string, parentSessionID?: string): void {
  if (!sessionID) return

  const previousRootID = resolveRootSessionID(sessionID)

  if (!sessionParents.has(sessionID)) {
    sessionParents.set(sessionID, undefined)
  }

  if (parentSessionID) {
    if (!sessionParents.has(parentSessionID)) {
      sessionParents.set(parentSessionID, undefined)
    }
    sessionParents.set(sessionID, parentSessionID)
  }

  const nextRootID = resolveRootSessionID(sessionID)
  if (previousRootID !== nextRootID) {
    mergeRootBudgets(previousRootID, nextRootID)
  }
}

export function clearSessionBudgetSession(sessionID: string): void {
  if (!sessionID) return

  const isRoot = resolveRootSessionID(sessionID) === sessionID
  const descendantSessionIDs = [...sessionParents.keys()].filter((candidateID) =>
    hasAncestor(candidateID, sessionID),
  )

  for (const descendantSessionID of descendantSessionIDs) {
    sessionParents.delete(descendantSessionID)
  }

  if (isRoot) {
    rootBudgets.delete(sessionID)
  }
}

export function recordSessionBudgetCost(input: {
  sessionID: string
  messageID: string
  costUsd: number
  env?: Record<string, string | undefined>
}): SessionBudgetOutcome | null {
  const limitUsd = getSessionBudgetLimitUsd(input.env)
  if (limitUsd === null) return null

  const { sessionID, messageID, costUsd } = input
  if (!sessionID || !messageID || !Number.isFinite(costUsd) || costUsd < 0) {
    return null
  }

  if (!sessionParents.has(sessionID)) {
    sessionParents.set(sessionID, undefined)
  }

  const rootSessionID = resolveRootSessionID(sessionID)
  const rootBudget = getOrCreateRootBudget(rootSessionID)
  const previousCost = rootBudget.messageCosts.get(messageID) ?? 0

  if (costUsd <= previousCost) {
    return {
      enabled: true,
      rootSessionID,
      totalUsd: rootBudget.totalUsd,
      limitUsd,
      exceeded: rootBudget.totalUsd > limitUsd,
      firstExceeded: false,
      abortSessionIDs: [],
      messageCostUsd: previousCost,
    }
  }

  rootBudget.messageCosts.set(messageID, costUsd)
  rootBudget.totalUsd += costUsd - previousCost

  const exceeded = rootBudget.totalUsd > limitUsd
  const firstExceeded = exceeded && !rootBudget.aborted

  if (firstExceeded) {
    rootBudget.aborted = true
  }

  return {
    enabled: true,
    rootSessionID,
    totalUsd: rootBudget.totalUsd,
    limitUsd,
    exceeded,
    firstExceeded,
    abortSessionIDs: firstExceeded
      ? (rootSessionID === sessionID ? [rootSessionID] : [sessionID, rootSessionID])
      : [],
    messageCostUsd: costUsd,
  }
}

export function _resetSessionBudgetStateForTesting(): void {
  sessionParents.clear()
  rootBudgets.clear()
}

export function _getSessionBudgetSnapshotForTesting(sessionID: string): {
  rootSessionID: string
  totalUsd: number
  aborted: boolean
  trackedMessageCount: number
} | null {
  if (!sessionParents.has(sessionID) && !rootBudgets.has(sessionID)) return null

  const rootSessionID = sessionParents.has(sessionID)
    ? resolveRootSessionID(sessionID)
    : sessionID
  const rootBudget = rootBudgets.get(rootSessionID)
  if (!rootBudget) return null

  return {
    rootSessionID,
    totalUsd: rootBudget.totalUsd,
    aborted: rootBudget.aborted,
    trackedMessageCount: rootBudget.messageCosts.size,
  }
}

export { SESSION_BUDGET_ENV_VAR }
