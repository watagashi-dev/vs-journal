import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { marked } from 'marked';
import { formatDate } from './utils/date';
import { getWorkspaceRoot } from './utils/workspace';
import { TagTreeProvider } from './sidebar/TagTreeProvider';
import { createFileMeta } from './services/fileMetaService';
import { FileMeta } from './models/FileMeta';

let currentPanel: vscode.WebviewPanel | undefined;
let currentDocument: vscode.TextDocument | undefined;
let tagProvider: TagTreeProvider;

// FileMeta と TagIndex
const fileMetaMap = new Map<string, FileMeta>();
const tagIndex = new Map<string, Set<string>>();
// --- 未タグファイル ---
let untaggedFiles: { filePath: string; title: string }[] = [];

// 起動時 or 設定変更時に呼ぶ初期化処理
function initializeFileMeta(journalDir: string) {
    fileMetaMap.clear();
    tagIndex.clear();
	untaggedFiles = [];

    const root = getWorkspaceRoot();
    if (!root) {
		return;
	}
    const fullDir = path.join(root, journalDir);
    if (!fs.existsSync(fullDir)) {
		return;
	}

    const files = fs.readdirSync(fullDir).filter(f => f.endsWith('.md'));

    for (const file of files) {
        const filePath = path.join(fullDir, file);
        const meta = createFileMeta(filePath);
        fileMetaMap.set(filePath, meta);
        addToTagIndex(meta);
		// 未タグファイル判定
		updateUntaggedFiles(meta);
    }

    console.log('=== Initial TagIndex ===', tagIndex);
	console.log('=== Initial untaggedFiles ===', untaggedFiles);
}

// TagIndex 操作
function removeFromTagIndex(meta: FileMeta) {
    for (const tag of meta.tags) {
        const files = tagIndex.get(tag);
        if (files) {
            files.delete(meta.filePath);
            if (files.size === 0) {
                tagIndex.delete(tag);
            }
        }
    }
}

function addToTagIndex(meta: FileMeta) {
    for (const tag of meta.tags) {
        if (!tagIndex.has(tag)) {
            tagIndex.set(tag, new Set());
        }
        tagIndex.get(tag)!.add(meta.filePath);
    }
}

function refreshTagIndexForFile(meta: FileMeta, oldMeta?: FileMeta) {
    if (oldMeta) {
        removeFromTagIndex(oldMeta);  // 古いタグを削除
    }
    addToTagIndex(meta);              // 新しいタグを追加
}

function getAllTags(): string[] {
    return Array.from(tagIndex.keys()).sort((a, b) => a.localeCompare(b));
}

function getUntaggedFiles(): { filePath: string; title: string }[] {
	return untaggedFiles;
}

/**
 * FileMeta に基づき untaggedFiles を更新する
 */
function updateUntaggedFiles(meta: FileMeta) {
    // 既存の同じファイルエントリを削除
    untaggedFiles = untaggedFiles.filter(f => f.filePath !== meta.filePath);

    // タグがない場合のみ追加
    if (meta.tags.length === 0) {
        untaggedFiles.push({ filePath: meta.filePath, title: meta.title });
    }
}

export function activate(context: vscode.ExtensionContext) {
	console.log('VS Journal active');

    const config = vscode.workspace.getConfiguration('vsJournal');
    const journalDir = config.get<string>('journalDir') ?? 'journal';

    // 初期スキャン
    initializeFileMeta(journalDir);

    // TagTreeProvider 作成
    tagProvider = new TagTreeProvider(getAllTags(), getUntaggedFiles(), journalDir);

    vscode.window.createTreeView('vsJournalTags', { treeDataProvider: tagProvider });

	// 設定変更イベント
	context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration('vsJournal.journalDir')) {
                const newDir = vscode.workspace.getConfiguration('vsJournal').get<string>('journalDir') ?? 'journal';
                tagProvider.setJournalDir(newDir);
                initializeFileMeta(newDir);
                tagProvider.refresh(getAllTags(), getUntaggedFiles());
                vscode.window.showInformationMessage('VS Journal: journalDir setting updated');
            }
        })
    );

    // 保存時差分更新
    context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument(document => {
            if (!isJournalFile(document)) {
				return;
			}

            if (currentDocument && document.uri.toString() === currentDocument.uri.toString()) {
                updatePreview();
            }

            const meta = createFileMeta(document.uri.fsPath);
            const oldMeta = fileMetaMap.get(document.uri.fsPath);
            fileMetaMap.set(document.uri.fsPath, meta);

			// 2. TagIndex 差分更新
			refreshTagIndexForFile(meta, oldMeta);

			// 3. untaggedFiles 更新
			updateUntaggedFiles(meta);

			// TreeProvider更新
            tagProvider.refresh(getAllTags(), getUntaggedFiles());
        })
    );

	// 新規日誌作成
	const newEntryDisposable = vscode.commands.registerCommand('vs-journal.newEntry', async () => {
		const root = getWorkspaceRoot();
		if (!root) {
			vscode.window.showErrorMessage('Workspace not found');
			return;
		}

		const dir = config.get<string>('journalDir') ?? 'journal';

		const filename = `${formatDate(new Date())}.md`;
		const fullDir = path.join(root, dir);
		const fullPath = path.join(fullDir, filename);

		fs.mkdirSync(fullDir, { recursive: true });

		if (!fs.existsSync(fullPath)) {
			fs.writeFileSync(fullPath, `# ${filename}\n\n`);
		}

		const doc = await vscode.workspace.openTextDocument(fullPath);
		await vscode.window.showTextDocument(doc);

		tagProvider.refresh(getAllTags(), getUntaggedFiles());
	});

	// プレビュー表示
	const previewDisposable = vscode.commands.registerCommand('vs-journal.previewEntry', async () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showErrorMessage('No active editor');
			return;
		}

		const document = editor.document;
		if (!isJournalFile(document)) {
			vscode.window.showErrorMessage('Not a VS Journal file');
			return;
		}

		currentDocument = document;

		if (currentPanel) {
			currentPanel.reveal(vscode.ViewColumn.Active);
		} else {
			currentPanel = vscode.window.createWebviewPanel(
				'vsJournalPreview',
				'VS Journal Preview',
				vscode.ViewColumn.Active,
				{ enableScripts: false }
			);

			currentPanel.onDidDispose(() => {
				currentPanel = undefined;
				currentDocument = undefined;
			});
		}

		updatePreview();
	});

	// タグ補完登録
	const completionDisposable = vscode.languages.registerCompletionItemProvider(
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

				return Array.from(tagIndex.keys())
					.map(tag => new vscode.CompletionItem(tag, vscode.CompletionItemKind.Keyword));
			}
		},
		'#' // 先頭 # 入力時に補完
	);

	context.subscriptions.push(
		newEntryDisposable,
		previewDisposable,
		completionDisposable
	);
}

export function deactivate() {}

// --- WebView ---
function getWebviewContent(markdown: string): string {
	const htmlContent = marked.parse(markdown);
	return `
	<!DOCTYPE html>
	<html>
	<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<style>
		body { padding: 40px; font-family: -apple-system, BlinkMacSystemFont, sans-serif; line-height: 1.6; max-width: 800px; margin: 0 auto; }
		h1, h2, h3 { margin-top: 1.4em; }
		pre { background: #f4f4f4; padding: 12px; overflow-x: auto; border-radius: 6px; }
		code { background: #eee; padding: 2px 4px; border-radius: 4px; }
		hr { margin: 2em 0; }
	</style>
	</head>
	<body>${htmlContent}</body>
	</html>
	`;
}

function updatePreview() {
	if (!currentPanel || !currentDocument) {
		return;
	}
	const markdown = currentDocument.getText();
	currentPanel.webview.html = getWebviewContent(markdown);
}

// --- ファイル判定 ---
function isJournalFile(document: vscode.TextDocument): boolean {
	return document.fileName.endsWith('.md');
}
