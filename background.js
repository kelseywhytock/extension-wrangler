// Background script for Extension Organizer

// Handle installation
chrome.runtime.onInstalled.addListener(() => {
  console.log('Extension Organizer installed');
});

// Listen for extension state changes to keep "Fixed" group enabled
chrome.management.onEnabled.addListener(async (info) => {
  await handleExtensionStateChange(info.id, true);
});

chrome.management.onDisabled.addListener(async (info) => {
  await handleExtensionStateChange(info.id, false);
});

async function handleExtensionStateChange(extensionId, enabled) {
  try {
    // Get stored groups from sync storage for consistency
    const result = await chrome.storage.sync.get(['groups']);
    const groups = result.groups || {};

    // Check if extension is in "Fixed" group
    const alwaysOnGroup = groups['always-on'];
    if (alwaysOnGroup && alwaysOnGroup.extensions.includes(extensionId)) {
      // If a "Fixed" extension was disabled, re-enable it
      if (!enabled) {
        // Small delay to avoid conflicts
        setTimeout(async () => {
          try {
            await chrome.management.setEnabled(extensionId, true);
            console.log(`Re-enabled "Fixed" extension: ${extensionId}`);

            // Log for Web Store debugging
            console.log(`[Web Store Debug] Fixed extension re-enabled:`, {
              extensionId,
              timestamp: new Date().toISOString(),
              storageType: 'sync'
            });
          } catch (error) {
            console.error(`Failed to re-enable "Fixed" extension ${extensionId}:`, error);

            // Enhanced error logging for Web Store issues
            console.error(`[Web Store Debug] Re-enable failed:`, {
              extensionId,
              error: error.message,
              errorCode: error.code || 'unknown',
              timestamp: new Date().toISOString(),
              storageType: 'sync'
            });
          }
        }, 100);
      }
    }
  } catch (error) {
    console.error('Error handling extension state change:', error);

    // Enhanced error logging for Web Store debugging
    console.error(`[Web Store Debug] Storage access failed:`, {
      extensionId,
      error: error.message,
      errorCode: error.code || 'unknown',
      timestamp: new Date().toISOString(),
      operation: 'handleExtensionStateChange'
    });

    // Fallback to local storage if sync fails
    try {
      console.log(`[Web Store Debug] Attempting fallback to local storage...`);
      const localResult = await chrome.storage.local.get(['groups']);
      const localGroups = localResult.groups || {};

      const alwaysOnGroup = localGroups['always-on'];
      if (alwaysOnGroup && alwaysOnGroup.extensions.includes(extensionId) && !enabled) {
        setTimeout(async () => {
          try {
            await chrome.management.setEnabled(extensionId, true);
            console.log(`Re-enabled "Fixed" extension via fallback: ${extensionId}`);
          } catch (fallbackError) {
            console.error(`Fallback re-enable failed for ${extensionId}:`, fallbackError);
          }
        }, 100);
      }
    } catch (fallbackError) {
      console.error('Fallback storage access also failed:', fallbackError);
    }
  }
}

// Provide API for popup to communicate with background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getExtensions') {
    chrome.management.getAll().then(extensions => {
      sendResponse({ extensions });
    }).catch(error => {
      sendResponse({ error: error.message });
    });
    return true; // Indicates we will send a response asynchronously
  }
  
  if (request.action === 'toggleExtension') {
    chrome.management.setEnabled(request.extensionId, request.enabled).then(() => {
      sendResponse({ success: true });
    }).catch(error => {
      sendResponse({ error: error.message });
    });
    return true;
  }
});