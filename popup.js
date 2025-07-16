class ExtensionOrganizer {
  constructor() {
    this.groups = {};
    this.extensions = {};
    this.currentTab = 'groups';
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
      const result = await chrome.storage.local.get(['groups']);
      this.groups = result.groups || {};
      
      // Ensure "Always On" group exists
      if (!this.groups['always-on']) {
        this.groups['always-on'] = {
          id: 'always-on',
          name: 'Always On',
          extensions: [],
          isDefault: true
        };
        await this.saveData();
      }
    } catch (error) {
      console.error('Failed to load data:', error);
      this.groups = {
        'always-on': {
          id: 'always-on',
          name: 'Always On',
          extensions: [],
          isDefault: true
        }
      };
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
    }
  }

  async saveData() {
    try {
      await chrome.storage.local.set({ groups: this.groups });
    } catch (error) {
      console.error('Failed to save data:', error);
    }
  }

  setupEventListeners() {
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

    const promises = group.extensions.map(async (extId) => {
      try {
        await chrome.management.setEnabled(extId, enable);
      } catch (error) {
        console.error(`Failed to ${enable ? 'enable' : 'disable'} extension ${extId}:`, error);
      }
    });

    await Promise.all(promises);
    await this.loadExtensions();
    this.render();
  }

  async toggleExtension(extId, enable) {
    try {
      await chrome.management.setEnabled(extId, enable);
      await this.loadExtensions();
      this.render();
    } catch (error) {
      console.error(`Failed to ${enable ? 'enable' : 'disable'} extension ${extId}:`, error);
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
      
      div.querySelector('.extension-toggle').addEventListener('click', () => {
        this.toggleExtension(ext.id, !ext.enabled);
      });
      
      container.appendChild(div);
    });
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
    
    // Sort groups to show "Always On" first
    const sortedGroups = Object.values(this.groups).sort((a, b) => {
      if (a.isDefault) return -1;
      if (b.isDefault) return 1;
      return a.name.localeCompare(b.name);
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
          <div class="group-info">
            <div class="group-name">
              ${group.name}
              ${group.isDefault ? '<span class="always-on-badge">ALWAYS ON</span>' : ''}
            </div>
            <div class="group-stats">
              ${enabledCount}/${group.extensions.length} extensions enabled
            </div>
          </div>
          <button class="group-toggle ${toggleState}" data-group-id="${group.id}" title="${toggleState === 'enabled' ? 'Disable all' : 'Enable all'}"></button>
        </div>
        <div class="group-extensions"></div>
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
          
          extDiv.querySelector('.extension-toggle').addEventListener('click', () => {
            this.toggleExtension(ext.id, !ext.enabled);
          });
          
          extensionsContainer.appendChild(extDiv);
        });
      }
      
      // Add event listener for group toggle
      const toggleBtn = groupDiv.querySelector('.group-toggle');
      if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
          const shouldEnable = toggleState !== 'enabled';
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