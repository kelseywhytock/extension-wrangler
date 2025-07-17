# Privacy Policy for Extension Wrangler

**Last Updated: January 2025**

## Overview

Extension Wrangler ("we", "our", or "the extension") is committed to protecting your privacy. This Privacy Policy explains how we handle information when you use our Chrome extension for managing and organizing your installed browser extensions.

## Information We Collect

### Extension Management Data
- **Extension Information**: We access the list of your installed Chrome extensions solely to display them within our interface and enable management features. This includes extension names, IDs, enabled/disabled status, and icons.
- **Group Configurations**: Custom groups you create and their associated extensions are stored locally in Chrome's storage.
- **User Preferences**: Your organizational preferences, group orders, and display settings.

### Diagnostic Information
- **Error Logs**: When extension toggle operations fail, we store minimal error information locally to help with troubleshooting.
- **Performance Metrics**: Basic operational data such as initialization timestamps and toggle success rates, used solely for improving extension reliability.

## How We Use Information

We use the collected information exclusively for:
- Displaying and organizing your installed extensions
- Enabling/disabling extensions individually or in groups
- Saving your custom group configurations
- Improving extension performance and reliability
- Troubleshooting errors when toggle operations fail

## Data Storage and Security

### Local Storage Only
- **No Cloud Storage**: All data is stored locally on your device using Chrome's storage API
- **No External Servers**: We do not transmit any data to external servers
- **No Analytics**: We do not use Google Analytics or any third-party analytics services
- **No Tracking**: We do not track your browsing activity or collect personal information

### Data Persistence
- Your group configurations and preferences persist across browser sessions
- Failed operation logs are limited to the 50 most recent entries
- Cached data is used only to improve startup performance

## Data Sharing

**We do not share your data with anyone.** Specifically:
- No data is sent to Anthropic or any other company
- No data is sold, rented, or shared with third parties
- No data is used for advertising purposes
- No data leaves your local device

## Permissions Used

Extension Wrangler requires the following Chrome permissions:

### `management`
- **Purpose**: To list, enable, and disable Chrome extensions
- **Justification**: Core functionality of the extension manager

### `storage`
- **Purpose**: To save your group configurations and preferences locally
- **Justification**: Allows your settings to persist between sessions

### `activeTab` (if applicable)
- **Purpose**: Not used by this extension
- **Justification**: N/A

## User Control and Data Deletion

You have complete control over your data:

### Viewing Your Data
- Open the extension popup and click the debug button (🐛)
- Use Chrome DevTools to inspect stored data

### Deleting Your Data
1. **Clear All Data**: Uninstall the extension to remove all stored data
2. **Clear Specific Data**: 
   - Right-click the extension icon → "Inspect popup"
   - In the console, run: `chrome.storage.local.clear()`
3. **Clear Failed Operations**: 
   - In the console, run: `chrome.storage.local.remove(['failedToggles', 'failedOperationQueue'])`

## Children's Privacy

Extension Wrangler does not knowingly collect information from children under 13. The extension is intended for general use by individuals capable of managing browser extensions.

## Changes to This Policy

We may update this Privacy Policy from time to time. Changes will be reflected in the "Last Updated" date above. Continued use of the extension after changes constitutes acceptance of the updated policy.

## Open Source

Extension Wrangler is open source. You can review our code to verify our privacy practices:
- No external API calls
- No data collection endpoints
- All storage operations are local

## Contact Information

For privacy-related questions or concerns about Extension Wrangler:
- Submit an issue on our GitHub repository
- Email: [your-email@example.com]

## Compliance

This extension complies with:
- Chrome Web Store Developer Program Policies
- Chrome Extension Privacy Requirements
- General Data Protection Regulation (GDPR) principles
- California Consumer Privacy Act (CCPA) requirements

## Summary

**Your privacy is paramount. Extension Wrangler:**
- ✅ Stores all data locally on your device
- ✅ Never sends data to external servers
- ✅ Does not track or monitor your browsing
- ✅ Does not collect personal information
- ✅ Does not use analytics or advertising
- ✅ Gives you full control over your data

---

*This privacy policy is designed to be transparent and easy to understand. We believe in minimal data collection and maximum user control.*