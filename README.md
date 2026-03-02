# Extension Wrangler

> Wrangle your Chrome extensions with custom groups and bulk controls

Extension Wrangler helps you organize and manage your Chrome extensions efficiently by grouping them and controlling them in bulk. Create custom groups, enable/disable entire groups at once, and keep your essential extensions always running with the "Fixed" group.

## Features

### 🗂️ **Group Management**
- Create custom groups to organize your extensions
- Enable/disable entire groups with one click
- Drag and drop to reorder groups
- Fixed group for extensions that should always stay enabled

### 🔍 **Smart Search**
- Search through all your extensions quickly
- Filter extensions by name
- See which groups each extension belongs to

### ⚡ **Bulk Operations**
- Toggle entire groups on/off instantly
- Individual extension controls within groups
- Advanced settings for fine-grained control

### 🔄 **Sync Across Devices**
- Chrome sync support for your group configurations
- Automatic migration from local to sync storage
- Works seamlessly across all your Chrome devices

## Installation

### From Chrome Web Store (Recommended)
1. Visit the Chrome Web Store (link coming soon)
2. Click "Add to Chrome"
3. The extension will appear in your toolbar

### Manual Installation (Development)
1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the extension folder
5. The extension will appear in your Chrome toolbar

## Usage

### Popup Interface
- Click the extension icon for quick access to groups
- Groups appear as collapsible accordions (collapsed by default)
- Fixed group appears at the bottom of the list
- Create new groups directly from the popup
- Toggle entire groups on/off with the switch button
- Toggle individual extensions within each group
- Switch to the Search tab to find extensions quickly
- Note: To edit or delete groups, use the Settings page

### Settings Page
- Click "Settings" in the popup for advanced management
- Access all features including:
  - Drag-and-drop group ordering
  - Import/export configurations
  - Bulk enable/disable all extensions
  - Extension statistics

### Creating Groups
1. Click "New Group" in the popup or settings
2. Name your group (e.g., "Development", "Shopping", "Social Media")
3. Select extensions to include
4. Save the group

### Managing Extensions
- Toggle individual extensions with the switch buttons
- Enable/disable entire groups at once
- Extensions in the "Always On" group stay enabled
- See which groups an extension belongs to

## Tips

- Use groups to create different "profiles" for different tasks
- The Fixed group is perfect for security extensions or password managers
- Export your groups to backup your configuration
- Use the search feature to quickly find and toggle specific extensions
- Click on group headers to expand/collapse them

## Troubleshooting

### Chrome Web Store Issues

If you're experiencing issues after installing from the Chrome Web Store:

#### Settings Not Syncing Across Devices
1. Open the extension popup and click the debug button (🐛)
2. Check the console for Web Store diagnostic information
3. Run: `await window.webStoreUtils.runDiagnostics()`
4. If sync storage quota is exceeded, the extension will automatically use local storage

#### Extension Errors or Failures
1. Click the debug button in the popup for detailed error information
2. Check for quota warnings: `await window.webStoreUtils.checkSyncStorageQuota()`
3. Try the "Refresh" button in Settings to reload extension data
4. If issues persist, export your groups and reimport them

#### Performance Issues
- The extension automatically detects Web Store vs. manual installation
- Web Store versions may have different performance characteristics
- Storage operations include automatic fallbacks for reliability

### Debug Information

The extension includes comprehensive debugging tools:

```javascript
// Run full diagnostics (in popup console)
await window.webStoreUtils.runDiagnostics()

// Check storage quota
await window.webStoreUtils.checkSyncStorageQuota()

// Analyze storage usage
await window.webStoreUtils.analyzeStorageUsage()

// Manual cleanup
await window.organizer.cleanupOrphanedExtensions()

// Export groups for backup
copy(JSON.stringify(window.organizer.groups))
```

### Common Issues

**Q: My groups disappeared after updating Chrome**
A: Your groups are stored in Chrome sync. Try clicking "Refresh" in Settings or check the debug console for migration information.

**Q: Extensions won't toggle on/off**
A: Some extensions require user interaction to toggle. Check the debug console for specific error messages about failed toggles.

**Q: Storage quota exceeded error**
A: The extension automatically falls back to local storage. This is normal for users with many extensions and complex group configurations.

**Q: Fixed group extensions keep getting disabled**
A: This is intended behavior. Extensions in the Fixed group are automatically re-enabled if something tries to disable them.

**Q: Chrome Web Store version shows "No extensions loaded"**
A: This is a timing issue with Chrome Web Store security. The extension now includes automatic retry logic. If it persists:
1. Close and reopen the extension popup/settings
2. Check Chrome's extension permissions are fully granted
3. Look for detailed error messages in the browser console

**Q: Drag and drop reordering doesn't work (Chrome Web Store version)**
A: The Chrome Web Store has stricter security policies. The latest version includes enhanced compatibility:
1. Ensure groups are fully loaded before attempting to drag
2. Try dragging by the drag handle (dots icon) rather than the group name
3. Check the console for "[Drag Debug]" messages for specific issues

## Permissions

The extension requires:
- `management`: To read and control other extensions
- `storage`: To save your group configurations
- `unlimitedStorage`: Enhanced storage reliability for complex configurations

## Development

To modify the extension:
1. Edit the files in the `extension-wrangler` folder
2. Go to `chrome://extensions/`
3. Click the refresh icon on the Extension Wrangler card
4. Test your changes

## Version History

- 1.0: Initial release with group management, bulk controls, and search functionality