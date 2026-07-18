# VS Journal

VS Journal is a lightweight journaling extension for Visual Studio Code, designed for quickly capturing and organizing daily work notes.

It lets you manage Markdown-based notes with hashtags, so you can keep a seamless work log without leaving your editor.

GitHub  
https://github.com/watagashi-dev/vs-journal

---

## Overview

VS Journal is built for people who use VS Code daily and want a frictionless way to keep notes.

- **Fully Local**: All data is stored as local Markdown files.
- **No Database Required**: Notes are managed on a simple file-based system.
- **High Performance**: The lightweight design ensures it won't interrupt your workflow.

---

## Installation

Install **VS Journal** from the VS Code Marketplace.

1. Open the **Extensions** view (`Ctrl+Shift+X`)
2. Search for **VS Journal**
3. Click **Install**

Alternatively, install it directly from the marketplace:

https://marketplace.visualstudio.com/items?itemName=watagashi-dev.vs-journal-tag

---

## Quick Start

1. Open the **Command Palette** (`Ctrl+Shift+P` / `Cmd+Shift+P`)
2. Run **VS Journal: New Entry**
3. Start writing your notes in Markdown and organize them using hashtags.

**Example:**
```markdown
# Work Notes — 2026-03-05

_March 5, 2026_ _10:15_

## Today's Work

- Updated the README
- Implemented tag support
- Improved the UI

#work #project/vs-journal
```

---
## Screenshots

### Editing an Entry

Write notes easily in Markdown. Tag autocompletion is supported.  
![](images/screenshot-entry.png)

### Markdown Preview

Click a title (or filename) in the tag tree to open the preview.

- Click anywhere or press `Enter` to return to the editor  
- Clicking a tag shows multiple related notes in a single combined view  

![](images/screenshot-preview.png)

When a preview contains multiple matches from a virtual tag,
a navigation bar is displayed, allowing quick jumps between matches.

![](images/screenshot-navi.png)

- Keyboard navigation is also available using `Ctrl+Up / Down Arrow`.
- The current match is automatically synchronized with scrolling.

### Tag View

Browse and organize notes in a tree structure based on hashtags.  
Tags are automatically sorted alphabetically.

![](images/screenshot-tagtree.png)

---

## Features

### 1. Lightweight by Design

VS Journal is optimized for speed. No complex setup or heavy systems.

---

### 2. Markdown-Based

All notes are stored as standard `.md` files.

- Use full VS Code editing features
- Easy backup and migration
- High portability
- Supports organization using folder hierarchies

---

### 3. Hashtag-Based Organization

Organize notes flexibly using hashtags.

Example:

```
#work
#idea
#project/vs-journal
```

#### Hierarchical Tags

Tags can be nested using `/` (up to 4 levels):

```
#project/dev/frontend
```

#### Tag Rules

- Tags are only recognized when written:
  - On a standalone line, or
  - On a heading line
- Hashtags inside sentences are ignored
- Hashtags inside code blocks are ignored
- Hashtags inside inline code are also ignored

---

### 4. Virtual Tags (Dynamic Tagging)

Group notes dynamically without writing hashtags into files.
Virtual tags are based on search conditions and can be used to organize related notes automatically.

- Save search conditions as reusable virtual tags
- Highlight matching content directly in preview
- Display matching notes in a combined view
- Navigate between matches using UI controls or keyboard shortcuts
- Matching portions of tag names are highlighted directly in the preview
- Link and image paths, titles, and related metadata can also be matched by virtual tags

---

### 5. Tag Autocompletion

Tags are suggested as you type based on existing tags.

- Prevents inconsistencies
- Faster input
- Suggestions are automatically sorted
- Frequently used tags are displayed higher in the suggestion list
- Completion ranking is automatically persisted

---

### 6. Enhanced Preview

The Markdown preview is optimized for readability and interaction.

- Highlighting for user tags and virtual tag matches
- Syntax highlighting for code blocks
- Support for diff code block rendering
- Language labels for code blocks
- Support for simple TeX-style mathematical expressions
- Improved table rendering (header emphasis, borders)
- Better checklist visibility
- Inline display of external images
- Support for opening external links

#### Tag-Based Combined Preview

Clicking a tag shows all related notes merged into a single preview.

- Useful for reviewing related entries across files

Large note collections may be partially displayed to maintain performance.

---

### VS Journal Markdown Extensions

In addition to standard Markdown, VS Journal supports several extended syntax features.

#### Mathematical Expressions

Simple TeX-style mathematical expressions can be rendered in the preview.

Inline expression:

```markdown
$E = mc^2$
```

Block expression:

```markdown
$$
\sum_{i=1}^{n} i
$$
```

#### Diff Code Blocks

Diff-style code blocks can be rendered with added and removed lines highlighted.
They can also be combined with normal language specification.

````text
```cpp_diff
- int value = 10;
+ int value = 20;
```
````

![](images/screenshot-diff-sample.png)

#### Image Display Options

Image display size can be controlled using options in the ALT text.

Supported options:

| Option | Description |
|---------|-------------|
| width | Set image width (px) |
| height | Set image height (px) |

Width:

```markdown
![Screenshot|width=400](image.png)
```

Height:

```markdown
![Screenshot|height=300](image.png)
```

Multiple options:

```markdown
![Screenshot|width=400|height=300](image.png)
```

---

### 7. Images & File Links

Insert images and links directly while editing Markdown.

- Save and paste clipboard images
- Insert file and folder links
- Open local files and folders from preview
- Control image display size through ALT text options

Journal file and folder links are stored using relative paths whenever possible.

---

### 8. Tag View

Organize and navigate notes through a hierarchical tag tree.

- Tags displayed as a tree structure
- Automatically sorted
- Manage files and virtual tags directly from the Tag Tree context menu

---

### 9. System Tags

Tags automatically assigned based on file state.

- `Today` — Notes updated today
- `Untagged` — Notes without any user-defined tags

These are dynamically generated and not based on file content.

System tag visibility can be configured in settings.

---

### 10. Keyboard & UI Interaction

Quick access to preview while editing.

- Open preview via shortcut or command
- Preview can also be triggered from the side panel toolbar
- Smooth transition between preview and editor
- When virtual tag navigation is available, use `Ctrl+Up` / `Ctrl+Down Arrow` to jump between matches

---

## Usage

### Create a New Entry

Run from the Command Palette:

```
VS Journal: New Entry
```

Shortcut:

```
Ctrl+Alt+N (Windows / Linux)
Cmd+Option+N (macOS)
```

---

### Write Notes

Example:

```markdown
# Work Notes — 2026-03-05

_March 5, 2026_ _10:15_

## Today's Work

- Updated README
- Implemented tag feature
- UI improvements

#work #project/vs-journal
```

When creating a new file:

- A heading is inserted on the first line
- Current date/time is inserted on the second line (can be disabled)
- File naming format and folder structure can be customized in settings

---

### Insert Images and Links

While editing a Markdown file, the following actions are available from the editor context menu:

- VSJ: Paste Image
- VSJ: Insert File Link
- VSJ: Insert Folder Link

Shortcuts:

| Action | Windows / Linux | macOS |
| :--- | :--- | :--- |
| Paste Image | Ctrl+Alt+V | Cmd+Option+V |
| Insert File Link | Ctrl+Alt+I | Cmd+Option+I |
| Insert Folder Link | Ctrl+Alt+Shift+I | Cmd+Option+Shift+I |

When pasting an image, the clipboard image is saved automatically and a Markdown image link is inserted.

Image size can be controlled using ALT text options.
See **VS Journal Markdown Extensions** for details.

---

### Preview Notes

You can open preview in several ways:

- Click from the tag view
- Use the side panel toolbar button
- Run a command
- Use a keyboard shortcut

```
VS Journal: Preview Entry
```

Shortcut:

```
Ctrl+Alt+P (Windows / Linux)
Cmd+Option+P (macOS)
```

---

## Commands

| Command | Description |
| :--- | :--- |
| VS Journal: New Entry | Create a new note |
| VS Journal: Preview Entry | Preview a note |
| VS Journal: Select Journal Directory | Change storage folder |
| VS Journal: Add Virtual Tag | Add a new virtual tag |

---

## Keyboard Shortcuts

| Action | Windows / Linux | macOS |
| :--- | :--- | :--- |
| New Entry | Ctrl+Alt+N | Cmd+Option+N |
| Preview | Ctrl+Alt+P | Cmd+Option+P |
| Paste Image | Ctrl+Alt+V | Cmd+Option+V |
| Insert File Link | Ctrl+Alt+I | Cmd+Option+I |
| Insert Folder Link | Ctrl+Alt+Shift+I | Cmd+Option+Shift+I |

---

## Configuration

| Setting | Description | Default |
| :--- | :--- | :--- |
| vsJournal.journalDir | Storage folder | $HOME/VSJournal |
| vsJournal.autoSave | Auto-save delay (ms) | 800 |
| vsJournal.enableDateTime | Insert date/time on new file | true |
| vsJournal.confirmDeleteFile | Confirm before deleting file | true |
| vsJournal.confirmDeleteVirtualTag | Confirm before deleting virtual tag | true |
| vsJournal.virtualTags.caseSensitive | Case-sensitive virtual tags | false |
| vsJournal.systemTags.visibility | Control system tag visibility | { "Today": true } |
| vsJournal.fileNameStyle | File naming format for new entries | datetime-minute |
| vsJournal.folderStructure | Folder structure for new entries | flat |
| vsJournal.paste.saveLocation | Location for pasted images | structured |
| vsJournal.internalOpenExtensions | Extensions opened inside VS Code | [".md"] |

Example:

```json
{
  "vsJournal.journalDir": "/path/to/journal",
  "vsJournal.autoSave": 30000,
  "vsJournal.enableDateTime": false,
  "vsJournal.confirmDeleteFile": false,
  "vsJournal.confirmDeleteVirtualTag": false,
  "vsJournal.virtualTags.caseSensitive": true,
  "vsJournal.systemTags.visibility": {
    "Today": true
  },
  "vsJournal.fileNameStyle": "datetime-minute",
  "vsJournal.folderStructure": "yyyy-mm-dd",
  "vsJournal.paste.saveLocation": "structured",
  "vsJournal.internalOpenExtensions": [
    ".md",
    ".txt"
  ]
}
```

---

## Directory Structure

Example (flat):

```
Journal Directory/
  2025-03-07-10-08.md
  2025-03-08-14-30.md
  2026-01-01-18-23.md
```

Example (yyyy-mm-dd):

```
Journal Directory/
  2026/
    05/
      07/
        2026-05-07-13-45.md
```

When using image pasting, an image directory associated with the note is created automatically.

---

## Who It's For

- People who use VS Code regularly
- Users who want to keep work logs or ideas
- People who prefer Markdown-based notes
- Users looking for a lightweight note system

---

## Why This Tool Exists

- To keep notes entirely inside VS Code
- To organize related information across files
- To build a simple tag-based system
- To stay fast and minimal

Inspired by HOWM's philosophy of lightweight, file-based note taking.

---

## Roadmap

VS Journal will continue to evolve while staying simple and lightweight.

### Better Organization

- Improved organization and navigation features

### Writing Experience

- Enhanced Markdown editing support

---

## License

MIT License
