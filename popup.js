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
    
    // Log summary
    console.log('📊 Initialization complete:', {
      extensionsLoaded: Object.keys(this.extensions).length,
      groupsLoaded: Object.keys(this.groups).length,
      totalExtensionsInGroups: Object.values(this.groups).reduce((sum, g) => sum + g.extensions.length, 0)
    });
  }

  async checkFailureHistory() {
    try {
      const result = await chrome.storage.local.get(['failedToggles']);
      if (result.failedToggles && result.failedToggles.length > 0) {
        console.warn('🚨 Previous toggle failures detected:', result.failedToggles.length);
        console.log('To analyze failures, run: chrome.storage.local.get(["failedToggles"], (r) => console.table(r.failedToggles))');
      }
    } catch (error) {
      console.error('Failed to check failure history:', error);
    }
  }

  async loadData() {
    try {
      const result = await chrome.storage.local.get(['groups', 'groupOrder']);
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
    } catch (error) {
      console.error('Failed to load data:', error);
      this.groups = {
        'always-on': {
          id: 'always-on',
          name: 'Fixed',
          extensions: [],
          isDefault: true
        }
      };
      this.groupOrder = ['always-on'];
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
    
    // Safety check - if no extensions loaded, don't clean up
    if (validExtensionIds.size === 0) {
      console.warn('⚠️ No extensions loaded - skipping cleanup to prevent data loss');
      return;
    }
    
    console.log(`🧹 Checking for orphaned extensions (${validExtensionIds.size} valid extensions found)...`);
    
    // Check each group for orphaned extensions
    for (const [groupId, group] of Object.entries(this.groups)) {
      const originalLength = group.extensions.length;
      const beforeExtensions = [...group.extensions]; // Keep track of what we're removing
      
      // Filter out extensions that no longer exist
      group.extensions = group.extensions.filter(extId => {
        const exists = validExtensionIds.has(extId);
        if (!exists) {
          console.warn(`Removing orphaned extension ${extId} from group "${group.name}"`);
        }
        return exists;
      });
      
      if (group.extensions.length !== originalLength) {
        hasChanges = true;
        const removed = beforeExtensions.filter(id => !group.extensions.includes(id));
        console.log(`Cleaned ${removed.length} orphaned extension(s) from group "${group.name}":`, removed);
      }
    }
    
    // Save changes if any orphaned extensions were removed
    if (hasChanges) {
      await this.saveData();
      console.log('✅ Orphaned extensions cleanup complete');
    } else {
      console.log('✅ No orphaned extensions found');
    }
  }

  async loadExtensions() {
    try {
      const extensions = await chrome.management.getAll();
      this.extensions = {};

      extensions.forEach(ext => {
        if (ext.type === 'extension' && ext.id !== chrome.runtime.id) {
          this.extensions[ext.id] = ext;
        }
      });
      
      // Verify we loaded extensions
      if (Object.keys(this.extensions).length === 0) {
        console.error('⚠️ WARNING: No extensions were loaded!');
        // Try once more
        console.log('🔄 Retrying extension load...');
        const retryExtensions = await chrome.management.getAll();
        retryExtensions.forEach(ext => {
          if (ext.type === 'extension' && ext.id !== chrome.runtime.id) {
            this.extensions[ext.id] = ext;
          }
        });
      }
    } catch (error) {
      console.error('Failed to load extensions:', error);
      // Set a flag to prevent cleanup
      this.extensionLoadError = true;
    }
  }

  async saveData() {
    try {
      await chrome.storage.local.set({ groups: this.groups });
    } catch (error) {
      console.error('Failed to save data:', error);
    }
  }

  async saveGroupOrder() {
    try {
      await chrome.storage.local.set({ groupOrder: this.groupOrder });
    } catch (error) {
      console.error('Failed to save group order:', error);
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
    
    // Show failed toggles
    const failedResult = await chrome.storage.local.get(['failedToggles']);
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
    
    console.log('\n📝 To clear failed toggle history, run:');
    console.log('chrome.storage.local.remove(["failedToggles"])');
    console.log('\n🧹 To manually clean orphaned extensions, run:');
    console.log('await window.organizer.cleanupOrphanedExtensions()');
    console.log('\n💾 To backup your groups, run:');
    console.log('copy(JSON.stringify(window.organizer.groups))');
    console.log('\n🔄 To restore groups from backup, run:');
    console.log('window.organizer.restoreGroups(YOUR_BACKUP_JSON)');
    
    console.groupEnd();
    
    // Make organizer available for debugging
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
    chrome.storage.local.set({ failedToggles: this.failedToggles });
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
    const expandIcon = document.querySelector(`.group [data-group-id="${groupId}"] .group-expand-icon`);

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