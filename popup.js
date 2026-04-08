class ExtensionOrganizer {
  constructor() {
    this.groups = {};
    this.extensions = {};
    this.currentTab = 'groups';
    this.groupOrder = [];
    this.init();
  }

  async init() {
    console.log('🚀 Initializing Extension Wrangler...');
    console.log(`🕰️ Popup opened at: ${new Date().toLocaleString()}`);

    // Store initialization timestamp
    this.initTime = Date.now();

    // Run Web Store diagnostics first
    if (window.webStoreUtils) {
      await window.webStoreUtils.runDiagnostics();
    }

    // Load extensions FIRST
    console.log('📦 Loading extensions...');
    await this.loadExtensions();
    console.log(`✅ Loaded ${Object.keys(this.extensions).length} extensions`);

    // Then load data (which needs extensions for cleanup)
    console.log('💾 Loading saved data...');
    await this.loadData();
    console.log(`✅ Loaded ${Object.keys(this.groups).length} groups`);

    this.setupEventListeners();
    this.render();

    // Check for previous failures
    this.checkFailureHistory();

    // Check storage quota if Web Store utils available
    if (window.webStoreUtils) {
      const quotaInfo = await window.webStoreUtils.checkSyncStorageQuota();
      if (quotaInfo.isNearQuota) {
        console.warn(`[Web Store Debug] Storage quota warning: ${quotaInfo.usagePercentage}% used`);
      }
    }

    // Log summary
    console.log('📊 Initialization complete:', {
      extensionsLoaded: Object.keys(this.extensions).length,
      groupsLoaded: Object.keys(this.groups).length,
      totalExtensionsInGroups: Object.values(this.groups).reduce((sum, g) => sum + g.extensions.length, 0)
    });
  }

  async migrateFromLocalStorage() {
    try {
      // Check if migration has already been completed
      const migrationResult = await chrome.storage.sync.get(['migrationCompleted']);
      if (migrationResult.migrationCompleted) {
        return; // Migration already completed, skip
      }

      // Check if sync storage is empty and local storage has data
      const syncResult = await chrome.storage.sync.get(['groups', 'groupOrder', 'failedToggles']);
      const localResult = await chrome.storage.local.get(['groups', 'groupOrder', 'failedToggles']);

      const hasSyncData = syncResult.groups && Object.keys(syncResult.groups).length > 0;
      const hasLocalData = localResult.groups && Object.keys(localResult.groups).length > 0;

      if (!hasSyncData && hasLocalData) {
        console.log('[Web Store Debug] Migrating extension groups from local storage to sync storage...');

        // Copy data to sync storage
        const dataToMigrate = {};
        if (localResult.groups) dataToMigrate.groups = localResult.groups;
        if (localResult.groupOrder) dataToMigrate.groupOrder = localResult.groupOrder;
        if (localResult.failedToggles) dataToMigrate.failedToggles = localResult.failedToggles;

        if (Object.keys(dataToMigrate).length > 0) {
          try {
            await chrome.storage.sync.set(dataToMigrate);

            // Mark migration as completed
            await chrome.storage.sync.set({ migrationCompleted: true });

            // Clear local storage to avoid confusion
            await chrome.storage.local.remove(['groups', 'groupOrder', 'failedToggles']);

            console.log('[Web Store Debug] Migration completed successfully');
          } catch (migrationError) {
            console.error('[Web Store Debug] Migration failed:', migrationError);

            // If migration fails due to quota, keep using local storage
            if (migrationError.message && migrationError.message.includes('QUOTA')) {
              console.log('[Web Store Debug] Migration failed due to quota - keeping local storage');
              return;
            }
            throw migrationError;
          }
        }
      } else {
        // Mark migration as completed even if no data to migrate
        await chrome.storage.sync.set({ migrationCompleted: true });
      }
    } catch (error) {
      console.error('[Web Store Debug] Failed to migrate from local storage:', error);
      // Don't throw - allow the extension to continue with current data
    }
  }

  async checkFailureHistory() {
    try {
      const result = await chrome.storage.sync.get(['failedToggles']);
      if (result.failedToggles && result.failedToggles.length > 0) {
        console.warn('🚨 Previous toggle failures detected:', result.failedToggles.length);
        console.log('To analyze failures, run: chrome.storage.sync.get(["failedToggles"], (r) => console.table(r.failedToggles))');
      }
    } catch (error) {
      console.error('Failed to check failure history:', error);
    }
  }

  async loadData() {
    try {
      // First, try to migrate from local storage to sync storage
      await this.migrateFromLocalStorage();

      const result = await chrome.storage.sync.get(['groups', 'groupOrder']);
      this.groups = result.groups || {};
      this.groupOrder = result.groupOrder || [];

      // Ensure "Fixed" group exists
      if (!this.groups['always-on']) {
        this.groups['always-on'] = {
          id: 'always-on',
          name: 'Fixed',
          extensions: [],
          isDefault: true
        };
        await this.saveData();
      }

      // Initialize group order if empty
      if (this.groupOrder.length === 0) {
        this.groupOrder = Object.keys(this.groups);
        await this.saveGroupOrder();
      }

      // Clean up orphaned extensions after loading all data
      await this.cleanupOrphanedExtensions();

      // Log successful load for Web Store debugging
      console.log(`[Web Store Debug] Data loaded successfully:`, {
        groupsCount: Object.keys(this.groups).length,
        totalExtensionsInGroups: Object.values(this.groups).reduce((sum, g) => sum + g.extensions.length, 0),
        storageType: 'sync',
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Failed to load data:', error);

      // Enhanced error logging for Web Store issues
      console.error(`[Web Store Debug] Data load failed:`, {
        error: error.message,
        errorCode: error.code || 'unknown',
        timestamp: new Date().toISOString(),
        operation: 'loadData',
        storageType: 'sync'
      });

      // Fallback to local storage
      try {
        console.log(`[Web Store Debug] Attempting fallback to local storage...`);
        const localResult = await chrome.storage.local.get(['groups', 'groupOrder']);

        if (localResult.groups && Object.keys(localResult.groups).length > 0) {
          this.groups = localResult.groups;
          this.groupOrder = localResult.groupOrder || Object.keys(localResult.groups);
          console.log(`[Web Store Debug] Fallback successful - loaded from local storage`);
        } else {
          throw new Error('No data found in local storage either');
        }
      } catch (fallbackError) {
        console.error(`[Web Store Debug] Fallback also failed:`, fallbackError);

        // Final fallback to default state
        this.groups = {
          'always-on': {
            id: 'always-on',
            name: 'Fixed',
            extensions: [],
            isDefault: true
          }
        };
        this.groupOrder = ['always-on'];

        console.log(`[Web Store Debug] Using default state due to storage failures`);
      }
    }
  }

  async cleanupOrphanedExtensions() {
    // Don't run cleanup if there was an error loading extensions
    if (this.extensionLoadError) {
      console.warn('⚠️ Skipping cleanup due to extension load error');
      return;
    }
    
    let hasChanges = false;
    const validExtensionIds = new Set(Object.keys(this.extensions));
    const removedExtensions = [];
    
    // Safety check - if no extensions loaded, don't clean up
    if (validExtensionIds.size === 0) {
      console.warn('⚠️ No extensions loaded - skipping cleanup to prevent data loss');
      return;
    }
    
    console.log(`🧹 Checking for orphaned extensions (${validExtensionIds.size} valid extensions found)...`);
    
    // Check each group for orphaned extensions
    for (const [, group] of Object.entries(this.groups)) {
      const originalLength = group.extensions.length;
      const beforeExtensions = [...group.extensions];
      
      // Filter out extensions that no longer exist and track what we're removing
      const extensionsToKeep = [];
      for (const extId of group.extensions) {
        const exists = validExtensionIds.has(extId);
        if (exists) {
          extensionsToKeep.push(extId);
        } else {
          // Try to get the extension name from our cached data or use the ID
          const extensionName = await this.getCachedExtensionName(extId);
          removedExtensions.push({
            id: extId,
            name: extensionName,
            groupName: group.name
          });
          console.warn(`Removing orphaned extension ${extensionName} (${extId}) from group "${group.name}"`);
        }
      }
      group.extensions = extensionsToKeep;
      
      if (group.extensions.length !== originalLength) {
        hasChanges = true;
        const removed = beforeExtensions.filter(id => !group.extensions.includes(id));
        console.log(`Cleaned ${removed.length} orphaned extension(s) from group "${group.name}"`);
      }
    }
    
    // Save changes and track removals if any orphaned extensions were removed
    if (hasChanges) {
      await this.saveData();
      await this.trackRemovedExtensions(removedExtensions);
      console.log('✅ Orphaned extensions cleanup complete');
      
      // Log removal summary for console users
      if (removedExtensions.length > 0) {
        this.logRemovedExtensions(removedExtensions);
      }
    } else {
      console.log('✅ No orphaned extensions found');
    }
  }

  async getCachedExtensionName(extensionId) {
    // Try to get the name from our cached extension names
    const cache = await this.getCachedRemovedExtensions();
    const cached = cache[extensionId];
    return cached ? cached.name : extensionId.slice(0, 8) + '...';
  }

  async cacheExtensionNames() {
    try {
      const result = await chrome.storage.local.get(['extensionNameCache']);  // was sync
      const existingCache = result.extensionNameCache || {};
      const updatedCache = { ...existingCache };
      Object.values(this.extensions).forEach(ext => {
        updatedCache[ext.id] = { name: ext.name, lastSeen: new Date().toISOString() };
      });
      const entries = Object.entries(updatedCache)
        .sort((a, b) => new Date(b[1].lastSeen) - new Date(a[1].lastSeen))
        .slice(0, 200);
      const trimmedCache = Object.fromEntries(entries);
      await chrome.storage.local.set({ extensionNameCache: trimmedCache });  // was sync
    } catch (error) {
      console.error('Failed to cache extension names:', error);
    }
  }

  async getCachedRemovedExtensions() {
    try {
      const result = await chrome.storage.local.get(['extensionNameCache']);  // was sync
      return result.extensionNameCache || {};
    } catch (error) {
      console.error('Failed to get cached extension names:', error);
      return {};
    }
  }

  async trackRemovedExtensions(removedExtensions) {
    if (removedExtensions.length === 0) return;
    
    try {
      // Get existing removal history
      const result = await chrome.storage.sync.get(['removedExtensions']);
      const existingRemovals = result.removedExtensions || [];
      
      // Add new removals with timestamp
      const newRemovals = removedExtensions.map(ext => ({
        ...ext,
        removedAt: new Date().toISOString(),
        cleanedUp: true
      }));
      
      // Keep only last 50 removals to avoid storage bloat
      const allRemovals = [...newRemovals, ...existingRemovals].slice(0, 50);
      
      // Save to storage
      await chrome.storage.sync.set({ removedExtensions: allRemovals });
      
      console.log('📝 Tracked removed extensions:', newRemovals);
    } catch (error) {
      console.error('Failed to track removed extensions:', error);
    }
  }

  logRemovedExtensions(removedExtensions) {
    // Log detailed information for popup users
    console.group('🗑️ Extensions Removed from Groups');
    removedExtensions.forEach(ext => {
      console.log(`• "${ext.name}" removed from "${ext.groupName}"`);
    });
    console.groupEnd();
  }

  async loadExtensions() {
    try {
      console.log('🔄 Attempting to load extensions...');
      let extensions = await chrome.management.getAll();

      // Chrome Web Store fix: Retry if no extensions loaded or API returned empty/invalid result
      if (!extensions || extensions.length === 0 || !Array.isArray(extensions)) {
        console.warn('⚠️ Initial extension load failed or returned empty - retrying for Chrome Web Store compatibility...');

        // Wait a bit for Chrome Web Store to fully initialize
        await new Promise(resolve => setTimeout(resolve, 1500));

        try {
          extensions = await chrome.management.getAll();
          console.log('🔄 Retry attempt completed, got:', extensions ? extensions.length : 'null', 'extensions');
        } catch (retryError) {
          console.error('❌ Retry attempt also failed:', retryError);
          throw retryError;
        }
      }

      // Reset extensions object
      this.extensions = {};

      // Process extensions with additional validation
      if (extensions && Array.isArray(extensions)) {
        extensions.forEach(ext => {
          if (ext && ext.type === 'extension' && ext.id && ext.id !== chrome.runtime.id) {
            this.extensions[ext.id] = ext;
          }
        });
      }

      const loadedCount = Object.keys(this.extensions).length;
      console.log(`✅ Loaded ${loadedCount} extensions`);

      // Enhanced debugging for Chrome Web Store issues
      console.log(`[Web Store Debug] Extension loading details:`, {
        rawExtensionsCount: extensions ? extensions.length : 'null',
        filteredExtensionsCount: loadedCount,
        extensionIds: Object.keys(this.extensions),
        timestamp: new Date().toISOString()
      });

      // Cache extension names for future reference
      await this.cacheExtensionNames();

      // Verify we loaded extensions with more detailed warning
      if (loadedCount === 0) {
        console.warn('⚠️ WARNING: No extensions were loaded!');
        console.warn('This could indicate:');
        console.warn('- Chrome Web Store security restrictions');
        console.warn('- Extension permissions not granted');
        console.warn('- API timing issues');
        console.warn('- Genuinely no other extensions installed');
      }
    } catch (error) {
      console.error('❌ Failed to load extensions:', error);

      // Enhanced error logging for Chrome Web Store debugging
      console.error(`[Web Store Debug] Extension loading failed:`, {
        error: error.message,
        errorCode: error.code || 'unknown',
        stack: error.stack,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent
      });

      // Set a flag to prevent cleanup
      this.extensionLoadError = true;
    }
  }

  async saveData() {
    try {
      await chrome.storage.sync.set({ groups: this.groups });

      // Log successful save for Web Store debugging
      console.log(`[Web Store Debug] Data saved successfully:`, {
        groupsCount: Object.keys(this.groups).length,
        totalExtensionsInGroups: Object.values(this.groups).reduce((sum, g) => sum + g.extensions.length, 0),
        storageType: 'sync',
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Failed to save data:', error);

      // Enhanced error logging for Web Store issues
      console.error(`[Web Store Debug] Data save failed:`, {
        error: error.message,
        errorCode: error.code || 'unknown',
        timestamp: new Date().toISOString(),
        operation: 'saveData',
        storageType: 'sync',
        dataSize: JSON.stringify(this.groups).length
      });
      throw error;
    }
  }

  async saveGroupOrder() {
    try {
      await chrome.storage.sync.set({ groupOrder: this.groupOrder });

      // Log successful save for Web Store debugging
      console.log(`[Web Store Debug] Group order saved successfully:`, {
        orderLength: this.groupOrder.length,
        storageType: 'sync',
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Failed to save group order:', error);

      // Enhanced error logging for Web Store issues
      console.error(`[Web Store Debug] Group order save failed:`, {
        error: error.message,
        errorCode: error.code || 'unknown',
        timestamp: new Date().toISOString(),
        operation: 'saveGroupOrder',
        storageType: 'sync'
      });
      throw error;
    }
  }

  setupEventListeners() {
    // Debug button
    document.getElementById('debugBtn').addEventListener('click', () => {
      this.showDebugInfo();
    });

    // Open settings page
    document.getElementById('openSettingsBtn').addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
      window.close();
    });

    // Tab switching
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        this.switchTab(tab.dataset.tab);
      });
    });

    // Create group
    document.getElementById('createGroupBtn').addEventListener('click', () => {
      this.showCreateGroupModal();
    });

    // Modal actions
    document.getElementById('confirmCreateBtn').addEventListener('click', () => {
      this.createGroup();
    });

    document.getElementById('cancelCreateBtn').addEventListener('click', () => {
      this.hideCreateGroupModal();
    });

    // Search
    document.getElementById('searchInput').addEventListener('input', (e) => {
      this.handleSearch(e.target.value);
    });

    // Close modals on backdrop click
    document.getElementById('createGroupModal').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) {
        this.hideCreateGroupModal();
      }
    });
  }

  async showDebugInfo() {
    console.group('🐛 Extension Wrangler Debug Info');

    // Run Web Store diagnostics first
    if (window.webStoreUtils) {
      await window.webStoreUtils.runDiagnostics();
    }

    // Show failed toggles
    const failedResult = await chrome.storage.sync.get(['failedToggles']);
    if (failedResult.failedToggles && failedResult.failedToggles.length > 0) {
      console.log('🔴 Failed Toggle History:');
      console.table(failedResult.failedToggles);
    } else {
      console.log('✅ No failed toggles recorded');
    }

    // Show current groups
    console.log('\n📁 Current Groups:');
    Object.values(this.groups).forEach(group => {
      console.log(`- ${group.name}: ${group.extensions.length} extensions`);
    });

    // Show extension states
    console.log('\n🧬 Extension Analysis:');
    const extensionStats = {
      total: 0,
      enabled: 0,
      disabled: 0,
      byDisabledReason: {},
      byInstallType: {}
    };

    Object.values(this.extensions).forEach(ext => {
      extensionStats.total++;
      if (ext.enabled) {
        extensionStats.enabled++;
      } else {
        extensionStats.disabled++;
        if (ext.disabledReason) {
          extensionStats.byDisabledReason[ext.disabledReason] =
            (extensionStats.byDisabledReason[ext.disabledReason] || 0) + 1;
        }
      }
      if (ext.installType) {
        extensionStats.byInstallType[ext.installType] =
          (extensionStats.byInstallType[ext.installType] || 0) + 1;
      }
    });

    console.table(extensionStats);

    // Show problematic extensions
    const problematic = Object.values(this.extensions).filter(ext =>
      ext.disabledReason === 'unknown' ||
      ext.disabledReason === 'permissions_increase' ||
      ext.installType === 'admin'
    );

    if (problematic.length > 0) {
      console.log('\n⚠️  Potentially Problematic Extensions:');
      problematic.forEach(ext => {
        console.log(`- ${ext.name}: ${ext.disabledReason || 'N/A'} (${ext.installType})`);
      });
    }

    // Storage quota info
    if (window.webStoreUtils) {
      const quotaInfo = await window.webStoreUtils.checkSyncStorageQuota();
      console.log('\n💾 Storage Quota Status:');
      console.table(quotaInfo);
    }

    console.log('\n📝 Debugging Commands:');
    console.log('🔍 Run diagnostics: await window.webStoreUtils.runDiagnostics()');
    console.log('🧹 Clean orphaned extensions: await window.organizer.cleanupOrphanedExtensions()');
    console.log('💾 Backup groups: copy(JSON.stringify(window.organizer.groups))');
    console.log('🔄 Restore groups: window.organizer.restoreGroups(YOUR_BACKUP_JSON)');
    console.log('🗑️ Clear failed toggles: chrome.storage.sync.remove(["failedToggles"])');
    console.log('📊 Storage analysis: await window.webStoreUtils.analyzeStorageUsage()');

    console.groupEnd();

    // Make organizer and utils available for debugging
    window.organizer = this;
  }

  async refreshData() {
    console.log('🔄 Refreshing all data...');
    await this.loadExtensions();
    await this.loadData();
    this.render();
    console.log('✅ Data refresh complete');
  }

  async restoreGroups(groupsJson) {
    try {
      const groups = typeof groupsJson === 'string' ? JSON.parse(groupsJson) : groupsJson;
      
      console.log('🔄 Restoring groups...');
      
      // Validate the structure
      if (!groups || typeof groups !== 'object') {
        throw new Error('Invalid groups data');
      }
      
      // Merge with existing groups (preserving the Fixed group)
      const fixedGroup = this.groups['always-on'];
      this.groups = groups;
      
      // Ensure Fixed group is preserved
      if (fixedGroup) {
        this.groups['always-on'] = fixedGroup;
      }
      
      await this.saveData();
      await this.loadData(); // Reload to clean any orphaned extensions
      this.render();
      
      console.log('✅ Groups restored successfully!');
    } catch (error) {
      console.error('❌ Failed to restore groups:', error);
    }
  }

  switchTab(tabName) {
    this.currentTab = tabName;

    // Update tab appearance
    document.querySelectorAll('.tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.tab === tabName);
    });

    // Show/hide content and search
    document.getElementById('groupsContent').classList.toggle('hidden', tabName !== 'groups');
    document.getElementById('searchContent').classList.toggle('hidden', tabName !== 'search');

    const searchContainer = document.querySelector('.search-container');
    searchContainer.classList.toggle('show', tabName === 'search');

    if (tabName === 'search') {
      this.renderSearchResults();
      document.getElementById('searchInput').focus();
    }
  }

  showCreateGroupModal() {
    document.getElementById('groupNameInput').value = '';
    document.getElementById('createGroupModal').style.display = 'block';
    document.getElementById('groupNameInput').focus();
  }

  hideCreateGroupModal() {
    document.getElementById('createGroupModal').style.display = 'none';
  }

  async createGroup() {
    const name = document.getElementById('groupNameInput').value.trim();
    if (!name) return;

    const id = 'group-' + Date.now();
    this.groups[id] = {
      id,
      name,
      extensions: [],
      isDefault: false
    };

    await this.saveData();
    this.hideCreateGroupModal();
    this.render();
  }

  async toggleGroup(groupId, enable) {
    const group = this.groups[groupId];
    if (!group) return;

    // Show loading state
    this.setGroupLoadingState(groupId, true);

    const results = await this.toggleExtensionsWithRetry(group.extensions, enable);

    // Check for failures
    const failures = results.filter(r => !r.success && !r.skipped);
    if (failures.length > 0) {
      const failedNames = failures.map(f => this.extensions[f.extId]?.name || f.extId).join(', ');
      alert(`Failed to ${enable ? 'enable' : 'disable'} some extensions: ${failedNames}`);
    }

    await this.loadExtensions();
    this.setGroupLoadingState(groupId, false);
    this.render();
  }

  async toggleExtensionsWithRetry(extensionIds, enable, maxRetries = 3) {
    const results = [];
    const batchSize = 2; // Process in smaller batches
    const delayMs = 100; // Delay between batches

    // Enhanced logging
    console.group(`🔧 Toggling ${extensionIds.length} extensions to ${enable ? 'ENABLED' : 'DISABLED'}`);
    console.log('Extensions to toggle:', extensionIds.map(id => {
      const ext = this.extensions[id];
      return `${ext?.name || id} (${id}) - Currently: ${ext?.enabled ? 'enabled' : 'disabled'}`;
    }));

    for (let i = 0; i < extensionIds.length; i += batchSize) {
      const batch = extensionIds.slice(i, i + batchSize);
      console.log(`\n📦 Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(extensionIds.length/batchSize)}:`, batch);

      const batchPromises = batch.map(async (extId) => {
        let lastError;
        const ext = this.extensions[extId];
        
        // Skip if extension doesn't exist
        if (!ext) {
          console.warn(`  ⚠️ Skipping non-existent extension: ${extId}`);
          return { extId, success: false, error: new Error('Extension not found'), skipped: true };
        }
        
        for (let attempt = 0; attempt < maxRetries; attempt++) {
          try {
            console.log(`  🔄 Attempt ${attempt + 1} for "${ext?.name}"...`);
            await chrome.management.setEnabled(extId, enable);
            console.log(`  ✅ Success: "${ext?.name}" is now ${enable ? 'enabled' : 'disabled'}`);
            return { extId, success: true };
          } catch (error) {
            lastError = error;
            console.warn(`  ❌ Attempt ${attempt + 1} failed for "${ext?.name}":`, {
              errorMessage: error.message,
              errorCode: error.code,
              extensionId: extId,
              extensionName: ext?.name,
              currentState: ext?.enabled,
              targetState: enable,
              permissions: ext?.permissions,
              installType: ext?.installType,
              mayRequireUserGesture: ext?.mayRequireUserGesture,
              updateUrl: ext?.updateUrl,
              disabledReason: ext?.disabledReason
            });

            // Wait before retry with exponential backoff
            if (attempt < maxRetries - 1) {
              const waitTime = (attempt + 1) * 100;
              console.log(`  ⏳ Waiting ${waitTime}ms before retry...`);
              await new Promise(resolve => setTimeout(resolve, waitTime));
            }
          }
        }

        console.error(`  ❌❌ FAILED: Unable to ${enable ? 'enable' : 'disable'} "${ext?.name}" after ${maxRetries} attempts`, {
          finalError: lastError,
          extensionDetails: ext
        });
        
        // Store failure for analysis
        this.logFailedToggle(extId, enable, lastError);
        
        return { extId, success: false, error: lastError };
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Add delay between batches to avoid overwhelming the API
      if (i + batchSize < extensionIds.length) {
        console.log(`\n⏸️  Pausing ${delayMs}ms before next batch...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    // Summary
    const succeeded = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success && !r.skipped).length;
    const skipped = results.filter(r => r.skipped).length;
    
    console.log(`\n📊 Summary: ${succeeded} succeeded, ${failed} failed${skipped > 0 ? `, ${skipped} skipped` : ''}`);
    
    if (failed > 0) {
      console.error('Failed extensions:', results.filter(r => !r.success && !r.skipped).map(r => ({
        name: this.extensions[r.extId]?.name,
        id: r.extId,
        error: r.error?.message
      })));
    }
    
    if (skipped > 0) {
      console.warn('Skipped non-existent extensions:', results.filter(r => r.skipped).map(r => r.extId));
    }
    
    console.groupEnd();
    return results;
  }

  logFailedToggle(extensionId, targetState, error) {
    // Initialize storage for failed toggles
    if (!this.failedToggles) {
      this.failedToggles = [];
    }
    
    const failureData = {
      extensionId,
      extensionName: this.extensions[extensionId]?.name,
      targetState,
      error: error.message,
      errorCode: error.code,
      timestamp: new Date().toISOString(),
      extensionDetails: {
        ...this.extensions[extensionId],
        // Remove icon data to keep logs clean
        icons: undefined
      }
    };
    
    this.failedToggles.push(failureData);
    
    // Keep only last 50 failures
    if (this.failedToggles.length > 50) {
      this.failedToggles = this.failedToggles.slice(-50);
    }
    
    // Store in chrome.storage.local for persistence and debugging
    chrome.storage.sync.set({ failedToggles: this.failedToggles });
  }

  setGroupLoadingState(groupId, isLoading) {
    const toggleBtn = document.querySelector(`.group-toggle[data-group-id="${groupId}"]`);
    if (toggleBtn) {
      const groupDiv = toggleBtn.closest('.group');
      if (groupDiv) {
        groupDiv.classList.toggle('loading', isLoading);
        toggleBtn.disabled = isLoading;

        // Add visual loading indicator
        if (isLoading) {
          toggleBtn.classList.add('loading');
        } else {
          toggleBtn.classList.remove('loading');
        }
      }
    }
  }

  async toggleExtension(extId, enable) {
    console.log(`🔄 Toggling individual extension: ${this.extensions[extId]?.name} to ${enable ? 'enabled' : 'disabled'}`);
    
    try {
      await chrome.management.setEnabled(extId, enable);
      
      // Reload extension data to get fresh state
      await this.loadExtensions();
      
      // Verify the toggle worked
      const updatedExt = this.extensions[extId];
      if (updatedExt && updatedExt.enabled !== enable) {
        console.error(`⚠️ Toggle failed: ${updatedExt.name} is still ${updatedExt.enabled ? 'enabled' : 'disabled'}`);
      } else {
        console.log(`✅ Successfully toggled ${updatedExt?.name}`);
      }
      
      // Update only the specific extension without re-rendering everything
      this.updateExtensionState(extId);
    } catch (error) {
      console.error(`Failed to ${enable ? 'enable' : 'disable'} extension ${extId}:`, error);
      // Still update UI to reflect actual state
      await this.loadExtensions();
      this.updateExtensionState(extId);
    }
  }

  updateExtensionState(extId) {
    // Find all instances of this extension in the UI
    const toggleButtons = document.querySelectorAll(`.extension-toggle[data-extension-id="${extId}"]`);
    const ext = this.extensions[extId];
    
    toggleButtons.forEach(btn => {
      btn.classList.toggle('enabled', ext.enabled);
      btn.classList.toggle('disabled', !ext.enabled);
    });
    
    // Update group toggle states without re-rendering
    this.updateAllGroupToggleStates();
  }

  updateAllGroupToggleStates() {
    Object.values(this.groups).forEach(group => {
      this.updateGroupToggleState(group.id);
    });
  }

  updateGroupToggleState(groupId) {
    const group = this.groups[groupId];
    const toggleBtn = document.querySelector(`.group-toggle[data-group-id="${groupId}"]`);
    if (!toggleBtn || !group) return;
    
    const enabledCount = group.extensions.filter(extId => 
      this.extensions[extId] && this.extensions[extId].enabled
    ).length;
    
    // Update toggle state classes
    toggleBtn.classList.remove('enabled', 'disabled', 'mixed');
    
    if (enabledCount === 0 || group.extensions.length === 0) {
      toggleBtn.classList.add('disabled');
    } else if (enabledCount === group.extensions.length) {
      toggleBtn.classList.add('enabled');
    } else {
      toggleBtn.classList.add('mixed');
    }
    
    // Update stats text
    const statsElement = toggleBtn.closest('.group').querySelector('.group-stats');
    if (statsElement) {
      statsElement.textContent = `${enabledCount}/${group.extensions.length} extensions enabled`;
    }
  }

  getExtensionGroups(extId) {
    return Object.values(this.groups)
      .filter(group => group.extensions.includes(extId))
      .map(group => group.name);
  }

  handleSearch(query) {
    if (this.currentTab === 'search') {
      this.renderSearchResults(query);
    }
  }

  renderSearchResults(query = '') {
    const container = document.getElementById('searchResults');
    container.innerHTML = '';

    const filteredExtensions = Object.values(this.extensions).filter(ext =>
      ext.name.toLowerCase().includes(query.toLowerCase())
    );

    if (filteredExtensions.length === 0) {
      container.innerHTML = '<div class="empty-state">No extensions found</div>';
      return;
    }

    filteredExtensions.forEach(ext => {
      const groups = this.getExtensionGroups(ext.id);

      const div = document.createElement('div');
      div.className = 'extension-item';

      div.innerHTML = `
        <img src="${ext.icons && ext.icons.length > 0 ? ext.icons[0].url : 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSI+PHJlY3Qgd2lkdGg9IjE2IiBoZWlnaHQ9IjE2IiBmaWxsPSIjZGFkY2UwIi8+PC9zdmc+'}" class="extension-icon" alt="">
        <div class="extension-name">
          ${ext.name}
          ${groups.length > 0 ? `<div class="extension-groups">Groups: ${groups.join(', ')}</div>` : ''}
        </div>
        <button class="extension-toggle ${ext.enabled ? 'enabled' : 'disabled'}" data-extension-id="${ext.id}"></button>
      `;

      div.querySelector('.extension-toggle').addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const currentlyEnabled = this.extensions[ext.id].enabled;
        console.log(`Clicked toggle for ${ext.name} in search, currently ${currentlyEnabled ? 'enabled' : 'disabled'}`);
        this.toggleExtension(ext.id, !currentlyEnabled);
      });

      container.appendChild(div);
    });
  }

  toggleAccordion(groupId) {
    const extensionsDiv = document.querySelector(`.group-extensions[data-group-id="${groupId}"]`);

    if (!extensionsDiv) return;

    // Find the expand icon in the same group
    const groupDiv = extensionsDiv.closest('.group');
    const icon = groupDiv.querySelector('.group-expand-icon');

    extensionsDiv.classList.toggle('expanded');
    icon.classList.toggle('expanded');
  }

  render() {
    this.renderGroups();
    if (this.currentTab === 'search') {
      this.renderSearchResults(document.getElementById('searchInput').value);
    }
  }

  renderGroups() {
    const container = document.getElementById('groupsContent');
    const emptyState = document.getElementById('emptyState');

    const groupIds = Object.keys(this.groups);
    const hasGroups = groupIds.length > 1 || (groupIds.length === 1 && groupIds[0] !== 'always-on');

    if (!hasGroups) {
      emptyState.style.display = 'block';
      container.querySelectorAll('.group').forEach(el => el.remove());
      return;
    }

    emptyState.style.display = 'none';
    container.querySelectorAll('.group').forEach(el => el.remove());

    // Sort groups based on saved order, with Fixed group always last
    const sortedGroups = [...this.groupOrder]
      .filter(id => this.groups[id] && !this.groups[id].isDefault)
      .map(id => this.groups[id]);

    // Add Fixed group at the end
    const fixedGroup = Object.values(this.groups).find(g => g.isDefault);
    if (fixedGroup) {
      sortedGroups.push(fixedGroup);
    }

    // Add any groups not in the order (shouldn't happen, but just in case)
    Object.values(this.groups).forEach(group => {
      if (!sortedGroups.find(g => g.id === group.id)) {
        if (!group.isDefault) {
          sortedGroups.unshift(group);
        }
      }
    });

    sortedGroups.forEach(group => {
      const groupDiv = document.createElement('div');
      groupDiv.className = 'group';

      const enabledCount = group.extensions.filter(extId =>
        this.extensions[extId] && this.extensions[extId].enabled
      ).length;

      // Determine toggle state
      let toggleState = 'disabled';
      if (enabledCount === group.extensions.length && group.extensions.length > 0) {
        toggleState = 'enabled';
      } else if (enabledCount > 0) {
        toggleState = 'mixed';
      }

      groupDiv.innerHTML = `
        <div class="group-header">
          <svg class="group-expand-icon" viewBox="0 0 16 16" fill="currentColor">
            <path d="M6 12l4-4-4-4v8z"/>
          </svg>
          <div class="group-info">
            <div class="group-name">
              ${group.name}
              ${group.isDefault ? '<span class="always-on-badge">FIXED</span>' : ''}
            </div>
            <div class="group-stats">
              ${enabledCount}/${group.extensions.length} extensions enabled
            </div>
          </div>
          <button class="group-toggle ${toggleState}" data-group-id="${group.id}" title="${toggleState === 'enabled' ? 'Disable all' : 'Enable all'}"></button>
        </div>
        <div class="group-extensions" data-group-id="${group.id}"></div>
      `;

      const extensionsContainer = groupDiv.querySelector('.group-extensions');

      if (group.extensions.length === 0) {
        extensionsContainer.innerHTML = '<div style="color: #5f6368; font-size: 12px; padding: 8px 0;">No extensions in this group</div>';
      } else {
        group.extensions.forEach(extId => {
          const ext = this.extensions[extId];
          if (!ext) return;

          const extDiv = document.createElement('div');
          extDiv.className = 'extension-item';

          extDiv.innerHTML = `
            <img src="${ext.icons && ext.icons.length > 0 ? ext.icons[0].url : 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSI+PHJlY3Qgd2lkdGg9IjE2IiBoZWlnaHQ9IjE2IiBmaWxsPSIjZGFkY2UwIi8+PC9zdmc+'}" class="extension-icon" alt="">
            <div class="extension-name">${ext.name}</div>
            <button class="extension-toggle ${ext.enabled ? 'enabled' : 'disabled'}" data-extension-id="${ext.id}"></button>
          `;

          extDiv.querySelector('.extension-toggle').addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const currentlyEnabled = this.extensions[ext.id].enabled;
            console.log(`Clicked toggle for ${ext.name}, currently ${currentlyEnabled ? 'enabled' : 'disabled'}`);
            this.toggleExtension(ext.id, !currentlyEnabled);
          });

          extensionsContainer.appendChild(extDiv);
        });
      }

      // Add event listeners
      const header = groupDiv.querySelector('.group-header');
      header.addEventListener('click', (e) => {
        // Don't toggle accordion if clicking the group toggle switch
        if (e.target.closest('.group-toggle')) return;
        this.toggleAccordion(group.id);
      });

      // Add event listener for group toggle
      const toggleBtn = groupDiv.querySelector('.group-toggle');
      if (toggleBtn) {
        toggleBtn.addEventListener('click', (e) => {
          e.stopPropagation(); // Prevent accordion toggle
          // If mixed state (some enabled), disable all. Otherwise toggle normally.
          const shouldEnable = toggleState === 'disabled';
          this.toggleGroup(group.id, shouldEnable);
        });
      }

      container.appendChild(groupDiv);
    });
  }
}

// Initialize the extension organizer
document.addEventListener('DOMContentLoaded', () => {
  new ExtensionOrganizer();
});