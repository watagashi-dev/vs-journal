// src/extension.ts
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { FileMeta } from './models/FileMeta';
import { measure } from './perf';
import { TagHierarchyBuilder, TagHierarchyNode } from './services/TagHierarchyBuilder';
import { createFileMeta } from './services/fileMetaService';
import { TagTreeProvider } from './sidebar/TagTreeProvider';
import { formatFileNameDate, formatDateString, formatTimeString } from './utils/date';
import { getWorkspaceRoot } from './utils/workspace';
import {
    setPreviewState, getPreviewState,
    ensurePreviewPanel, updatePreviewPanel,
    setExtensionContext, setCurrentDocument,
    getCurrentPanel,
    notifyThemeChanged, disposePreviewPanel
} from './preview/previewPanel';
import { shouldShowCompletionMultiLine, getCurrentTagAtCursor } from './services/tagLogic';
import {
    clearCursorLine,
    setCursorLine,
    systemTagIndexMap, userTagIndexMap, virtualTagIndexMap,
    virtualTagSet, resetVirtualTags
} from './state';
import {
    indexVirtualTags, indexVirtualTagForAllFiles,
    removeVirtualTagsForFile,
    rebuildVirtualTagIndex
} from './services/virtualTagService';

let tagProvider: TagTreeProvider;

// State management
const fileMetaMap = new Map<string, FileMeta>();
const sessionTagUsage = new Map<string, number>();

function getJournalDir(): string {
    const config = vscode.workspace.getConfiguration('vsJournal');
    const setting = config.inspect<string>('journalDir');
    if (!setting || (setting.globalValue === undefined && setting.workspaceValue === undefined && setting.workspaceFolderValue === undefined)) {
        return path.join(os.homedir(), 'vsJournal');
    }
    return config.get<string>('journalDir') ?? path.join(os.homedir(), 'vsJournal');
}

export function getAbsoluteJournalDir(
  journalDir: string,
  workspaceRoot?: string
): string | undefined {
    if (path.isAbsolute(journalDir)) {
        return journalDir;
    }
    const root = workspaceRoot ?? getWorkspaceRoot();
    return root ? path.join(root, journalDir) : undefined;
}

export function getJournalRelativePath(filePath: string): string {
    const journalDir = getAbsoluteJournalDir(getJournalDir());
    if (!journalDir) {
        return filePath;
    }
    return path.relative(journalDir, filePath).replace(/\\/g, '/');
}

type SystemTagDefinition = {
    id: string;
    build: (meta: FileMeta) => boolean;
};

const systemTagDefinitions: SystemTagDefinition[] = [
    {
        id: 'Today',
        build: (_meta) => {
            const now = new Date();
            const mtime = new Date(_meta.mtime);

            return (
                now.getMonth() === mtime.getMonth() &&
                now.getDate() === mtime.getDate()
            );
        }
    },
    {
        id: 'Untagged',
        build: (meta) => meta.tags.length === 0
    }
];

function rebuildSystemTags() {
    systemTagIndexMap.clear();

    // Initialize: create empty arrays for all system tags
    for (const def of systemTagDefinitions) {
        systemTagIndexMap.set(def.id, []);
    }

    // Iterate through all files once
    for (const meta of fileMetaMap.values()) {
        for (const def of systemTagDefinitions) {
            if (def.build(meta)) {
                systemTagIndexMap.get(def.id)!.push(meta);
            }
        }
    }
}

function rebuildTree() {
    const config = vscode.workspace.getConfiguration('vsJournal');
    const visibility = config.get<Record<string, boolean>>(
        'systemTags.visibility',
        {}
    );
    const filteredSystemMap = new Map<string, FileMeta[]>();

    for (const [key, value] of systemTagIndexMap.entries()) {
        if (visibility[key] !== false) {
            filteredSystemMap.set(key, value);
        }
    }

    // --- Ensure virtual tags exist even with 0 entries ---
    const normalizedVirtualMap = new Map<string, FileMeta[]>();

    for (const tag of virtualTagSet) {
        normalizedVirtualMap.set(
            tag,
            virtualTagIndexMap.get(tag) ?? []
        );
    }

    const hierarchyBuilder = new TagHierarchyBuilder();
    const result = hierarchyBuilder.build(
        filteredSystemMap,
        userTagIndexMap,
        normalizedVirtualMap
    );
    tagProvider.refresh(result.system, result.user, result.virtual);
}

export function readFileEntry(filePath: string): { content: string; stats: fs.Stats } {
    const content = fs.readFileSync(filePath, 'utf-8');
    const stats = fs.statSync(filePath);

    return { content, stats };
}

async function refreshAllData() {
    const journalDir = getJournalDir();
    const fullDir = getAbsoluteJournalDir(journalDir);

    fileMetaMap.clear();
    userTagIndexMap.clear();
    systemTagIndexMap.clear();
    virtualTagIndexMap.clear();

    if (!fullDir || !fs.existsSync(fullDir)) {
        return;
    }

    const files = fs.readdirSync(fullDir).filter(f => f.endsWith('.md'));

    const fileCache = new Map<string, { content: string; stats: any }>();

    for (const file of files) {
        const filePath = path.join(fullDir, file);

        const entry = readFileEntry(filePath);
        fileCache.set(filePath, entry);

        const meta = createFileMeta(filePath, entry.content, entry.stats);
        fileMetaMap.set(filePath, meta);

        addUserTagsFromMeta(meta);
    }

    rebuildSystemTags();

    const readFileContent = (filePath: string): string => {
        return fileCache.get(filePath)?.content ?? '';
    };

    rebuildVirtualTagIndex(fileMetaMap, readFileContent);
}

function removeUserTagsFromMeta(oldMeta: FileMeta | undefined) {
    if (!oldMeta) {
        return;
    }

    oldMeta.tags.forEach(tag => {
        const files = userTagIndexMap.get(tag);

        if (files) {
            const filtered = files.filter(f => f.filePath !== oldMeta.filePath);

            if (filtered.length === 0) {
                userTagIndexMap.delete(tag);
            } else {
                userTagIndexMap.set(tag, filtered);
            }
        }
    });
}

function addUserTagsFromMeta(meta: FileMeta) {
    meta.tags.forEach(tag => {
        const arr = userTagIndexMap.get(tag) ?? [];
        userTagIndexMap.set(tag, [...arr, meta]);
    });
}

function updateSingleFile(filePath: string) {
    const oldMeta = fileMetaMap.get(filePath);

    // --- Remove from old user tags ---
    removeUserTagsFromMeta(oldMeta);

    // --- Read file ---
    const { content, stats } = readFileEntry(filePath);

    // --- Create new FileMeta ---
    const newMeta = createFileMeta(filePath, content, stats);
    fileMetaMap.set(filePath, newMeta);

    // --- Add to user tags ---
    addUserTagsFromMeta(newMeta);

    // --- Virtual tags ---
    removeVirtualTagsForFile(filePath);
    indexVirtualTags(newMeta, content);

    rebuildSystemTags();
}

function checkPreviewLimits(files: FileMeta[]): {
    limitedFiles: FileMeta[];
    limitExceeded: boolean;
    message?: string;
} {
    const MAX_TOTAL_SIZE = 2 * 1024 * 1024; // 2MB
    const MAX_FILES = 80;
//    const MAX_TOTAL_SIZE = 3 * 1024;
//    const MAX_FILES = 4;

    let totalSize = 0;
    const result: FileMeta[] = [];

    for (const file of files) {
        if (result.length >= MAX_FILES) {
            return {
                limitedFiles: result,
                limitExceeded: true,
                message: vscode.l10n.t('Preview truncated: too many files')
            };
        }

        if (totalSize + file.size > MAX_TOTAL_SIZE) {
            return {
                limitedFiles: result,
                limitExceeded: true,
                message: vscode.l10n.t('Preview truncated: size limit exceeded')
            };
        }

        totalSize += file.size;
        result.push(file);
    }

    return {
        limitedFiles: result,
        limitExceeded: false
    };
}

export async function activate(context: vscode.ExtensionContext) {
    setExtensionContext(context);

    // --- Status Bar ---
    const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    context.subscriptions.push(statusBar);

    const updateStatusBar = () => {
        const dir = getAbsoluteJournalDir(getJournalDir());
        if (dir) {
            const shortDir = dir.length > 40 ? '…' + dir.slice(-37) : dir;
            statusBar.text = `VS Journal: ${shortDir}`;
            statusBar.tooltip = dir;
            statusBar.show();
        } else {
            statusBar.hide();
        }
    };

    // --- File Watcher ---
    let fileWatcher: vscode.FileSystemWatcher | undefined;
    const setupWatcher = () => {
        if (fileWatcher) {fileWatcher.dispose();}

        const absDir = getAbsoluteJournalDir(getJournalDir());
        if (!absDir) {return;}

        const pattern = new vscode.RelativePattern(absDir, '**/*.md');
        fileWatcher = vscode.workspace.createFileSystemWatcher(pattern);

        fileWatcher.onDidCreate(uri => {
            updateSingleFile(uri.fsPath);
            rebuildTree();
        });
        fileWatcher.onDidChange(uri => {
            updateSingleFile(uri.fsPath);
            rebuildTree();
        });
        fileWatcher.onDidDelete(() => {
            refreshAllData();
            rebuildTree();
        });

        context.subscriptions.push(fileWatcher);
    };

    // --- Tag Tree ---
    tagProvider = new TagTreeProvider();
    vscode.window.createTreeView('VSJournal.TagTree', {
        treeDataProvider: tagProvider,
        showCollapseAll: true,
    });

    // --- Command Registration ---
    context.subscriptions.push(
        vscode.commands.registerCommand('vs-journal.newEntry', async () => {
            let doc: vscode.TextDocument;
            let position: vscode.Position;

            const fullDir = getAbsoluteJournalDir(getJournalDir());
            if (!fullDir) {return;}

            const filename = `${formatFileNameDate(new Date())}.md`;
            const fullPath = path.join(fullDir, filename);
            fs.mkdirSync(fullDir, { recursive: true });

            if (!fs.existsSync(fullPath)) {
                const config = vscode.workspace.getConfiguration('vsJournal');
                const enableDateTime = config.get<boolean>('enableDateTime') ?? true;

                let content = '# \n';
                if (enableDateTime) {
                    const now = new Date();
                    content += `\n_${formatDateString(now)}_ _${formatTimeString(now)}_\n\n`;
                }
                fs.writeFileSync(fullPath, content);
                doc = await vscode.workspace.openTextDocument(fullPath);
                position = new vscode.Position(0, 2);
            }
            else {
                doc = await vscode.workspace.openTextDocument(fullPath);
                const lastLine = doc.lineCount - 1;
                const char = doc.lineAt(lastLine).text.length;
                position = new vscode.Position(lastLine, char);
            }

            const editor = await vscode.window.showTextDocument(doc);
            editor.selection = new vscode.Selection(position, position);
        }),

        vscode.commands.registerCommand('vs-journal.previewEntry', async (arg?: unknown) => {
            let filePath: string | undefined;

            if (typeof arg === 'string') {
                filePath = arg;
            } else if (arg && typeof arg === 'object' && 'fsPath' in arg) {
                filePath = (arg as any).fsPath;
            }

            let document: vscode.TextDocument | undefined;
        
            if (!filePath) {
                const editor = vscode.window.activeTextEditor;
                if (editor && isJournalFile(editor.document)) {
                    filePath = editor.document.uri.fsPath;
                }
            }
        
            if (!filePath) {
                return;
            }
        
            document = await vscode.workspace.openTextDocument(filePath);

            // cursor初期化（安全）
            const lineCount = document.lineCount;
            setCursorLine(filePath, lineCount > 0 ? 0 : 0);

            setCurrentDocument(document);
            const column = vscode.ViewColumn.Active;

            const panel = ensurePreviewPanel(column);

            await measure("preview generation", async () => {
                const meta = createFileMeta(filePath);
                const check = checkPreviewLimits([meta]);
        
                setPreviewState(panel, check.limitedFiles);
        
                await updatePreviewPanel(panel, check.limitedFiles, {
                    limitExceeded: check.limitExceeded,
                    message: check.message
                });
        
                panel.webview.postMessage({
                    type: 'scrollToTop'
                });
            });
        }),

        vscode.commands.registerCommand('vs-journal.selectJournalDir', async () => {
            const root = getWorkspaceRoot();
            const folderUri = await vscode.window.showOpenDialog({
                canSelectFolders: true,
                defaultUri: root ? vscode.Uri.file(root) : undefined
            });
            if (folderUri?.[0]) {
                await vscode.workspace.getConfiguration('vsJournal')
                    .update('journalDir', folderUri[0].fsPath, vscode.ConfigurationTarget.Global);
            }
        }),

        vscode.commands.registerCommand('vs-journal.onTagClick', async (node: TagHierarchyNode) => {
            const filesToPreview = node.files; // Ignore child tags

            if (filesToPreview.length === 0) {
                vscode.window.showInformationMessage(vscode.l10n.t('There are no files for this tag'));
                return;
            }

            const panel = ensurePreviewPanel(vscode.ViewColumn.Active);
            const check = checkPreviewLimits(filesToPreview);
            setPreviewState(panel, check.limitedFiles);
            await updatePreviewPanel(panel, check.limitedFiles, {
                limitExceeded: check.limitExceeded,
                message: check.message
            });
        }),

        vscode.commands.registerCommand('vs-journal.addVirtualTag', async () => {
            const tag = await vscode.window.showInputBox({
                prompt: vscode.l10n.t('Enter virtual tag name')
            });

            if (!tag) {
                return;
            }

            const trimmed = tag.trim();

            if (trimmed.length === 0) {
                return;
            }

            // --- Register virtual tag (core) ---
            virtualTagSet.add(trimmed);

            // --- Register virtual tag (empty entry allowed for now) ---
            if (!virtualTagIndexMap.has(trimmed)) {
                virtualTagIndexMap.set(trimmed, []);
            }
            indexVirtualTagForAllFiles(
                trimmed,
                fileMetaMap
            );

            // --- Refresh tree ---
            rebuildTree();
        }),

        vscode.commands.registerCommand('vsJournal.deleteFile', async (item) => {
            if (!item || item.type !== 'file' || !item.path) { return; }

            const config = vscode.workspace.getConfiguration('vsJournal');
            const confirm = config.get<boolean>('confirmDeleteFile', true);

            if (confirm) {
                const deleteLabel = vscode.l10n.t('Delete');
                const result = await vscode.window.showWarningMessage(
                    vscode.l10n.t('Delete this file?'),
                    { modal: true },
                    deleteLabel
                );

                if (result !== deleteLabel) { return; }
            }
            const uri = vscode.Uri.file(item.path);

            await vscode.workspace.fs.delete(uri, { useTrash: true });
        }),

        // Command to increment tag usage count
        vscode.commands.registerCommand('vsJournal.incrementTagUsage', (tag: string) => {
            sessionTagUsage.set(tag, (sessionTagUsage.get(tag) ?? 0) + 1);
        }),

        vscode.languages.registerCompletionItemProvider(
            { scheme: 'file', language: 'markdown' },
            {
                provideCompletionItems(document, position) {
                    if (!isJournalFile(document)) { return; }

                    const lines = document.getText().split(/\r?\n/);
                    const lineIndex = position.line;

                    if (!shouldShowCompletionMultiLine(lines, lineIndex)) {
                        return undefined;
                    }

                    const line = lines[lineIndex];
                    const textBefore = line.substring(0, position.character);
                    const current = getCurrentTagAtCursor(textBefore)?.toLowerCase() || "";

                    const items = Array.from(userTagIndexMap.keys()).map(tag => {
                        const item = new vscode.CompletionItem(tag, vscode.CompletionItemKind.Keyword);
                        const lowerTag = tag.toLowerCase();
                        const usage = sessionTagUsage.get(tag) ?? 0;
                        const isPrefix = current && lowerTag.startsWith(current);

                        item.sortText = (isPrefix ? "0" : "1") + String(9999 - usage).padStart(4, "0") + tag.toLowerCase();

                        // Trigger command on selection
                        item.command = {
                            command: 'vsJournal.incrementTagUsage',  // The command name registered above
                            title: 'Increment Tag Usage',           // Optional description
                            arguments: [tag]                        // Arguments passed to the command
                        };

                        return item;
                    });

                    return items;
                }
            },
            '#'
        )
    );

    // --- Configuration Changes ---
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(async event => {
            if (event.affectsConfiguration('vsJournal.journalDir')) {
                resetVirtualTags();
                await performScan();
                setupWatcher();
                disposePreviewPanel();
            }
            if (event.affectsConfiguration('vsJournal.autoSave')) {
                autoSaveTimers.forEach(timer => clearTimeout(timer));
                autoSaveTimers.clear();
            }
            if (event.affectsConfiguration('vsJournal.systemTags.visibility')) {
                rebuildTree(); // No rescan required
            }
        }),

        vscode.workspace.onDidSaveTextDocument(async document => {
            if (!isJournalFile(document)) {
                return;
            }
            updateSingleFile(document.uri.fsPath);
            rebuildTree();

            const panel = getCurrentPanel();
            if (!panel) { return; }

            const currentFiles = getPreviewState(panel);
            if (!currentFiles) { return; }

            const meta = createFileMeta(document.uri.fsPath);
            const updatedFiles = currentFiles.map(f =>
                f.filePath === meta.filePath ? meta : f
            );

            const check = checkPreviewLimits(updatedFiles);

            setPreviewState(panel, check.limitedFiles);

            await updatePreviewPanel(panel, check.limitedFiles, {
                limitExceeded: check.limitExceeded,
                message: check.message
            });
        }),

        vscode.workspace.onDidChangeTextDocument(event => {
            if (!isJournalFile(event.document)) {return;}
            scheduleAutoSave(event.document);
        }),
    
        vscode.workspace.onDidCloseTextDocument(document => {
            clearCursorLine(document.uri.fsPath);
        })
    );

    context.subscriptions.push(
        vscode.window.onDidChangeActiveColorTheme((theme) => {
            notifyThemeChanged();
        }),

        vscode.window.onDidChangeTextEditorSelection((e) => {
            const filePath = e.textEditor.document.uri.fsPath;
            const line = e.selections?.[0]?.active.line ?? 0;

            if (!isJournalFile(e.textEditor.document)) {
                return;
            }

            setCursorLine(filePath, line);
        })
    );

    // --- Initial Scan ---
    const performScan = async () => {
        tagProvider.setScanning(true);
        await new Promise(resolve => setTimeout(resolve, 0)); // Crucial to allow UI to update
        updateStatusBar();

        await refreshAllData();
        // await new Promise(r => setTimeout(r, 10000)); // Intentional delay

        rebuildTree();
        tagProvider.setScanning(false);
        updateStatusBar();
    };

    await performScan();
    setupWatcher();
}

export function isJournalFile(document: vscode.TextDocument, absJournalDir?: string): boolean {
    const journalDir = absJournalDir ?? getAbsoluteJournalDir(getJournalDir());
    if (!journalDir) {
        return false;
    }
    const rel = path.relative(journalDir, document.uri.fsPath);
    return !rel.startsWith('..') && !path.isAbsolute(rel) && document.uri.fsPath.toLowerCase().endsWith('.md');
}

const autoSaveTimers = new Map<string, NodeJS.Timeout>();

function scheduleAutoSave(document: vscode.TextDocument) {
    const delay = vscode.workspace.getConfiguration('vsJournal').get<number>('autoSave') ?? 800;
    if (delay === 0) {
        return; // Auto-save is disabled
    }

    const filePath = document.uri.fsPath;
    if (autoSaveTimers.has(filePath)) {
        clearTimeout(autoSaveTimers.get(filePath)!);
    }

    const timer = setTimeout(async () => {
        autoSaveTimers.delete(filePath);
        await saveDocument(document);
    }, delay);

    autoSaveTimers.set(filePath, timer);
}

async function saveDocument(document: vscode.TextDocument) {
    try {
        await document.save();
    } catch (e) {
        console.error('Auto-save failed:', e);
    }
}

export function deactivate() {}
