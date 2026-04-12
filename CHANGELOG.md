# Change Log

## [0.1.3] - 2026-04-XX

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
