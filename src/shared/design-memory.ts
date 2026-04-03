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

const PATH_TOKEN_SPLIT = /[^a-z0-9]+/i
const DOCS_PRIORITY_BY_TYPE: Record<DesignMemoryFileType, number> = {
  design_style: 84,
  product_context: 78,
  user_behavior: 76,
  copy_context: 72,
  historical_learnings: 70,
  custom: 64,
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

function collectFilePaths(directory: string): string[] {
  if (!fs.existsSync(directory)) {
    return []
  }

  const entries = fs.readdirSync(directory, { withFileTypes: true })
  const filePaths: string[] = []

  for (const entry of entries) {
    const resolvedPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      filePaths.push(...collectFilePaths(resolvedPath))
      continue
    }

    if (entry.isFile()) {
      filePaths.push(resolvedPath)
    }
  }

  return filePaths
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
  directory: string
  config: DesignMemoryConfig
  prompt?: string
}): DesignMemoryCandidate[] {
  const docsRoot = resolveMemoryPath(args.directory, args.config.docs_root)
  const filePaths = collectFilePaths(docsRoot)

  const candidates = filePaths
    .map((resolvedPath) => {
      const relativePath = toRelativePath(args.directory, resolvedPath)
      if (!matchesDocsGlobs(relativePath, args.config.docs_globs)) {
        return null
      }

      const type = inferDocsType(relativePath)
      return {
        file: {
          path: relativePath,
          type,
          priority: scoreDocsCandidate({
            relativePath,
            type,
            prompt: args.prompt,
            preferDocsTypes: args.config.prefer_docs_types,
          }),
          tags: [],
          required: false,
        },
        resolvedPath,
        relativePath,
        source: "docs" as const,
        score: 0,
      }
    })
    .filter((candidate): candidate is DesignMemoryCandidate => candidate !== null)
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

  const docsCandidates = config.docs_first
    ? createDocsCandidates({ directory, config, prompt })
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
      const raw = fs.readFileSync(candidate.resolvedPath, "utf-8").trim()
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

  return {
    summary: formatSummary(loaded),
    files: loaded,
  }
}
