# Extension Wrangler

A Chrome extension for organizing and managing your extensions with custom groups and bulk controls.

## Features

- **Custom Groups**: Create groups to organize extensions by purpose, project, or any criteria
- **Bulk Controls**: Enable/disable entire groups with one click
- **Always On Group**: Keep essential extensions always enabled
- **Search**: Quickly find extensions across all groups
- **Settings Page**: Comprehensive management interface with advanced features
- **Import/Export**: Save and restore your group configurations

## Installation

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" in the top right
3. Click "Load unpacked"
4. Select the `extension-wrangler` folder
5. The extension will appear in your Chrome toolbar

## Usage

### Popup Interface
- Click the extension icon for quick access to groups
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
- The Always On group is perfect for security extensions or password managers
- Export your groups to backup your configuration
- Use the search feature to quickly find and toggle specific extensions

## Permissions

The extension requires:
- `management`: To read and control other extensions
- `storage`: To save your group configurations

## Troubleshooting

If the extension doesn't work:
1. Ensure you have the necessary permissions enabled
2. Try refreshing the extensions page
3. Check the console for any error messages

## Development

To modify the extension:
1. Edit the files in the `extension-wrangler` folder
2. Go to `chrome://extensions/`
3. Click the refresh icon on the Extension Wrangler card
4. Test your changes

## Version History

- 1.0: Initial release with group management, bulk controls, and search functionality