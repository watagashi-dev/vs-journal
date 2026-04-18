import * as vscode from 'vscode';
import * as path from 'path';
import { FileMeta } from '../models/FileMeta';
import { createMarkdownIt, getHljsThemeUrl } from './previewRenderer';
import { getCursorLine } from '../state';

let currentPanel: vscode.WebviewPanel | undefined;
let currentDocument: vscode.TextDocument | undefined;
let extensionContext: vscode.ExtensionContext;

// ===== Preview State =====
const previewStateMap = new Map<vscode.WebviewPanel, FileMeta[]>();

export function setPreviewState(panel: vscode.WebviewPanel, files: FileMeta[]) {
    previewStateMap.set(panel, files);
}

export function getPreviewState(panel: vscode.WebviewPanel): FileMeta[] | undefined {
    return previewStateMap.get(panel);
}

export function getCurrentPanel(): vscode.WebviewPanel | undefined {
    return currentPanel;
}

export function setExtensionContext(ctx: vscode.ExtensionContext) {
    extensionContext = ctx;
}

export function setCurrentDocument(doc: vscode.TextDocument) {
    currentDocument = doc;
}

export function notifyThemeChanged() {
    if (!currentPanel) {
        return;
    }

    currentPanel.webview.postMessage({
        type: 'themeChanged',
        themeUrl: getHljsThemeUrl(vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark)
    });
}

export function disposePreviewPanel() {
    if (currentPanel) {
        currentPanel.dispose();
        currentPanel = undefined;
    }
}

function getLocalResourceRoots(): vscode.Uri[] {
    const config = vscode.workspace.getConfiguration('vsJournal');
    const journalDir = config.get<string>('journalDir');

    const roots: vscode.Uri[] = [];

    if (journalDir) {
        roots.push(vscode.Uri.file(journalDir));
    }

    // Webview resources (always required)
    roots.push(
        vscode.Uri.file(
            path.join(extensionContext.extensionPath, 'resources')
        )
    );

    return roots;
}

function syncScrollToCursor(panel: vscode.WebviewPanel) {
    const previewFiles = getPreviewState(panel);

    if (!previewFiles || previewFiles.length !== 1) {
        return;
    }

    const filePath = previewFiles[0].filePath;
    const line = getCursorLine(filePath);

    if (line === undefined) {
        return;
    }

    panel.webview.postMessage({
        type: 'scrollToLine',
        filePath,
        line
    });
}


export function ensurePreviewPanel(
    column: vscode.ViewColumn,
    preserveFocus: boolean = false
): vscode.WebviewPanel {
    if (currentPanel) {
        currentPanel.reveal(column, preserveFocus);
        return currentPanel;
    }

    const roots = getLocalResourceRoots();

    currentPanel = vscode.window.createWebviewPanel(
        'vsJournalPreview',
        'VS Journal Preview',
        column,
        {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: roots
        }
    );

    currentPanel.onDidDispose(() => {
        previewStateMap.delete(currentPanel!);
        currentPanel = undefined;
        currentDocument = undefined;
    });

    currentPanel.onDidChangeViewState(e => {
        if (!e.webviewPanel.visible) {
            return;
        }

        syncScrollToCursor(e.webviewPanel);
    });

    currentPanel.webview.onDidReceiveMessage(handleWebviewMessage);

    return currentPanel;
}

async function handleWebviewMessage(message: any) {
    if (!message) { return; }

    if (message.type === 'openExternal') {
        await vscode.env.openExternal(vscode.Uri.parse(message.url));
        return;
    }

    if (message.type === 'jumpToLine' && message.filePath) {
        const uri = vscode.Uri.file(message.filePath);
        const doc = await vscode.workspace.openTextDocument(uri);

        const safeLine = Math.min(message.line ?? 0, doc.lineCount - 1);
        const pos = new vscode.Position(safeLine, 0);

        await vscode.window.showTextDocument(doc, {
            selection: new vscode.Selection(pos, pos)
        });
        return;
    }

    if (message.type === 'jumpToFile' && message.filePath) {
        const uri = vscode.Uri.file(message.filePath);
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc);
        return;
    }

    if (message.type === 'edit' && currentDocument) {
        const doc = await vscode.workspace.openTextDocument(currentDocument.uri);
        await vscode.window.showTextDocument(doc);
        return;
    }
}

async function buildHtml(
    panel: vscode.WebviewPanel,
    filesToPreview: FileMeta[],
    options?: {
        limitExceeded?: boolean;
        message?: string;
    }
): Promise<string> {
    const webview = panel.webview;

    let htmlContent = '';
    let warningHtml = '';

    if (options?.limitExceeded && options.message) {
        warningHtml = `<div class="vjs-limit-warning">${options.message}</div>`;
    }

    let index = 0;
    for (const fileMeta of filesToPreview) {
        const baseUri = vscode.Uri.file(fileMeta.filePath);
        const md = createMarkdownIt(webview, baseUri);

        if (index > 0) {
            htmlContent += `<div class="file-separator"></div>\n`;
        }
        index++;

        htmlContent += `<div class="file-block" data-file="${fileMeta.filePath}">\n`;

        const fileText = await vscode.workspace.fs.readFile(
            vscode.Uri.file(fileMeta.filePath)
        );
        const text = Buffer.from(fileText).toString('utf8');

        htmlContent += md.render(text, { filePath: fileMeta.filePath });
        htmlContent += '</div>\n';
    }

    const templatePath = vscode.Uri.file(
        path.join(extensionContext.extensionPath, 'resources/template.html')
    );
    const templateBuffer = await vscode.workspace.fs.readFile(templatePath);
    let template = Buffer.from(templateBuffer).toString('utf8');

    const cssPath = vscode.Uri.file(
        path.join(extensionContext.extensionPath, 'resources/webview.css')
    );
    const cssUri = panel.webview.asWebviewUri(cssPath);

    const scriptPath = vscode.Uri.file(
        path.join(extensionContext.extensionPath, 'resources/webview/webview.js')
    );
    const scriptUri = panel.webview.asWebviewUri(scriptPath);

    const hintText = vscode.l10n.t("Click or press Enter to edit");
    const isDark = vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark;
    const themeUrl = getHljsThemeUrl(isDark);

    return template
        .replace(/{{cspSource}}/g, webview.cspSource)
        .replace(/{{cssUri}}/g, cssUri.toString())
        .replace(/{{themeUrl}}/g, themeUrl)
        .replace(/{{hintText}}/g, hintText)
        .replace(/{{content}}/g, htmlContent)
        .replace(/{{warning}}/g, warningHtml)
        .replace(/{{scriptUri}}/g, scriptUri.toString());
}

export async function updatePreviewPanel(
    panel: vscode.WebviewPanel,
    filesToPreview: FileMeta[] = [],
    options?: {
        limitExceeded?: boolean;
        message?: string;
    }
) {
    try {
        const html = await buildHtml(panel, filesToPreview, options);
        panel.webview.html = html;
    } catch (e) {
        // Preview update skipped
    }
}
