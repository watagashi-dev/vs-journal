import * as vscode from 'vscode';
import MarkdownIt from 'markdown-it';
import taskLists from 'markdown-it-task-lists';
import texmath from 'markdown-it-texmath';
import katex from 'katex';

import {
    getTagRanges,
    getTagNodeContext,
    isTagLineValid,
    isParsedHeadingTagPartValid,
    isValidTagLineStructure,
    hasValidHeadingTagStructure
} from '../services/tagLogic';
import {
    matchesPreviewVirtualTag,
    buildTagSegments
} from '../services/virtualTagService';
import { VirtualTagFile } from '../models/FileMeta';

export type InlineVirtualHit = {
    virtualTag: boolean;
    keyword?: string;
};

export function createMarkdownIt(
    webview: vscode.Webview,
    baseUri: vscode.Uri | undefined,
    options?: {
        caseSensitive: boolean;
        highlightKeyword: string | undefined;
        virtualTagFile?: VirtualTagFile;
    }
) {
    const highlightKeyword =
        options?.highlightKeyword;

    const caseSensitive =
        options?.caseSensitive ?? false;

    const virtualTagFile =
        options?.virtualTagFile;

    const md = new MarkdownIt({
        html: true,
        linkify: true,
        typographer: true
    }).use(taskLists, {
        enabled: false,
        label: false,
        labelAfter: false
    }).use(texmath, {
        engine: katex,
        delimiters: 'dollars',
    });

    const defaultRender = md.renderer.renderToken.bind(md.renderer);

    function applyLineAttrs(token: any) {
        const map = token.map;
        if (!map) { return; }

        const start = map[0];
        const end = map[1];

        token.attrSet("data-start-line", String(start));

        if (typeof end === "number") {
            token.attrSet("data-end-line", String(end));
        }
    }

    md.renderer.renderToken = (
        tokens: any[],
        idx: number,
        options: any,
        env?: Record<string, any>
    ): string => {
        const token = tokens[idx];

        if (token.type === "table_open" || token.type === "thead_open" || token.type === "tbody_open") {
            return defaultRender(tokens, idx, options);
        }

        if (token.map && token.nesting === 1) {
            applyLineAttrs(token);
        }

        return defaultRender(tokens, idx, options);
    };

    const defaultImageRule = md.renderer.rules.image;
    md.renderer.rules.image = (tokens, idx, options, env, self) => {
        const token = tokens[idx];
        const src = token.attrGet("src");
        const hit = token.meta?.hit;

        // Parse image options from alt text
        const alt = token.content;
        const separator = alt.indexOf("|");

        if (separator >= 0) {
            const altText = alt.slice(0, separator);
            const optionText = alt.slice(separator + 1);

            token.content = altText;
            if (token.children && token.children.length > 0) {
                token.children[0].content = altText;
            }

            const allowedAttrs = new Set([
                "width",
                "height",
            ]);

            optionText.split(",").forEach((option) => {
                const [rawKey, rawValue] = option.split("=");
                const key = rawKey?.trim();
                const value = rawValue?.trim();

                if (!key || !value) {
                    return;
                }

                if (!allowedAttrs.has(key)) {
                    return;
                }

                token.attrSet(key, value);
            });
        }

        if (hit?.virtual) {
            token.attrJoin("class", "vjs-virtual-image-hit");
            token.attrSet("data-virtual", "true");
        }

        if (!src) {
            return defaultImageRule
                ? defaultImageRule(tokens, idx, options, env, self)
                : "";
        }

        // External URL はそのまま
        if (!src.startsWith("http://") && !src.startsWith("https://")) {
            if (baseUri) {
                try {
                    const imageUri =
                        vscode.Uri.joinPath(
                            baseUri,
                            "..",
                            src
                        );

                    const webviewUri =
                        webview.asWebviewUri(imageUri);

                    token.attrSet(
                        "src",
                        webviewUri.toString()
                    );
                }
                catch {
                    return "";
                }
            }
        }

        return defaultImageRule
            ? defaultImageRule(tokens, idx, options, env, self)
            : self.renderToken(tokens, idx, options);
    };

    md.renderer.rules.table_open = (tokens, idx, options, env, self) => {
        const token = tokens[idx];

        // Existing processing (adding line numbers, etc.)
        applyLineAttrs(token);

        // Treat Markdown tables as border less
        const existingClass = tokens[idx].attrGet('class');
        if (existingClass) {
            tokens[idx].attrSet('class', existingClass + ' vjs-md-table');
        } else {
            tokens[idx].attrSet('class', 'vjs-md-table');
        }

        return self.renderToken(tokens, idx, options);
    };

    md.renderer.rules.thead_open = (tokens, idx, options, env, self) => {
        applyLineAttrs(tokens[idx]);
        return self.renderToken(tokens, idx, options);
    };

    md.renderer.rules.tbody_open = (tokens, idx, options, env, self) => {
        applyLineAttrs(tokens[idx]);
        return self.renderToken(tokens, idx, options);
    };

    const defaultFence = md.renderer.rules.fence;
    md.renderer.rules.fence = (tokens, idx, options, env, self) => {
        const token = tokens[idx];
        if (token.map) {
            applyLineAttrs(token);
        }
        const rawLang = token.info?.trim().split(/\s+/g)[0] ?? "";
        if (rawLang.toLowerCase() === "math") {
            const startLine = token.attrGet("data-start-line");
            const endLine = token.attrGet("data-end-line");

            const html = katex.renderToString(token.content, {
                displayMode: true,
                throwOnError: false
            });

            return `<div class="math-block" data-start-line="${startLine}" data-end-line="${endLine}">${html}</div>`;
        }

        let displayLang = '';
        let hasNoTab = false;
        let hasWrap = false;
        if (token.info) {
            const rawLang = token.info.trim();
            const langTokens = rawLang
                .split(/[\s_-]+/)
                .filter(Boolean);
            const KNOWN_FLAGS = new Set([
                'diff',
                'wrap',
                'linenumber',
                'notab'
            ]);

            const flags = new Set(
                langTokens
                    .map(t => t.toLowerCase())
                    .filter(t => KNOWN_FLAGS.has(t))
            );

            hasWrap = flags.has('wrap');
            hasNoTab = flags.has('notab');

            const lang =
                langTokens.find(t => !KNOWN_FLAGS.has(t.toLowerCase()))
                ?? '';
            displayLang = lang;
            token.attrSet('data-language', rawLang);

            if (flags.has('diff')) {
                token.attrSet('data-diff', 'true');
            }
            if (hasWrap) {
                token.attrSet('data-wrap', 'true');
            }
            if (flags.has('linenumber')) {
                token.attrSet('data-linenumber', 'true');
            }

            token.attrJoin("class", `language-${lang}`);
        }

        const html = defaultFence
            ? defaultFence(tokens, idx, options, env, self)
            : self.renderToken(tokens, idx, options);

        if (!displayLang && !hasWrap) {
            return html;
        }

        const isVirtual =
            token.meta?.hit?.virtual === true;
        return `
<div class="vjs-code-block">
    ${!hasNoTab && displayLang
                ? `<div class="vjs-code-tab"
            data-language="${displayLang}"
            ${isVirtual ? 'data-virtual="true"' : ''}>
            ${displayLang}
        </div>`
                : ''} 
    ${html}
</div>`;
    };

    function highlightHtmlTextNodes(
        html: string,
        keyword: string | undefined,
        caseSensitive: boolean
    ): string {
        if (!keyword) {
            return html;
        }

        const segments: string[] = [];
        const tokenPattern =
            /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<\/?[a-zA-Z][^>]*>|<![^>]*>/g;

        let lastIndex = 0;
        let match: RegExpExecArray | null;

        const appendText = (text: string): void => {
            if (!text) {
                return;
            }

            const textSegments = buildTagSegments(
                text,
                keyword,
                caseSensitive
            );

            for (const segment of textSegments) {
                if (!segment.virtualTag) {
                    segments.push(segment.text);
                    continue;
                }

                segments.push(
                    `<span class="vjs-virtual-tag" data-virtual="true">${md.utils.escapeHtml(segment.text)}</span>`
                );
            }
        };

        while ((match = tokenPattern.exec(html)) !== null) {
            appendText(html.slice(lastIndex, match.index));
            segments.push(match[0]);
            lastIndex = match.index + match[0].length;
        }

        appendText(html.slice(lastIndex));

        return segments.join('');
    }

    const defaultHtmlBlock = md.renderer.rules.html_block;
    md.renderer.rules.html_block = (tokens, idx, options, env, self) => {
        const token = tokens[idx];
        let html = token.content;
        if (highlightKeyword) {
            html = highlightHtmlTextNodes(
                html,
                highlightKeyword,
                caseSensitive
            );
        }
        if (token.map && html.trimStart().startsWith('<table')) {
            const start = token.map[0];
            const end = token.map[1];

            let attr = `data-start-line="${start}"`;
            if (typeof end === "number") {
                attr += ` data-end-line="${end}"`;
            }

            html = html.replace(/^<table/, `<table ${attr}`);

            return html;
        }
        return defaultHtmlBlock ? defaultHtmlBlock(tokens, idx, options, env, self) : html;
    };

    const defaultLinkOpen = md.renderer.rules.link_open || ((tokens, idx, options, env, self) => {
        return self.renderToken(tokens, idx, options);
    });

    md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
        const token = tokens[idx];

        if (token.attrs) {
            const hrefIndex = token.attrIndex("href");

            if (hrefIndex >= 0) {
                let href = token.attrs[hrefIndex][1];
                try {
                    href = decodeURIComponent(href);
                }
                catch {
                    // Keep original URL
                }
                // LOCAL / UNC / relative は VS Journal管理
                const isUNC = href.startsWith('\\') && !href.startsWith('\\\\');
                if (isUNC) {
                    href = '\\' + href;
                }

                // data-hrefのみ保持
                token.attrs.splice(hrefIndex, 1);
                token.attrPush(["data-href", href]);
            }
        }

        const hit = token.meta?.hit;
        if (hit?.virtual) {
            token.attrJoin("class", "vjs-virtual-link-hit");
            token.attrSet("data-virtual", "true");
        }

        return defaultLinkOpen(tokens, idx, options, env, self);
    };

    md.renderer.rules.vjs_tag = (
        tokens,
        idx
    ) => {
        const token = tokens[idx];

        const meta = token.meta || {};

        const className = meta.heading
            ? 'vjs-heading-tag'
            : 'vjs-user-tag';

        const segments = buildTagSegments(
            token.content,
            highlightKeyword,
            caseSensitive
        );

        const content = segments
            .map((segment) => {
                const escapedText = md.utils.escapeHtml(
                    segment.text
                );

                if (!segment.virtualTag) {
                    return escapedText;
                }

                return `<span class="vjs-virtual-tag" data-virtual="true">${escapedText}</span>`;
            })
            .join('');

        let html = `<span class="${className}">${content}</span>`;

        if (meta.hasSoftbreak) {
            html = `<div class="vjs-tag-line">${html}</div>`;
        }

        return html;
    };

    md.renderer.rules.vjs_virtual_tag = (
        tokens,
        idx
    ) => {
        const token = tokens[idx];

        return `<span class="vjs-virtual-tag" data-virtual="true">${md.utils.escapeHtml(token.content)}</span>`;
    };

    md.core.ruler.after(
        'inline',
        'vjs-tag-mark',
        (state) => {
            // Sort virtual tag matches by source line.
            const sortedMatches = virtualTagFile?.matchedLines ?? [];
            /*
            const sortedMatches = [
                ...(virtualTagFile?.matchedline ?? [])
            ].sort((a, b) => a - b);
            */

            let matchIndex = 0;
            state.tokens.forEach((token, index) => {
                // Keep virtual tag detection for code blocks.
                if (token.type === 'fence') {
                    const rawLang = token.info?.trim().split(/\s+/g)[0] ?? '';
                    token.meta = {
                        ...(token.meta || {}),
                        hit: {
                            virtual: rawLang
                                ? matchesPreviewVirtualTag(
                                    [rawLang],
                                    options?.highlightKeyword,
                                    options?.caseSensitive ?? false
                                )
                                : false
                        }
                    };

                    return;
                }

                if (token.type !== 'inline' || !token.children) {
                    return;
                }

                // Find virtual tag matches within this inline token's source lines.
                const tokenLineMatches = new Set<number>();

                if (token.map) {
                    const startLine = token.map[0];
                    const endLine = token.map[1];

                    while (
                        matchIndex < sortedMatches.length &&
                        sortedMatches[matchIndex] < startLine
                    ) {
                        matchIndex++;
                    }

                    let currentMatchIndex = matchIndex;

                    while (
                        currentMatchIndex < sortedMatches.length &&
                        sortedMatches[currentMatchIndex] < endLine
                    ) {
                        tokenLineMatches.add(
                            sortedMatches[currentMatchIndex]
                        );
                        currentMatchIndex++;
                    }
                }

                const hasSoftbreak = token.children.some(
                    child => child.type === 'softbreak'
                );
                const context = getTagNodeContext(state.tokens, index);
                const canProcessUserTag = context.isTagScope;
                const isHeading = context.isHeading;

                // Split inline tokens into logical lines.
                const logicalLines: {
                    start: number;
                    end: number;
                }[] = [];

                let lineStart = 0;

                for (let i = 0; i < token.children.length; i++) {
                    if (token.children[i].type === 'softbreak') {
                        logicalLines.push({
                            start: lineStart,
                            end: i
                        });

                        lineStart = i + 1;
                    }
                }

                logicalLines.push({
                    start: lineStart,
                    end: token.children.length
                });

                const appendVirtualText = (
                    content: string,
                    hasCandidate: boolean,
                    target: any[],
                    currentState: any
                ) => {
                    const segments = hasCandidate
                        ? buildTagSegments(
                            content,
                            highlightKeyword,
                            caseSensitive
                        )
                        : [{ text: content, virtualTag: false }];

                    for (const segment of segments) {
                        if (!segment.text) {
                            continue;
                        }

                        const textToken = new currentState.Token(
                            segment.virtualTag ? 'vjs_virtual_tag' : 'text',
                            '',
                            0
                        );

                        textToken.content = segment.text;
                        target.push(textToken);
                    }
                };

                const newChildren: any[] = [];
                let linkDepth = 0;

                const headingStructureValid =
                    !isHeading ||
                    hasValidHeadingTagStructure(token.children);

                for (
                    let childIndex = 0;
                    childIndex < token.children.length;
                    childIndex++
                ) {
                    const child = token.children[childIndex];

                    // Preserve link structure without virtual hit metadata.
                    // Detect virtual tag matches in link URLs.
                    if (child.type === 'link_open') {
                        const href = child.attrGet('href') ?? '';

                        child.meta = {
                            ...(child.meta || {}),
                            hit: {
                                ...(child.meta?.hit || {}),
                                virtual: matchesPreviewVirtualTag(
                                    href,
                                    highlightKeyword,
                                    caseSensitive
                                )
                            }
                        };

                        linkDepth++;
                    }

                    if (child.type === 'link_close') {
                        linkDepth = Math.max(0, linkDepth - 1);
                        newChildren.push(child);
                        continue;
                    }

                    // Preserve image tokens without virtual hit metadata.
                    // Detect virtual tag matches in image alt text and title.
                    if (child.type === 'image') {
                        const alt = child.content ?? '';
                        const title = child.attrGet('title') ?? '';

                        const isVirtualHit = matchesPreviewVirtualTag(
                            [alt, title],
                            highlightKeyword,
                            caseSensitive
                        );

                        child.meta = {
                            ...(child.meta || {}),
                            hit: {
                                ...(child.meta?.hit || {}),
                                virtual: isVirtualHit
                            }
                        };

                        newChildren.push(child);
                        continue;
                    }

                    if (child.type === 'text') {
                        const content = child.content;

                        const currentLineIndex = logicalLines.findIndex(
                            logicalLine =>
                                childIndex >= logicalLine.start &&
                                childIndex < logicalLine.end
                        );

                        const currentLine =
                            currentLineIndex >= 0
                                ? logicalLines[currentLineIndex]
                                : undefined;

                        const line = token.map && currentLineIndex >= 0
                            ? token.map[0] + currentLineIndex
                            : undefined;

                        const hasVirtualTagCandidate =
                            !!virtualTagFile &&
                            (
                                !token.map ||
                                (
                                    line !== undefined &&
                                    tokenLineMatches.has(line)
                                )
                            );

                        const isValidStructure = currentLine
                            ? isValidTagLineStructure(
                                token.children,
                                currentLine.start,
                                currentLine.end
                            )
                            : false;

                        const canCreateUserTag =
                            canProcessUserTag &&
                            (
                                isHeading
                                    ? headingStructureValid
                                    : isValidStructure
                            );

                        const canProcessTag =
                            canCreateUserTag &&
                            (
                                isTagLineValid(content, false) ||
                                (
                                    isHeading &&
                                    isParsedHeadingTagPartValid(content)
                                )
                            );

                        if (canProcessTag) {
                            const ranges = getTagRanges(content);

                            if (ranges.length > 0) {
                                let lastIndex = 0;

                                for (const range of ranges) {
                                    if (range.start > lastIndex) {
                                        appendVirtualText(
                                            content.slice(lastIndex, range.start),
                                            hasVirtualTagCandidate,
                                            newChildren,
                                            state
                                        );
                                    }

                                    const tagText = content.slice(
                                        range.start,
                                        range.end
                                    );

                                    const tagToken = new state.Token(
                                        'vjs_tag',
                                        '',
                                        0
                                    );
                                    tagToken.content = tagText;
                                    tagToken.meta = {
                                        userTag: true,
                                        heading: isHeading,
                                        hasSoftbreak: hasSoftbreak ?? false
                                    };

                                    newChildren.push(tagToken);
                                    lastIndex = range.end;
                                }

                                if (lastIndex < content.length) {
                                    appendVirtualText(
                                        content.slice(lastIndex),
                                        hasVirtualTagCandidate,
                                        newChildren,
                                        state
                                    );
                                }

                                continue;
                            }
                        }

                        appendVirtualText(
                            content,
                            hasVirtualTagCandidate,
                            newChildren,
                            state
                        );
                        continue;
                    }

                    newChildren.push(child);
                }

                token.children = newChildren;
            });
        }
    );

    return md;
}

export function getHljsThemeUrl(
    webview: vscode.Webview,
    isDark: boolean,
    extensionUri: vscode.Uri
) {
    const theme = isDark
        ? 'atom-one-dark'
        : 'atom-one-light';
    const themePath = vscode.Uri.joinPath(
        extensionUri,
        'dist',
        'webview',
        'styles',
        `${theme}.css`
    );

    return webview.asWebviewUri(themePath).toString();
}
