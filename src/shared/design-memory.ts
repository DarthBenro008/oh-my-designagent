import * as fs from "fs"
import * as path from "path"
import type {
  DesignMemoryConfig,
  DesignMemoryFile,
  DesignMemoryFileType,
} from "../config"

type MemorySource = "docs" | "config"

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
const docsInventoryCache = new Map<string, DocsInventoryCacheEntry>()
const fileContentCache = new Map<string, FileContentCacheEntry>()
const designMemoryPacketCache = new Map<string, PacketCacheEntry>()
let docsInventoryVersionCounter = 0

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

  if (
    lowerPath.includes("history")
    || lowerPath.includes("decision")
    || lowerPath.includes("learn")
    || lowerPath.includes("retro")
  ) {
    return "historical_learnings"
  }

  return "product_context"
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
}): string {
  return JSON.stringify({
    directory: path.resolve(args.directory),
    docsInventoryVersion: args.docsInventoryVersion,
    promptBucket: args.promptBucket,
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
}): number {
  const { relativePath, type, prompt, preferDocsTypes } = args
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

  return Math.max(0, Math.min(100, score))
}

function createDocsCandidates(args: {
  config: DesignMemoryConfig
  docsInventory: DocsInventoryCacheEntry
  prompt?: string
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
}): { required: DesignMemoryCandidate[]; optional: DesignMemoryCandidate[] } {
  const required: DesignMemoryCandidate[] = []
  const optional: DesignMemoryCandidate[] = []

  for (const file of args.config.files) {
    const resolvedPath = resolveMemoryPath(args.directory, file.path)
    const relativePath = toRelativePath(args.directory, resolvedPath)
    const candidate: DesignMemoryCandidate = {
      file,
      resolvedPath,
      relativePath,
      source: "config",
      score: file.priority,
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

function formatSummary(files: LoadedDesignMemoryFile[]): string {
  return files.map(({ file, relativePath, content, source }) => {
    const tags = file.tags.length > 0 ? ` | tags: ${file.tags.join(", ")}` : ""
    return [
      `### ${file.type} | ${relativePath} | source: ${source}${tags}`,
      content,
    ].join("\n")
  }).join("\n\n---\n\n")
}

export function loadDesignMemoryPacket(args: {
  directory?: string
  config?: DesignMemoryConfig
  prompt?: string
}): DesignMemoryPacket {
  const { directory = process.cwd(), config, prompt } = args

  if (!config?.enabled) {
    return { summary: "", files: [] }
  }

  const promptBucket = normalizePromptBucket(prompt)
  const docsInventory = config.docs_first
    ? getDocsInventory({ directory, config })
    : null
  const packetCacheKey = createPacketCacheKey({
    directory,
    config,
    promptBucket,
    docsInventoryVersion: docsInventory?.version ?? 0,
  })
  const cachedPacket = getCachedPacket(packetCacheKey)
  if (cachedPacket) {
    return cachedPacket
  }

  const docsCandidates = docsInventory
    ? createDocsCandidates({ config, docsInventory, prompt })
    : []
  const configuredCandidates = createConfiguredCandidates({ directory, config })

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
    summary: formatSummary(loaded),
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
