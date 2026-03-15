// src/extension.ts
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { marked } from 'marked';

import { FileMeta } from './models/FileMeta';
import { measure } from './perf';
import { TagHierarchyBuilder, TagHierarchyNode } from './services/TagHierarchyBuilder';
import { createFileMeta } from './services/fileMetaService';
import { TagTreeProvider } from './sidebar/TagTreeProvider';
import { formatFileNameDate, formatDateString, formatTimeString } from './utils/date';
import { getWorkspaceRoot } from './utils/workspace';

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
    extensionContext = context;

    // --- ステータスバー ---
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

    // --- ファイルウォッチャー ---
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

    // --- タグツリー ---
    tagProvider = new TagTreeProvider([]);
    vscode.window.createTreeView('vsJournalTags', {
        treeDataProvider: tagProvider,
        showCollapseAll: true,
    });

    // --- コマンド登録 ---
    context.subscriptions.push(
        vscode.commands.registerCommand('vs-journal.openExternal', async (url: string) => {
            try {
                await vscode.env.openExternal(vscode.Uri.parse(url));
            } catch (err) {
                console.error('Failed to open external URL:', url, err);
            }
        }),

        vscode.commands.registerCommand('vs-journal.newEntry', async () => {
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
            }

            const doc = await vscode.workspace.openTextDocument(fullPath);
            const editor = await vscode.window.showTextDocument(doc);
            editor.selection = new vscode.Selection(new vscode.Position(0, 2), new vscode.Position(0, 2));
        }),

        vscode.commands.registerCommand('vs-journal.previewEntry', async (filePath?: string) => {
            let document: vscode.TextDocument | undefined;
            if (filePath) {document = await vscode.workspace.openTextDocument(filePath);}
            else if (vscode.window.activeTextEditor && isJournalFile(vscode.window.activeTextEditor.document)) {
                document = vscode.window.activeTextEditor.document;
            } else {return;}

            currentDocument = document;
            const column = vscode.ViewColumn.Active;

            if (!currentPanel) {
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

                currentPanel.webview.onDidReceiveMessage(async message => {
                    if (message.command === 'openExternal' && message.url) {
                        vscode.commands.executeCommand('vs-journal.openExternal', message.url);
                    }
                    if (message.command === 'edit' && currentDocument) {
                        const uri = currentDocument.uri;
                        const doc = await vscode.workspace.openTextDocument(uri);
                        let selection: vscode.Range | undefined;

                        if (message.line !== undefined) {
                            const pos = new vscode.Position(message.line, 0);
                            selection = new vscode.Range(pos, pos);
                        } else if (!vscode.workspace.textDocuments.some(d => d.uri.toString() === uri.toString())) {
                            const pos = new vscode.Position(0, 0);
                            selection = new vscode.Range(pos, pos);
                        }

                        await vscode.window.showTextDocument(doc, { selection });
                    }
                });
            } else {
                currentPanel.reveal(column, true);
            }

            await measure("preview generation", async () => updatePreview());
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

        vscode.languages.registerCompletionItemProvider(
            { scheme: 'file', language: 'markdown' },
            {
                provideCompletionItems(document, position) {
                    if (!isJournalFile(document)) {return undefined;}
                    const linePrefix = document.lineAt(position).text.substr(0, position.character);
                    if (!linePrefix.startsWith('#')) {return undefined;}

                    return Array.from(tagIndexForProvider.keys())
                        .map(tag => new vscode.CompletionItem(tag, vscode.CompletionItemKind.Keyword));
                }
            },
            '#'
        )
    );

    // --- 設定変更 ---
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
            if (!isJournalFile(document)) {return;}
            updateSingleFile(document.uri.fsPath);

            if (currentPanel?.visible && currentDocument?.uri.toString() === document.uri.toString()) {
                updatePreview();
            }
        }),
        vscode.workspace.onDidChangeTextDocument(event => {
            if (!isJournalFile(event.document)) {return;}
            scheduleAutoSave(event.document);
        })
    );

    // --- 初期スキャン ---
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


// --- 以下ユーティリティ ---
function updatePreview() {
    if (!currentPanel) {
        return;
    }

    try {
        const text = currentDocument?.getText() || "";
        const tokens = marked.lexer(text);
        let line = 0;

        const htmlContent = tokens.map((token) => {
            const startLine = line;
            const html = marked.parser([token]);
            const raw = token.raw || "";
            const lineCount = raw.split("\n").length - 1;
            line += lineCount;

            return `<div class="vjs-line" data-line="${startLine}">${html}</div>`;
        }).join("\n");
        const cssPath = vscode.Uri.file(path.join(extensionContext.extensionPath, 'resources/webview.css'));
        const cssUri = currentPanel.webview.asWebviewUri(cssPath);
        const hintText = vscode.l10n.t("Click or press Enter to edit");

        currentPanel.webview.html = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <link rel="stylesheet" type="text/css" href="${cssUri}">
            </head>
            <body>
                <div class="edit-hint">${hintText}</div>
                ${htmlContent}
                <script>
                    const vscode = acquireVsCodeApi();
                    document.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter' || e.key === 'Escape')
                            vscode.postMessage({ command: 'edit' });
                    });

                    // クリックで編集
                    document.body.addEventListener('click', (e) => {
                        const target = e.target.closest('a');
                        if (target) {
                            const href = target.getAttribute('href');
                            if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
                                e.preventDefault();
                                vscode.postMessage({ command: 'openExternal', url: href });
                            }
                            return; // リンクは編集に行かない
                        }

                        // div.vjs-line に対してクリック判定
                        const lineDivs = document.querySelectorAll('div.vjs-line');
                        for (const div of lineDivs) {
                            const rect = div.getBoundingClientRect();
                            if (e.clientY >= rect.top && e.clientY <= rect.bottom) {
                                const line = div.getAttribute('data-line');
                                vscode.postMessage({ command: 'edit', line: line ? parseInt(line, 10) : null });
                                break;
                            }
                        }
                    });
                </script>
            </body>
            </html>
        `;
    } catch (e) {
        // console.log("Preview update skipped (panel might be busy)");
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