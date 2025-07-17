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
    // Get stored groups
    const result = await chrome.storage.local.get(['groups']);
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
          } catch (error) {
            console.error(`Failed to re-enable "Fixed" extension ${extensionId}:`, error);
          }
        }, 100);
      }
    }
  } catch (error) {
    console.error('Error handling extension state change:', error);
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