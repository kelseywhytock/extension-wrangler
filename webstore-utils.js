// Web Store Compatibility and Storage Utilities
// Version 1.0.0

class WebStoreUtils {
  constructor() {
    this.isWebStore = null;
    this.storageQuotaWarningThreshold = 0.8; // 80% of quota
  }

  // Detect if extension is running from Chrome Web Store
  async detectWebStoreInstall() {
    if (this.isWebStore !== null) {
      return this.isWebStore;
    }

    try {
      // Check if extension has an update URL (Web Store extensions have this)
      const extensionInfo = await chrome.management.getSelf();

      // Web Store extensions typically have updateUrl containing "clients2.google.com"
      this.isWebStore = extensionInfo.updateUrl &&
                       extensionInfo.updateUrl.includes('clients2.google.com');

      // Additional check: Web Store extensions have installType 'normal'
      // while developer mode/unpacked extensions have 'development'
      const isNormalInstall = extensionInfo.installType === 'normal';

      // Combine both checks for more accuracy
      this.isWebStore = this.isWebStore && isNormalInstall;

      console.log(`[Web Store Debug] Installation detection:`, {
        isWebStore: this.isWebStore,
        installType: extensionInfo.installType,
        updateUrl: extensionInfo.updateUrl,
        version: extensionInfo.version
      });

      return this.isWebStore;

    } catch (error) {
      console.error('[Web Store Debug] Failed to detect installation type:', error);
      // Fallback to false (assume development)
      this.isWebStore = false;
      return false;
    }
  }

  // Check Chrome sync storage quota and usage
  async checkSyncStorageQuota() {
    try {
      const usage = await chrome.storage.sync.getBytesInUse();
      const maxBytes = chrome.storage.sync.QUOTA_BYTES || 102400; // 100KB default
      const maxBytesPerItem = chrome.storage.sync.QUOTA_BYTES_PER_ITEM || 8192; // 8KB per item
      const maxItems = chrome.storage.sync.MAX_ITEMS || 512;

      const usagePercentage = (usage / maxBytes) * 100;
      const isNearQuota = usagePercentage > (this.storageQuotaWarningThreshold * 100);

      const quotaInfo = {
        usage,
        maxBytes,
        maxBytesPerItem,
        maxItems,
        usagePercentage: Math.round(usagePercentage * 100) / 100,
        isNearQuota,
        remainingBytes: maxBytes - usage
      };

      console.log(`[Web Store Debug] Sync storage quota status:`, quotaInfo);

      if (isNearQuota) {
        console.warn(`[Web Store Debug] WARNING: Sync storage usage is at ${quotaInfo.usagePercentage}%`);
      }

      return quotaInfo;

    } catch (error) {
      console.error('[Web Store Debug] Failed to check sync storage quota:', error);
      return {
        usage: 0,
        maxBytes: 102400,
        maxBytesPerItem: 8192,
        maxItems: 512,
        usagePercentage: 0,
        isNearQuota: false,
        remainingBytes: 102400,
        error: error.message
      };
    }
  }

  // Get detailed storage analysis
  async analyzeStorageUsage() {
    try {
      const syncData = await chrome.storage.sync.get(null);
      const localData = await chrome.storage.local.get(null);

      const syncEntries = Object.keys(syncData);
      const localEntries = Object.keys(localData);

      // Calculate sizes
      const syncSize = JSON.stringify(syncData).length;
      const localSize = JSON.stringify(localData).length;

      // Find largest items
      const syncItems = syncEntries.map(key => ({
        key,
        size: JSON.stringify(syncData[key]).length,
        type: typeof syncData[key]
      })).sort((a, b) => b.size - a.size);

      const analysis = {
        sync: {
          totalSize: syncSize,
          itemCount: syncEntries.length,
          largestItems: syncItems.slice(0, 5),
          keys: syncEntries
        },
        local: {
          totalSize: localSize,
          itemCount: localEntries.length,
          keys: localEntries
        },
        timestamp: new Date().toISOString()
      };

      console.log(`[Web Store Debug] Storage usage analysis:`, analysis);

      return analysis;

    } catch (error) {
      console.error('[Web Store Debug] Failed to analyze storage usage:', error);
      return {
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  // Smart storage selection based on Web Store context
  async getOptimalStorageAPI() {
    const isWebStore = await this.detectWebStoreInstall();
    const quotaInfo = await this.checkSyncStorageQuota();

    // Use sync storage for Web Store if quota allows
    if (isWebStore && !quotaInfo.isNearQuota) {
      return {
        api: chrome.storage.sync,
        type: 'sync',
        reason: 'Web Store + quota available'
      };
    }

    // Fallback to local storage
    return {
      api: chrome.storage.local,
      type: 'local',
      reason: isWebStore ? 'Web Store + quota exceeded' : 'Development mode'
    };
  }

  // Enhanced error handler for storage operations
  async handleStorageError(error, operation, data = null) {
    const isWebStore = await this.detectWebStoreInstall();
    const quotaInfo = await this.checkSyncStorageQuota();

    const errorInfo = {
      operation,
      error: error.message,
      errorCode: error.code || 'unknown',
      isWebStore,
      quotaInfo,
      dataSize: data ? JSON.stringify(data).length : 0,
      timestamp: new Date().toISOString()
    };

    console.error(`[Web Store Debug] Enhanced storage error:`, errorInfo);

    // Provide specific recommendations
    let recommendation = 'Unknown error';

    if (error.message && error.message.includes('QUOTA_BYTES_PER_ITEM')) {
      recommendation = 'Data too large for single item - consider splitting data';
    } else if (error.message && error.message.includes('QUOTA_BYTES')) {
      recommendation = 'Total storage quota exceeded - use local storage fallback';
    } else if (error.message && error.message.includes('MAX_WRITE_OPERATIONS_PER_HOUR')) {
      recommendation = 'Write operations limit exceeded - reduce save frequency';
    } else if (error.message && error.message.includes('MAX_WRITE_OPERATIONS_PER_MINUTE')) {
      recommendation = 'Write operations per minute exceeded - add delays between saves';
    }

    console.error(`[Web Store Debug] Recommendation: ${recommendation}`);

    return {
      ...errorInfo,
      recommendation
    };
  }

  // Diagnostic tool for troubleshooting
  async runDiagnostics() {
    console.group('[Web Store Debug] Running diagnostics...');

    const isWebStore = await this.detectWebStoreInstall();
    const quotaInfo = await this.checkSyncStorageQuota();
    const storageAnalysis = await this.analyzeStorageUsage();
    const optimalStorage = await this.getOptimalStorageAPI();

    const diagnostics = {
      installationType: isWebStore ? 'Chrome Web Store' : 'Development/Manual',
      quotaStatus: quotaInfo,
      storageUsage: storageAnalysis,
      recommendedStorage: optimalStorage,
      timestamp: new Date().toISOString()
    };

    console.log('Diagnostics results:', diagnostics);
    console.groupEnd();

    return diagnostics;
  }
}

// Export singleton instance
window.webStoreUtils = new WebStoreUtils();