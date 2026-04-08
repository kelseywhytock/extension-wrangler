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
    if (_migrationInProgress) return;
    _migrationInProgress = true;
    try {
      // --- One-time cleanup: move device-local keys out of sync storage ---
      // This runs independently of the original migration (which may already be complete).
      const deviceMigration = await chrome.storage.local.get(['deviceDataMigrated']);
      if (!deviceMigration.deviceDataMigrated) {
        // Move extensionNameCache: sync → local
        const staleCache = await chrome.storage.sync.get(['extensionNameCache']);
        if (staleCache.extensionNameCache) {
          await chrome.storage.local.set({ extensionNameCache: staleCache.extensionNameCache });
          await chrome.storage.sync.remove(['extensionNameCache']);
          debugLog('[Sync Fix] Moved extensionNameCache from sync to local storage');
        }

        // Move removedExtensions: sync → local (merge, don't overwrite)
        const staleDeviceData = await chrome.storage.sync.get(['removedExtensions', 'failedToggles']);
        if (staleDeviceData.removedExtensions) {
          const localResult = await chrome.storage.local.get(['removedExtensions']);
          const existing = localResult.removedExtensions || [];
          const merged = [...staleDeviceData.removedExtensions, ...existing].slice(0, 50);
          await chrome.storage.local.set({ removedExtensions: merged });
          await chrome.storage.sync.remove(['removedExtensions']);
          debugLog('[Sync Fix] Moved removedExtensions from sync to local storage');
        }

        // Move failedToggles: sync → local (merge, don't overwrite)
        if (staleDeviceData.failedToggles) {
          const localResult = await chrome.storage.local.get(['failedToggles']);
          const existing = localResult.failedToggles || [];
          const merged = [...staleDeviceData.failedToggles, ...existing].slice(0, 100);
          await chrome.storage.local.set({ failedToggles: merged });
          await chrome.storage.sync.remove(['failedToggles']);
          debugLog('[Sync Fix] Moved failedToggles from sync to local storage');
        }

        // Also clean up legacy migrationCompleted flag
        const legacyFlag = await chrome.storage.sync.get(['migrationCompleted']);
        if (legacyFlag.migrationCompleted !== undefined) {
          await chrome.storage.sync.remove(['migrationCompleted']);
          debugLog('[Sync Fix] Removed legacy migrationCompleted flag from sync storage');
        }

        // Mark device data migration complete
        await chrome.storage.local.set({ deviceDataMigrated: true });
        debugLog('[Sync Fix] Device data migration complete');
      }
      // --- End device-local key cleanup ---

      // --- Groups migration: local storage → sync storage ---
      // Only run if there is actual local data to migrate up.
      // Do NOT set migrationCompleted on a fresh device where sync hasn't propagated yet —
      // that races with sync propagation and can permanently block groups from loading.

      const localResult = await chrome.storage.local.get(['groups', 'groupOrder']);
      const hasLocalData = localResult.groups && Object.keys(localResult.groups).length > 0;

      if (!hasLocalData) {
        // Nothing to migrate — fresh install or already migrated.
        // Do NOT write migrationCompleted here; if sync has groups they'll load fine.
        return;
      }

      // Local has data. Check if sync already has groups too.
      const syncResult = await chrome.storage.sync.get(['groups']);
      const hasSyncData = syncResult.groups && Object.keys(syncResult.groups).length > 0;

      if (hasSyncData) {
        // Sync wins — local copy is a harmless safety backup; loadData() reads sync first.
        debugLog('[Sync Fix] Sync has data — local copy retained as safety backup');
        return;
      }

      // Local has data, sync is empty: safe to migrate up.
      debugLog('[Sync Fix] Migrating groups from local to sync storage...');
      const dataToMigrate = {};
      if (localResult.groups) dataToMigrate.groups = localResult.groups;
      if (localResult.groupOrder) dataToMigrate.groupOrder = localResult.groupOrder;

      try {
        await chrome.storage.sync.set(dataToMigrate);
        await chrome.storage.local.remove(['groups', 'groupOrder']);
        debugLog('[Sync Fix] Groups migrated successfully');
        if (onNotify) onNotify('Settings migrated to Chrome sync', 'success');
      } catch (migrationError) {
        debugLog('[Sync Fix] Groups migration failed:', migrationError);
        if (migrationError.message && migrationError.message.includes('QUOTA')) {
          debugLog('[Sync Fix] Migration failed due to quota — keeping local storage');
          if (onNotify) onNotify('Using local storage due to sync quota limits', 'info');
        }
        // Do not rethrow — extension continues working from local data
      }
    } catch (error) {
      debugLog('[Web Store Debug] Failed to migrate from local storage:', error);
      // Don't throw - allow the extension to continue with current data
    } finally {
      _migrationInProgress = false;
    }
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
