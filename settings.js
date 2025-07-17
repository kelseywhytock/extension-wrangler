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
    await this.loadData();
    await this.loadExtensions();
    this.setupEventListeners();
    this.render();
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
    } catch (error) {
      console.error('Failed to load data:', error);
      this.showNotification('Failed to load groups', 'error');
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
    } catch (error) {
      console.error('Failed to load extensions:', error);
      this.showNotification('Failed to load extensions', 'error');
    }
  }

  async saveData() {
    try {
      await chrome.storage.local.set({ groups: this.groups });
    } catch (error) {
      console.error('Failed to save data:', error);
      this.showNotification('Failed to save changes', 'error');
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
    
    if (groupId) {
      title.textContent = 'Edit Group';
      nameInput.value = this.groups[groupId].name;
      this.renderExtensionsListForModal(this.groups[groupId].extensions);
    } else {
      title.textContent = 'Create New Group';
      nameInput.value = '';
      this.renderExtensionsListForModal([]);
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
      
      // Add to group order (at the beginning, before Fixed group)
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
      this.showNotification('Cannot delete the Fixed group', 'error');
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
    if (!confirm('Are you sure you want to enable all extensions?')) return;
    
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
    if (!confirm('Are you sure you want to disable all extensions? This will also disable Extension Wrangler.')) return;
    
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
        await this.saveData();
        this.render();
        this.showNotification('Groups imported successfully', 'success');
      }
    } catch (error) {
      console.error('Failed to import groups:', error);
      this.showNotification('Failed to import groups', 'error');
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
      
      const label = document.createElement('label');
      label.className = 'checkbox-label';
      label.innerHTML = `
        <img src="${ext.icons && ext.icons.length > 0 ? ext.icons.find(icon => icon.size === 16)?.url || ext.icons[0].url : 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSI+PHJlY3Qgd2lkdGg9IjE2IiBoZWlnaHQ9IjE2IiBmaWxsPSIjZGFkY2UwIi8+PC9zdmc+'}" width="16" height="16" class="extension-icon" alt="">
        <span>${ext.name}</span>
      `;
      
      label.addEventListener('click', () => {
        checkbox.checked = !checkbox.checked;
      });
      
      div.appendChild(checkbox);
      div.appendChild(label);
      container.appendChild(div);
    });
  }

  filterExtensionsInModal(query) {
    const containers = document.querySelectorAll('#extensionsList .checkbox-item');
    const lowerQuery = query.toLowerCase();
    
    containers.forEach(container => {
      const extensionName = container.dataset.extensionName;
      const matches = extensionName.includes(lowerQuery);
      container.style.display = matches ? 'flex' : 'none';
    });
  }

  renderAllExtensions() {
    const container = document.getElementById('allExtensionsList');
    container.innerHTML = '';

    Object.values(this.extensions).forEach(ext => {
      const groups = this.getExtensionGroups(ext.id);
      const isAlwaysEnabled = groups.includes('Fixed');
      
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

    // Close dropdowns when clicking outside
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.group-dropdown')) {
        document.querySelectorAll('.group-dropdown-content').forEach(dropdown => {
          dropdown.classList.remove('show');
        });
      }
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
        ${group.isDefault ? '<span style="color: #34a853; font-size: 11px;">(Fixed)</span>' : ''}
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
    return Object.values(this.groups)
      .filter(group => group.extensions.includes(extId))
      .map(group => group.name);
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
    const draggedIndex = this.groupOrder.indexOf(draggedId);
    const targetIndex = this.groupOrder.indexOf(targetId);
    
    if (draggedIndex === -1 || targetIndex === -1) return;
    
    // Remove dragged item
    this.groupOrder.splice(draggedIndex, 1);
    
    // Insert at new position
    const newTargetIndex = this.groupOrder.indexOf(targetId);
    if (draggedIndex < targetIndex) {
      // Dragged from above to below
      this.groupOrder.splice(newTargetIndex + 1, 0, draggedId);
    } else {
      // Dragged from below to above
      this.groupOrder.splice(newTargetIndex, 0, draggedId);
    }
    
    await this.saveGroupOrder();
    this.render();
  }

  showNotification(message, type = 'success') {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.className = `notification ${type}`;
    notification.classList.add('show');
    
    setTimeout(() => {
      notification.classList.remove('show');
    }, 3000);
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
  }

  renderGroups() {
    const container = document.getElementById('groupsContainer');
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
            ${group.isDefault ? '<span class="always-on-badge">FIXED</span>' : ''}
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
              <span>${group.extensions.length} Total</span>
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
      
      // Add drag and drop functionality (only for non-fixed groups)
      if (!group.isDefault) {
        groupCard.draggable = true;
        
        groupCard.addEventListener('dragstart', (e) => {
          this.draggedGroupId = group.id;
          e.dataTransfer.effectAllowed = 'move';
          groupCard.classList.add('dragging');
        });
        
        groupCard.addEventListener('dragend', (e) => {
          groupCard.classList.remove('dragging');
          this.draggedGroupId = null;
        });
        
        groupCard.addEventListener('dragover', (e) => {
          e.preventDefault();
          if (this.draggedGroupId && this.draggedGroupId !== group.id) {
            groupCard.classList.add('drag-over');
          }
        });
        
        groupCard.addEventListener('dragleave', (e) => {
          groupCard.classList.remove('drag-over');
        });
        
        groupCard.addEventListener('drop', (e) => {
          e.preventDefault();
          groupCard.classList.remove('drag-over');
          
          if (this.draggedGroupId && this.draggedGroupId !== group.id) {
            this.reorderGroups(this.draggedGroupId, group.id);
          }
        });
      }
      
      container.appendChild(groupCard);
    });
  }
}

// Initialize the settings page
document.addEventListener('DOMContentLoaded', () => {
  new ExtensionWranglerSettings();
});