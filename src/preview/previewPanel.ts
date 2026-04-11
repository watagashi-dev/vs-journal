import * as vscode from 'vscode';
import * as path from 'path';
import { FileMeta } from '../models/FileMeta';
import { createMarkdownIt, getHljsThemeUrl } from './previewRenderer';

let currentPanel: vscode.WebviewPanel | undefined;
let currentDocument: vscode.TextDocument | undefined;
let extensionContext: vscode.ExtensionContext;
let needsRefresh = false;

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

    // Webview用リソース（常に必要）
    roots.push(
        vscode.Uri.file(
            path.join(extensionContext.extensionPath, 'resources')
        )
    );

    return roots;
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
        if (e.webviewPanel.visible && needsRefresh) {
            needsRefresh = false;
        }
    });

    currentPanel.webview.onDidReceiveMessage(async message => {
        if (!message) { return; }

        if (message.type === 'jumpToLine' && message.filePath) {
            const uri = vscode.Uri.file(message.filePath);
            const doc = await vscode.workspace.openTextDocument(uri);

            const safeLine = Math.min(message.line ?? 0, doc.lineCount - 1);
            const pos = new vscode.Position(safeLine, 0);

            await vscode.window.showTextDocument(doc, {
                selection: new vscode.Selection(pos, pos)
            });
        }

        if (message.type === 'jumpToFile' && message.filePath) {
            const uri = vscode.Uri.file(message.filePath);
            const doc = await vscode.workspace.openTextDocument(uri);
            await vscode.window.showTextDocument(doc);
        }

        if (message.type === 'edit' && currentDocument) {
            const doc = await vscode.workspace.openTextDocument(currentDocument.uri);
            await vscode.window.showTextDocument(doc);
        }
    });

    return currentPanel;
}

export async function updatePreviewPanel(
    panel: vscode.WebviewPanel,
    filesToPreview: FileMeta[] = [],
    options?: {
        limitExceeded?: boolean;
        message?: string;
    }
) {
    const webview = panel.webview;
    try {
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

            const fileText = await vscode.workspace.fs.readFile(vscode.Uri.file(fileMeta.filePath));
            const text = Buffer.from(fileText).toString('utf8');

            htmlContent += md.render(text, { filePath: fileMeta.filePath });
            htmlContent += '</div>\n';
        }

        const cssPath = vscode.Uri.file(path.join(extensionContext.extensionPath, 'resources/webview.css'));
        const cssUri = panel.webview.asWebviewUri(cssPath);
        const hintText = vscode.l10n.t("Click or press Enter to edit");
        const isDark = vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark;
        const themeUrl = getHljsThemeUrl(isDark);

        panel.webview.html = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta http-equiv="Content-Security-Policy" content="
                    default-src 'none';
                    img-src ${webview.cspSource} https: data:;
                    style-src ${webview.cspSource} 'unsafe-inline' https://cdnjs.cloudflare.com;
                    script-src ${webview.cspSource} 'unsafe-inline' https://cdnjs.cloudflare.com;
                ">
                <link rel="stylesheet" type="text/css" href="${cssUri}">
                <link id="hljs-theme" rel="stylesheet" href="${themeUrl}">
                <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.8.0/highlight.min.js"></script>
            </head>
            <body>
                <div class="edit-hint">${hintText}</div>
                ${htmlContent}
                ${warningHtml}
                <script>
                hljs.highlightAll();
                (function(){
                    const vscode = acquireVsCodeApi();
                    document.body.addEventListener('click', (e) => {
                        const link = e.target.closest('a');
                        if (link) {
                            const href = link.getAttribute('href');
                            if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
                                e.preventDefault();
                            }
                            return;
                        }
                        const targetLineDiv = e.target.closest('.vjs-line');
                        if (targetLineDiv) {
                            const lineStr = targetLineDiv.getAttribute('data-line');
                            const fileContainer = targetLineDiv.closest('[data-file]');
                            const filePath = fileContainer?.getAttribute('data-file');
                            if (lineStr && filePath) {
                                vscode.postMessage({
                                    type: 'jumpToLine',
                                    filePath,
                                    line: parseInt(lineStr, 10)
                                });
                                return;
                            }
                        }
                        const fileRoot = e.target.closest('[data-file]');
                        if (fileRoot) {
                            const filePath = fileRoot.getAttribute('data-file');
                            if (filePath) {
                                vscode.postMessage({
                                    type: 'jumpToFile',
                                    filePath
                                });
                                return;
                            }
                        }
                    });

                    document.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter' || e.key === 'Escape') {
                            vscode.postMessage({ type: 'edit' });
                        }
                    });
                    window.addEventListener('load', () => {
                        hljs.highlightAll();
                    });
                })();
                window.addEventListener('message', event => {
                    const msg = event.data;
                    if (msg.type !== 'themeChanged') return;
                    const link = document.getElementById('hljs-theme');
                    if (!link) return;
                    link.href = msg.themeUrl;
                    hljs.highlightAll();
                });
                </script>
            </body>
            </html>
        `;
    } catch (e) {
        // Preview update skipped
    }
}
