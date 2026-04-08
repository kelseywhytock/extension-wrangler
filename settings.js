const _DEBUG = window.ExtWranglerShared?.DEBUG ?? false;

class ExtensionWranglerSettings {
  constructor() {
    this.groups = {};
    this.extensions = {};
    this.editingGroupId = null;
    this.currentTab = 'groups';
    this.groupOrder = [];
    this.draggedGroupId = null;
    this.init();
  }

  async init() {
    console.log('🚀 Initializing Extension Wrangler Settings...');

    try {
      await this.loadExtensions();
      await this.loadData();
      this.setupEventListeners();
      this.render();

      // Check if Chrome Sync is actually operational
      if (window.webStoreUtils) {
        const syncStatus = await window.webStoreUtils.checkSyncStatus();
        this.updateSyncStatusCard(syncStatus.operational);
        if (!syncStatus.operational) {
          this.showSyncWarning();
        }
      }

      console.log('✅ Settings initialization complete');
    } catch (error) {
      console.error('❌ Settings initialization failed:', error);
      // Still try to set up basic event listeners
      try {
        this.setupEventListeners();
      } catch (setupError) {
        console.error('❌ Event listener setup failed:', setupError);
      }
    }
  }

  async migrateFromLocalStorage() {
    return window.ExtWranglerShared.migrateFromLocalStorage((msg, type) => this.showNotification(msg, type));
  }

  async loadData() {
    try {
      // First, try to migrate from local storage to sync storage
      await this.migrateFromLocalStorage();

      const result = await chrome.storage.sync.get(['groups', 'groupOrder']);
      this.groups = result.groups || {};
      this.groupOrder = result.groupOrder || [];

      // Ensure "Always On" group exists
      if (!this.groups[window.ExtWranglerShared.ALWAYS_ON_GROUP_ID]) {
        this.groups[window.ExtWranglerShared.ALWAYS_ON_GROUP_ID] = {
          id: window.ExtWranglerShared.ALWAYS_ON_GROUP_ID,
          name: 'Always On',
          extensions: [],
          isDefault: true
        };
        await this.saveData();
      }

      // Repair groupOrder if it's missing or doesn't include all groups.
      // This can happen when groups and groupOrder are saved separately and one
      // write fails, or after a migration that only partially synced.
      const allGroupIds = Object.keys(this.groups);
      const missingFromOrder = allGroupIds.filter(id => !this.groupOrder.includes(id));
      if (this.groupOrder.length === 0 || missingFromOrder.length > 0) {
        if (missingFromOrder.length > 0) {
          console.warn('[Sync Fix] groupOrder missing entries, repairing:', missingFromOrder);
        }
        // Preserve existing order for known groups, append any missing ones before Always On
        const fixedId = allGroupIds.find(id => this.groups[id]?.isDefault);
        const ordered = this.groupOrder.filter(id => allGroupIds.includes(id) && id !== fixedId);
        missingFromOrder.filter(id => id !== fixedId).forEach(id => ordered.push(id));
        if (fixedId) ordered.push(fixedId);
        this.groupOrder = ordered;
        await this.saveGroupOrder();
        if (_DEBUG) { console.log('[Sync Fix] groupOrder repaired:', this.groupOrder); }
      }

      // Clean up orphaned extensions after loading all data
      await this.cleanupOrphanedExtensions();
    } catch (error) {
      console.error('Failed to load data:', error);
      this.showNotification('Failed to load groups', 'error');
    }
  }

  async loadExtensions() {
    return window.ExtWranglerShared.loadExtensions(this);
  }

  async cleanupOrphanedExtensions() {
    return window.ExtWranglerShared.cleanupOrphanedExtensions(
      this,
      (removed) => this.showRemovedExtensionsNotification(removed)
    );
  }

  async getCachedExtensionName(extensionId) {
    return window.ExtWranglerShared.getCachedExtensionName(extensionId);
  }

  async cacheExtensionNames() {
    return window.ExtWranglerShared.cacheExtensionNames(this);
  }

  async getCachedRemovedExtensions() {
    return window.ExtWranglerShared.getNameCache();
  }

  async trackRemovedExtensions(removedExtensions) {
    return window.ExtWranglerShared.trackRemovedExtensions(removedExtensions);
  }

  showRemovedExtensionsNotification(removedExtensions) {
    const count = removedExtensions.length;
    const extensionNames = removedExtensions.slice(0, 3).map(ext => ext.name).join(', ');
    const moreText = count > 3 ? ` and ${count - 3} more` : '';

    let message;
    if (count === 1) {
      message = `Removed "${extensionNames}" from groups (extension was uninstalled)`;
    } else {
      message = `Cleaned up ${count} uninstalled extensions: ${extensionNames}${moreText}`;
    }

    this.showNotification(message, 'success');

    // Also log detailed information
    console.group('🗑️ Extensions Removed from Groups');
    removedExtensions.forEach(ext => {
      console.log(`• "${ext.name}" removed from "${ext.groupName}"`);
    });
    console.groupEnd();
  }

  async saveData() {
    try {
      // Always write groups and groupOrder together so they never diverge
      // if one write fails and the other succeeds.
      await chrome.storage.sync.set({ groups: this.groups, groupOrder: this.groupOrder });
    } catch (error) {
      console.error('Failed to save data:', error);
      this.showNotification('Failed to save changes', 'error');
      throw error;
    }
  }

  async saveGroupOrder() {
    try {
      // Always write groups and groupOrder together so they never diverge.
      await chrome.storage.sync.set({ groups: this.groups, groupOrder: this.groupOrder });
    } catch (error) {
      console.error('Failed to save group order:', error);
      throw error;
    }
  }

  setupEventListeners() {
    // Create group button
    document.getElementById('createGroupBtn').addEventListener('click', () => {
      this.showGroupModal();
    });

    // Tab switching
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        this.switchTab(tab.dataset.tab);
      });
    });

    // Refresh button
    document.getElementById('refreshBtn').addEventListener('click', async () => {
      await this.loadExtensions();
      this.render();
      this.showNotification('Extensions refreshed', 'success');
    });

    // Refresh extensions button (in Extension List tab)
    document.getElementById('refreshExtensionsBtn').addEventListener('click', async () => {
      await this.loadExtensions();
      this.render();
      this.showNotification('Extensions refreshed', 'success');
    });

    // Modal buttons
    document.getElementById('saveBtn').addEventListener('click', () => {
      this.saveGroup();
    });

    document.getElementById('cancelBtn').addEventListener('click', () => {
      this.hideGroupModal();
    });

    document.getElementById('deleteGroupBtn').addEventListener('click', () => {
      if (this.editingGroupId) {
        this.hideGroupModal();
        this.deleteGroup(this.editingGroupId);
      }
    });

    // Search
    document.getElementById('searchInput').addEventListener('input', (e) => {
      this.handleSearch(e.target.value);
    });

    // Extension search in modal
    // Note: This will be attached dynamically when modal opens

    // Extension search in Extension List tab
    document.getElementById('extensionSearchInput').addEventListener('input', (e) => {
      this.filterExtensionsInList(e.target.value);
    });

    // Quick actions
    document.getElementById('enableAllBtn').addEventListener('click', () => {
      this.enableAllExtensions();
    });

    document.getElementById('disableAllBtn').addEventListener('click', () => {
      this.disableAllExtensions();
    });

    document.getElementById('exportBtn').addEventListener('click', () => {
      this.exportGroups();
    });

    document.getElementById('importBtn').addEventListener('click', () => {
      document.getElementById('fileInput').click();
    });

    document.getElementById('fileInput').addEventListener('change', (e) => {
      this.importGroups(e.target.files[0]);
    });

    document.getElementById('clearHistoryBtn').addEventListener('click', () => {
      this.clearRemovedExtensionsHistory();
    });

    // Get Started button in empty state
    document.getElementById('getStartedBtn').addEventListener('click', () => {
      this.showGroupModal();
    });

    // Close modal on backdrop click
    document.getElementById('groupModal').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) {
        this.hideGroupModal();
      }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.hideGroupModal();
      }
    });

    // Close group dropdowns when clicking outside
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.group-dropdown')) {
        document.querySelectorAll('.group-dropdown-content').forEach(d => d.classList.remove('show'));
      }
    });
  }

  switchTab(tabName) {
    this.currentTab = tabName;

    // Update tab appearance
    document.querySelectorAll('.tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.tab === tabName);
    });

    // Show/hide content
    document.getElementById('groupsContainer').classList.toggle('hidden', tabName !== 'groups');
    document.getElementById('extensionsContainer').classList.toggle('hidden', tabName !== 'extensions');

    if (tabName === 'extensions') {
      this.renderAllExtensions();
    }
  }

  showGroupModal(groupId = null) {
    this.editingGroupId = groupId;
    const modal = document.getElementById('groupModal');
    const title = document.getElementById('modalTitle');
    const nameInput = document.getElementById('groupNameInput');
    const deleteBtn = document.getElementById('deleteGroupBtn');
    const saveBtn = document.getElementById('saveBtn');

    if (groupId) {
      title.textContent = 'Edit Group';
      nameInput.value = this.groups[groupId].name;
      this.renderExtensionsListForModal(this.groups[groupId].extensions);
      // Show delete button for non-default groups
      if (!this.groups[groupId].isDefault) {
        deleteBtn.style.display = 'inline-block';
      } else {
        deleteBtn.style.display = 'none';
      }
      saveBtn.textContent = 'Save Changes';
    } else {
      title.textContent = 'Create New Group';
      nameInput.value = '';
      this.renderExtensionsListForModal([]);
      deleteBtn.style.display = 'none';
      saveBtn.textContent = 'Save Group';
    }

    const modalSearchInput = document.getElementById('modalExtensionSearchInput');
    if (modalSearchInput) {
      modalSearchInput.value = '';
    }

    modal.style.display = 'block';
    nameInput.focus();

    // Attach search event listener immediately
    this.attachModalSearchListener();
  }

  attachModalSearchListener() {
    const modalSearchInput = document.getElementById('modalExtensionSearchInput');
    if (modalSearchInput) {
      // Remove existing listener to prevent duplicates
      modalSearchInput.removeEventListener('input', this.modalSearchHandler);

      // Create bound handler
      this.modalSearchHandler = (e) => {
        this.filterExtensionsInModal(e.target.value);
      };

      // Add new listener
      modalSearchInput.addEventListener('input', this.modalSearchHandler);
    }
  }

  hideGroupModal() {
    document.getElementById('groupModal').style.display = 'none';
    this.editingGroupId = null;
  }

  async saveGroup() {
    const name = document.getElementById('groupNameInput').value.trim();
    if (!name) {
      this.showNotification('Group name is required', 'error');
      return;
    }

    const selectedExtensions = Array.from(document.querySelectorAll('#extensionsList .checkbox:checked'))
      .map(cb => cb.dataset.extensionId);

    if (this.editingGroupId) {
      // Edit existing group
      this.groups[this.editingGroupId].name = name;
      this.groups[this.editingGroupId].extensions = selectedExtensions;
      this.showNotification('Group updated successfully', 'success');
    } else {
      // Create new group
      const id = 'group-' + Date.now();
      this.groups[id] = {
        id,
        name,
        extensions: selectedExtensions,
        isDefault: false
      };

      // Add to group order (at the beginning, before Always On group)
      this.groupOrder.unshift(id);
      await this.saveGroupOrder();
      this.showNotification('Group created successfully', 'success');
    }

    await this.saveData();
    this.hideGroupModal();
    this.render();
  }

  async deleteGroup(groupId) {
    if (this.groups[groupId].isDefault) {
      this.showNotification('Cannot delete the Always On group', 'error');
      return;
    }

    if (confirm(`Are you sure you want to delete the group "${this.groups[groupId].name}"?`)) {
      delete this.groups[groupId];
      this.groupOrder = this.groupOrder.filter(id => id !== groupId);
      await this.saveData();
      await this.saveGroupOrder();
      this.render();
      this.showNotification('Group deleted successfully', 'success');
    }
  }

  async toggleGroup(groupId, enable) {
    const group = this.groups[groupId];
    if (!group) return;

    let successCount = 0;
    let totalCount = group.extensions.length;

    const promises = group.extensions.map(async (extId) => {
      try {
        await chrome.management.setEnabled(extId, enable);
        successCount++;
      } catch (error) {
        console.error(`Failed to ${enable ? 'enable' : 'disable'} extension ${extId}:`, error);
      }
    });

    await Promise.all(promises);
    await this.loadExtensions();
    this.render();

    const action = enable ? 'enabled' : 'disabled';
    this.showNotification(`${successCount}/${totalCount} extensions ${action}`, 'success');
  }

  async toggleExtension(extId, enable) {
    try {
      await chrome.management.setEnabled(extId, enable);
      await this.loadExtensions();
      this.render();

      const extension = this.extensions[extId];
      const action = enable ? 'enabled' : 'disabled';
      this.showNotification(`${extension.name} ${action}`, 'success');
    } catch (error) {
      console.error(`Failed to ${enable ? 'enable' : 'disable'} extension ${extId}:`, error);
      this.showNotification('Failed to toggle extension', 'error');
    }
  }

  async enableAllExtensions() {
    if (!confirm(`Enable all ${Object.keys(this.extensions).length} extensions? This will turn on every extension across all groups.`)) return;

    let successCount = 0;
    const extensionIds = Object.keys(this.extensions);

    for (const extId of extensionIds) {
      try {
        await chrome.management.setEnabled(extId, true);
        successCount++;
      } catch (error) {
        console.error(`Failed to enable extension ${extId}:`, error);
      }
    }

    await this.loadExtensions();
    this.render();
    this.showNotification(`${successCount}/${extensionIds.length} extensions enabled`, 'success');
  }

  async disableAllExtensions() {
    if (!confirm(`Disable all ${Object.keys(this.extensions).length} extensions? This includes Extension Wrangler itself — you will need to re-enable it manually from chrome://extensions.`)) return;

    let successCount = 0;
    const extensionIds = Object.keys(this.extensions);

    for (const extId of extensionIds) {
      try {
        await chrome.management.setEnabled(extId, false);
        successCount++;
      } catch (error) {
        console.error(`Failed to disable extension ${extId}:`, error);
      }
    }

    await this.loadExtensions();
    this.render();
    this.showNotification(`${successCount}/${extensionIds.length} extensions disabled`, 'success');
  }

  exportGroups() {
    const data = {
      groups: this.groups,
      exportDate: new Date().toISOString(),
      version: '1.0'
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'extension-wrangler-groups.json';
    a.click();
    URL.revokeObjectURL(url);

    this.showNotification('Groups exported successfully', 'success');
  }

  async importGroups(file) {
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (!data.groups || typeof data.groups !== 'object') {
        throw new Error('Invalid file format');
      }

      if (confirm('This will overwrite your existing groups. Are you sure?')) {
        this.groups = data.groups;
        // Rebuild groupOrder from imported data — exported JSON may or may not include it
        if (Array.isArray(data.groupOrder) && data.groupOrder.length > 0) {
          this.groupOrder = data.groupOrder.filter(id => this.groups[id]);
        } else {
          const fixedId = Object.keys(this.groups).find(id => this.groups[id]?.isDefault);
          const others = Object.keys(this.groups).filter(id => !this.groups[id]?.isDefault);
          this.groupOrder = fixedId ? [...others, fixedId] : [...others];
        }
        await this.saveData();
        this.render();
        this.showNotification('Groups imported successfully', 'success');
      }
    } catch (error) {
      console.error('Failed to import groups:', error);
      this.showNotification('Failed to import groups', 'error');
    }
  }

  updateSelectionCount() {
    const total = document.querySelectorAll('#extensionsList .checkbox').length;
    const selected = document.querySelectorAll('#extensionsList .checkbox:checked').length;
    const counter = document.getElementById('selectionCount');
    if (counter) {
      counter.textContent = selected > 0 ? `${selected} of ${total} selected` : `${total} extensions`;
    }
  }

  renderExtensionsListForModal(selectedExtensions = []) {
    const container = document.getElementById('extensionsList');
    container.innerHTML = '';

    Object.values(this.extensions).forEach(ext => {
      const div = document.createElement('div');
      div.className = 'checkbox-item';
      div.dataset.extensionName = ext.name.toLowerCase();

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'checkbox';
      checkbox.dataset.extensionId = ext.id;
      checkbox.checked = selectedExtensions.includes(ext.id);
      checkbox.addEventListener('change', () => this.updateSelectionCount());

      const label = document.createElement('label');
      label.className = 'checkbox-label';

      const iconSrc = ext.icons && ext.icons.length > 0
        ? (ext.icons.find(icon => icon.size === 16)?.url || ext.icons[0].url)
        : 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSI+PHJlY3Qgd2lkdGg9IjE2IiBoZWlnaHQ9IjE2IiBmaWxsPSIjZGFkY2UwIi8+PC9zdmc+';
      const img = document.createElement('img');
      img.src = iconSrc;
      img.width = 16;
      img.height = 16;
      img.className = 'extension-icon';
      img.alt = '';

      const nameSpan = document.createElement('span');
      nameSpan.textContent = ext.name;

      label.appendChild(img);
      label.appendChild(nameSpan);

      label.addEventListener('click', () => {
        checkbox.checked = !checkbox.checked;
        this.updateSelectionCount();
      });

      div.appendChild(checkbox);
      div.appendChild(label);
      container.appendChild(div);
    });

    this.updateSelectionCount();
  }

  filterExtensionsInModal(query) {
    const containers = document.querySelectorAll('#extensionsList .checkbox-item');
    const lowerQuery = query.toLowerCase();
    let anyVisible = false;

    containers.forEach(container => {
      const extensionName = container.dataset.extensionName;
      const matches = extensionName.includes(lowerQuery);
      container.style.display = matches ? 'flex' : 'none';
      if (matches) anyVisible = true;
    });

    const emptyMsg = document.getElementById('extensionsEmptySearch');
    if (emptyMsg) emptyMsg.style.display = anyVisible || !lowerQuery ? 'none' : 'block';
  }

  renderAllExtensions() {
    const container = document.getElementById('allExtensionsList');
    container.innerHTML = '';

    Object.values(this.extensions).forEach(ext => {
      const groups = this.getExtensionGroups(ext.id);
      const isAlwaysEnabled = groups.includes('Always On');

      const div = document.createElement('div');
      div.className = 'extension-card';
      div.dataset.extensionName = ext.name.toLowerCase();

      div.innerHTML = `
        <div class="extension-header">
          <img src="${ext.icons && ext.icons.length > 0 ? ext.icons.find(icon => icon.size === 16)?.url || ext.icons[0].url : 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSI+PHJlY3Qgd2lkdGg9IjE2IiBoZWlnaHQ9IjE2IiBmaWxsPSIjZGFkY2UwIi8+PC9zdmc+'}" class="extension-icon" alt="">
          <div class="extension-name">${ext.name}</div>
        </div>
        ${groups.length > 0 ? `
          <div class="group-indicator">
            <div class="group-dot ${isAlwaysEnabled ? 'always-enabled' : ''}"></div>
            <span class="group-text">${groups.join(', ')}</span>
          </div>
        ` : `
          <div class="group-dropdown">
            <button class="group-dropdown-button" data-extension-id="${ext.id}">
              Add to Group
              <svg width="10" height="10" viewBox="0 0 12 12" fill="currentColor">
                <path d="M6 9l3-3-3-3v6z"/>
              </svg>
            </button>
            <div class="group-dropdown-content" data-extension-id="${ext.id}">
              ${this.renderGroupDropdownItems(ext.id)}
            </div>
          </div>
        `}
        <button class="extension-toggle ${ext.enabled ? 'enabled' : 'disabled'}" data-extension-id="${ext.id}"></button>
      `;

      // Add event listeners
      div.querySelector('.extension-toggle').addEventListener('click', () => {
        this.toggleExtension(ext.id, !ext.enabled);
      });

      const dropdownBtn = div.querySelector('.group-dropdown-button');
      if (dropdownBtn) {
        dropdownBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.toggleGroupDropdown(ext.id);
        });
      }

      container.appendChild(div);
    });

  }

  renderGroupDropdownItems(extId) {
    const availableGroups = Object.values(this.groups).filter(group =>
      !group.extensions.includes(extId)
    );

    if (availableGroups.length === 0) {
      return '<div class="group-dropdown-item" style="color: #5f6368;">No groups available</div>';
    }

    return availableGroups.map(group => `
      <div class="group-dropdown-item" data-group-id="${group.id}" data-extension-id="${extId}">
        ${group.name}
        ${group.isDefault ? '<span style="color: #34a853; font-size: 11px;">(Always On)</span>' : ''}
      </div>
    `).join('');
  }

  toggleGroupDropdown(extId) {
    // Close all other dropdowns first
    document.querySelectorAll('.group-dropdown-content').forEach(dropdown => {
      if (dropdown.dataset.extensionId !== extId) {
        dropdown.classList.remove('show');
      }
    });

    // Toggle current dropdown
    const dropdown = document.querySelector(`.group-dropdown-content[data-extension-id="${extId}"]`);
    dropdown.classList.toggle('show');

    // Add event listeners to dropdown items
    dropdown.querySelectorAll('.group-dropdown-item[data-group-id]').forEach(item => {
      item.addEventListener('click', () => {
        const groupId = item.dataset.groupId;
        this.addExtensionToGroup(extId, groupId);
        dropdown.classList.remove('show');
      });
    });
  }

  filterExtensionsInList(query) {
    const extensions = document.querySelectorAll('#allExtensionsList .extension-card');
    const lowerQuery = query.toLowerCase();

    extensions.forEach(extensionCard => {
      const extensionName = extensionCard.dataset.extensionName;
      const matches = extensionName.includes(lowerQuery);
      extensionCard.style.display = matches ? 'flex' : 'none';
    });
  }

  async addExtensionToGroup(extId, groupId) {
    if (!this.groups[groupId].extensions.includes(extId)) {
      this.groups[groupId].extensions.push(extId);
      await this.saveData();
      this.render();
      this.showNotification('Extension added to group', 'success');
    }
  }

  getExtensionGroups(extId) {
    return window.ExtWranglerShared.getExtensionGroups(this.groups, extId);
  }

  handleSearch(query) {
    const groups = document.querySelectorAll('.group-card');
    const lowerQuery = query.toLowerCase();

    groups.forEach(groupCard => {
      const groupName = groupCard.querySelector('.group-name').textContent.toLowerCase();
      const extensionNames = Array.from(groupCard.querySelectorAll('.extension-name'))
        .map(el => el.textContent.toLowerCase());

      const matches = groupName.includes(lowerQuery) ||
                     extensionNames.some(name => name.includes(lowerQuery));

      groupCard.style.display = matches ? 'block' : 'none';
    });
  }

  toggleAccordion(groupId) {
    const contentDiv = document.querySelector(`.group-content[data-group-id="${groupId}"]`);
    const expandIcon = document.querySelector(`.group-header[data-group-id="${groupId}"] .group-expand-icon`);

    if (!contentDiv || !expandIcon) return;

    contentDiv.classList.toggle('expanded');
    expandIcon.classList.toggle('expanded');
  }

  async reorderGroups(draggedId, targetId) {
    // Enhanced debugging for drag and drop issues
    if (_DEBUG) {
      console.log(`[Drag Debug] Attempting reorder:`, {
        draggedId,
        targetId,
        draggedGroupExists: !!this.groups[draggedId],
        targetGroupExists: !!this.groups[targetId],
        draggedIsDefault: this.groups[draggedId]?.isDefault,
        currentGroupOrder: this.groupOrder,
        timestamp: new Date().toISOString()
      });
    }

    // Don't allow dragging the Always On group
    if (this.groups[draggedId]?.isDefault) {
      if (_DEBUG) { console.log('Cannot drag the Always On group'); }
      return;
    }

    // Validate inputs more thoroughly
    if (!draggedId || !targetId) {
      console.error('[Drag Debug] Missing draggedId or targetId:', { draggedId, targetId });
      return;
    }

    if (!this.groups[draggedId]) {
      console.error('[Drag Debug] Dragged group not found:', draggedId);
      return;
    }

    if (!this.groups[targetId]) {
      console.error('[Drag Debug] Target group not found:', targetId);
      return;
    }

    const draggedIndex = this.groupOrder.indexOf(draggedId);

    if (draggedIndex === -1) {
      console.error('[Drag Debug] Dragged group not found in group order:', {
        draggedId,
        groupOrder: this.groupOrder,
        availableGroups: Object.keys(this.groups)
      });
      return;
    }

    if (draggedId === targetId) {
      if (_DEBUG) { console.log('[Drag Debug] Cannot drop group on itself'); }
      return;
    }

    if (_DEBUG) {
      console.log(`[Drag Debug] Valid reorder operation: moving ${this.groups[draggedId]?.name} (${draggedId})`);
      console.log('[Drag Debug] Current order before:', this.groupOrder);
    }

    // Create a new array to avoid mutation issues
    let newOrder = [...this.groupOrder];

    // Remove dragged item from current position
    newOrder.splice(draggedIndex, 1);

    // Determine where to insert the dragged item
    let insertIndex;

    if (this.groups[targetId]?.isDefault) {
      // If dropping on Always On group, insert at the end (before Always On group)
      insertIndex = newOrder.length;
      if (_DEBUG) { console.log('Dropping before Always On group at end'); }
    } else {
      // Find the target's new position after removal and insert before it
      const targetIndex = newOrder.indexOf(targetId);
      insertIndex = targetIndex;
      if (_DEBUG) { console.log(`Inserting before ${this.groups[targetId]?.name} at index ${insertIndex}`); }
    }

    // Insert dragged item at new position
    newOrder.splice(insertIndex, 0, draggedId);

    this.groupOrder = newOrder;
    if (_DEBUG) { console.log('New group order after:', this.groupOrder); }

    await this.saveGroupOrder();
    this.showNotification('Group order updated', 'success');

    // Move DOM nodes in-place rather than calling render(), which would destroy
    // and recreate all cards — wiping draggable attributes and event listeners
    // in packaged extension context.
    const container = document.getElementById('groupsList');
    if (container) {
      const cards = [...container.querySelectorAll('.group-card')];
      // Build a map of groupId → card element using the data-group-id on the header
      const cardMap = {};
      cards.forEach(card => {
        const header = card.querySelector('[data-group-id]');
        if (header) cardMap[header.dataset.groupId] = card;
      });
      // Re-append in the new order (Always On group card stays last)
      newOrder.forEach(id => {
        if (cardMap[id] && !this.groups[id]?.isDefault) container.appendChild(cardMap[id]);
      });
      // Always On group card goes last
      const fixedCard = cards.find(card => {
        const header = card.querySelector('[data-group-id]');
        return header && this.groups[header.dataset.groupId]?.isDefault;
      });
      if (fixedCard) container.appendChild(fixedCard);
    } else {
      // Fallback: full re-render if container not found
      this.render();
    }
  }

  updateSyncStatusCard(operational) {
    const card = document.getElementById('syncStatusCard');
    const title = document.getElementById('syncStatusTitle');
    const body = document.getElementById('syncStatusBody');
    if (!card || !title || !body) return;

    if (operational) {
      card.style.background = '#e8f0fe';
      card.style.borderColor = '#4285f4';
      title.style.color = '#1558d6';
      title.textContent = 'Your groups sync across devices!';
      body.textContent = 'Settings are automatically synchronized with your Chrome profile and available on all your devices.';
    } else {
      card.style.background = '#fef7e0';
      card.style.borderColor = '#f9ab00';
      title.style.color = '#7a5900';
      title.textContent = 'Sync is currently unavailable';
      body.textContent = 'Sign into Chrome with the same Google account on all devices and enable Sync > Extensions to sync your groups.';
    }
  }

  showSyncWarning() {
    if (document.getElementById('syncWarningBanner')) return;

    const banner = document.createElement('div');
    banner.id = 'syncWarningBanner';
    banner.style.cssText = [
      'background:#fef7e0',
      'border:1px solid #f9ab00',
      'border-radius:6px',
      'padding:12px 16px',
      'margin:0 0 16px 0',
      'font-size:13px',
      'color:#7a5900',
      'display:flex',
      'align-items:flex-start',
      'gap:10px'
    ].join(';');

    const icon = document.createElement('span');
    icon.style.cssText = 'font-size:18px;line-height:1.2';
    icon.textContent = '\u26A0\uFE0F';

    const textWrap = document.createElement('span');

    const strong = document.createElement('strong');
    strong.textContent = 'Chrome Sync is unavailable.';

    const link = document.createElement('a');
    link.href = '#';
    link.style.color = '#1558d6';
    link.textContent = 'Chrome settings';
    link.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: 'chrome://settings/syncSetup' });
    });

    textWrap.appendChild(strong);
    textWrap.appendChild(document.createTextNode(' Your groups are saved locally on this device only. To sync across all devices, make sure you are signed into Chrome with the same Google account and that Sync > Extensions is enabled in '));
    textWrap.appendChild(link);
    textWrap.appendChild(document.createTextNode('.'));

    banner.appendChild(icon);
    banner.appendChild(textWrap);

    const mainContent = document.querySelector('.main-content') || document.body;
    mainContent.insertBefore(banner, mainContent.firstChild);
  }

  showNotification(message, type = 'success') {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.className = `notification ${type}`;
    notification.classList.add('show');

    setTimeout(() => {
      notification.classList.remove('show');
    }, window.ExtWranglerShared.TOAST_DURATION_MS);
  }

  updateSummary() {
    const totalExtensions = Object.keys(this.extensions).length;
    const enabledExtensions = Object.values(this.extensions).filter(ext => ext.enabled).length;
    const disabledExtensions = totalExtensions - enabledExtensions;

    document.getElementById('totalExtensions').textContent = `${totalExtensions} Total Extensions`;
    document.getElementById('enabledExtensions').textContent = `${enabledExtensions} Enabled`;
    document.getElementById('disabledExtensions').textContent = `${disabledExtensions} Disabled`;
  }

  render() {
    if (this.currentTab === 'groups') {
      this.renderGroups();
    } else if (this.currentTab === 'extensions') {
      this.renderAllExtensions();
    }
    this.updateSummary();
    this.renderRemovedExtensionsHistory();

    // Debug: Check if drag handles are rendered
    if (_DEBUG) {
      setTimeout(() => {
        const dragHandles = document.querySelectorAll('.drag-handle');
        const draggableCards = document.querySelectorAll('.group-card[draggable="true"]');
        const allGroupCards = document.querySelectorAll('.group-card');
        console.log(`🔍 Debug: Found ${dragHandles.length} drag handles, ${draggableCards.length} draggable cards, ${allGroupCards.length} total cards`);

        // Check each card
        allGroupCards.forEach((card, index) => {
          const isDraggable = card.getAttribute('draggable') === 'true';
          console.log(`  Card ${index}: draggable=${isDraggable}, classes=${card.className}`);
        });

        // Basic drag functionality check
        if (draggableCards.length > 0) {
          console.log(`✅ ${draggableCards.length} groups ready for drag-and-drop`);
        }
      }, 200);
    }
  }

  renderGroups() {
    const container = document.getElementById('groupsList');
    const emptyState = document.getElementById('emptyState');

    const groupIds = Object.keys(this.groups);

    // Always show groups container if we have the Always On group
    if (groupIds.length === 0) {
      emptyState.style.display = 'block';
      container.querySelectorAll('.group-card').forEach(el => el.remove());
      return;
    }

    emptyState.style.display = 'none';
    container.querySelectorAll('.group-card').forEach(el => el.remove());

    // Sort groups based on saved order, with Always On group always last
    const sortedGroups = [...this.groupOrder]
      .filter(id => this.groups[id] && !this.groups[id].isDefault)
      .map(id => this.groups[id]);

    // Add Always On group at the end
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
      const groupCard = document.createElement('div');
      groupCard.className = 'group-card';

      const enabledCount = group.extensions.filter(extId =>
        this.extensions[extId] && this.extensions[extId].enabled
      ).length;
      const disabledCount = group.extensions.length - enabledCount;

      // Determine toggle state
      let toggleState = 'disabled';
      if (enabledCount === group.extensions.length && group.extensions.length > 0) {
        toggleState = 'enabled';
      } else if (enabledCount > 0) {
        toggleState = 'mixed';
      }

      groupCard.innerHTML = `
        <div class="group-header" data-group-id="${group.id}">
          ${!group.isDefault ? '<svg class="drag-handle" viewBox="0 0 16 16" fill="currentColor"><path d="M2 5.5a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zM6.5 5.5a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zM2 10.5a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zM6.5 10.5a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0z"/></svg>' : ''}
          <svg class="group-expand-icon" viewBox="0 0 16 16" fill="currentColor">
            <path d="M6 12l4-4-4-4v8z"/>
          </svg>
          <div class="group-name">
            ${group.name}
            ${group.isDefault ? '<span class="always-on-badge">ALWAYS ON</span>' : ''}
          </div>
          <div class="group-actions">
            <button class="group-toggle ${toggleState}" data-group-id="${group.id}" title="${toggleState === 'enabled' ? 'Disable all' : 'Enable all'}"></button>
            <button class="btn btn-secondary btn-small" data-action="edit" data-group-id="${group.id}">Edit</button>
            ${!group.isDefault ? `<button class="btn btn-danger btn-small" data-action="delete" data-group-id="${group.id}">Delete</button>` : ''}
          </div>
        </div>

        <div class="group-content" data-group-id="${group.id}">
          <div class="group-stats">
            <div class="stat">
              <div class="stat-icon stat-total"></div>
              <span>${group.extensions.length} Extensions</span>
            </div>
            <div class="stat">
              <div class="stat-icon stat-enabled"></div>
              <span>${enabledCount} Enabled</span>
            </div>
            <div class="stat">
              <div class="stat-icon stat-disabled"></div>
              <span>${disabledCount} Disabled</span>
            </div>
          </div>

          <div class="extensions-grid" id="extensions-${group.id}"></div>
        </div>
      `;

      const extensionsGrid = groupCard.querySelector(`#extensions-${group.id}`);

      if (group.extensions.length === 0) {
        extensionsGrid.innerHTML = '<div class="empty-state" style="padding: 32px 16px;"><p>No extensions in this group</p></div>';
      } else {
        group.extensions.forEach(extId => {
          const ext = this.extensions[extId];
          if (!ext) return;

          const allGroups = this.getExtensionGroups(extId);
          const otherGroups = allGroups.filter(name => name !== group.name);

          const extCard = document.createElement('div');
          extCard.className = 'extension-card';

          extCard.innerHTML = `
            <div class="extension-header">
              <img src="${ext.icons && ext.icons.length > 0 ? ext.icons.find(icon => icon.size === 16)?.url || ext.icons[0].url : 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSI+PHJlY3Qgd2lkdGg9IjE2IiBoZWlnaHQ9IjE2IiBmaWxsPSIjZGFkY2UwIi8+PC9zdmc+'}" class="extension-icon" alt="">
              <div class="extension-info">
                <div class="extension-name">${ext.name}</div>
                ${otherGroups.length > 0 ? `<div class="extension-groups">Also in: ${otherGroups.join(', ')}</div>` : ''}
              </div>
            </div>
            <button class="extension-toggle ${ext.enabled ? 'enabled' : 'disabled'}" data-extension-id="${ext.id}"></button>
          `;

          extCard.querySelector('.extension-toggle').addEventListener('click', () => {
            this.toggleExtension(ext.id, !ext.enabled);
          });

          extensionsGrid.appendChild(extCard);
        });
      }

      // Add event listeners
      const header = groupCard.querySelector('.group-header');
      header.addEventListener('click', (e) => {
        // Don't toggle accordion if clicking action buttons or toggle
        if (e.target.closest('.group-actions') || e.target.closest('.group-toggle')) return;
        this.toggleAccordion(group.id);
      });

      // Add event listener for group toggle
      const toggleBtn = groupCard.querySelector('.group-toggle');
      if (toggleBtn) {
        toggleBtn.addEventListener('click', (e) => {
          e.stopPropagation(); // Prevent accordion toggle
          const shouldEnable = toggleState !== 'enabled';
          this.toggleGroup(group.id, shouldEnable);
        });
      }

      // Add event listeners for group actions
      groupCard.querySelectorAll('[data-action]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation(); // Prevent accordion toggle
          const action = e.target.dataset.action;
          const groupId = e.target.dataset.groupId;

          switch (action) {
            case 'edit':
              this.showGroupModal(groupId);
              break;
            case 'delete':
              this.deleteGroup(groupId);
              break;
          }
        });
      });

      // Add drag and drop functionality
      if (!group.isDefault) {
        // Use setAttribute so draggable survives re-renders in packaged extensions.
        // Setting groupCard.draggable = true as a JS property after innerHTML can
        // fail to register dragstart in Web Store context.
        groupCard.setAttribute('draggable', 'true');

        groupCard.addEventListener('dragstart', (e) => {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', group.id);
          this.draggedGroupId = group.id;
          groupCard.classList.add('dragging');
        });

        groupCard.addEventListener('dragend', () => {
          groupCard.classList.remove('dragging');
          document.querySelectorAll('.group-card').forEach(card => {
            card.classList.remove('drag-over');
          });
          // Clear after drop event has had a chance to fire
          setTimeout(() => {
            this.draggedGroupId = null;
          }, 0);
        });
      }

      // ALL groups can be drop targets (including Always On group for positioning)
      groupCard.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';

        // dataTransfer.getData() returns empty string during dragover in packaged
        // extensions — only available in dragstart and drop. Use the instance
        // property instead.
        if (this.draggedGroupId && this.draggedGroupId !== group.id) {
          groupCard.classList.add('drag-over');
        }
      });

      groupCard.addEventListener('dragleave', () => {
        groupCard.classList.remove('drag-over');
      });

      groupCard.addEventListener('drop', (e) => {
        e.preventDefault();
        groupCard.classList.remove('drag-over');

        // dataTransfer is the canonical source; draggedGroupId is the reliable fallback
        const draggedId = e.dataTransfer.getData('text/plain') || this.draggedGroupId;

        if (draggedId && draggedId !== group.id) {
          this.reorderGroups(draggedId, group.id);
        }
      });

      container.appendChild(groupCard);
    });
  }

  async renderRemovedExtensionsHistory() {
    try {
      const result = await chrome.storage.local.get(['removedExtensions']);
      const removedExtensions = result.removedExtensions || [];

      const container = document.getElementById('removedExtensionsList');

      if (removedExtensions.length === 0) {
        container.innerHTML = '<div style="color: #5f6368; padding: 16px; text-align: center;">No recently removed extensions</div>';
        document.getElementById('clearHistoryBtn').style.display = 'none';
        return;
      }

      document.getElementById('clearHistoryBtn').style.display = 'block';

      container.innerHTML = '';

      // Show most recent first
      removedExtensions.slice(0, window.ExtWranglerShared.REMOVED_EXT_DISPLAY_LIMIT).forEach(ext => {
        const div = document.createElement('div');
        div.style.cssText = `
          padding: 8px 12px;
          border-bottom: 1px solid #f0f0f0;
          display: flex;
          justify-content: space-between;
          align-items: center;
        `;

        const date = new Date(ext.removedAt).toLocaleDateString();
        const time = new Date(ext.removedAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});

        div.innerHTML = `
          <div>
            <div style="font-weight: 500; color: #1a1a1a;">${ext.name}</div>
            <div style="font-size: 12px; color: #5f6368;">from "${ext.groupName}"</div>
          </div>
          <div style="font-size: 11px; color: #5f6368; text-align: right;">
            <div>${date}</div>
            <div>${time}</div>
          </div>
        `;

        container.appendChild(div);
      });

      if (removedExtensions.length > window.ExtWranglerShared.REMOVED_EXT_DISPLAY_LIMIT) {
        const moreDiv = document.createElement('div');
        moreDiv.style.cssText = 'padding: 8px 12px; color: #5f6368; font-size: 12px; text-align: center;';
        moreDiv.textContent = `... and ${removedExtensions.length - window.ExtWranglerShared.REMOVED_EXT_DISPLAY_LIMIT} more`;
        container.appendChild(moreDiv);
      }

    } catch (error) {
      console.error('Failed to render removal history:', error);
    }
  }

  async clearRemovedExtensionsHistory() {
    if (confirm('Clear all removal history? This cannot be undone.')) {
      try {
        await chrome.storage.local.remove(['removedExtensions']);
        this.renderRemovedExtensionsHistory();
        this.showNotification('Removal history cleared', 'success');
      } catch (error) {
        console.error('Failed to clear removal history:', error);
        this.showNotification('Failed to clear history', 'error');
      }
    }
  }
}

// Initialize the settings page
document.addEventListener('DOMContentLoaded', () => {
  new ExtensionWranglerSettings();
});