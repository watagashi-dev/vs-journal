# VS Journal

VS Journal is a lightweight journaling extension for Visual Studio Code, designed for quickly capturing and organizing daily work notes.

It lets you manage Markdown-based notes with hashtags, so you can keep a seamless work log without leaving your editor.

GitHub  
https://github.com/watagashi-dev/vs-journal

---

## Overview

VS Journal is built for developers who use VS Code daily and want a frictionless way to keep notes.

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

### 4. Tag Autocompletion

Tags are suggested as you type based on existing tags.

- Prevents inconsistencies
- Faster input
- Suggestions are automatically sorted

---

### 5. Enhanced Preview

The Markdown preview is optimized for readability and interaction.

- Syntax highlighting for code blocks
- Improved table rendering (header emphasis, borders)
- Better checklist visibility
- Inline display of external images
- Confirmation dialog when opening external links

#### Tag-Based Combined Preview

Clicking a tag shows all related notes merged into a single preview.

- Useful for reviewing related entries across files
- Internally limited to prevent performance issues

---

### 6. Tag View

Organize and navigate notes through a hierarchical tag tree.

- Tags displayed as a tree structure
- Automatically sorted alphabetically
- Files within tags are sorted by title

---

### 7. System Tags

Tags automatically assigned based on file state.

- `Today` — Notes updated today
- `Untagged` — Notes without any user-defined tags

These are dynamically generated and not based on file content.

---

### 8. Keyboard & UI Interaction

Quick access to preview while editing.

- Open preview via shortcut or command
- Preview can also be triggered from the side panel toolbar
- Smooth transition between preview and editor

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

---

## Keyboard Shortcuts

| Action | Windows / Linux | macOS |
| :--- | :--- | :--- |
| New Entry | Ctrl+Alt+N | Cmd+Option+N |
| Preview | Ctrl+Alt+P | Cmd+Option+P |
| Focus Tag View | Ctrl+Alt+J | Cmd+Option+J |

---

## Configuration

| Setting | Description | Default |
| :--- | :--- | :--- |
| vsJournal.journalDir | Storage folder | $HOME/VSJournal |
| vsJournal.autoSave | Auto-save delay (ms) | 800 |
| vsJournal.enableDateTime | Insert date/time on new file | true |
| vsJournal.systemTags.visibility | Control system tag visibility | { "Today": true } |

Example:

```json
{
  "vsJournal.journalDir": "/path/to/journal",
  "vsJournal.autoSave": 30000,
  "vsJournal.enableDateTime": false,
  "vsJournal.systemTags.visibility": {
    "Today": true
  }
}
```

---

## Directory Structure

Files are stored flatly without subfolders:

```
VSJournal/
  2025-03-07-10-08.md
  2025-03-08-14-30.md
  2026-01-01-18-23.md
```

---

## Who It's For

- Developers using VS Code daily
- People who want to keep work logs
- Users looking for a lightweight note system

---

## Why This Tool Exists

- To keep notes entirely inside VS Code
- To organize related information across files
- To build a simple tag-based system
- To stay fast and minimal

Inspired by **HOWM (Hitori Otegaru Wiki Modoki)** for Emacs.

---

## Roadmap

VS Journal will continue to evolve while staying simple and lightweight.

### Better Organization

- Virtual tags (search-based dynamic tags)
- Heading-based structure and navigation
- Section-level combined preview

### Writing Experience

- Enhanced Markdown editing support
- Basic math expression support

### Media Handling

- Paste images with automatic saving and insertion

### File Management

- File renaming support
- Optional folder-based organization

---

## License

MIT License
