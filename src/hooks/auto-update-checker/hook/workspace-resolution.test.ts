import type { PluginInput } from "@opencode-ai/plugin"
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test"
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const originalCheckerModule = await import("../checker.ts?restore")
const originalCacheModule = await import("../cache.ts?restore")
const originalOpencodeConfigDir = process.env.OPENCODE_CONFIG_DIR
const originalXdgCacheHome = process.env.XDG_CACHE_HOME

type PluginEntry = {
  entry: string
  isPinned: boolean
  pinnedVersion: string | null
  configPath: string
}

type ToastMessageGetter = (isUpdate: boolean, version?: string) => string

function createPluginEntry(overrides?: Partial<PluginEntry>): PluginEntry {
  return {
    entry: "oh-my-opencode@3.4.0",
    isPinned: false,
    pinnedVersion: null,
    configPath: "/test/opencode.json",
    ...overrides,
  }
}

const TEST_DIR = join(import.meta.dir, "__test-workspace-resolution__")
const TEST_CACHE_DIR = join(TEST_DIR, "opencode")
const TEST_CONFIG_DIR = join(TEST_DIR, "config")

const mockFindPluginEntry = mock((_directory: string): PluginEntry | null => createPluginEntry())
const mockGetCachedVersion = mock((): string | null => "3.4.0")
const mockGetLatestVersion = mock(async (): Promise<string | null> => "3.5.0")
const mockInvalidatePackage = mock(() => {})
const mockShowUpdateAvailableToast = mock(
  async (_ctx: PluginInput, _latestVersion: string, _getToastMessage: ToastMessageGetter): Promise<void> => {}
)
const mockShowAutoUpdatedToast = mock(
  async (_ctx: PluginInput, _fromVersion: string, _toVersion: string): Promise<void> => {}
)
const mockSyncCachePackageJsonToIntent = mock(() => ({ synced: true, error: null }))

const mockRunBunInstallWithDetails = mock(
  async (opts?: { outputMode?: string; workspaceDir?: string }) => {
    return { success: true }
  }
)

async function importFreshBackgroundUpdateCheck(): Promise<typeof import("./background-update-check")> {
  return import(`./background-update-check?test=${Date.now()}-${Math.random()}`)
}

function registerModuleMocks(): void {
  mock.module("../checker", () => ({
    ...originalCheckerModule,
    findPluginEntry: mockFindPluginEntry,
    getCachedVersion: mockGetCachedVersion,
    getLatestVersion: mockGetLatestVersion,
    revertPinnedVersion: mock(() => false),
    syncCachePackageJsonToIntent: mockSyncCachePackageJsonToIntent,
  }))
  mock.module("../cache", () => ({
    ...originalCacheModule,
    invalidatePackage: mockInvalidatePackage,
  }))
  mock.module("../../../cli/config-manager", () => ({
    runBunInstallWithDetails: mockRunBunInstallWithDetails,
  }))
  mock.module("./update-toasts", () => ({
    showUpdateAvailableToast: mockShowUpdateAvailableToast,
    showAutoUpdatedToast: mockShowAutoUpdatedToast,
  }))
  mock.module("../../../shared/logger", () => ({ log: () => {} }))
}

describe("workspace resolution", () => {
  let runBackgroundUpdateCheck: typeof import("./background-update-check")["runBackgroundUpdateCheck"]
  const mockCtx = { directory: "/test" } as PluginInput
  const getToastMessage: ToastMessageGetter = (isUpdate, version) =>
    isUpdate ? `Update to ${version}` : "Up to date"

  beforeEach(async () => {
    // Setup test directories
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true })
    }
    mkdirSync(TEST_DIR, { recursive: true })
    process.env.OPENCODE_CONFIG_DIR = TEST_CONFIG_DIR
    process.env.XDG_CACHE_HOME = TEST_DIR
    registerModuleMocks()

    mockFindPluginEntry.mockReset()
    mockGetCachedVersion.mockReset()
    mockGetLatestVersion.mockReset()
    mockInvalidatePackage.mockReset()
    mockRunBunInstallWithDetails.mockReset()
    mockShowUpdateAvailableToast.mockReset()
    mockShowAutoUpdatedToast.mockReset()

    mockFindPluginEntry.mockReturnValue(createPluginEntry())
    mockGetCachedVersion.mockReturnValue("3.4.0")
    mockGetLatestVersion.mockResolvedValue("3.5.0")
    // Note: Don't use mockResolvedValue here - it overrides the function that captures args
    mockSyncCachePackageJsonToIntent.mockReturnValue({ synced: true, error: null })
    ;({ runBackgroundUpdateCheck } = await importFreshBackgroundUpdateCheck())
  })

  afterEach(() => {
    mock.restore()
    if (originalOpencodeConfigDir === undefined) {
      delete process.env.OPENCODE_CONFIG_DIR
    } else {
      process.env.OPENCODE_CONFIG_DIR = originalOpencodeConfigDir
    }
    if (originalXdgCacheHome === undefined) {
      delete process.env.XDG_CACHE_HOME
    } else {
      process.env.XDG_CACHE_HOME = originalXdgCacheHome
    }
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true })
    }
  })

  describe("#given config-dir install exists but cache-dir does not", () => {
    it("installs to config-dir, not cache-dir", async () => {
      //#given - config-dir has installation, cache-dir does not
      mkdirSync(join(TEST_CONFIG_DIR, "node_modules", "oh-my-opencode"), { recursive: true })
      writeFileSync(
        join(TEST_CONFIG_DIR, "package.json"),
        JSON.stringify({ dependencies: { "oh-my-opencode": "3.4.0" } }, null, 2)
      )
      writeFileSync(
        join(TEST_CONFIG_DIR, "node_modules", "oh-my-opencode", "package.json"),
        JSON.stringify({ name: "oh-my-opencode", version: "3.4.0" }, null, 2)
      )

      // cache-dir should NOT exist
      expect(existsSync(TEST_CACHE_DIR)).toBe(false)

      //#when
      await runBackgroundUpdateCheck(mockCtx, true, getToastMessage)

      //#then - install should be called with config-dir
      const mockCalls = mockRunBunInstallWithDetails.mock.calls
      expect(mockCalls[0][0]?.workspaceDir).toBe(TEST_CONFIG_DIR)
    })
  })

  describe("#given both config-dir and cache-dir exist", () => {
    it("prefers config-dir over cache-dir", async () => {
      //#given - both directories have installations
      mkdirSync(join(TEST_CONFIG_DIR, "node_modules", "oh-my-opencode"), { recursive: true })
      writeFileSync(
        join(TEST_CONFIG_DIR, "package.json"),
        JSON.stringify({ dependencies: { "oh-my-opencode": "3.4.0" } }, null, 2)
      )
      writeFileSync(
        join(TEST_CONFIG_DIR, "node_modules", "oh-my-opencode", "package.json"),
        JSON.stringify({ name: "oh-my-opencode", version: "3.4.0" }, null, 2)
      )

      mkdirSync(join(TEST_CACHE_DIR, "node_modules", "oh-my-opencode"), { recursive: true })
      writeFileSync(
        join(TEST_CACHE_DIR, "package.json"),
        JSON.stringify({ dependencies: { "oh-my-opencode": "3.4.0" } }, null, 2)
      )
      writeFileSync(
        join(TEST_CACHE_DIR, "node_modules", "oh-my-opencode", "package.json"),
        JSON.stringify({ name: "oh-my-opencode", version: "3.4.0" }, null, 2)
      )

      //#when
      await runBackgroundUpdateCheck(mockCtx, true, getToastMessage)

      //#then - install should prefer config-dir
      const mockCalls2 = mockRunBunInstallWithDetails.mock.calls
      expect(mockCalls2[0][0]?.workspaceDir).toBe(TEST_CONFIG_DIR)
    })
  })

  describe("#given only cache-dir install exists", () => {
    it("falls back to cache-dir", async () => {
      //#given - only cache-dir has installation
      mkdirSync(join(TEST_CACHE_DIR, "node_modules", "oh-my-opencode"), { recursive: true })
      writeFileSync(
        join(TEST_CACHE_DIR, "package.json"),
        JSON.stringify({ dependencies: { "oh-my-opencode": "3.4.0" } }, null, 2)
      )
      writeFileSync(
        join(TEST_CACHE_DIR, "node_modules", "oh-my-opencode", "package.json"),
        JSON.stringify({ name: "oh-my-opencode", version: "3.4.0" }, null, 2)
      )

      // config-dir should NOT exist
      expect(existsSync(TEST_CONFIG_DIR)).toBe(false)

      //#when
      await runBackgroundUpdateCheck(mockCtx, true, getToastMessage)

      //#then - install should fall back to cache-dir
      const mockCalls3 = mockRunBunInstallWithDetails.mock.calls
      expect(mockCalls3[0][0]?.workspaceDir).toBe(TEST_CACHE_DIR)
    })
  })
})
