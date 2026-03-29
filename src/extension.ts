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

let currentPanel: vscode.WebviewPanel | undefined;
let currentDocument: vscode.TextDocument | undefined;
let tagProvider: TagTreeProvider;
let extensionContext: vscode.ExtensionContext;

let needsRefresh = false;

// State management
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

            currentDocument = document;
            const column = vscode.ViewColumn.Active;

            if (!currentPanel) {
                currentPanel = vscode.window.createWebviewPanel(
                    'vsJournalPreview',
                    'VS Journal Preview',
                    column,
                    {
                        enableScripts: true,
                        retainContextWhenHidden: true,
                        localResourceRoots: [
                            vscode.Uri.file(path.dirname(currentDocument.uri.fsPath)),
                            vscode.Uri.file(path.join(context.extensionPath, 'resources'))
                        ]
                    }
                );
                currentPanel.onDidDispose(() => {
                    currentPanel = undefined;
                    currentDocument = undefined;
                });
                currentPanel.onDidChangeViewState(e => {
                    if (e.webviewPanel.visible && needsRefresh) {
                        updatePreview();
                        needsRefresh = false;
                    }
                });

                currentPanel.webview.onDidReceiveMessage(async message => {
                    if (!currentDocument) { return; }

                    // フェーズ3：クリックでMarkdown行ジャンプ
                    if (message.type === 'jumpToLine') {
                        const line = message.line ?? 0; // line が未定義なら0行目
                        const editor = vscode.window.activeTextEditor;
                        const uri = currentDocument.uri;

                        // 現在開いているタブに対象ファイルがあるか確認
                        const isOpenedInTab = vscode.window.tabGroups.all.some(group =>
                            group.tabs.some(tab => {
                                const input = tab.input as vscode.TabInputText;
                                return input?.uri?.fsPath === uri.fsPath;
                            })
                        );

                        // 選択範囲を作成
                        const doc = await vscode.workspace.openTextDocument(uri);
                        const safeLine = Math.min(line, doc.lineCount - 1);
                        const pos = new vscode.Position(safeLine, 0);
                        const selection = new vscode.Selection(pos, pos);

                        await vscode.window.showTextDocument(doc, { selection });
                    }

                    // 既存の Enter / Escape 編集モード
                    if (message.type === 'edit') {
                        const uri = currentDocument.uri;
                        const doc = await vscode.workspace.openTextDocument(uri);
                        await vscode.window.showTextDocument(doc);
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
            needsRefresh = true;

            if (currentPanel && currentDocument?.uri.toString() === document.uri.toString()) {
                updatePreview();
                needsRefresh = false;
            }
        }),
        vscode.workspace.onDidChangeTextDocument(event => {
            if (!isJournalFile(event.document)) {return;}
            scheduleAutoSave(event.document);
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


// --- Utilities below ---
function createMarkdownIt(webview: vscode.Webview, baseUri: vscode.Uri | undefined) {
    const md = new MarkdownIt({
        html: true,
        linkify: true,
        typographer: true
    });

    // ===== 行番号付与 =====
    const defaultRender = md.renderer.renderToken.bind(md.renderer);

    md.renderer.renderToken = (tokens, idx, options) => {
        const token = tokens[idx];

        // table系は除外（専用ルールに任せる）
        if (
            token.type === "table_open" ||
            token.type === "thead_open" ||
            token.type === "tbody_open"
        ) {
            return defaultRender(tokens, idx, options);
        }

        // block要素の開始タグだけ対象
        if (token.map && token.nesting === 1) {
            const startLine = token.map[0];

            token.attrSet("data-line", String(startLine));
            token.attrJoin("class", "vjs-line");
        }

        return defaultRender(tokens, idx, options);
    };

    const defaultImageRule = md.renderer.rules.image;

    md.renderer.rules.image = (tokens, idx, options, env, self) => {
        const token = tokens[idx];

        const src = token.attrGet("src");
        if (!src || !baseUri) {
            return defaultImageRule
                ? defaultImageRule(tokens, idx, options, env, self)
                : "";
        }

        try {
            const imageUri = vscode.Uri.joinPath(baseUri, "..", src);
            const webviewUri = webview.asWebviewUri(imageUri);

            token.attrSet("src", webviewUri.toString());
        } catch {
            return "";
        }

        // altはそのまま使う
        return defaultImageRule
            ? defaultImageRule(tokens, idx, options, env, self)
            : self.renderToken(tokens, idx, options);
    };

    // ===== table対応 =====

    const addLineAttr = (tokens: any[], idx: number) => {
        const token = tokens[idx];

        if (!token.map) { return; }
        const line = token.map[0];

        if (!token.attrGet("data-line")) {
            token.attrSet("data-line", String(line));
        }
        token.attrJoin("class", "vjs-line");
    };

    // table
    md.renderer.rules.table_open = (tokens, idx, options, env, self) => {
        addLineAttr(tokens, idx);
        return self.renderToken(tokens, idx, options);
    };

    // thead（必要なら）
    md.renderer.rules.thead_open = (tokens, idx, options, env, self) => {
        addLineAttr(tokens, idx);
        return self.renderToken(tokens, idx, options);
    };

    // tbody（必要なら）
    md.renderer.rules.tbody_open = (tokens, idx, options, env, self) => {
        addLineAttr(tokens, idx);
        return self.renderToken(tokens, idx, options);
    };

    const defaultFence = md.renderer.rules.fence;
    md.renderer.rules.fence = (tokens, idx, options, env, self) => {
        const token = tokens[idx];

        if (token.map) {
            token.attrSet("data-line", String(token.map[0]));
            token.attrJoin("class", "vjs-line");
        }

        // 元のレンダラーを呼ぶ
        if (defaultFence) {
            return defaultFence(tokens, idx, options, env, self);
        } else {
            // デフォルトのレンダリング fallback
            return self.renderToken(tokens, idx, options);
        }
    };

    // html_block の行番号付与
    const defaultHtmlBlock = md.renderer.rules.html_block;
    md.renderer.rules.html_block = (tokens, idx, options, env, self) => {
        const token = tokens[idx];

        let html = token.content;

        if (token.map && html.trimStart().startsWith('<table')) {
            const line = token.map[0];
            // table に data-line を追加
            html = html.replace(
                /^<table/,
                `<table data-line="${line}" class="vjs-line"`
            );
            return html; // ← ここで置き換えた HTML を直接返す
        }

        if (defaultHtmlBlock) {
            return defaultHtmlBlock(tokens, idx, options, env, self);
        }
        return html;
    };

    return md;
}

function updatePreview() {
    if (!currentPanel) {
        return;
    }
    const webview = currentPanel.webview;

    try {
        const text = currentDocument?.getText() || "";
        const baseUri = currentDocument?.uri;
        const md = createMarkdownIt(webview, baseUri);

        const htmlContent = md.render(text);
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
                (function(){
                    const vscode = acquireVsCodeApi();

                    // 外部リンクはクリック無効（http / https のみ）
                    document.body.addEventListener('click', (e) => {
                        const link = e.target.closest('a');
                        if (link) {
                            const href = link.getAttribute('href');
                            if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
                                e.preventDefault();
                            }
                            return; // リンクは編集/ジャンプ対象外
                        }

                        // vjs-line クラスの親を取得
                        const targetLineDiv = e.target.closest('.vjs-line');
                        if (!targetLineDiv) return;

                        const lineStr = targetLineDiv.getAttribute('data-line');
                        if (!lineStr) return;

                        vscode.postMessage({
                            type: 'jumpToLine',
                            line: parseInt(lineStr, 10)
                        });
                    });

                    // Enter / Escape キーで編集モード呼び出し（既存）
                    document.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter' || e.key === 'Escape') {
                            vscode.postMessage({ type: 'edit' });
                        }
                    });
                })();
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