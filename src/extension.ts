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
import {
    setPreviewState, getPreviewState,
    ensurePreviewPanel, updatePreviewPanel,
    setExtensionContext, setCurrentDocument,
    getCurrentPanel,
    notifyThemeChanged, disposePreviewPanel
} from './preview/previewPanel';

let tagProvider: TagTreeProvider;

// State management
const fileMetaMap = new Map<string, FileMeta>();
const systemTagIndexMap = new Map<string, FileMeta[]>(); 
const userTagIndexMap = new Map<string, FileMeta[]>(); 
const virtualTagIndexMap = new Map<string, FileMeta[]>(); 

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

    // 初期化（全タグ分の空配列を作る）
    for (const def of systemTagDefinitions) {
        systemTagIndexMap.set(def.id, []);
    }

    // 全ファイルを1回だけループ
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
//        { untagged: true }
    );
    const filteredSystemMap = new Map<string, FileMeta[]>();

    for (const [key, value] of systemTagIndexMap.entries()) {
        if (visibility[key] !== false) {
            filteredSystemMap.set(key, value);
        }
    }

    const hierarchyBuilder = new TagHierarchyBuilder();
    const result = hierarchyBuilder.build(
        filteredSystemMap,
        userTagIndexMap,
        virtualTagIndexMap
    );
    tagProvider.refresh(result.system, result.user, result.virtual);
}

async function refreshAllData() {
    const journalDir = getJournalDir();
    const fullDir = getAbsoluteJournalDir(journalDir);

    // 既存データクリア
    fileMetaMap.clear();
    userTagIndexMap.clear();
    systemTagIndexMap.clear();  // System タグは表示用 Map
    virtualTagIndexMap.clear(); // 今は空

    if (!fullDir || !fs.existsSync(fullDir)) {
        return;
    }

    const files = fs.readdirSync(fullDir).filter(f => f.endsWith('.md'));

    // --- ファイルを解析して User タグに登録 ---
    for (const file of files) {
        const filePath = path.join(fullDir, file);
        const meta = createFileMeta(filePath);
        fileMetaMap.set(filePath, meta);

        // User タグ追加
        meta.tags.forEach(tag => {
            const arr = userTagIndexMap.get(tag) ?? [];
            userTagIndexMap.set(tag, [...arr, meta]);
        });
    }
    rebuildSystemTags();
}

function updateSingleFile(filePath: string) {
    const oldMeta = fileMetaMap.get(filePath);

    // --- 古い User タグから削除 ---
    if (oldMeta) {
        oldMeta.tags.forEach(tag => {
            const files = userTagIndexMap.get(tag);
            if (files) {
                const filtered = files.filter(f => f.filePath !== filePath);
                if (filtered.length === 0) {
                    userTagIndexMap.delete(tag);
                } else {
                    userTagIndexMap.set(tag, filtered);
                }
            }
        });
    }

    // --- 新しい FileMeta を作成 ---
    const newMeta = createFileMeta(filePath);
    fileMetaMap.set(filePath, newMeta);

    // --- User タグに追加 ---
    newMeta.tags.forEach(tag => {
        const arr = userTagIndexMap.get(tag) ?? [];
        userTagIndexMap.set(tag, [...arr, newMeta]);
    });

    rebuildSystemTags();
}

/*
function notifyProvider(scanning?: boolean) {
    const hierarchyBuilder = new TagHierarchyBuilder();
    const result = hierarchyBuilder.build(systemTagIndexMap, userTagIndexMap, virtualTagIndexMap);
    tagProvider.refresh(result.system, result.user, result.virtual, scanning);
}
*/

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
        fileWatcher.onDidDelete(() => refreshAllData());

        context.subscriptions.push(fileWatcher);
    };

    // --- Tag Tree ---
    tagProvider = new TagTreeProvider();
    vscode.window.createTreeView('vsJournalTags', {
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

        vscode.commands.registerCommand('vs-journal.previewEntry', async (filePath?: string) => {
            let document: vscode.TextDocument | undefined;
            if (filePath) {document = await vscode.workspace.openTextDocument(filePath);}
            else if (vscode.window.activeTextEditor && isJournalFile(vscode.window.activeTextEditor.document)) {
                document = vscode.window.activeTextEditor.document;
            } else {return;}

            setCurrentDocument(document);
            const column = vscode.ViewColumn.Active;

            const panel = ensurePreviewPanel(column);

            await measure("preview generation", async () => {
                if (filePath) {
                    const meta = createFileMeta(filePath);
                    const check = checkPreviewLimits([meta]);
                    setPreviewState(panel, check.limitedFiles);
                    await updatePreviewPanel(panel, check.limitedFiles, {
                        limitExceeded: check.limitExceeded,
                        message: check.message
                    });
                } else if (vscode.window.activeTextEditor && isJournalFile(vscode.window.activeTextEditor.document)) {
                    const docMeta = createFileMeta(vscode.window.activeTextEditor.document.uri.fsPath);
                    await updatePreviewPanel(panel, [docMeta]);
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

            const panel = ensurePreviewPanel(vscode.ViewColumn.Active);
            const check = checkPreviewLimits(filesToPreview);
            setPreviewState(panel, check.limitedFiles);
            await updatePreviewPanel(panel, check.limitedFiles, {
                limitExceeded: check.limitExceeded,
                message: check.message
            });
        }),

        vscode.languages.registerCompletionItemProvider(
            { scheme: 'file', language: 'markdown' },
            {
                provideCompletionItems(document, position) {
                    if (!isJournalFile(document)) { return; }

                    const lines = document.getText().split(/\r?\n/);
                    const lineIndex = position.line;
                    const cursor = position.character;

                    if (!shouldShowCompletionMultiLine(lines, lineIndex, cursor)) {
                        return undefined;
                    }

                    const items = Array.from(userTagIndexMap.keys()).map(tag => {
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
                disposePreviewPanel();
            }
            if (event.affectsConfiguration('vsJournal.autoSave')) {
                autoSaveTimers.forEach(timer => clearTimeout(timer));
                autoSaveTimers.clear();
            }
            if (event.affectsConfiguration('vsJournal.systemTags.visibility')) {
                rebuildTree(); // ← 再スキャンしない
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
        })
    );

    context.subscriptions.push(
        vscode.window.onDidChangeActiveColorTheme((theme) => {
            notifyThemeChanged();
        })
    );

    // --- Initial Scan ---
    const performScan = async () => {
        tagProvider.setScanning(true);
        await new Promise(resolve => setTimeout(resolve, 0)); // ←これ重要
        updateStatusBar();

        await refreshAllData();
        await new Promise(r => setTimeout(r, 10000)); // 3秒待つ

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

export function addToTagIndex(tag: string, file: FileMeta, map?: Map<string, FileMeta[]>) {
    const targetMap = map ?? userTagIndexMap;
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
