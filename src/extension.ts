// src/extension.ts
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import MarkdownIt from 'markdown-it';

import { FileMeta } from './models/FileMeta';
import { measure } from './perf';
import { TagHierarchyBuilder, TagHierarchyNode } from './services/TagHierarchyBuilder';
import { createFileMeta } from './services/fileMetaService';
import { TagTreeProvider } from './sidebar/TagTreeProvider';
import { formatFileNameDate, formatDateString, formatTimeString } from './utils/date';
import { getWorkspaceRoot } from './utils/workspace';
import { shouldShowCompletionMultiLine } from './services/tagLogic';
import { ensurePreviewPanel, updatePreviewPanel, setExtensionContext, setCurrentDocument, notifyThemeChanged } from './preview/previewPanel';

let tagProvider: TagTreeProvider;

// State management
const fileMetaMap = new Map<string, FileMeta>();
const tagIndexForProvider = new Map<string, FileMeta[]>(); 
let untaggedFiles: FileMeta[] = [];

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

async function refreshAllData() {
    const journalDir = getJournalDir();
    const fullDir = getAbsoluteJournalDir(journalDir);

    fileMetaMap.clear();
    tagIndexForProvider.clear();
    untaggedFiles = [];

    if (!fullDir || !fs.existsSync(fullDir)) {
        return;
    }

    const files = fs.readdirSync(fullDir).filter(f => f.endsWith('.md'));

    for (const file of files) {
        const filePath = path.join(fullDir, file);
        const meta = createFileMeta(filePath);
        fileMetaMap.set(filePath, meta);

        if (meta.tags.length === 0) {
            addToUntagged(meta);
        } else {
            meta.tags.forEach(tag => addToTagIndex(tag, meta));
        }
    }

    tagProvider.refreshFromTagMap(tagIndexForProvider);
    notifyProvider();
}

function updateSingleFile(filePath: string) {
    const oldMeta = fileMetaMap.get(filePath);
    if (oldMeta) {
        oldMeta.tags.forEach(tag => {
            const files = tagIndexForProvider.get(tag);
            if (files) {
                const filtered = files.filter(f => f.filePath !== filePath);
                filtered.length === 0 ? tagIndexForProvider.delete(tag) : tagIndexForProvider.set(tag, filtered);
            }
        });
    }

    untaggedFiles = untaggedFiles.filter(f => f.filePath !== filePath);

    const newMeta = createFileMeta(filePath);
    fileMetaMap.set(filePath, newMeta);

    if (newMeta.tags.length === 0) {
        addToUntagged(newMeta);
    } else {
        newMeta.tags.forEach(tag => addToTagIndex(tag, newMeta));
    }

    notifyProvider();
}

function notifyProvider(scanning?: boolean) {
    const hierarchyBuilder = new TagHierarchyBuilder();
    const nodes: TagHierarchyNode[] = hierarchyBuilder.build(tagIndexForProvider, untaggedFiles);
    tagProvider.refresh(nodes, scanning);
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

        fileWatcher.onDidCreate(uri => updateSingleFile(uri.fsPath));
        fileWatcher.onDidChange(uri => updateSingleFile(uri.fsPath));
        fileWatcher.onDidDelete(() => refreshAllData());

        context.subscriptions.push(fileWatcher);
    };

    // --- Tag Tree ---
    tagProvider = new TagTreeProvider([]);
    vscode.window.createTreeView('vsJournalTags', {
        treeDataProvider: tagProvider,
        showCollapseAll: true,
    });

    // --- Command Registration ---
    context.subscriptions.push(
        vscode.commands.registerCommand('vs-journal.openExternal', async (url: string) => {
            try {
                await vscode.env.openExternal(vscode.Uri.parse(url));
            } catch (err) {
                console.error('Failed to open external URL:', url, err);
            }
        }),

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

        vscode.commands.registerCommand('vs-journal.previewEntry', async (filePath?: string) => {
            let document: vscode.TextDocument | undefined;
            if (filePath) {document = await vscode.workspace.openTextDocument(filePath);}
            else if (vscode.window.activeTextEditor && isJournalFile(vscode.window.activeTextEditor.document)) {
                document = vscode.window.activeTextEditor.document;
            } else {return;}

            setCurrentDocument(document);
            const column = vscode.ViewColumn.Active;

            ensurePreviewPanel(column);

            await measure("preview generation", async () => {
                if (filePath) {
                    const meta = createFileMeta(filePath);
                    await updatePreviewPanel([meta]);
                } else if (vscode.window.activeTextEditor && isJournalFile(vscode.window.activeTextEditor.document)) {
                    const docMeta = createFileMeta(vscode.window.activeTextEditor.document.uri.fsPath);
                    await updatePreviewPanel([docMeta]);
                } else {
                    return;
                }
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
            const filesToPreview = node.files; // 子タグは無視

            if (filesToPreview.length === 0) {
                vscode.window.showInformationMessage(vscode.l10n.t('There are no files for this tag'));
                return;
            }

            ensurePreviewPanel(vscode.ViewColumn.Active);

            await updatePreviewPanel(filesToPreview);
        }),

        vscode.languages.registerCompletionItemProvider(
            { scheme: 'file', language: 'markdown' },
            {
                provideCompletionItems(document, position) {
                    // Check if it is a target file (if necessary)
                    if (!isJournalFile(document)) { return; }

                    const lines = document.getText().split(/\r?\n/); // Convert entire document to an array
                    const lineIndex = position.line;
                    const cursor = position.character;

                    if (!shouldShowCompletionMultiLine(lines, lineIndex, cursor)) {
                        return undefined;
                    }

                    const items = Array.from(tagIndexForProvider.keys()).map(tag => {
                        const item = new vscode.CompletionItem(tag, vscode.CompletionItemKind.Keyword);
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
                await performScan();
                setupWatcher();
            }
            if (event.affectsConfiguration('vsJournal.autoSave')) {
                autoSaveTimers.forEach(timer => clearTimeout(timer));
                autoSaveTimers.clear();
            }
        }),

        vscode.workspace.onDidSaveTextDocument(document => {
            if (!isJournalFile(document)) {
                return;
            }
            updateSingleFile(document.uri.fsPath);

            const meta = createFileMeta(document.uri.fsPath);
            updatePreviewPanel([meta]); // 配列にして渡す
        }),
        vscode.workspace.onDidChangeTextDocument(event => {
            if (!isJournalFile(event.document)) {return;}
            scheduleAutoSave(event.document);
        })
    );

    context.subscriptions.push(
        vscode.window.onDidChangeActiveColorTheme((theme) => {
            notifyThemeChanged();
        })
    );

    // --- Initial Scan ---
    const performScan = async () => {
        const spinnerNode: TagHierarchyNode = { name: '', children: new Map(), files: [], contextValue: undefined };
        tagProvider.refresh([spinnerNode], true);
        await refreshAllData();

        const hierarchyBuilder = new TagHierarchyBuilder();
        const nodes = hierarchyBuilder.build(tagIndexForProvider, untaggedFiles);
        tagProvider.refresh(nodes, false);
        updateStatusBar();
    };

    await performScan();
    setupWatcher();
    updateStatusBar();
}

export function isJournalFile(document: vscode.TextDocument, absJournalDir?: string): boolean {
    const journalDir = absJournalDir ?? getAbsoluteJournalDir(getJournalDir());
    if (!journalDir) {
        return false;
    }
    const rel = path.relative(journalDir, document.uri.fsPath);
    return !rel.startsWith('..') && !path.isAbsolute(rel) && document.uri.fsPath.toLowerCase().endsWith('.md');
}

export function addToUntagged(file: { filePath: string; title: string }, arr?: { filePath: string; title: string }[]) {
    const targetArr = arr ?? untaggedFiles;
    if (!targetArr.some(f => f.filePath === file.filePath)) {
        targetArr.push(file);
    }
}

export function addToTagIndex(tag: string, file: FileMeta, map?: Map<string, FileMeta[]>) {
    const targetMap = map ?? tagIndexForProvider;
    const list = targetMap.get(tag) || [];
    if (!list.some(f => f.filePath === file.filePath)) {
        list.push(file);
        targetMap.set(tag, list);
    }
}

const autoSaveTimers = new Map<string, NodeJS.Timeout>();

function scheduleAutoSave(document: vscode.TextDocument) {
    const delay = vscode.workspace.getConfiguration('vsJournal').get<number>('autoSave') ?? 800;
    if (delay === 0) {
        return; // Do nothing if OFF
    }

    const filePath = document.uri.fsPath;
    if (autoSaveTimers.has(filePath)) {
        clearTimeout(autoSaveTimers.get(filePath)!);
    }

    const timer = setTimeout(async () => {
        autoSaveTimers.delete(filePath);
        await saveDocument(document);
    }, delay); // Save after 800ms delay

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