# Extension Wrangler Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] - Task 3: Fix migration bugs from code quality review

### Fixed - Three migration correctness issues in `popup.js` and `settings.js`

#### Bug 1: `deviceDataMigrated` stored in sync instead of local storage
`deviceDataMigrated` is a per-device flag that records whether this device has run the one-time cleanup of stale sync keys. It was incorrectly stored in `chrome.storage.sync`, meaning once device A ran cleanup and set the flag, device B would receive the flag via sync before running its own cleanup — permanently skipping the cleanup on device B.
- **`popup.js`** — `migrateFromLocalStorage()`: Changed `chrome.storage.sync.get(['deviceDataMigrated'])` to `chrome.storage.local.get` and `chrome.storage.sync.set({ deviceDataMigrated: true })` to `chrome.storage.local.set`
- **`settings.js`** — `migrateFromLocalStorage()`: Same changes as `popup.js`

#### Bug 2: `local.remove(['groups', 'groupOrder'])` in the "sync wins" branch
When sync already had groups data, the code immediately deleted the local copy. This was unsafe: `chrome.storage.sync.get()` returns the local sync mirror which may be stale or offline. If a user had newer data in local storage from working offline, this would permanently destroy it. `loadData()` already reads sync first, so the local copy is a harmless safety backup.
- **`popup.js`** — `migrateFromLocalStorage()`: Removed `await chrome.storage.local.remove(['groups', 'groupOrder'])` from the `hasSyncData` branch; updated log message
- **`settings.js`** — `migrateFromLocalStorage()`: Same change as `popup.js`

#### Bug 3: Legacy `migrationCompleted` key never removed from sync storage
The `migrationCompleted` flag was removed from the migration logic but existing users with `migrationCompleted: true` in their sync storage carried it forever, wasting sync quota. Added cleanup inside the `deviceDataMigrated` guard block so it is removed once per device on first run.
- **`popup.js`** — `migrateFromLocalStorage()`: Added `migrationCompleted` removal block before `chrome.storage.local.set({ deviceDataMigrated: true })`
- **`settings.js`** — `migrateFromLocalStorage()`: Same addition as `popup.js`

#### Affected Files
- `popup.js` (Task 3 changes — lines 58, 90–97, 113–118)
- `settings.js` (Task 3 changes — lines 36, 68–75, 91–96)

---

## [Unreleased] - Task 2: Move removedExtensions and failedToggles to local storage

### Fixed - Sync Quota: Move Device-Specific Debug Data to Local Storage

#### Problem
`removedExtensions` (orphan cleanup history) and `failedToggles` (toggle error log) were being stored in Chrome sync storage. These are device-specific debug/history items with no cross-device value, and they were consuming sync quota unnecessarily — quota that should be reserved for group data.

#### Changes
- **`popup.js`** — `trackRemovedExtensions()`: Changed `chrome.storage.sync` to `chrome.storage.local` for reads and writes of `removedExtensions`
- **`popup.js`** — `checkFailureHistory()`: Changed to read `failedToggles` from `chrome.storage.local` instead of sync; updated log prefix to `[Sync Fix]`
- **`popup.js`** — `logFailedToggle()`: Changed `chrome.storage.sync.set` to `chrome.storage.local.set` for `failedToggles`
- **`popup.js`** — `showDebugInfo()`: Changed `failedToggles` read and the help-tip `remove` call to use local storage
- **`popup.js`** — `migrateFromLocalStorage()`: Removed `failedToggles` from the groups migration block (groups-only migration now); added one-time cleanup block to drain any stale `removedExtensions`/`failedToggles` from sync and move them to local
- **`settings.js`** — `trackRemovedExtensions()`: Changed sync to local for both the `get` and `set` of `removedExtensions`
- **`settings.js`** — `renderRemovedExtensionsHistory()`: Changed `chrome.storage.sync.get` to `chrome.storage.local.get` for `removedExtensions`
- **`settings.js`** — `clearRemovedExtensionsHistory()`: Changed `chrome.storage.sync.remove` to `chrome.storage.local.remove` for `removedExtensions`
- **`settings.js`** — `migrateFromLocalStorage()`: Added one-time cleanup block to drain stale `removedExtensions`/`failedToggles` from sync into local

#### Affected Files
- `popup.js` (Task 2 changes)
- `settings.js` (Task 2 changes)

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