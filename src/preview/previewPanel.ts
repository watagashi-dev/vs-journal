import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import open from 'open';
import { FileMeta } from '../models/FileMeta';
import { createMarkdownIt, getHljsThemeUrl } from './previewRenderer';
import { getCursorLine, getLastActiveFilePath } from '../state';

let currentPanel: vscode.WebviewPanel | undefined;
let currentDocument: vscode.TextDocument | undefined;
let extensionContext: vscode.ExtensionContext;

export type PreviewContext = {
    kind: 'file' | 'tag';
    tagType?: 'system' | 'user' | 'virtual';
    tagName?: string;
};

// =========================================
// Virtual Tag Session (new unified state)
// =========================================
export type VirtualTagMatch = {
    filePath: string;
    line: number;
    start: number;
    end: number;
};

export type VirtualTagSession = {
    keyword: string;
    caseSensitive: boolean;
    matches: VirtualTagMatch[];
    currentIndex: number;
};

const previewStateMap = new Map<
    vscode.WebviewPanel,
    {
        files: FileMeta[];
        context?: PreviewContext;
        highlight?: {
            keyword: string;
            className: string;
        }
        virtualTagSession?: VirtualTagSession;
    }
>();

export function setPreviewState(
    panel: vscode.WebviewPanel,
    state: {
        files: FileMeta[];
        context?: PreviewContext;
        highlight?: { keyword: string, className: string };
        virtualTagSession?: VirtualTagSession;
    }
) {
    previewStateMap.set(panel, state);
}

export function getPreviewState(
    panel: vscode.WebviewPanel
): {
    files: FileMeta[];
    context?: PreviewContext;
    highlight?: { keyword: string, className: string };
    virtualTagSession?: VirtualTagSession;
} | undefined {
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
            path.join(extensionContext.extensionPath, 'dist')
        )
    );

    return roots;
}

function syncScrollToCursor(panel: vscode.WebviewPanel) {
    const state = getPreviewState(panel);
    if (!state) {
        return;
    }

    const filePath = getLastActiveFilePath();
    if (!filePath) { return; }
    if (!state.files.some(f => f.filePath === filePath)) { return; }

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

let syncScheduled = false;
export function requestSyncScroll(panel: vscode.WebviewPanel) {
    if (syncScheduled) { return; }

    syncScheduled = true;

    setTimeout(() => {
        syncScheduled = false;
        syncScrollToCursor(panel);
    }, 0);
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

        requestSyncScroll(e.webviewPanel);
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

    if (message.type === 'openLocalLink' && message.path) {
        let targetPath = decodeURIComponent(message.path);

        const isUNC = /^\\\\/.test(targetPath);

        // -----------------------------
        // Relative path resolution
        // -----------------------------
        const isAbsolutePath = path.isAbsolute(targetPath);

        if (!isUNC && !isAbsolutePath) {
            if (!currentDocument) {
                vscode.window.showWarningMessage(
                    vscode.l10n.t('Unable to resolve relative path.')
                );
                return;
            }

            const baseDir = path.dirname(currentDocument.uri.fsPath);

            targetPath = path.resolve(baseDir, targetPath);
        }
        const uri = vscode.Uri.file(targetPath);

        if (!isUNC && !fs.existsSync(targetPath)) {
            vscode.window.showWarningMessage(
                vscode.l10n.t('File or directory not found.')
            );
            return;
        }

        const config = vscode.workspace.getConfiguration('vsJournal');
        const normalizedExts = new Set(
            (config.get<string[]>('internalOpenExtensions', []))
                .map(e => e.toLowerCase().startsWith('.') ? e.toLowerCase() : '.' + e.toLowerCase())
        );
        const ext = path.extname(targetPath).toLowerCase();
        const shouldOpenInternally = normalizedExts.has(ext);

        try {
            if (shouldOpenInternally) {
                await vscode.commands.executeCommand(
                    'vscode.open',
                    uri
                );
            } else {
                await open(targetPath);
            }
        } catch {
            vscode.window.showWarningMessage(
                isUNC
                    ? vscode.l10n.t(
                        'Failed to access network path. The server may be unavailable or authentication may be required.'
                    )
                    : vscode.l10n.t(
                        'Failed to open file or directory.'
                    )
            );
        }
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
        const uri = currentDocument.uri;

        const isOpenedInTab = vscode.window.tabGroups.all.some(group =>
            group.tabs.some(tab => {
                const input = tab.input as vscode.TabInputText;
                return input?.uri?.fsPath === uri.fsPath;
            })
        );

        let selection: vscode.Range | undefined;

        if (!isOpenedInTab) {
            const pos = new vscode.Position(0, 0);
            selection = new vscode.Range(pos, pos);
        }

        const doc = await vscode.workspace.openTextDocument(uri);

        await vscode.window.showTextDocument(doc, {
            selection,
            preserveFocus: false,
            preview: false
        });

        return;
    }
    if (message.type === 'closePreview' && currentPanel) {
        currentPanel.dispose();
        return;
    }
}

function getHintText(count: number): string {
    if (count > 1) {
        return vscode.l10n.t("Click to edit, or press Enter to close preview");
    }

    return vscode.l10n.t("Click or press Enter to edit");
}

async function buildHtml(
    panel: vscode.WebviewPanel,
    filesToPreview: FileMeta[],
    options?: {
        limitExceeded?: boolean;
        message?: string;
        context?: PreviewContext;
        highlight?: { keyword: string, className: string };
    }
): Promise<string> {
    const webview = panel.webview;

    // =========================================
    // Resolve highlight (single source of truth)
    // =========================================
    const highlight = options?.highlight;

    const caseSensitive = vscode.workspace
        .getConfiguration('vsJournal')
        .get<boolean>('virtualTags.caseSensitive', true);


    // =========================================
    // Create Virtual Tag Session (no behavior change yet)
    // =========================================
    let virtualTagSession: VirtualTagSession | undefined = undefined;

    if (highlight?.keyword) {
        virtualTagSession = {
            keyword: highlight.keyword,
            caseSensitive,
            matches: [],
            currentIndex: 0
        };
    }

    let htmlContent = '';
    let warningHtml = '';

    if (options?.limitExceeded && options.message) {
        warningHtml = `<div class="vjs-limit-warning">${options.message}</div>`;
    }

    let index = 0;
    for (const fileMeta of filesToPreview) {
        const baseUri = vscode.Uri.file(fileMeta.filePath);
        const md = createMarkdownIt(
            webview,
            baseUri,
            {
                caseSensitive,
                highlightKeyword: highlight?.keyword
            });

        if (index > 0) {
            htmlContent += `<div class="file-separator"></div>\n`;
        }
        index++;

        htmlContent += `<div class="file-block" data-file="${fileMeta.filePath}">\n`;

        const fileText = await vscode.workspace.fs.readFile(
            vscode.Uri.file(fileMeta.filePath)
        );
        const text = Buffer.from(fileText).toString('utf8');

        // =========================================
        // Collect virtual tag matches (no usage yet)
        // =========================================
        if (virtualTagSession) {
            const lines = text.split('\n');

            for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
                const lineText = lines[lineIndex];

                if (!lineText) {
                    continue;
                }
                const keyword = virtualTagSession.keyword;

                if (virtualTagSession.caseSensitive) {
                    let index = 0;

                    while (true) {
                        const found = lineText.indexOf(keyword, index);

                        if (found === -1) {
                            break;
                        }

                        virtualTagSession.matches.push({
                            filePath: fileMeta.filePath,
                            line: lineIndex,
                            start: found,
                            end: found + keyword.length
                        });

                        index = found + keyword.length;
                    }
                } else {
                    const lowerLine = lineText.toLowerCase();
                    const lowerKeyword = keyword.toLowerCase();

                    let index = 0;

                    while (true) {
                        const found = lowerLine.indexOf(lowerKeyword, index);

                        if (found === -1) {
                            break;
                        }

                        virtualTagSession.matches.push({
                            filePath: fileMeta.filePath,
                            line: lineIndex,
                            start: found,
                            end: found + keyword.length
                        });

                        index = found + keyword.length;
                    }
                }
            }
            const state = getPreviewState(panel);
            if (state) {
                state.virtualTagSession = virtualTagSession;
            }
        }

        htmlContent += md.render(text, {
            filePath: fileMeta.filePath,
            context: options?.context,
            rules: highlight
                ? [{
                    keyword: highlight.keyword,
                    className: highlight.className,
                    caseSensitive
                }]
                : []
        });

        htmlContent += '</div>\n';
    }

    const templatePath = vscode.Uri.file(
        path.join(extensionContext.extensionPath, 'dist/webview/template.html')
    );
    const templateBuffer = await vscode.workspace.fs.readFile(templatePath);
    let template = Buffer.from(templateBuffer).toString('utf8');

    const cssPath = vscode.Uri.file(
        path.join(extensionContext.extensionPath, 'dist/webview/webview.css')
    );
    const cssUri = panel.webview.asWebviewUri(cssPath);

    const scriptPath = vscode.Uri.file(
        path.join(extensionContext.extensionPath, 'dist/webview/webview.js')
    );
    const scriptUri = panel.webview.asWebviewUri(scriptPath);

    const hintText = getHintText(filesToPreview.length);
    const isDark = vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark;
    const themeUrl = getHljsThemeUrl(isDark);

    return template
        .replace(/{{cspSource}}/g, webview.cspSource)
        .replace(/{{cssUri}}/g, cssUri.toString())
        .replace(/{{themeUrl}}/g, themeUrl)
        .replace(/{{hintText}}/g, hintText)
        .replace(/{{content}}/g, htmlContent)
        .replace(/{{warning}}/g, warningHtml)
        .replace(/{{highlightRules}}/g, (() => {
            if (!highlight) {
                return '';
            }

            const rules = [
                {
                    keyword: highlight.keyword,
                    className: highlight.className,
                    caseSensitive
                }
            ];

            return encodeURIComponent(JSON.stringify(rules));
        })())
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
        const state = getPreviewState(panel);

        const html = await buildHtml(panel, filesToPreview, {
            ...options,
            context: state?.context,
            highlight: state?.highlight
        });
        panel.webview.html = html;

        if (state?.virtualTagSession) {
            panel.webview.postMessage({
                type: 'setMatches',
                matches: state.virtualTagSession.matches
            });
        }
        panel.webview.postMessage({
            type: 'setPreviewCount',
            count: filesToPreview.length
        });
    } catch (e) {
        // Preview update skipped
    }
}
