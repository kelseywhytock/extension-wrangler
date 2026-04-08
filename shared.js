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
    try {
      debugLog('🔄 Attempting to load extensions...');
      let extensions = await chrome.management.getAll();

      // Chrome Web Store fix: Retry if no extensions loaded or API returned empty/invalid result
      if (!extensions || extensions.length === 0 || !Array.isArray(extensions)) {
        debugLog('⚠️ Initial extension load failed or returned empty - retrying for Chrome Web Store compatibility...');

        // Wait a bit for Chrome Web Store to fully initialize
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));

        try {
          extensions = await chrome.management.getAll();
          debugLog('🔄 Retry attempt completed, got:', extensions ? extensions.length : 'null', 'extensions');
        } catch (retryError) {
          debugLog('❌ Retry attempt also failed:', retryError);
          throw retryError;
        }
      }

      // Reset extensions object
      ctx.extensions = {};

      // Process extensions with additional validation
      if (extensions && Array.isArray(extensions)) {
        extensions.forEach(ext => {
          if (ext && ext.type === 'extension' && ext.id && ext.id !== chrome.runtime.id) {
            ctx.extensions[ext.id] = ext;
          }
        });
      }

      const loadedCount = Object.keys(ctx.extensions).length;
      debugLog(`✅ Loaded ${loadedCount} extensions`);

      // Enhanced debugging for Chrome Web Store issues
      debugLog(`[Web Store Debug] Extension loading details:`, {
        rawExtensionsCount: extensions ? extensions.length : 'null',
        filteredExtensionsCount: loadedCount,
        extensionIds: Object.keys(ctx.extensions),
        timestamp: new Date().toISOString()
      });

      // Cache extension names for future reference
      await cacheExtensionNames(ctx);

      // Verify we loaded extensions with more detailed warning
      if (loadedCount === 0) {
        debugLog('⚠️ WARNING: No extensions were loaded!');
        debugLog('This could indicate:');
        debugLog('- Chrome Web Store security restrictions');
        debugLog('- Extension permissions not granted');
        debugLog('- API timing issues');
        debugLog('- Genuinely no other extensions installed');
      }
    } catch (error) {
      debugLog('❌ Failed to load extensions:', error);

      // Enhanced error logging for Chrome Web Store debugging
      debugLog(`[Web Store Debug] Extension loading failed:`, {
        error: error.message,
        errorCode: error.code || 'unknown',
        stack: error.stack,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent
      });

      // Set a flag to prevent cleanup
      ctx.extensionLoadError = true;
    }
  }

  async function cacheExtensionNames(ctx) {
    try {
      const result = await chrome.storage.local.get(['extensionNameCache']);
      const existingCache = result.extensionNameCache || {};
      const updatedCache = { ...existingCache };
      Object.values(ctx.extensions).forEach(ext => {
        updatedCache[ext.id] = { name: ext.name, lastSeen: new Date().toISOString() };
      });
      const entries = Object.entries(updatedCache)
        .sort((a, b) => new Date(b[1].lastSeen) - new Date(a[1].lastSeen))
        .slice(0, NAME_CACHE_MAX_ENTRIES);
      const trimmedCache = Object.fromEntries(entries);
      await chrome.storage.local.set({ extensionNameCache: trimmedCache });
    } catch (error) {
      debugLog('Failed to cache extension names:', error);
    }
  }

  // Renamed from getCachedRemovedExtensions — actually returns extensionNameCache
  // (a map of all extension names ever seen), not a list of removed extensions.
  async function getNameCache() {
    try {
      const result = await chrome.storage.local.get(['extensionNameCache']);
      return result.extensionNameCache || {};
    } catch (error) {
      console.error('Failed to get extension name cache:', error);
      return {};
    }
  }

  async function getCachedExtensionName(extensionId) {
    const cache = await getNameCache();
    const cached = cache[extensionId];
    return cached ? cached.name : extensionId.slice(0, 8) + '...';
  }

  async function trackRemovedExtensions(removedExtensions) {
    if (removedExtensions.length === 0) return;

    try {
      // Get existing removal history
      const result = await chrome.storage.local.get(['removedExtensions']);
      const existingRemovals = result.removedExtensions || [];

      // Add new removals with timestamp
      const newRemovals = removedExtensions.map(ext => ({
        ...ext,
        removedAt: new Date().toISOString(),
        cleanedUp: true
      }));

      // Keep only last REMOVED_EXT_MAX removals to avoid storage bloat
      const allRemovals = [...newRemovals, ...existingRemovals].slice(0, REMOVED_EXT_MAX);

      // Save to storage
      await chrome.storage.local.set({ removedExtensions: allRemovals });

      debugLog('[Sync Fix] Tracked removed extensions:', newRemovals);
    } catch (error) {
      debugLog('Failed to track removed extensions:', error);
    }
  }

  async function cleanupOrphanedExtensions(ctx, onNotify) {
    // Don't run cleanup if there was an error loading extensions
    if (ctx.extensionLoadError) {
      console.warn('⚠️ Skipping cleanup due to extension load error');
      return;
    }

    let hasChanges = false;
    const validExtensionIds = new Set(Object.keys(ctx.extensions));
    const removedExtensions = [];

    // Safety check - if no extensions loaded, don't clean up
    if (validExtensionIds.size === 0) {
      console.warn('⚠️ No extensions loaded - skipping cleanup to prevent data loss');
      return;
    }

    debugLog(`🧹 Checking for orphaned extensions (${validExtensionIds.size} valid extensions found)...`);

    // Single fetch of name cache before the loop — avoids N sequential storage reads (bug #13)
    const nameCache = await getNameCache();

    // Check each group for orphaned extensions
    for (const [, group] of Object.entries(ctx.groups)) {
      const originalLength = group.extensions.length;
      const beforeExtensions = [...group.extensions];

      // Filter out extensions that no longer exist and track what we're removing
      const extensionsToKeep = [];
      for (const extId of group.extensions) {
        const exists = validExtensionIds.has(extId);
        if (exists) {
          extensionsToKeep.push(extId);
        } else {
          // Get the extension name from the pre-fetched cache or fall back to truncated ID
          const extensionName = nameCache[extId]?.name ?? extId.slice(0, 8) + '...';
          removedExtensions.push({
            id: extId,
            name: extensionName,
            groupName: group.name
          });
          debugLog(`Removing orphaned extension ${extensionName} (${extId}) from group "${group.name}"`);
        }
      }
      group.extensions = extensionsToKeep;

      if (group.extensions.length !== originalLength) {
        hasChanges = true;
        const removed = beforeExtensions.filter(id => !group.extensions.includes(id));
        debugLog(`Cleaned ${removed.length} orphaned extension(s) from group "${group.name}"`);
      }
    }

    // Save changes and notify user if any orphaned extensions were removed
    if (hasChanges) {
      await ctx.saveData();
      await trackRemovedExtensions(removedExtensions);
      debugLog('✅ Orphaned extensions cleanup complete');

      // Invoke caller-supplied notification callback
      if (removedExtensions.length > 0) {
        if (onNotify) onNotify(removedExtensions);
      }
    } else {
      debugLog('✅ No orphaned extensions found');
    }
  }

  function getExtensionGroups(groups, extId) {
    return Object.values(groups)
      .filter(g => g.extensions.includes(extId))
      .map(g => g.name);
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
