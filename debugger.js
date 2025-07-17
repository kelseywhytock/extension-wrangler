class ExtensionDebugger {
  constructor() {
    this.logs = [];
    this.extensions = {};
    this.failedExtensions = new Set();
    this.toggleHistory = {};
    this.init();
  }

  async init() {
    await this.loadExtensions();
    this.setupEventListeners();
    this.updateStats();
  }

  setupEventListeners() {
    document.getElementById('runDiagnostics').addEventListener('click', () => this.runFullDiagnostics());
    document.getElementById('testSingleToggle').addEventListener('click', () => this.testSingleToggle());
    document.getElementById('testBatchToggle').addEventListener('click', () => this.testBatchToggle());
    document.getElementById('analyzeGroups').addEventListener('click', () => this.analyzeGroups());
    document.getElementById('clearLogs').addEventListener('click', () => this.clearLogs());
    document.getElementById('filterInput').addEventListener('input', (e) => this.filterExtensions(e.target.value));
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
      this.log('Loaded ' + Object.keys(this.extensions).length + ' extensions', 'info');
    } catch (error) {
      this.log('Failed to load extensions: ' + error.message, 'error');
    }
  }

  log(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = { timestamp, message, type };
    this.logs.push(logEntry);
    this.renderLog();
  }

  renderLog() {
    const container = document.getElementById('logContainer');
    const shouldScroll = container.scrollHeight - container.scrollTop === container.clientHeight;
    
    container.innerHTML = this.logs.map(log => 
      `<div class="log-entry log-${log.type}">[${log.timestamp}] ${log.message}</div>`
    ).join('');
    
    if (shouldScroll) {
      container.scrollTop = container.scrollHeight;
    }
  }

  updateStats() {
    const total = Object.keys(this.extensions).length;
    const enabled = Object.values(this.extensions).filter(ext => ext.enabled).length;
    const disabled = total - enabled;
    
    document.getElementById('totalExtensions').textContent = total;
    document.getElementById('enabledExtensions').textContent = enabled;
    document.getElementById('disabledExtensions').textContent = disabled;
    document.getElementById('failedToggles').textContent = this.failedExtensions.size;
  }

  async runFullDiagnostics() {
    this.log('Starting full diagnostics...', 'info');
    document.getElementById('progressBar').style.display = 'block';
    
    const extensions = Object.values(this.extensions);
    const results = [];
    
    for (let i = 0; i < extensions.length; i++) {
      const ext = extensions[i];
      const progress = Math.round((i + 1) / extensions.length * 100);
      this.updateProgress(progress);
      
      this.log(`Testing ${ext.name} (${ext.id})...`, 'info');
      
      // Test disable
      const disableResult = await this.testToggle(ext.id, false);
      
      // Small delay
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Test enable
      const enableResult = await this.testToggle(ext.id, true);
      
      results.push({
        extension: ext,
        disableSuccess: disableResult.success,
        enableSuccess: enableResult.success,
        disableError: disableResult.error,
        enableError: enableResult.error,
        disableTime: disableResult.time,
        enableTime: enableResult.time
      });
      
      // Restore original state
      if (ext.enabled !== enableResult.success) {
        await this.testToggle(ext.id, ext.enabled);
      }
    }
    
    document.getElementById('progressBar').style.display = 'none';
    this.analyzeResults(results);
  }

  async testToggle(extensionId, enable) {
    const startTime = Date.now();
    try {
      await chrome.management.setEnabled(extensionId, enable);
      const time = Date.now() - startTime;
      this.log(`Successfully ${enable ? 'enabled' : 'disabled'} in ${time}ms`, 'success');
      return { success: true, time };
    } catch (error) {
      const time = Date.now() - startTime;
      this.log(`Failed to ${enable ? 'enable' : 'disable'}: ${error.message}`, 'error');
      this.failedExtensions.add(extensionId);
      
      // Track error patterns
      if (!this.toggleHistory[extensionId]) {
        this.toggleHistory[extensionId] = [];
      }
      this.toggleHistory[extensionId].push({
        action: enable ? 'enable' : 'disable',
        error: error.message,
        time: new Date().toISOString()
      });
      
      return { success: false, error: error.message, time };
    }
  }

  analyzeResults(results) {
    const failedExtensions = results.filter(r => !r.disableSuccess || !r.enableSuccess);
    
    // Group by error type
    const errorPatterns = {};
    failedExtensions.forEach(result => {
      const errors = [result.disableError, result.enableError].filter(Boolean);
      errors.forEach(error => {
        if (!errorPatterns[error]) {
          errorPatterns[error] = [];
        }
        errorPatterns[error].push(result.extension);
      });
    });
    
    // Analyze common characteristics
    const characteristics = this.analyzeCharacteristics(failedExtensions.map(r => r.extension));
    
    // Render analysis
    this.renderAnalysis(results, errorPatterns, characteristics);
  }

  analyzeCharacteristics(extensions) {
    const chars = {
      permissions: {},
      types: {},
      installTypes: {},
      updateUrls: 0,
      hostPermissions: {},
      disabledReasons: {}
    };
    
    extensions.forEach(ext => {
      // Count permissions
      if (ext.permissions) {
        ext.permissions.forEach(perm => {
          chars.permissions[perm] = (chars.permissions[perm] || 0) + 1;
        });
      }
      
      // Count types
      chars.types[ext.type] = (chars.types[ext.type] || 0) + 1;
      
      // Count install types
      chars.installTypes[ext.installType] = (chars.installTypes[ext.installType] || 0) + 1;
      
      // Check for update URL
      if (ext.updateUrl) {
        chars.updateUrls++;
      }
      
      // Count host permissions
      if (ext.hostPermissions) {
        ext.hostPermissions.forEach(host => {
          chars.hostPermissions[host] = (chars.hostPermissions[host] || 0) + 1;
        });
      }
      
      // Count disabled reasons
      if (ext.disabledReason) {
        chars.disabledReasons[ext.disabledReason] = (chars.disabledReasons[ext.disabledReason] || 0) + 1;
      }
    });
    
    return chars;
  }

  renderAnalysis(results, errorPatterns, characteristics) {
    const analysisDiv = document.getElementById('extensionAnalysis');
    const patternsDiv = document.getElementById('problemPatterns');
    
    // Render extension table
    analysisDiv.innerHTML = `
      <table class="extension-table">
        <thead>
          <tr>
            <th>Extension</th>
            <th>Status</th>
            <th>Disable Result</th>
            <th>Enable Result</th>
            <th>Avg Time (ms)</th>
            <th>Disabled Reason</th>
          </tr>
        </thead>
        <tbody>
          ${results.map(r => `
            <tr>
              <td>${r.extension.name}</td>
              <td><span class="status-badge status-${r.extension.enabled ? 'enabled' : 'disabled'}">${r.extension.enabled ? 'Enabled' : 'Disabled'}</span></td>
              <td><span class="status-badge status-${r.disableSuccess ? 'enabled' : 'failed'}">${r.disableSuccess ? 'Success' : 'Failed'}</span></td>
              <td><span class="status-badge status-${r.enableSuccess ? 'enabled' : 'failed'}">${r.enableSuccess ? 'Success' : 'Failed'}</span></td>
              <td>${Math.round((r.disableTime + r.enableTime) / 2)}</td>
              <td>${r.extension.disabledReason || '-'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
    
    // Render patterns
    let patternsHTML = '<div class="test-results">';
    
    // Error patterns
    if (Object.keys(errorPatterns).length > 0) {
      patternsHTML += '<h3>Error Patterns</h3>';
      Object.entries(errorPatterns).forEach(([error, exts]) => {
        patternsHTML += `
          <div class="test-item error">
            <strong>Error:</strong> ${error}<br>
            <strong>Affected Extensions (${exts.length}):</strong> ${exts.map(e => e.name).join(', ')}
          </div>
        `;
      });
    }
    
    // Characteristics of failed extensions
    const failedCount = results.filter(r => !r.disableSuccess || !r.enableSuccess).length;
    if (failedCount > 0) {
      patternsHTML += '<h3>Common Characteristics of Failed Extensions</h3>';
      patternsHTML += `
        <div class="test-item warning">
          <strong>Total Failed:</strong> ${failedCount} out of ${results.length}<br>
          <strong>Common Permissions:</strong> ${Object.entries(characteristics.permissions)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([perm, count]) => `${perm} (${count})`)
            .join(', ') || 'None'}<br>
          <strong>Install Types:</strong> ${Object.entries(characteristics.installTypes)
            .map(([type, count]) => `${type} (${count})`)
            .join(', ') || 'None'}<br>
          <strong>Disabled Reasons:</strong> ${Object.entries(characteristics.disabledReasons)
            .map(([reason, count]) => `${reason} (${count})`)
            .join(', ') || 'None'}<br>
          <strong>Have Update URLs:</strong> ${characteristics.updateUrls}
        </div>
      `;
    }
    
    // Success rate
    const successRate = ((results.length - failedCount) / results.length * 100).toFixed(1);
    patternsHTML += `
      <div class="test-item ${successRate > 90 ? 'success' : successRate > 70 ? 'warning' : 'error'}">
        <strong>Overall Success Rate:</strong> ${successRate}%<br>
        <strong>Average Toggle Time:</strong> ${Math.round(results.reduce((sum, r) => sum + r.disableTime + r.enableTime, 0) / (results.length * 2))}ms
      </div>
    `;
    
    patternsHTML += '</div>';
    patternsDiv.innerHTML = patternsHTML;
    
    this.updateStats();
  }

  async testSingleToggle() {
    const extId = prompt('Enter extension ID to test:');
    if (!extId || !this.extensions[extId]) {
      this.log('Invalid extension ID', 'error');
      return;
    }
    
    const ext = this.extensions[extId];
    this.log(`Testing single toggle for ${ext.name}...`, 'info');
    
    const currentState = ext.enabled;
    const disableResult = await this.testToggle(extId, !currentState);
    await new Promise(resolve => setTimeout(resolve, 500));
    const enableResult = await this.testToggle(extId, currentState);
    
    this.log(`Test complete. Disable: ${disableResult.success}, Enable: ${enableResult.success}`, 
      disableResult.success && enableResult.success ? 'success' : 'error');
  }

  async testBatchToggle() {
    const count = parseInt(prompt('How many extensions to test in batch (1-10)?') || '5');
    if (count < 1 || count > 10) {
      this.log('Invalid batch size', 'error');
      return;
    }
    
    const extensions = Object.values(this.extensions).slice(0, count);
    this.log(`Testing batch toggle with ${extensions.length} extensions...`, 'info');
    
    // Store original states
    const originalStates = {};
    extensions.forEach(ext => {
      originalStates[ext.id] = ext.enabled;
    });
    
    // Test disable all
    this.log('Disabling batch...', 'info');
    const disablePromises = extensions.map(ext => this.testToggle(ext.id, false));
    const disableResults = await Promise.all(disablePromises);
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Test enable all
    this.log('Enabling batch...', 'info');
    const enablePromises = extensions.map(ext => this.testToggle(ext.id, true));
    const enableResults = await Promise.all(enablePromises);
    
    // Restore original states
    this.log('Restoring original states...', 'info');
    const restorePromises = extensions.map(ext => 
      this.testToggle(ext.id, originalStates[ext.id])
    );
    await Promise.all(restorePromises);
    
    const successCount = disableResults.filter(r => r.success).length + 
                       enableResults.filter(r => r.success).length;
    const totalTests = disableResults.length + enableResults.length;
    
    this.log(`Batch test complete. Success rate: ${successCount}/${totalTests}`, 
      successCount === totalTests ? 'success' : 'warning');
  }

  async analyzeGroups() {
    try {
      const result = await chrome.storage.local.get(['groups']);
      const groups = result.groups || {};
      
      this.log('Analyzing groups...', 'info');
      
      for (const [groupId, group] of Object.entries(groups)) {
        this.log(`\nAnalyzing group: ${group.name} (${group.extensions.length} extensions)`, 'info');
        
        let failCount = 0;
        let unmodifiableCount = 0;
        
        for (const extId of group.extensions) {
          const ext = this.extensions[extId];
          if (!ext) {
            this.log(`Extension ${extId} not found in group ${group.name}`, 'warning');
            continue;
          }
          
          // Check if extension cannot be modified
          if (ext.disabledReason === 'unknown' || ext.disabledReason === 'permissions_increase') {
            unmodifiableCount++;
            this.log(`- ${ext.name}: Cannot be modified (${ext.disabledReason})`, 'error');
          } else if (this.failedExtensions.has(extId)) {
            failCount++;
            this.log(`- ${ext.name}: Known to fail`, 'error');
          }
        }
        
        if (unmodifiableCount > 0) {
          this.log(`Group ${group.name} has ${unmodifiableCount} unmodifiable extensions`, 'error');
        }
        if (failCount > 0) {
          this.log(`Group ${group.name} has ${failCount} problematic extensions`, 'warning');
        }
        if (unmodifiableCount === 0 && failCount === 0) {
          this.log(`Group ${group.name} appears healthy`, 'success');
        }
      }
    } catch (error) {
      this.log('Failed to analyze groups: ' + error.message, 'error');
    }
  }

  updateProgress(percent) {
    const fill = document.getElementById('progressFill');
    fill.style.width = percent + '%';
    fill.textContent = percent + '%';
  }

  clearLogs() {
    this.logs = [];
    this.renderLog();
    this.log('Logs cleared', 'info');
  }

  filterExtensions(query) {
    // This would filter the extension table if implemented
    this.log(`Filtering extensions by: ${query}`, 'info');
  }
}

// Initialize debugger
document.addEventListener('DOMContentLoaded', () => {
  new ExtensionDebugger();
});