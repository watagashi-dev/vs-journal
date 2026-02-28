import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { marked } from 'marked';
import { formatDate } from './utils/date';
import { getWorkspaceRoot } from './utils/workspace';
import { TagTreeProvider } from './sidebar/TagTreeProvider';
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

function getAbsoluteJournalDir(journalDir: string): string | undefined {
    if (path.isAbsolute(journalDir)) {
        return journalDir;
    }
    const root = getWorkspaceRoot();
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
    const allTags = Array.from(tagIndexForProvider.keys()).sort();
    tagProvider.refresh(allTags, untaggedFiles, tagIndexForProvider, scanning);
}

export async function activate(context: vscode.ExtensionContext) {
    let fileWatcher: vscode.FileSystemWatcher | undefined;

    extensionContext = context;

    // ステータスバー作成
    const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    context.subscriptions.push(statusBar);

    // ステータスバーに現在のジャーナルDirを表示
    const updateStatusBar = () => {
        const dir = getAbsoluteJournalDir(getJournalDir());
        if (dir) {
            const shortDir = dir.length > 40 ? '…' + dir.slice(-37) : dir; // 長すぎる場合省略
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

    tagProvider = new TagTreeProvider([], [], new Map());
    vscode.window.createTreeView('vsJournalTags', {
        treeDataProvider: tagProvider,
        showCollapseAll: true,
    });

    const performScan = async (message: string) => {
        tagProvider.refresh([], [], new Map(), true); // Treeにスピナー表示
        await refreshAllData();

        await new Promise(r => setTimeout(r, 10000)); // 3秒待つ

        tagProvider.refresh(Array.from(tagIndexForProvider.keys()).sort(), untaggedFiles, tagIndexForProvider, false);
        updateStatusBar();
    };

    await performScan('VS Journal: scanning...');

    setupWatcher();
    updateStatusBar();

    // 設定変更
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(async event => {
            if (event.affectsConfiguration('vsJournal.journalDir')) {
                await performScan('VS Journal: journalDir updated');
                setupWatcher();
            }
        })
    );

    // 保存時差分更新
    context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument(document => {
            if (!isJournalFile(document)) {
                return;
            }
            updateSingleFile(document.uri.fsPath);

            if (currentPanel && currentPanel.visible && currentDocument?.uri.toString() === document.uri.toString()) {
                updatePreview();
            }
        })
    );

    // --- コマンド登録 ---
    context.subscriptions.push(
        vscode.commands.registerCommand('vs-journal.newEntry', async () => {
            const fullDir = getAbsoluteJournalDir(getJournalDir());
            if (!fullDir) { return; }
            const filename = `${formatDate(new Date())}.md`;
            const fullPath = path.join(fullDir, filename);
            fs.mkdirSync(fullDir, { recursive: true });
            if (!fs.existsSync(fullPath)) {
                fs.writeFileSync(fullPath, `# ${filename}\n\n`);
            }
            const doc = await vscode.workspace.openTextDocument(fullPath);
            await vscode.window.showTextDocument(doc);
            // updateSingleFile(fullPath); // 新規作成も差分更新
        }),

        vscode.commands.registerCommand('vs-journal.previewEntry', async (filePath?: string) => {
            let document: vscode.TextDocument | undefined;

            if (filePath) {
                // ファイルパスが渡されていれば開く
                document = await vscode.workspace.openTextDocument(filePath);
            } else if (vscode.window.activeTextEditor && isJournalFile(vscode.window.activeTextEditor.document)) {
                document = vscode.window.activeTextEditor.document;
            } else {
                return; // プレビューできる対象がない
            }

            currentDocument = document;
            const column = vscode.ViewColumn.Active;

            if (currentPanel) {
                const isActive =
                    currentPanel.visible && currentPanel.active;
                    
                // すでに前面にあるなら何もしない
                if (!isActive) {
                    currentPanel.reveal(column, false);
                }
            } else {
                currentPanel = vscode.window.createWebviewPanel(
                    'vsJournalPreview',
                    'VS Journal Preview',
                    column,
                    {
                        enableScripts: true,
                        retainContextWhenHidden: true
                    }
                );
                currentPanel.onDidDispose(() => {
                    currentPanel = undefined;
                    currentDocument = undefined;
                });

                // --- WebView からのメッセージ受信 ---
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
                await vscode.workspace.getConfiguration('vsJournal').update('journalDir', folderUri[0].fsPath, vscode.ConfigurationTarget.Global);
            }
        }),

        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (!editor || !isJournalFile(editor.document)) {
                return;
            }

            const meta = fileMetaMap.get(editor.document.uri.fsPath);
            if (!meta || meta.tags.length === 0) {
                return;
            }
        }),

        vscode.languages.registerCompletionItemProvider(
            { scheme: 'file', language: 'markdown' },
            {
                provideCompletionItems(document, position) {
                    if (!isJournalFile(document)) { return undefined; }
                    const linePrefix = document.lineAt(position).text.substr(0, position.character);
                    if (!linePrefix.startsWith('#')) { return undefined; }
                    return Array.from(tagIndexForProvider.keys()).map(tag => new vscode.CompletionItem(tag, vscode.CompletionItemKind.Keyword));
                }
            },
            '#'
        )
    );
}

// --- 以下、ユーティリティ（変更なし） ---
function updatePreview() {
    // パネルがない、または破棄されていたら何もしない
    if (!currentPanel) { return; }

    try {
        const htmlContent = marked.parse(currentDocument?.getText() || "");
        // WebViewにCSSを読み込む
        const cssPath = vscode.Uri.file(
            path.join(extensionContext.extensionPath, 'resources', 'webview.css'));
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
        // 万が一の描画エラーをキャッチしてログを汚さないようにする
        console.log("Preview update skipped (panel might be busy)");
    }
}

function isJournalFile(document: vscode.TextDocument): boolean {
    const absJournalDir = getAbsoluteJournalDir(getJournalDir());
    if (!absJournalDir) { return false; }
    const rel = path.relative(absJournalDir, document.uri.fsPath);
    return !rel.startsWith('..') && !path.isAbsolute(rel) && document.uri.fsPath.toLowerCase().endsWith('.md');
}

function addToUntagged(file: { filePath: string; title: string }) {
    if (!untaggedFiles.some(f => f.filePath === file.filePath)) {
        untaggedFiles.push(file);
    }
}

function addToTagIndex(tag: string, file: { filePath: string; title: string }) {
    const list = tagIndexForProvider.get(tag) || [];
    if (!list.some(f => f.filePath === file.filePath)) {
        list.push(file);
        tagIndexForProvider.set(tag, list);
    }
}

export function deactivate() {}