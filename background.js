// Background script for Extension Organizer

const ALWAYS_ON_GROUP_ID = 'always-on';

async function getGroupsWithFallback() {
  try {
    const result = await chrome.storage.sync.get(['groups']);
    if (result.groups && Object.keys(result.groups).length > 0) {
      return result.groups;
    }
  } catch (_) {}
  // Fallback to local storage on new device or sync unavailability
  try {
    const local = await chrome.storage.local.get(['groups']);
    return local.groups || {};
  } catch (_) {
    return {};
  }
}

// Handle installation
chrome.runtime.onInstalled.addListener(() => {
  console.log('Extension Organizer installed');
});

// Listen for extension state changes to keep "Always On" group enabled
chrome.management.onEnabled.addListener(async (info) => {
  await handleExtensionStateChange(info.id, true);
});

chrome.management.onDisabled.addListener(async (info) => {
  await handleExtensionStateChange(info.id, false);
});

async function handleExtensionStateChange(extensionId, enabled) {
  try {
    // Get stored groups with sync→local fallback for new-device race
    const groups = await getGroupsWithFallback();

    // Check if extension is in "Always On" group
    const alwaysOnGroup = groups[ALWAYS_ON_GROUP_ID];
    if (alwaysOnGroup && alwaysOnGroup.extensions.includes(extensionId)) {
      // If an "Always On" extension was disabled, re-enable it
      if (!enabled) {
        // Small delay to avoid conflicts
        setTimeout(async () => {
          try {
            await chrome.management.setEnabled(extensionId, true);
            console.log(`Re-enabled "Always On" extension: ${extensionId}`);

            // Log for Web Store debugging
            console.log(`[Web Store Debug] Always On extension re-enabled:`, {
              extensionId,
              timestamp: new Date().toISOString(),
              storageType: 'sync'
            });
          } catch (error) {
            console.error(`Failed to re-enable "Always On" extension ${extensionId}:`, error);

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
  }
}

// Provide API for popup to communicate with background script
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
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