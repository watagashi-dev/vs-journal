// src/extension.ts
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { marked } from 'marked';
import { formatDate } from './utils/date';
import { getWorkspaceRoot } from './utils/workspace';
import { TagTreeProvider } from './sidebar/TagTreeProvider';
import { TagHierarchyBuilder, TagHierarchyNode } from './services/TagHierarchyBuilder';
import { createFileMeta } from './services/fileMetaService';
import { FileMeta } from './models/FileMeta';
import { measure } from './perf';

let currentPanel: vscode.WebviewPanel | undefined;
let currentDocument: vscode.TextDocument | undefined;
let tagProvider: TagTreeProvider;
let extensionContext: vscode.ExtensionContext;

// 状態管理
const fileMetaMap = new Map<string, FileMeta>();
const tagIndexForProvider = new Map<string, any[]>(); 
let untaggedFiles: { filePath: string; title: string }[] = [];

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
            addToUntagged({ filePath: meta.filePath, title: meta.title });
        }
        else {
            meta.tags.forEach(tag => addToTagIndex(tag, { filePath: meta.filePath, title: meta.title }));
        }
    }

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
        addToUntagged({ filePath: newMeta.filePath, title: newMeta.title });
    }
    else {
        newMeta.tags.forEach(tag => addToTagIndex(tag, { filePath: newMeta.filePath, title: newMeta.title }));
    }

    notifyProvider();
}

function notifyProvider(scanning?: boolean) {
    const hierarchyBuilder = new TagHierarchyBuilder();
    const nodes: TagHierarchyNode[] = hierarchyBuilder.build(tagIndexForProvider, untaggedFiles);
    tagProvider.refresh(nodes, scanning);
}

export async function activate(context: vscode.ExtensionContext) {
    let fileWatcher: vscode.FileSystemWatcher | undefined;
//    await l10n.config({
//        fsPath: context.asAbsolutePath('./l10n/bundle.l10n.json')
////        uri: new URL('../l10n/bundle.l10n.json', import.meta.url)
//    });
    extensionContext = context;

    // ステータスバー作成
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

    const setupWatcher = () => {
        if (fileWatcher) {
            fileWatcher.dispose();
        }
        const absDir = getAbsoluteJournalDir(getJournalDir());
        if (!absDir) {
            return;
        }

        const pattern = new vscode.RelativePattern(absDir, '**/*.md');
        fileWatcher = vscode.workspace.createFileSystemWatcher(pattern);

        fileWatcher.onDidCreate(uri => updateSingleFile(uri.fsPath));
        fileWatcher.onDidChange(uri => updateSingleFile(uri.fsPath));
        fileWatcher.onDidDelete(() => refreshAllData());

        context.subscriptions.push(fileWatcher);
    };

    tagProvider = new TagTreeProvider([]);
    vscode.window.createTreeView('vsJournalTags', {
        treeDataProvider: tagProvider,
        showCollapseAll: true,
    });

    const performScan = async (message: string) => {
        const spinnerNode: TagHierarchyNode = {
            name: '',
            children: new Map(),
            files: [],
            contextValue: undefined
        };
        tagProvider.refresh([spinnerNode], true);
        await refreshAllData();
        await new Promise(r => setTimeout(r, 10000)); // 意図的に長く

        const hierarchyBuilder = new TagHierarchyBuilder();
        const nodes: TagHierarchyNode[] = hierarchyBuilder.build(tagIndexForProvider, untaggedFiles);
        tagProvider.refresh(nodes, false);
        updateStatusBar();
    };

    await performScan('VS Journal: scanning...');
    setupWatcher();
    updateStatusBar();

    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(async event => {
            if (event.affectsConfiguration('vsJournal.journalDir')) {
                await performScan('VS Journal: journalDir updated');
                setupWatcher();
            }
            if (event.affectsConfiguration('vsJournal.autoSave')) {
                autoSaveTimers.forEach(timer => clearTimeout(timer));
                autoSaveTimers.clear();
            }
        })
    );

    context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument(document => {
            if (!isJournalFile(document)) {
                return;
            }
            updateSingleFile(document.uri.fsPath);

            if (currentPanel && currentPanel.visible && currentDocument?.uri.toString() === document.uri.toString()) {
                updatePreview();
            }
        }),
        vscode.workspace.onDidChangeTextDocument(event => {
            if (!isJournalFile(event.document)) {
                return;
            }
            scheduleAutoSave(event.document);
        })
    );

    // --- コマンド登録 ---
    context.subscriptions.push(
        vscode.commands.registerCommand('vs-journal.newEntry', async () => {
            const fullDir = getAbsoluteJournalDir(getJournalDir());
            if (!fullDir) {
                return;
            }
            const filename = `${formatDate(new Date())}.md`;
            const fullPath = path.join(fullDir, filename);
            fs.mkdirSync(fullDir, { recursive: true });
            if (!fs.existsSync(fullPath)) {
                fs.writeFileSync(fullPath, `# ${filename}\n\n`);
            }
            const doc = await vscode.workspace.openTextDocument(fullPath);
            await vscode.window.showTextDocument(doc);
        }),
        vscode.commands.registerCommand('vs-journal.previewEntry', async (filePath?: string) => {
            let document: vscode.TextDocument | undefined;

            if (filePath) {
                document = await vscode.workspace.openTextDocument(filePath);
            } else if (vscode.window.activeTextEditor && isJournalFile(vscode.window.activeTextEditor.document)) {
                document = vscode.window.activeTextEditor.document;
            } else {
                return;
            }

            currentDocument = document;
            const column = vscode.ViewColumn.Active;

            if (currentPanel) {
                const isActive = currentPanel.visible && currentPanel.active;
                if (!isActive) {
                    currentPanel.reveal(column, false);
                }
            } else {
                currentPanel = vscode.window.createWebviewPanel(
                    'vsJournalPreview',
                    'VS Journal Preview',
                    column,
                    { enableScripts: true, retainContextWhenHidden: true }
                );
                currentPanel.onDidDispose(() => {
                    currentPanel = undefined;
                    currentDocument = undefined;
                });
                currentPanel.webview.onDidReceiveMessage(message => {
                    if (message.command === 'edit' && currentDocument) {
                        vscode.window.showTextDocument(currentDocument);
                    }
                });
                currentPanel.reveal(column, true);
            }

            await measure("preview generation", async () => {
                updatePreview();
            });
        }),
        vscode.commands.registerCommand('vs-journal.selectJournalDir', async () => {
            const root = getWorkspaceRoot();
            const folderUri = await vscode.window.showOpenDialog({
                canSelectFolders: true,
                defaultUri: root ? vscode.Uri.file(root) : undefined
            });
            if (folderUri && folderUri[0]) {
                await vscode.workspace.getConfiguration('vsJournal')
                    .update('journalDir', folderUri[0].fsPath, vscode.ConfigurationTarget.Global);
            }
        }),
        vscode.languages.registerCompletionItemProvider(
            { scheme: 'file', language: 'markdown' },
            {
                provideCompletionItems(document, position) {
                    if (!isJournalFile(document)) {
                        return undefined;
                    }
                    const linePrefix = document.lineAt(position).text.substr(0, position.character);
                    if (!linePrefix.startsWith('#')) {
                        return undefined;
                    }
                    return Array.from(tagIndexForProvider.keys())
                        .map(tag => new vscode.CompletionItem(tag, vscode.CompletionItemKind.Keyword));
                }
            },
            '#'
        )
    );
}

// --- 以下ユーティリティ ---
function updatePreview() {
    if (!currentPanel) {
        return;
    }

    try {
        const htmlContent = marked.parse(currentDocument?.getText() || "");
        const cssPath = vscode.Uri.file(path.join(extensionContext.extensionPath, 'resources/webview.css'));
        const cssUri = currentPanel.webview.asWebviewUri(cssPath);
        currentPanel.webview.html = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <link rel="stylesheet" type="text/css" href="${cssUri}">
            </head>
            <body>
                ${htmlContent}
                <script>
                    const vscode = acquireVsCodeApi();
                    document.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter') vscode.postMessage({ command: 'edit' });
                    });
                </script>
            </body>
            </html>
        `;
    } catch (e) {
        console.log("Preview update skipped (panel might be busy)");
    }
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

export function addToTagIndex(tag: string, file: { filePath: string; title: string }, map?: Map<string, any[]>) {
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
        return; // OFFなら何もしない
    }

    const filePath = document.uri.fsPath;
    if (autoSaveTimers.has(filePath)) {
        clearTimeout(autoSaveTimers.get(filePath)!);
    }

    const timer = setTimeout(async () => {
        autoSaveTimers.delete(filePath);
        await saveDocument(document);
    }, delay); // 800ms 待機後に保存

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