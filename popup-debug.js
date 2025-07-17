// Debug version to find the error
console.log('Script loaded');

class ExtensionOrganizer {
  constructor() {
    console.log('Constructor called');
    try {
      this.groups = {};
      this.extensions = {};
      this.currentTab = 'groups';
      this.groupOrder = [];
      console.log('Basic properties initialized');
      this.init();
    } catch (error) {
      console.error('Constructor error:', error);
    }
  }

  async init() {
    console.log('Init called');
    try {
      await this.loadExtensions();
      console.log('Extensions loaded');
      await this.loadData();
      console.log('Data loaded');
      this.setupEventListeners();
      console.log('Event listeners setup');
      this.render();
      console.log('Render complete');
    } catch (error) {
      console.error('Init error:', error);
      alert('Init error: ' + error.message);
    }
  }

  async loadExtensions() {
    const extensions = await chrome.management.getAll();
    this.extensions = {};
    extensions.forEach(ext => {
      if (ext.type === 'extension' && ext.id !== chrome.runtime.id) {
        this.extensions[ext.id] = ext;
      }
    });
  }

  async loadData() {
    const result = await chrome.storage.local.get(['groups', 'groupOrder']);
    this.groups = result.groups || {};
    this.groupOrder = result.groupOrder || [];
    
    if (!this.groups['always-on']) {
      this.groups['always-on'] = {
        id: 'always-on',
        name: 'Fixed',
        extensions: [],
        isDefault: true
      };
    }
  }

  setupEventListeners() {
    // Minimal event listeners
    document.getElementById('debugBtn')?.addEventListener('click', () => {
      console.log('Debug clicked');
    });
  }

  render() {
    const container = document.getElementById('groupsContent');
    if (!container) {
      console.error('groupsContent not found');
      return;
    }
    container.innerHTML = '<div>Extension Wrangler Loaded</div>';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM loaded');
  try {
    new ExtensionOrganizer();
  } catch (error) {
    console.error('Failed to create ExtensionOrganizer:', error);
    alert('Failed to create ExtensionOrganizer: ' + error.message);
  }
});