// shared.js — Shared utilities for Extension Wrangler popup and settings pages.
// Exposed as window.ExtWranglerShared. Loaded before popup.js and settings.js.
window.ExtWranglerShared = (() => {

  // Set to true only during development to enable verbose diagnostic logging.
  const DEBUG = false;

  function debugLog(...args) {
    if (DEBUG) console.log(...args);
  }

  // ── Named constants ────────────────────────────────────────────────────────
  const ALWAYS_ON_GROUP_ID        = 'always-on';
  const NAME_CACHE_MAX_ENTRIES    = 200;
  const REMOVED_EXT_MAX           = 50;
  const FAILED_TOGGLES_MAX        = 100;
  const RETRY_DELAY_MS            = 1500;
  const TOAST_DURATION_MS         = 3000;
  const REMOVED_EXT_DISPLAY_LIMIT = 10;

  // ── Migration mutex ────────────────────────────────────────────────────────
  // Prevents double-execution if loadData is called twice quickly in one window.
  // Does NOT prevent cross-context races (popup + settings open simultaneously) —
  // that is handled by the storage-level deviceDataMigrated flag.
  let _migrationInProgress = false;

  async function migrateFromLocalStorage(onNotify) {
    // stub — implemented in Task 3
  }

  async function loadExtensions(ctx) {
    // stub — implemented in Task 4
  }

  async function cacheExtensionNames(ctx) {
    // stub — implemented in Task 5
  }

  // Renamed from getCachedRemovedExtensions — actually returns extensionNameCache
  // (a map of all extension names ever seen), not a list of removed extensions.
  async function getNameCache() {
    // stub — implemented in Task 5
  }

  async function getCachedExtensionName(extensionId) {
    // stub — implemented in Task 5
  }

  async function trackRemovedExtensions(removedExtensions) {
    // stub — implemented in Task 5
  }

  async function cleanupOrphanedExtensions(ctx, onNotify) {
    // stub — implemented in Task 6
  }

  function getExtensionGroups(groups, extId) {
    // stub — implemented in Task 5
  }

  return {
    DEBUG,
    debugLog,
    ALWAYS_ON_GROUP_ID,
    NAME_CACHE_MAX_ENTRIES,
    REMOVED_EXT_MAX,
    FAILED_TOGGLES_MAX,
    RETRY_DELAY_MS,
    TOAST_DURATION_MS,
    REMOVED_EXT_DISPLAY_LIMIT,
    migrateFromLocalStorage,
    loadExtensions,
    cacheExtensionNames,
    getNameCache,
    getCachedExtensionName,
    trackRemovedExtensions,
    cleanupOrphanedExtensions,
    getExtensionGroups,
  };
})();
