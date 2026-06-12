# Change Log

## [0.4.0] - 2026-06-

### Fixed

- Can't delete virtual tag

### Added

- Configurable file naming formats for new entries
- Configurable folder structures for journal storage
- Image paste support with automatic image saving and Markdown insertion
- File link insertion from the editor context menu
- Folder link insertion from the editor context menu
- Support for opening local files and folders from preview
- Configurable internal file opening extensions

### Changed

- Journal scanning now supports Markdown files in subdirectories

## [0.3.2] - 2026-06-01

### Fixed

- Fixed numerous user tag highlighting issues in Markdown preview.
- Fixed tags being incorrectly detected inside code blocks, inline code, blockquotes, lists, and tables.
- Fixed heading tag rendering and validation edge cases.
- Fixed inconsistencies between tag extraction and displayed tag highlights.

### Changed

- Reimplemented tag highlighting using markdown-it AST-aware processing.
- Deduplicated extracted tags in file metadata.
- Expanded test coverage for tag parsing and rendering behavior.
- Improved virtual tag highlight visibility.

## [0.3.1] - 2026-05-24

### Added

- Added virtual tag deletion from the tag tree context menu.
- Added optional confirmation dialog for virtual tag deletion (`vsJournal.confirmDeleteVirtualTag`).
- Added virtual tag keyword highlighting inside code blocks.
- Added navigation UI for virtual tag matches in preview.
- Added keyboard navigation for virtual tag matches (`Ctrl + ↑ / ↓`).
- Added scroll synchronization for virtual tag navigation.
- Added user tag color highlighting in preview.
- Added support for consistent preview context propagation between tree view and preview panel.

### Changed

- Refactored preview highlighting into a unified rules-based pipeline.
- Unified virtual tag session state management.
- Unified preview context handling between file preview and tag preview.
- Unified tag source model and removed duplicated node source handling.
- Improved virtual tag match synchronization between webview and extension host.
- Improved DOM-based scrolling accuracy for virtual tag navigation.
- Improved preview rendering architecture for future extensibility.

### Fixed

- Fixed duplicate `fileMetaMap` entries caused by Windows file path case mismatches.
- Fixed virtual tag match collection inside code blocks.
- Fixed highlight consistency across normal text and code blocks.
- Fixed webview dataset handling for highlight rules.

## [0.3.0] - 2026-04-26

### Added

- **Virtual Tags**: Introduced a dynamic tagging system. You can now add "Virtual Tags" that automatically group files containing specific keywords without manually adding hash tags to the file content.
- **File Deletion**: Added a "Delete File" command to the tag tree context menu.
- **Scroll Synchronization**: The preview now automatically scrolls to the line corresponding to your cursor position in the editor.
- **Configuration Options**:
    - `vsJournal.confirmDeleteFile`: Toggle the confirmation dialog when deleting files.
    - `vsJournal.virtualTags.caseSensitive`: Control whether virtual tag keyword matching is case-sensitive.

### Changed

- **Webview Refactoring**: The preview panel has been completely refactored. It now uses an external HTML template and separate TypeScript/CSS files, improving maintainability and performance.
- **UI Enhancements**: 
    - Updated command icons (`new-file`, `preview`, `tag`) for a more native VS Code look.
    - Activity Bar title changed from "vsJournal" to "VS Journal".
    - The "Edit Hint" in the preview now automatically hides during scrolling/inactivity and adapts based on the number of files being previewed.
- **State Management**: Internal logic for tag indexing and metadata extraction has been optimized to reduce redundant file system access.
- **Localization**: Expanded Japanese localization coverage for new commands, settings, and UI strings.

### Removed

- Removed the "Focus Tag View" keyboard shortcut (`Ctrl+Alt+J`) to avoid potential conflicts and simplify the default keybinding set.

### Fixed

- Improved file watcher logic to correctly trigger a tree rebuild when files are deleted externally.
- Fixed tag extraction consistency across code blocks and inline code.
- Fixed duplicate rendering of inline code in task list items.

---

## [0.2.0] - 2026-04-12

### New Features

- **Tag-based combined preview**
  - Clicking a tag now shows all related notes merged into a single preview
  - Useful for reviewing entries across multiple files

### Improvements

- **Preview UI enhancements**
  - Improved table rendering (header emphasis, border adjustments)
  - Better checklist visibility
  - Reduced excessive margins and improved readability
  - Syntax highlighting for code blocks
  - Inline display of external images

- **Tag view improvements**
  - Tags are now sorted alphabetically
  - Files within tags are sorted by title for stable ordering

- **Tag input experience**
  - Autocompletion suggestions are now sorted
  - Improved consistency in tag handling

### Safety

- Added confirmation dialog when opening external links from preview

### Fixes

- Fixed tag extraction issues in edge cases (e.g. inline/code block contexts)
- Fixed inconsistent behavior in list rendering and indentation
- Fixed issues where file order changed unexpectedly after edits

---

## [0.1.3] - 2026-03-28

### Fixed

- Fixed an issue where external CSS could not be loaded in the webview

### Improved

- Improved heading spacing and visual hierarchy
- Fixed list wrapping for long content
- Adjusted table layout to better fit content width

## [0.1.2] - 2026-03-25

### Changed

- Disable tag detection and completion inside code blocks

### Fixed

- Tag completion appearing in non-VS Journal files
- Webview not updating in real time when editing Markdown
- Local images not loading in Webview

## [0.1.1] - 2026-03-22

### Fixed

- Rename extension to avoid name conflict

## [0.1.0 - 2026-03-22]

Initial release
