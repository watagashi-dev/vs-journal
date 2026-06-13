// src/extension.ts
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { execFileSync } from 'child_process';
import { FileMeta } from './models/FileMeta';
import { measure } from './perf';
import { TagHierarchyBuilder, TagHierarchyNode } from './services/TagHierarchyBuilder';
import { createFileMeta } from './services/fileMetaService';
import { TagTreeProvider } from './sidebar/TagTreeProvider';
import {
    FileNameStyle,
    formatFileNameDate, formatDateString, formatTimeString
} from './utils/date';
import { getWorkspaceRoot } from './utils/workspace';
import {
    PreviewContext,
    setPreviewState, getPreviewState,
    ensurePreviewPanel, updatePreviewPanel,
    setExtensionContext, setCurrentDocument,
    getCurrentPanel,
    notifyThemeChanged, disposePreviewPanel,
    requestSyncScroll
} from './preview/previewPanel';
import { shouldShowCompletionMultiLine, getCurrentTagAtCursor } from './services/tagLogic';
import {
    clearCursorLine,
    setCursorLine,
    systemTagIndexMap, userTagIndexMap, virtualTagIndexMap,
    virtualTagSet, resetVirtualTags
} from './state';
import {
    indexVirtualTags,
    removeVirtualTagsForFile,
    rebuildVirtualTagIndex,
} from './services/virtualTagService';

let tagProvider: TagTreeProvider;

// State management
const fileMetaMap = new Map<string, FileMeta>();
const sessionTagUsage = new Map<string, number>();

export type FolderStructure =
    | 'flat'
    | 'yyyy'
    | 'yyyy-mm'
    | 'yyyy-mm-dd';

export type VSJournalConfig = {
    fileNameStyle: FileNameStyle;
    folderStructure: FolderStructure;
};

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

function getConfig(): VSJournalConfig {
    const config = vscode.workspace.getConfiguration('vsJournal');

    return {
        fileNameStyle: config.get('fileNameStyle') ?? 'datetime-minute',
        folderStructure: config.get('folderStructure') ?? 'flat'
    };
}

export function generateFolderPath(
    date: Date,
    config: VSJournalConfig,
    baseDir: string
): string {
    const pad = (n: number) => n.toString().padStart(2, '0');

    const YYYY = String(date.getFullYear());
    const MM = pad(date.getMonth() + 1);
    const DD = pad(date.getDate());

    switch (config.folderStructure) {
        case 'flat':
            return baseDir;

        case 'yyyy':
            return path.join(baseDir, YYYY);

        case 'yyyy-mm':
            return path.join(baseDir, YYYY, MM);

        case 'yyyy-mm-dd':
            return path.join(baseDir, YYYY, MM, DD);
    }
}

function generateFileName(
    date: Date,
    style: FileNameStyle
): string {
    return formatFileNameDate(date, style);
}

export function generateFullPath(date: Date, config: VSJournalConfig): string {
    const baseDir = getAbsoluteJournalDir(getJournalDir());
    if (!baseDir) {
        throw new Error('Journal directory not found');
    }

    const folder = generateFolderPath(date, config, baseDir);
    const fileName = generateFileName(date, config.fileNameStyle);

    return path.join(folder, fileName + '.md');
}

function getImageWindows(): Buffer | null {
    try {
        const script = `
Add-Type -AssemblyName System.Drawing;
$img = Get-Clipboard -Format Image;
if ($img -eq $null) { exit 1 }
$ms = New-Object System.IO.MemoryStream;
$img.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png);
[Console]::OpenStandardOutput().Write($ms.ToArray(), 0, $ms.Length);
`;

        const buffer = execFileSync(
            'powershell',
            ['-NoProfile', '-Command', script],
            { encoding: 'buffer' }
        );

        return buffer.length > 0 ? buffer : null;
    } catch {
        return null;
    }
}

function getImageMac(): Buffer | null {
    try {
        // pngpaste が前提（ほぼ入ってる or brewで入る）
        const buffer = execFileSync('pngpaste', ['-'], {
            encoding: 'buffer'
        });

        return buffer.length > 0 ? buffer : null;
    } catch {
        return null;
    }
}

function getImageLinux(): Buffer | null {
    // 優先: Wayland
    try {
        const buffer = execFileSync('wl-paste', ['--type', 'image/png'], {
            encoding: 'buffer'
        });

        if (buffer.length > 0) {
            return buffer;
        }
    } catch { }

    // fallback: X11
    try {
        const buffer = execFileSync('xclip', [
            '-selection',
            'clipboard',
            '-t',
            'image/png',
            '-o'
        ], {
            encoding: 'buffer'
        });

        if (buffer.length > 0) {
            return buffer;
        }
    } catch { }

    return null;
}

export function getImageFromClipboard(): Buffer | null {
    try {
        if (process.platform === 'win32') {
            return getImageWindows();
        }

        if (process.platform === 'darwin') {
            return getImageMac();
        }

        if (process.platform === 'linux') {
            return getImageLinux();
        }

        return null;
    } catch {
        return null;
    }
}

type PasteImageTarget = {
    directory: string;
    fileName: string;
    filePath: string;
    relativePath: string;
};

export function createPasteImageTarget(
    editor: vscode.TextEditor
): PasteImageTarget {

    const directory = resolveSaveDirectory(editor);
    const fileName = getNextImageFileName(directory);
    const filePath = path.join(directory, fileName);

    const docDir = path.dirname(editor.document.uri.fsPath);

    const relativePath = path
        .relative(docDir, filePath)
        .replace(/\\/g, '/');

    return {
        directory,
        fileName,
        filePath,
        relativePath,
    };
}

export function resolveSaveDirectory(
    editor: vscode.TextEditor
): string {

    const config = vscode.workspace.getConfiguration('vsJournal');

    const mode = config.get<'flat' | 'structured'>(
        'paste.saveLocation',
        'structured'
    );

    const docPath = editor.document.uri.fsPath;

    const dir = path.dirname(docPath);

    if (mode === 'flat') {
        return dir;
    }

    const baseName = path.basename(
        docPath,
        path.extname(docPath)
    );

    const assetsDir = path.join(
        dir,
        `${baseName}_assets`
    );

    if (!fs.existsSync(assetsDir)) {
        fs.mkdirSync(assetsDir, { recursive: true });
    }

    return assetsDir;
}

export function getNextImageFileName(
    directory: string
): string {

    const files = fs.readdirSync(directory);

    let max = 0;

    for (const file of files) {

        const match = file.match(/^img_(\d+)\.png$/);

        if (!match) {
            continue;
        }

        const num = parseInt(match[1], 10);

        if (num > max) {
            max = num;
        }
    }

    const next = max + 1;

    return `img_${next.toString().padStart(2, '0')}.png`;
}

export async function insertLinkMarkdown(
    editor: vscode.TextEditor,
    pathName: string,
    fileName: string,
    isImage = false
): Promise<boolean> {
    const selectedText =
        editor.document.getText(editor.selection);

    const linkText = selectedText || fileName;

    const markdown = isImage
        ? `![${linkText}](<${pathName}>)`
        : `[${linkText}](<${pathName}>)`;

    return editor.edit(editBuilder => {
        editBuilder.replace(
            editor.selection,
            markdown
        );
    });
}

// --- centralized key normalization ---
export function filePathToKey(filePath: string): string {
    // VSCode standard identity
    return vscode.Uri.file(filePath).toString();
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
            Array.from(virtualTagIndexMap.get(tag)?.values() ?? [])
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

function getAllMarkdownFiles(dir: string): string[] {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    return entries.flatMap(entry => {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            return getAllMarkdownFiles(fullPath);
        }

        if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
            return [fullPath];
        }

        return [];
    });
}

async function refreshAllData() {
    const journalDir = getJournalDir();
    const fullDir = getAbsoluteJournalDir(journalDir);
    const config = vscode.workspace.getConfiguration('vsJournal');
    const caseSensitive = config.get<boolean>('virtualTags.caseSensitive', true);

    fileMetaMap.clear();
    userTagIndexMap.clear();
    systemTagIndexMap.clear();
    virtualTagIndexMap.clear();

    if (!fullDir || !fs.existsSync(fullDir)) {
        return;
    }

    const files = getAllMarkdownFiles(fullDir);

    const fileCache = new Map<string, { content: string; stats: fs.Stats }>();

    for (const file of files) {

        const entry = readFileEntry(file);
        const key = filePathToKey(file);
        fileCache.set(key, entry);

        const meta = createFileMeta(file, entry.content, entry.stats);
        fileMetaMap.set(key, meta);

        addUserTagsFromMeta(meta);
    }

    rebuildSystemTags();

    const readFileContent = (filePath: string): string => {
        return fileCache.get(filePath)?.content ?? '';
    };

    rebuildVirtualTagIndex(fileMetaMap, readFileContent, caseSensitive);
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
    const config = vscode.workspace.getConfiguration('vsJournal');
    const caseSensitive = config.get<boolean>('virtualTags.caseSensitive', true);

    const key = filePathToKey(filePath);
    const oldMeta = fileMetaMap.get(key);

    // --- Remove from old user tags ---
    removeUserTagsFromMeta(oldMeta);

    // --- Read file ---
    const { content, stats } = readFileEntry(filePath);

    // --- Create new FileMeta ---
    const newMeta = createFileMeta(filePath, content, stats);
    const newKey = filePathToKey(filePath);
    fileMetaMap.set(newKey, newMeta);

    // --- Add to user tags ---
    addUserTagsFromMeta(newMeta);

    // --- Virtual tags ---
    removeVirtualTagsForFile(filePath);
    indexVirtualTags(newMeta, content, caseSensitive);

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

async function insertFromUri(editor: vscode.TextEditor, uri: vscode.Uri) {
    const baseName = path.basename(uri.fsPath);
    //    const rawPath = uri.fsPath.replace(/\\/g, '/');

    await insertLinkMarkdown(
        editor,
        //       rawPath,
        uri.fsPath,
        baseName
    );
}

async function pickUri(options: vscode.OpenDialogOptions) {
    const result = await vscode.window.showOpenDialog(options);

    if (!result || result.length === 0) {
        return undefined;
    }

    return result[0];
}

async function handleInsertFileOrDir(canSelectFolders: boolean) {
    const editor = vscode.window.activeTextEditor;

    if (!editor || !isJournalFile(editor.document)) {
        return;
    }

    const uri = await pickUri({
        canSelectFiles: true,
        canSelectFolders,
        canSelectMany: false,
        openLabel: vscode.l10n.t('Insert')
    });

    if (!uri) {
        return;
    }

    await insertFromUri(editor, uri);
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

    const setupWatcher = (context: vscode.ExtensionContext) => {
        if (fileWatcher) {
            fileWatcher.dispose();
            fileWatcher = undefined;
        }

        const absDir = getAbsoluteJournalDir(getJournalDir());
        if (!absDir) { return; }

        const pattern = new vscode.RelativePattern(absDir, '**/*.md');
        fileWatcher = vscode.workspace.createFileSystemWatcher(pattern);

        const onCreate = fileWatcher.onDidCreate(uri => {
            updateSingleFile(uri.fsPath);
            rebuildTree();
        });

        const onChange = fileWatcher.onDidChange(uri => {
            const doc = vscode.workspace.textDocuments.find(d => d.uri.fsPath === uri.fsPath);
            if (doc) { return; }

            updateSingleFile(uri.fsPath);
            rebuildTree();
        });

        const onDelete = fileWatcher.onDidDelete(() => {
            refreshAllData();
            rebuildTree();
        });

        context.subscriptions.push(
            fileWatcher,
            onCreate,
            onChange,
            onDelete
        );
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
            const config = getConfig();

            const fullPath = generateFullPath(new Date(), config);

            fs.mkdirSync(path.dirname(fullPath), { recursive: true });

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
            let context: PreviewContext | undefined;

            if (typeof arg === 'string') {
                filePath = arg;
                context = { kind: 'file' };
            }
            else if (arg && typeof arg === 'object') {
                filePath = (arg as any).filePath ?? (arg as any).fsPath;
                context = (arg as any).context ?? { kind: 'file' };
            }

            const highlight = (arg as any)?.highlight;
            let document: vscode.TextDocument | undefined;

            if (!filePath) {
                const editor = vscode.window.activeTextEditor;
                if (editor && isJournalFile(editor.document)) {
                    filePath = editor.document.uri.fsPath;
                    const lineCount = editor.selection.active.line;
                    setCursorLine(filePath, lineCount);
                }
            }
            else {
                setCursorLine(filePath, 0);
            }

            if (!filePath) {
                return;
            }

            document = await vscode.workspace.openTextDocument(filePath);

            setCurrentDocument(document);
            const column = vscode.ViewColumn.Active;

            const panel = ensurePreviewPanel(column);

            await measure("preview generation", async () => {
                const meta = createFileMeta(filePath);
                const check = checkPreviewLimits([meta]);
                setPreviewState(panel, {
                    files: check.limitedFiles,
                    context,
                    highlight
                });
                await updatePreviewPanel(panel, check.limitedFiles, {
                    limitExceeded: check.limitExceeded,
                    message: check.message
                });
                requestSyncScroll(panel);
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

        vscode.commands.registerCommand('vsJournal.previewMultiEntry', async (arg: any) => {

            const node: TagHierarchyNode = arg.node;
            const context: PreviewContext = arg.context;
            const highlight = arg.highlight;
            const filesToPreview = node.files; // Ignore child tags

            if (filesToPreview.length === 0) {
                vscode.window.showInformationMessage(vscode.l10n.t('There are no files for this tag'));
                return;
            }

            const panel = ensurePreviewPanel(vscode.ViewColumn.Active);
            await measure("preview multi entry generation", async () => {
                const check = checkPreviewLimits(filesToPreview);

                setCursorLine(filesToPreview[0].filePath, 0);
                setPreviewState(panel, {
                    files: check.limitedFiles,
                    context,
                    highlight
                });
                await updatePreviewPanel(panel, check.limitedFiles, {
                    limitExceeded: check.limitExceeded,
                    message: check.message
                });
            });
        }),

        vscode.commands.registerCommand('vs-journal.addVirtualTag', async () => {
            const config = vscode.workspace.getConfiguration('vsJournal');
            const caseSensitive = config.get<boolean>('virtualTags.caseSensitive', true);

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

            await measure("rebuild virtual tag", async () => {
                // --- Register virtual tag (core) ---
                virtualTagSet.add(trimmed);

                // --- Register virtual tag (empty entry allowed for now) ---
                if (!virtualTagIndexMap.has(trimmed)) {
                    virtualTagIndexMap.set(trimmed, new Map<string, FileMeta>());
                }
                const readFileContent = (filePath: string): string => {
                    return readFileEntry(filePath).content;
                };
                rebuildVirtualTagIndex(fileMetaMap, readFileContent, caseSensitive);
            });

            // --- Refresh tree ---
            rebuildTree();
        }),

        vscode.commands.registerCommand('vsJournal.deleteVirtualTag',
            async (
                item: vscode.TreeItem & {
                    node?: TagHierarchyNode;
                }
            ) => {
                if (!item || item.contextValue !== 'tag:virtual') {
                    return;
                }
                const node = item.node;
                if (!node) {
                    return;
                }
                if (!virtualTagSet.has(node.name)) {
                    return;
                }

                const config = vscode.workspace.getConfiguration('vsJournal');
                const confirm = config.get<boolean>('confirmDeleteVirtualTag', true);

                if (confirm) {
                    const deleteLabel = vscode.l10n.t('Delete');
                    const result = await vscode.window.showWarningMessage(
                        vscode.l10n.t('Delete this virtual tag?'),
                        { modal: true },
                        deleteLabel
                    );

                    if (result !== deleteLabel) {
                        return;
                    }
                }

                // 1. remove from source
                virtualTagSet.delete(node.name);

                // 2. rebuild derived structures
                const readFileContent = (filePath: string): string => {
                    return readFileEntry(filePath).content;
                };

                const caseSensitive = config.get<boolean>('virtualTags.caseSensitive', true);

                rebuildVirtualTagIndex(fileMetaMap, readFileContent, caseSensitive);

                // 3. rebuild UI
                rebuildTree();
            }
        ),

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

        vscode.commands.registerCommand(
            'vsJournal.paste',
            async () => {
                const editor = vscode.window.activeTextEditor;

                if (!editor || !isJournalFile(editor.document)) {
                    return;
                }

                const buf = getImageFromClipboard();
                if (!buf) {
                    return;
                }

                const target =
                    createPasteImageTarget(editor);

                fs.writeFileSync(target.filePath, buf);

                await insertLinkMarkdown(
                    editor,
                    target.relativePath,
                    target.fileName,
                    true
                );
            }
        ),

        vscode.commands.registerCommand(
            'vsJournal.insertFile',
            () => handleInsertFileOrDir(false)
        ),

        vscode.commands.registerCommand(
            'vsJournal.insertFolder',
            () => handleInsertFileOrDir(true)
        ),

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
                setupWatcher(context);
                disposePreviewPanel();
            }
            if (event.affectsConfiguration('vsJournal.autoSave')) {
                autoSaveTimers.forEach(timer => clearTimeout(timer));
                autoSaveTimers.clear();
            }
            if (event.affectsConfiguration('vsJournal.systemTags.visibility')) {
                rebuildTree(); // No re-scan required
            }
            if (event.affectsConfiguration('vsJournal.virtualTags.caseSensitive')) {
                const config = vscode.workspace.getConfiguration('vsJournal');
                const caseSensitive = config.get<boolean>('virtualTags.caseSensitive', true);

                virtualTagIndexMap.clear();

                const readFileContent = (filePath: string): string => {
                    return readFileEntry(filePath).content;
                };
                for (const tag of virtualTagSet) {
                    rebuildVirtualTagIndex(fileMetaMap, readFileContent, caseSensitive);
                }
                rebuildTree();
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

            const state = getPreviewState(panel);
            if (!state) { return; }

            const meta = createFileMeta(document.uri.fsPath);
            const updatedFiles = state.files.map(f =>
                f.filePath === meta.filePath ? meta : f
            );

            const check = checkPreviewLimits(updatedFiles);

            setPreviewState(panel, {
                files: check.limitedFiles,
                context: state.context,
                highlight: state.highlight
            });
            await updatePreviewPanel(panel, check.limitedFiles, {
                limitExceeded: check.limitExceeded,
                message: check.message
            });
        }),

        vscode.workspace.onDidChangeTextDocument(event => {
            if (!isJournalFile(event.document)) { return; }
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
    setupWatcher(context);
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

export function deactivate() { }
