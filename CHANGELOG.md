# Extension Wrangler Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.1] - 2025-09-26
### Fixed - Chrome Web Store Critical Issues Resolution

This release addresses critical issues specifically affecting the Chrome Web Store version that prevented proper functionality.

#### Extension Loading Fixes
- **Fixed Chrome Extension Management API Loading**: Resolved issue where `chrome.management.getAll()` fails in Chrome Web Store environment
- **Added Retry Logic**: Implemented robust retry mechanism with 1.5-second delay for Chrome Web Store initialization timing
- **Enhanced Validation**: Added comprehensive validation for extension data to handle API inconsistencies
- **Improved Error Logging**: Added detailed diagnostic logging to identify Chrome Web Store specific issues

#### Drag & Drop Functionality Fixes
- **Fixed Group Reordering**: Resolved "Invalid drag operation" errors in Chrome Web Store version
- **Enhanced Drag State Management**: Improved tracking of dragged group IDs with multiple fallback mechanisms
- **Chrome Web Store CSP Compatibility**: Added alternative data transfer methods for stricter CSP environments
- **Comprehensive Debugging**: Added detailed drag event logging to diagnose Chrome Web Store specific issues

#### Technical Improvements
- **Multi-Source Drag Data**: Uses multiple `dataTransfer` data types for broader browser compatibility
- **State Validation**: Enhanced validation of group order and dragged group existence
- **Warning Notifications**: Added warning notification type for non-critical but important user feedback
- **Initialization Timing**: Improved timing handling for Chrome Web Store's different execution context

#### Files Modified
- `settings.js` v1.1.1: Enhanced extension loading with retry logic and improved drag & drop handling
- `popup.js` v1.1.1: Applied same extension loading improvements for consistency
- `settings.html` v1.1.1: Added warning notification styling

## [1.1.0] - 2024-09-23
### Added - Chrome Web Store Compatibility Improvements

This release focuses on fixing reliability issues when the extension is distributed through the Chrome Web Store versus manual installation.

#### New Features
- **Web Store Compatibility Detection**: Automatically detects if extension is running from Chrome Web Store vs. manual installation
- **Storage Quota Monitoring**: Real-time monitoring of Chrome sync storage quota usage with warnings and fallbacks
- **Enhanced Error Handling**: Comprehensive error logging with Web Store-specific debugging information
- **Storage Migration Optimization**: One-time migration from local to sync storage instead of running on every popup open
- **Diagnostic Tools**: Built-in diagnostic utilities accessible via debug button for troubleshooting

#### Technical Improvements
- **Storage Consistency**: Fixed background.js to use `chrome.storage.sync` instead of `chrome.storage.local` for consistency
- **Enhanced Manifest Permissions**: Added `unlimitedStorage` permission for better sync reliability
- **Fallback Storage**: Automatic fallback to local storage when sync storage quota is exceeded or fails
- **Better Error Recovery**: Graceful handling of storage failures with user-friendly messages
- **Performance Optimizations**: Reduced redundant storage operations and improved initialization flow

#### Bug Fixes
- Fixed settings sync issues across multiple devices when installed from Chrome Web Store
- Resolved storage permission errors in Web Store environment
- Fixed migration logic running repeatedly causing performance issues
- Improved error handling for quota exceeded scenarios
- Enhanced logging for better troubleshooting of Web Store-specific issues

#### Files Modified
- `manifest.json`: Added `unlimitedStorage` permission
- `background.js`: Updated to use sync storage consistently, added fallback handling
- `popup.js`: Enhanced error handling, optimized migration, added Web Store diagnostics
- `settings.js`: Improved storage operations with Web Store compatibility
- `popup.html`: Added webstore-utils.js script
- `settings.html`: Added webstore-utils.js script

#### New Files
- `webstore-utils.js`: Web Store compatibility and storage utility module
- `CLAUDE.md`: Development guidelines and documentation standards

### Technical Details

#### Storage Architecture Changes
- **Before**: Mixed usage of `chrome.storage.local` and `chrome.storage.sync`
- **After**: Consistent use of `chrome.storage.sync` with intelligent fallback to local storage

#### Error Handling Improvements
- **Before**: Basic try-catch blocks with minimal logging
- **After**: Comprehensive error analysis with Web Store-specific diagnostics and recovery strategies

#### Migration Strategy
- **Before**: Migration ran on every popup open
- **After**: One-time migration with completion tracking to prevent redundant operations

### For Developers

To test the Web Store compatibility features:

1. **Run diagnostics**: Open popup, click debug button, or run `await window.webStoreUtils.runDiagnostics()` in console
2. **Check storage quota**: `await window.webStoreUtils.checkSyncStorageQuota()`
3. **Analyze storage usage**: `await window.webStoreUtils.analyzeStorageUsage()`

### Breaking Changes
None. All changes are backwards compatible.

### Migration Guide
No user action required. The extension will automatically migrate existing data from local storage to sync storage on first run of the new version.

---

## [1.0.0] - 2024-09-20
### Initial Release
- Basic extension grouping functionality
- Enable/disable groups of extensions
- Fixed group for always-on extensions
- Settings page for advanced group management
- Search functionality for extensions