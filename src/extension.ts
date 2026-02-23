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

// 状態管理
const fileMetaMap = new Map<string, FileMeta>();
const tagIndexForProvider = new Map<string, any[]>(); 
let untaggedFiles: { filePath: string; title: string }[] = [];

/**
 * ジャーナルディレクトリのパス解決
 */
function getJournalDir(): string {
    const config = vscode.workspace.getConfiguration('vsJournal');
    const setting = config.inspect<string>('journalDir');
    if (!setting || (setting.globalValue === undefined && setting.workspaceValue === undefined && setting.workspaceFolderValue === undefined)) {
        return path.join(os.homedir(), 'vsJournal');
    }
    return config.get<string>('journalDir') ?? path.join(os.homedir(), 'vsJournal');
}

function getAbsoluteJournalDir(journalDir: string): string | undefined {
    if (path.isAbsolute(journalDir)) { return journalDir; }
    const root = getWorkspaceRoot();
    return root ? path.join(root, journalDir) : undefined;
}

/**
 * 【高速化】全ファイルの初期スキャン
 */
async function refreshAllData() {
    const journalDir = getJournalDir();
    const fullDir = getAbsoluteJournalDir(journalDir);
    
    fileMetaMap.clear();
    tagIndexForProvider.clear();
    untaggedFiles = [];

    if (!fullDir || !fs.existsSync(fullDir)) { return; }

    const files = fs.readdirSync(fullDir).filter(f => f.endsWith('.md'));

    // 全ファイルを解析してインデックスを構築
    for (const file of files) {
        const filePath = path.join(fullDir, file);
        const meta = createFileMeta(filePath);
        fileMetaMap.set(filePath, meta);

        if (meta.tags.length === 0) {
            untaggedFiles.push({ filePath: meta.filePath, title: meta.title });
        } else {
            for (const tag of meta.tags) {
                if (!tagIndexForProvider.has(tag)) { tagIndexForProvider.set(tag, []); }
                tagIndexForProvider.get(tag)!.push({ filePath: meta.filePath, title: meta.title });
            }
        }
    }

    notifyProvider();
}

/**
 * 【差分更新】保存された1ファイルだけを効率的に更新する
 */
function updateSingleFile(filePath: string) {
    // 1. 古いデータの削除
    const oldMeta = fileMetaMap.get(filePath);
    if (oldMeta) {
        for (const tag of oldMeta.tags) {
            const files = tagIndexForProvider.get(tag);
            if (files) {
                const filtered = files.filter(f => f.filePath !== filePath);
                filtered.length === 0 ? tagIndexForProvider.delete(tag) : tagIndexForProvider.set(tag, filtered);
            }
        }
    }
    untaggedFiles = untaggedFiles.filter(f => f.filePath !== filePath);

    // 2. 新しいデータの抽出と追加
    const newMeta = createFileMeta(filePath);
    fileMetaMap.set(filePath, newMeta);

    if (newMeta.tags.length === 0) {
        untaggedFiles.push({ filePath: newMeta.filePath, title: newMeta.title });
    } else {
        for (const tag of newMeta.tags) {
            if (!tagIndexForProvider.has(tag)) { tagIndexForProvider.set(tag, []); }
            tagIndexForProvider.get(tag)!.push({ filePath: newMeta.filePath, title: newMeta.title });
        }
    }

    notifyProvider();
}

/**
 * Providerに最新データを反映させる
 */
function notifyProvider() {
    const allTags = Array.from(tagIndexForProvider.keys()).sort();
    tagProvider.refresh(allTags, untaggedFiles, tagIndexForProvider);
}

export async function activate(context: vscode.ExtensionContext) {
	let fileWatcher: vscode.FileSystemWatcher | undefined;

    // --- イベント監視 ---
	const setupWatcher = () => {
		// 古い監視があれば破棄する（デグレード・二重動作防止）
		if (fileWatcher) {
			fileWatcher.dispose();
		}

		const journalDir = getJournalDir();
		const absJournalDir = getAbsoluteJournalDir(journalDir);
		if (!absJournalDir) { return; }

		const pattern = new vscode.RelativePattern(absJournalDir, '**/*.md');
		fileWatcher = vscode.workspace.createFileSystemWatcher(pattern);

		fileWatcher.onDidCreate(uri => updateSingleFile(uri.fsPath));
		fileWatcher.onDidChange(uri => updateSingleFile(uri.fsPath));
		fileWatcher.onDidDelete(() => refreshAllData());

		// 拡張機能が終了したときに自動で破棄されるように登録
		context.subscriptions.push(fileWatcher);
	};

    // Providerの即時初期化
    tagProvider = new TagTreeProvider([], [], new Map());
    const treeView = vscode.window.createTreeView('vsJournalTags', { 
        treeDataProvider: tagProvider,
        showCollapseAll: true 
    });

//    treeView.onDidChangeVisibility(e => {
//        try {
//            await vscode.commands.executeCommand(
//                'setContext',
//                'vsJournalTagsVisible',
//                e.visible
//            );
//        } catch (err: any) {
//            if (err?.message !== 'Canceled') {
//                console.log(err);
//            }
//        }
//    });

    // 非同期で初回スキャン（プログレスバーをサイドバー内に表示）
    vscode.window.withProgress({
        location: { viewId: 'vsJournalTags' }
    }, async () => {
        await measure("initial scan", async () => {
            await refreshAllData().catch(err=> {
                if (err.message !== 'Canceled') {
                    console.log(err);
                }
            });
        });
    });
	setupWatcher(); // 監視開始

    // 設定変更
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(async event => {
            if (event.affectsConfiguration('vsJournal.journalDir')) {
                await measure("initial scan", async () => {
                    await refreshAllData();
                });
				setupWatcher(); // 設定変更に合わせて監視を作り直し
                vscode.window.showInformationMessage('VS Journal: journalDir updated');
            }
        })
    );

    // 保存時（差分更新を適用）
    context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument(async document => {
            if (!isJournalFile(document)) { return; }
            
            // 全スキャンではなく、このファイルだけを処理（爆速）
            updateSingleFile(document.uri.fsPath);

            // パネルが「表示されている」時だけ更新をかける
            if (currentPanel && currentPanel.visible && currentDocument?.uri.toString() === document.uri.toString()) {
                await measure("preview generation", async () => {
                    updatePreview();
                });
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
            updateSingleFile(fullPath); // 新規作成も差分更新
        }),

        vscode.commands.registerCommand('vs-journal.previewEntry', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor || !isJournalFile(editor.document)) { return; }
            currentDocument = editor.document;
            if (currentPanel) {
                currentPanel.reveal(vscode.ViewColumn.Active);
            } else {
                currentPanel = vscode.window.createWebviewPanel('vsJournalPreview', 'VS Journal Preview', vscode.ViewColumn.Active, { enableScripts: false });
                currentPanel.onDidDispose(() => { currentPanel = undefined; currentDocument = undefined; });
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
        currentPanel.webview.html = `<!DOCTYPE html><html>...${htmlContent}...</html>`;
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

export function deactivate() {}