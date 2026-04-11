import * as fs from "fs"
import * as path from "path"
import type {
  DesignMemoryConfig,
  DesignMemoryFile,
  DesignMemoryFileType,
} from "../config"
import type { CommentRequestType } from "./comment-classification"

type MemorySource = "docs" | "config"
export type DesignMemoryRole = "planner" | "executor" | "reviewer" | "question"

interface DesignMemoryCandidate {
  file: DesignMemoryFile
  resolvedPath: string
  relativePath: string
  source: MemorySource
  score: number
}

export interface LoadedDesignMemoryFile {
  file: DesignMemoryFile
  resolvedPath: string
  relativePath: string
  content: string
  source: MemorySource
  score: number
}

export interface DesignMemoryPacket {
  summary: string
  files: LoadedDesignMemoryFile[]
}

interface DocsInventoryFile {
  resolvedPath: string
  relativePath: string
  type: DesignMemoryFileType
}

interface DirectoryStamp {
  path: string
  mtimeMs: number
}

interface DocsInventoryCacheEntry {
  docsRoot: string
  rootExists: boolean
  version: number
  directories: DirectoryStamp[]
  files: DocsInventoryFile[]
}

interface FileContentCacheEntry {
  signature: string
  raw: string
}

interface PacketCacheEntry {
  packet: DesignMemoryPacket
  fileSignatures: Record<string, string>
}

const PATH_TOKEN_SPLIT = /[^a-z0-9]+/i
const DOCS_PRIORITY_BY_TYPE: Record<DesignMemoryFileType, number> = {
  design_style: 84,
  product_context: 78,
  user_behavior: 76,
  copy_context: 72,
  historical_learnings: 70,
  custom: 64,
}
const ROLE_PRIORITY_BY_TYPE: Record<
  DesignMemoryRole,
  Partial<Record<DesignMemoryFileType, number>>
> = {
  planner: {
    product_context: 16,
    user_behavior: 14,
    historical_learnings: 10,
    design_style: 6,
    copy_context: 4,
  },
  executor: {
    design_style: 18,
    historical_learnings: 16,
    product_context: 10,
    user_behavior: 6,
    copy_context: 4,
  },
  reviewer: {
    historical_learnings: 18,
    design_style: 14,
    copy_context: 12,
    product_context: 6,
    user_behavior: 6,
  },
  question: {
    product_context: 10,
    design_style: 8,
    copy_context: 8,
    user_behavior: 6,
    historical_learnings: 4,
  },
}
const REQUEST_PRIORITY_BY_TYPE: Partial<
  Record<CommentRequestType, Partial<Record<DesignMemoryFileType, number>>>
> = {
  copy_change: {
    copy_context: 18,
    historical_learnings: 6,
    design_style: 4,
  },
  token_bind: {
    design_style: 18,
    historical_learnings: 8,
  },
  color_update: {
    design_style: 16,
    historical_learnings: 6,
  },
  spacing_fix: {
    design_style: 14,
    user_behavior: 6,
    historical_learnings: 6,
  },
  typography_update: {
    design_style: 12,
    copy_context: 10,
    historical_learnings: 6,
  },
  layout_change: {
    product_context: 12,
    user_behavior: 10,
    design_style: 8,
    historical_learnings: 6,
  },
  new_component: {
    product_context: 14,
    design_style: 12,
    user_behavior: 8,
    historical_learnings: 8,
  },
  design_improvement: {
    product_context: 12,
    user_behavior: 10,
    design_style: 10,
    historical_learnings: 8,
  },
}
const docsInventoryCache = new Map<string, DocsInventoryCacheEntry>()
const fileContentCache = new Map<string, FileContentCacheEntry>()
const designMemoryPacketCache = new Map<string, PacketCacheEntry>()
let docsInventoryVersionCounter = 0

const DESIGN_MEMORY_ROLE_BY_AGENT: Record<string, DesignMemoryRole> = {
  prometheus: "planner",
  solacy: "planner",
  sisyphus: "planner",
  atlas: "planner",
  "comment-conductor": "planner",
  metis: "planner",
  "comment-planner": "planner",
  hephaestus: "executor",
  "design-worker": "executor",
  "sisyphus-junior": "executor",
  "canvas-executor": "executor",
  momus: "reviewer",
  "vision-reviewer": "reviewer",
  oracle: "reviewer",
  "design-auditor": "reviewer",
}

function resolveMemoryPath(directory: string, filePath: string): string {
  if (path.isAbsolute(filePath)) {
    return filePath
  }

  if (filePath.startsWith("~/")) {
    const home = process.env.HOME ?? ""
    return path.join(home, filePath.slice(2))
  }

  return path.resolve(directory, filePath)
}

function truncateContent(content: string, maxChars: number): string {
  if (content.length <= maxChars) {
    return content
  }

  return `${content.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`
}

function getFileSignature(filePath: string): string | null {
  try {
    const stat = fs.statSync(filePath)
    return `${stat.mtimeMs}:${stat.size}`
  } catch {
    return null
  }
}

function getDirectoryStamp(directory: string): DirectoryStamp | null {
  try {
    const stat = fs.statSync(directory)
    return {
      path: directory,
      mtimeMs: stat.mtimeMs,
    }
  } catch {
    return null
  }
}

function toRelativePath(directory: string, resolvedPath: string): string {
  const relativePath = path.relative(directory, resolvedPath)
  return relativePath.startsWith("..") ? resolvedPath : relativePath
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(PATH_TOKEN_SPLIT)
    .filter((token) => token.length >= 3)
}

function inferDocsType(relativePath: string): DesignMemoryFileType {
  const lowerPath = relativePath.toLowerCase()

  if (
    lowerPath.includes("history")
    || lowerPath.includes("decision")
    || lowerPath.includes("learn")
    || lowerPath.includes("retro")
  ) {
    return "historical_learnings"
  }

  if (
    lowerPath.includes("style")
    || lowerPath.includes("design")
    || lowerPath.includes("token")
    || lowerPath.includes("component")
    || lowerPath.includes("brand")
  ) {
    return "design_style"
  }

  if (
    lowerPath.includes("persona")
    || lowerPath.includes("behavior")
    || lowerPath.includes("journey")
    || lowerPath.includes("workflow")
    || lowerPath.includes("user")
    || lowerPath.includes("ux")
  ) {
    return "user_behavior"
  }

  if (
    lowerPath.includes("copy")
    || lowerPath.includes("tone")
    || lowerPath.includes("voice")
    || lowerPath.includes("messaging")
    || lowerPath.includes("content")
  ) {
    return "copy_context"
  }

  return "product_context"
}

export function getDesignMemoryRoleForAgent(
  agentName?: string,
): DesignMemoryRole | undefined {
  if (!agentName) {
    return undefined
  }

  return DESIGN_MEMORY_ROLE_BY_AGENT[agentName.trim().toLowerCase()]
}

function inferRequestTypeFromPrompt(prompt?: string): CommentRequestType | undefined {
  const lowerPrompt = prompt?.toLowerCase() ?? ""
  if (!lowerPrompt) {
    return undefined
  }

  if (
    lowerPrompt.includes("token")
    || lowerPrompt.includes("variable")
    || lowerPrompt.includes("style binding")
    || lowerPrompt.includes("bind ")
  ) {
    return "token_bind"
  }

  if (
    lowerPrompt.includes("copy")
    || lowerPrompt.includes("label")
    || lowerPrompt.includes("cta")
    || lowerPrompt.includes("headline")
    || lowerPrompt.includes("microcopy")
    || lowerPrompt.includes("wording")
  ) {
    return "copy_change"
  }

  if (
    lowerPrompt.includes("typography")
    || lowerPrompt.includes("font")
    || lowerPrompt.includes("text size")
    || lowerPrompt.includes("type scale")
  ) {
    return "typography_update"
  }

  if (
    lowerPrompt.includes("spacing")
    || lowerPrompt.includes("padding")
    || lowerPrompt.includes("margin")
    || lowerPrompt.includes("gap")
  ) {
    return "spacing_fix"
  }

  if (
    lowerPrompt.includes("layout")
    || lowerPrompt.includes("grid")
    || lowerPrompt.includes("align")
    || lowerPrompt.includes("flow")
  ) {
    return "layout_change"
  }

  if (
    lowerPrompt.includes("component")
    || lowerPrompt.includes("variant")
    || lowerPrompt.includes("new screen")
    || lowerPrompt.includes("new card")
    || lowerPrompt.includes("new modal")
  ) {
    return "new_component"
  }

  if (
    lowerPrompt.includes("color")
    || lowerPrompt.includes("colour")
    || lowerPrompt.includes("fill")
    || lowerPrompt.includes("background")
    || lowerPrompt.includes("shade")
    || lowerPrompt.includes("tint")
  ) {
    return "color_update"
  }

  if (
    lowerPrompt.includes("improve")
    || lowerPrompt.includes("polish")
    || lowerPrompt.includes("refine")
    || lowerPrompt.includes("redesign")
  ) {
    return "design_improvement"
  }

  return undefined
}

function getRoleTypeBoost(
  role: DesignMemoryRole | undefined,
  type: DesignMemoryFileType,
): number {
  if (!role) {
    return 0
  }

  return ROLE_PRIORITY_BY_TYPE[role]?.[type] ?? 0
}

function getRequestTypeBoost(
  requestType: CommentRequestType | undefined,
  type: DesignMemoryFileType,
): number {
  if (!requestType) {
    return 0
  }

  return REQUEST_PRIORITY_BY_TYPE[requestType]?.[type] ?? 0
}

function globToRegExp(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*\/?/g, "__DOUBLE_STAR__")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, ".")
    .replace(/__DOUBLE_STAR__/g, ".*")

  return new RegExp(`^${escaped}$`)
}

function matchesDocsGlobs(relativePath: string, globs: string[]): boolean {
  const normalizedPath = relativePath.split(path.sep).join("/")
  return globs.some((glob) => globToRegExp(glob).test(normalizedPath))
}

function collectDocsTree(args: {
  docsRoot: string
  directory: string
  globs: string[]
}): Pick<DocsInventoryCacheEntry, "rootExists" | "directories" | "files"> {
  const { docsRoot, directory, globs } = args
  if (!fs.existsSync(docsRoot)) {
    return {
      rootExists: false,
      directories: [],
      files: [],
    }
  }

  const directories: DirectoryStamp[] = []
  const files: DocsInventoryFile[] = []

  const traverse = (currentDir: string): void => {
    const directoryStamp = getDirectoryStamp(currentDir)
    if (!directoryStamp) {
      return
    }

    directories.push(directoryStamp)

    const entries = fs.readdirSync(currentDir, { withFileTypes: true })
    for (const entry of entries) {
      const resolvedPath = path.join(currentDir, entry.name)
      if (entry.isDirectory()) {
        traverse(resolvedPath)
        continue
      }

      if (!entry.isFile()) {
        continue
      }

      const relativePath = toRelativePath(directory, resolvedPath)
      if (!matchesDocsGlobs(relativePath, globs)) {
        continue
      }

      files.push({
        resolvedPath,
        relativePath,
        type: inferDocsType(relativePath),
      })
    }
  }

  traverse(docsRoot)

  return {
    rootExists: true,
    directories,
    files,
  }
}

function normalizePromptBucket(prompt?: string): string {
  const tokens = [...new Set(tokenize(prompt ?? ""))].sort()
  return tokens.join("|")
}

function serializeDesignMemoryFiles(files: DesignMemoryFile[]): string {
  return JSON.stringify(files.map((file) => ({
    path: file.path,
    type: file.type,
    priority: file.priority,
    tags: [...file.tags],
    max_chars: file.max_chars,
    required: file.required,
  })))
}

function createDocsInventoryCacheKey(args: {
  directory: string
  config: DesignMemoryConfig
}): string {
  return JSON.stringify({
    directory: path.resolve(args.directory),
    docsRoot: args.config.docs_root,
    docsGlobs: [...args.config.docs_globs],
  })
}

function isDocsInventoryCacheEntryValid(entry: DocsInventoryCacheEntry): boolean {
  if (!entry.rootExists) {
    return !fs.existsSync(entry.docsRoot)
  }

  for (const directory of entry.directories) {
    const currentStamp = getDirectoryStamp(directory.path)
    if (!currentStamp || currentStamp.mtimeMs !== directory.mtimeMs) {
      return false
    }
  }

  return true
}

function getDocsInventory(args: {
  directory: string
  config: DesignMemoryConfig
}): DocsInventoryCacheEntry {
  const key = createDocsInventoryCacheKey(args)
  const cached = docsInventoryCache.get(key)
  if (cached && isDocsInventoryCacheEntryValid(cached)) {
    return cached
  }

  const docsRoot = resolveMemoryPath(args.directory, args.config.docs_root)
  const tree = collectDocsTree({
    docsRoot,
    directory: args.directory,
    globs: args.config.docs_globs,
  })
  const entry: DocsInventoryCacheEntry = {
    docsRoot,
    rootExists: tree.rootExists,
    version: ++docsInventoryVersionCounter,
    directories: tree.directories,
    files: tree.files,
  }
  docsInventoryCache.set(key, entry)
  return entry
}

function readCachedFileContent(resolvedPath: string): string | null {
  const signature = getFileSignature(resolvedPath)
  if (!signature) {
    return null
  }

  const cached = fileContentCache.get(resolvedPath)
  if (cached?.signature === signature) {
    return cached.raw
  }

  try {
    const raw = fs.readFileSync(resolvedPath, "utf-8").trim()
    fileContentCache.set(resolvedPath, {
      signature,
      raw,
    })
    return raw
  } catch {
    return null
  }
}

function cloneLoadedDesignMemoryFile(
  loaded: LoadedDesignMemoryFile,
): LoadedDesignMemoryFile {
  return {
    ...loaded,
    file: {
      ...loaded.file,
      tags: [...loaded.file.tags],
    },
  }
}

function cloneDesignMemoryPacket(packet: DesignMemoryPacket): DesignMemoryPacket {
  return {
    summary: packet.summary,
    files: packet.files.map(cloneLoadedDesignMemoryFile),
  }
}

function createPacketCacheKey(args: {
  directory: string
  config: DesignMemoryConfig
  promptBucket: string
  docsInventoryVersion: number
  role?: DesignMemoryRole
  requestType?: CommentRequestType
}): string {
  return JSON.stringify({
    directory: path.resolve(args.directory),
    docsInventoryVersion: args.docsInventoryVersion,
    promptBucket: args.promptBucket,
    role: args.role ?? null,
    requestType: args.requestType ?? null,
    docsFirst: args.config.docs_first,
    preferDocsTypes: [...args.config.prefer_docs_types],
    maxDocsFiles: args.config.max_docs_files,
    maxCharsPerFile: args.config.max_chars_per_file,
    maxTotalChars: args.config.max_total_chars,
    files: serializeDesignMemoryFiles(args.config.files),
  })
}

function getCachedPacket(cacheKey: string): DesignMemoryPacket | null {
  const cached = designMemoryPacketCache.get(cacheKey)
  if (!cached) {
    return null
  }

  for (const [resolvedPath, signature] of Object.entries(cached.fileSignatures)) {
    if (getFileSignature(resolvedPath) !== signature) {
      designMemoryPacketCache.delete(cacheKey)
      return null
    }
  }

  return cloneDesignMemoryPacket(cached.packet)
}

function scoreDocsCandidate(args: {
  relativePath: string
  type: DesignMemoryFileType
  prompt?: string
  preferDocsTypes: DesignMemoryFileType[]
  role?: DesignMemoryRole
  requestType?: CommentRequestType
}): number {
  const {
    relativePath,
    type,
    prompt,
    preferDocsTypes,
    role,
    requestType,
  } = args
  const lowerPath = relativePath.toLowerCase()
  const promptTokens = new Set(tokenize(prompt ?? ""))
  const pathTokens = tokenize(relativePath)

  let score = DOCS_PRIORITY_BY_TYPE[type]

  if (
    lowerPath.includes("rule")
    || lowerPath.includes("instruction")
    || lowerPath.includes("manifesto")
    || lowerPath.includes("spec")
    || lowerPath.includes("policy")
  ) {
    score += 20
  }

  if (lowerPath.includes("/guide/") || lowerPath.includes("/reference/")) {
    score += 8
  }

  if (lowerPath.includes("/examples/") || lowerPath.includes("/troubleshooting/")) {
    score -= 18
  }

  if (preferDocsTypes.includes(type)) {
    score += 12
  }

  score += getRoleTypeBoost(role, type)
  score += getRequestTypeBoost(requestType, type)

  for (const token of pathTokens) {
    if (promptTokens.has(token)) {
      score += 6
    }
  }

  if (promptTokens.has("figma") && type === "design_style") {
    score += 8
  }

  if (promptTokens.has("comment") && type !== "historical_learnings") {
    score += 4
  }

  if (
    type === "historical_learnings"
    && (
      promptTokens.has("regression")
      || promptTokens.has("regressions")
      || promptTokens.has("learned")
      || promptTokens.has("mistake")
      || promptTokens.has("mistakes")
    )
  ) {
    score += 12
  }

  if (
    role === "reviewer"
    && type === "historical_learnings"
    && (
      promptTokens.has("review")
      || promptTokens.has("audit")
      || promptTokens.has("verify")
    )
  ) {
    score += 6
  }

  return Math.max(0, Math.min(100, score))
}

function createDocsCandidates(args: {
  config: DesignMemoryConfig
  docsInventory: DocsInventoryCacheEntry
  prompt?: string
  role?: DesignMemoryRole
  requestType?: CommentRequestType
}): DesignMemoryCandidate[] {
  const candidates = args.docsInventory.files
    .map((file) => ({
      file: {
        path: file.relativePath,
        type: file.type,
        priority: scoreDocsCandidate({
          relativePath: file.relativePath,
          type: file.type,
          prompt: args.prompt,
          preferDocsTypes: args.config.prefer_docs_types,
          role: args.role,
          requestType: args.requestType,
        }),
        tags: [],
        required: false,
      },
      resolvedPath: file.resolvedPath,
      relativePath: file.relativePath,
      source: "docs" as const,
      score: 0,
    }))
    .map((candidate) => ({
      ...candidate,
      score: candidate.file.priority,
    }))
    .sort((a, b) => b.score - a.score || a.relativePath.localeCompare(b.relativePath))

  return candidates.slice(0, args.config.max_docs_files)
}

function createConfiguredCandidates(args: {
  directory: string
  config: DesignMemoryConfig
  prompt?: string
  role?: DesignMemoryRole
  requestType?: CommentRequestType
}): { required: DesignMemoryCandidate[]; optional: DesignMemoryCandidate[] } {
  const required: DesignMemoryCandidate[] = []
  const optional: DesignMemoryCandidate[] = []

  for (const file of args.config.files) {
    const resolvedPath = resolveMemoryPath(args.directory, file.path)
    const relativePath = toRelativePath(args.directory, resolvedPath)
    const score = Math.max(
      0,
      Math.min(
        100,
        file.priority
          + getRoleTypeBoost(args.role, file.type)
          + getRequestTypeBoost(args.requestType, file.type)
          + scoreDocsCandidate({
            relativePath,
            type: file.type,
            prompt: args.prompt,
            preferDocsTypes: args.config.prefer_docs_types,
            role: args.role,
            requestType: args.requestType,
          })
          - DOCS_PRIORITY_BY_TYPE[file.type],
      ),
    )
    const candidate: DesignMemoryCandidate = {
      file,
      resolvedPath,
      relativePath,
      source: "config",
      score,
    }

    if (file.required) {
      required.push(candidate)
      continue
    }

    optional.push(candidate)
  }

  optional.sort((a, b) => b.score - a.score || a.relativePath.localeCompare(b.relativePath))

  return { required, optional }
}

function buildRoleSummaryIntro(args: {
  role?: DesignMemoryRole
  requestType?: CommentRequestType
}): string | undefined {
  const requestSuffix = args.requestType
    ? ` for \`${args.requestType}\` requests`
    : ""

  switch (args.role) {
    case "planner":
      return [
        "### Planner Focus",
        `Prioritize product context, user behavior, and prior design learnings${requestSuffix} before locking the plan.`,
      ].join("\n")
    case "executor":
      return [
        "### Executor Focus",
        `Prioritize design-system rules, concrete implementation guardrails, and historical learnings${requestSuffix} before mutating.`,
      ].join("\n")
    case "reviewer":
      return [
        "### Reviewer Focus",
        `Prioritize compliance evidence, copy/design fidelity, and prior regressions${requestSuffix} while judging the outcome.`,
      ].join("\n")
    case "question":
      return [
        "### Question Focus",
        `Prioritize product and design-system context${requestSuffix} so answers stay grounded in project guidance.`,
      ].join("\n")
    default:
      return undefined
  }
}

function formatSummary(args: {
  files: LoadedDesignMemoryFile[]
  role?: DesignMemoryRole
  requestType?: CommentRequestType
}): string {
  const sections = args.files.map(({ file, relativePath, content, source }) => {
    const tags = file.tags.length > 0 ? ` | tags: ${file.tags.join(", ")}` : ""
    return [
      `### ${file.type} | ${relativePath} | source: ${source}${tags}`,
      content,
    ].join("\n")
  })
  const intro = buildRoleSummaryIntro({
    role: args.role,
    requestType: args.requestType,
  })

  return [intro, ...sections].filter(Boolean).join("\n\n---\n\n")
}

export function loadDesignMemoryPacket(args: {
  directory?: string
  config?: DesignMemoryConfig
  prompt?: string
  role?: DesignMemoryRole
  requestType?: CommentRequestType
}): DesignMemoryPacket {
  const { directory = process.cwd(), config, prompt, role } = args

  if (!config?.enabled) {
    return { summary: "", files: [] }
  }

  const promptBucket = normalizePromptBucket(prompt)
  const requestType = args.requestType ?? inferRequestTypeFromPrompt(prompt)
  const docsInventory = config.docs_first
    ? getDocsInventory({ directory, config })
    : null
  const packetCacheKey = createPacketCacheKey({
    directory,
    config,
    promptBucket,
    docsInventoryVersion: docsInventory?.version ?? 0,
    role,
    requestType,
  })
  const cachedPacket = getCachedPacket(packetCacheKey)
  if (cachedPacket) {
    return cachedPacket
  }

  const docsCandidates = docsInventory
    ? createDocsCandidates({ config, docsInventory, prompt, role, requestType })
    : []
  const configuredCandidates = createConfiguredCandidates({
    directory,
    config,
    prompt,
    role,
    requestType,
  })

  const selectedCandidates = [
    ...docsCandidates,
    ...configuredCandidates.required,
    ...configuredCandidates.optional,
  ]

  if (selectedCandidates.length === 0) {
    return { summary: "", files: [] }
  }

  const loaded: LoadedDesignMemoryFile[] = []
  const seenPaths = new Set<string>()
  let remainingChars = config.max_total_chars

  for (const candidate of selectedCandidates) {
    if (remainingChars <= 0 || seenPaths.has(candidate.resolvedPath) || !fs.existsSync(candidate.resolvedPath)) {
      continue
    }

    try {
      const raw = readCachedFileContent(candidate.resolvedPath)
      if (!raw) {
        continue
      }

      const maxChars = Math.min(
        candidate.file.max_chars ?? config.max_chars_per_file,
        remainingChars,
      )
      const content = truncateContent(raw, maxChars)

      loaded.push({
        file: candidate.file,
        resolvedPath: candidate.resolvedPath,
        relativePath: candidate.relativePath,
        content,
        source: candidate.source,
        score: candidate.score,
      })
      seenPaths.add(candidate.resolvedPath)
      remainingChars -= content.length
    } catch {
      continue
    }
  }

  const packet = {
    summary: formatSummary({ files: loaded, role, requestType }),
    files: loaded,
  }
  designMemoryPacketCache.set(packetCacheKey, {
    packet: cloneDesignMemoryPacket(packet),
    fileSignatures: Object.fromEntries(
      packet.files
        .map((file) => [file.resolvedPath, getFileSignature(file.resolvedPath)])
        .filter((entry): entry is [string, string] => entry[1] !== null),
    ),
  })

  return packet
}

export function _resetDesignMemoryCacheForTesting(): void {
  docsInventoryCache.clear()
  fileContentCache.clear()
  designMemoryPacketCache.clear()
  docsInventoryVersionCounter = 0
}

export function _getDesignMemoryCacheStatsForTesting(): {
  docsInventoryEntries: number
  fileContentEntries: number
  packetEntries: number
} {
  return {
    docsInventoryEntries: docsInventoryCache.size,
    fileContentEntries: fileContentCache.size,
    packetEntries: designMemoryPacketCache.size,
  }
}
