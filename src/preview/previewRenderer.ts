import * as vscode from 'vscode';
import MarkdownIt from 'markdown-it';
import taskLists from 'markdown-it-task-lists';

import {
    getTagRanges,
    getTagNodeContext,
    isTaggableTextToken
} from '../services/tagLogic';
import {
    matchesPreviewVirtualTag,
    buildTagSegments
} from '../services/virtualTagService';

export function createMarkdownIt(
    webview: vscode.Webview,
    baseUri: vscode.Uri | undefined,
    options?: {
        caseSensitive: boolean;
        highlightKeyword: string | undefined;
    }
) {
    const highlightKeyword =
        options?.highlightKeyword;

    const caseSensitive =
        options?.caseSensitive ?? false;

    const md = new MarkdownIt({
        html: true,
        linkify: true,
        typographer: true
    }).use(taskLists, {
        enabled: false,
        label: false,
        labelAfter: false
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
        const alt = token.content ?? '';

        const hit =
            matchesPreviewVirtualTag(
                src ?? '',
                highlightKeyword,
                caseSensitive
            )
            ||
            matchesPreviewVirtualTag(
                alt,
                highlightKeyword,
                caseSensitive
            );

        if (hit) {
            token.attrJoin(
                'class',
                'vjs-virtual-image-hit'
            );
        }
        if (!src) {
            return defaultImageRule ? defaultImageRule(tokens, idx, options, env, self) : "";
        }
        // Keep as is if it's an external URL
        if (src.startsWith("http://") || src.startsWith("https://")) {
            return defaultImageRule ? defaultImageRule(tokens, idx, options, env, self) : self.renderToken(tokens, idx, options);
        }
        if (baseUri) {
            try {
                const imageUri = vscode.Uri.joinPath(baseUri, "..", src);
                const webviewUri = webview.asWebviewUri(imageUri);
                token.attrSet("src", webviewUri.toString());
            } catch {
                return "";
            }
        }
        return defaultImageRule ? defaultImageRule(tokens, idx, options, env, self) : self.renderToken(tokens, idx, options);
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
        if (token.info) {
            const lang = token.info.trim().split(/\s+/g)[0];
            token.attrJoin("class", `language-${lang}`);
        }
        return defaultFence ? defaultFence(tokens, idx, options, env, self) : self.renderToken(tokens, idx, options);
    };

    const defaultHtmlBlock = md.renderer.rules.html_block;
    md.renderer.rules.html_block = (tokens, idx, options, env, self) => {
        const token = tokens[idx];
        let html = token.content;
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
                const href = token.attrs[hrefIndex][1];
                if (
                    matchesPreviewVirtualTag(
                        href,
                        highlightKeyword,
                        caseSensitive
                    )
                ) {
                    token.attrJoin(
                        "class",
                        "vjs-virtual-link-hit"
                    );
                }
                // Convert ALL links to data-href
                token.attrs.splice(hrefIndex, 1);
                token.attrPush(["data-href", href]);
            }
        }

        return defaultLinkOpen(tokens, idx, options, env, self);
    };

    function applyRules(
        text: string,
        rules: Array<{
            keyword: string;
            className: string;
            caseSensitive: boolean;
        }>
    ): string {
        if (!rules || rules.length === 0) {
            return text;
        }

        let result = text;

        rules.forEach((rule) => {
            const { keyword, className, caseSensitive } = rule;
            // DEBUG: tag系は将来的に削除対象
            if (className.includes('vjs-')) {
                console.log('[applyRules TAG DETECTED]', keyword, className);
            }

            if (!keyword) {
                return;
            }

            const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

            if (caseSensitive) {
                result = result.split(keyword).join(
                    `<span class="${className}">${keyword}</span>`
                );
            } else {
                const regex = new RegExp(escapedKeyword, 'gi');
                result = result.replace(regex, (match) =>
                    `<span class="${className}">${match}</span>`
                );
            }
        });

        return result;
    };

    md.renderer.rules.text = (
        tokens,
        idx,
        options,
        env
    ) => {

        const token = tokens[idx];
        const content: string = token.content;

        if (!content) {
            return '';
        }

        const escapeHtml = (str: string) =>
            str
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;");

        const rules = env?.rules ?? [];

        const escaped =
            escapeHtml(content);

        const result = applyRules(escaped, rules);
        return result;
    };

    md.renderer.rules.vjs_tag = (
        tokens,
        idx
    ) => {
        const token = tokens[idx];

        const meta = token.meta || {};

        const baseClassName = meta.heading
            ? 'vjs-heading-tag'
            : 'vjs-user-tag';

        const segments = meta.segments;

        if (!segments) {
            return `
<span class="${baseClassName}">
${token.content}
</span>
`;
        }

        const innerHtml = segments
            .map((segment: {
                text: string;
                virtualTag: boolean;
            }) => {
                if (segment.virtualTag) {
                    return `<span class="vjs-virtual-tag">${segment.text}</span>`;
                }

                return segment.text;
            })
            .join('');

        const html = `
<span class="${baseClassName}">
${innerHtml}
</span>
`;

        return html;
    };

    md.core.ruler.after(
        'inline',
        'vjs-tag-mark',
        (state) => {
            state.tokens.forEach((token, index) => {
                if (token.type !== 'inline') {
                    return;
                }

                const context = getTagNodeContext(state.tokens, index);
                if (!context.isTarget) {
                    return;
                }

                const isHeading = context.isHeading;
                if (!token.content.includes('#')) {
                    return;
                }

                // -----------------------------
                // AST-aware inline processing
                // -----------------------------
                const content = token.content;
                if (!isTaggableTextToken(content, context)) {
                    return;
                }

                const ranges = getTagRanges(content);
                if (ranges.length === 0) {
                    return;
                }

                const newTokens: any[] = [];

                let lastIndex = 0;

                for (const range of ranges) {
                    const before = content.slice(lastIndex, range.start);

                    if (before) {
                        const beforeToken =
                            new state.Token(
                                'text',
                                '',
                                0
                            );

                        beforeToken.content = before;
                        newTokens.push(beforeToken);
                    }

                    const tagText = content.slice(range.start, range.end);
                    const tagToken =
                        new state.Token(
                            'vjs_tag',
                            '',
                            0
                        );

                    tagToken.content = tagText;
                    tagToken.meta = {
                        userTag: true,
                        virtualTag: matchesPreviewVirtualTag(
                            tagText.slice(1),
                            options?.highlightKeyword,
                            options?.caseSensitive ?? false
                        ),
                        segments: buildTagSegments(
                            tagText,
                            options?.highlightKeyword,
                            options?.caseSensitive ?? false
                        ),
                        heading: isHeading
                    };
                    newTokens.push(tagToken);

                    lastIndex = range.end;
                }

                const tail = content.slice(lastIndex);

                if (tail) {
                    const tailToken =
                        new state.Token(
                            'text',
                            '',
                            0
                        );

                    tailToken.content = tail;
                    newTokens.push(tailToken);
                }

                // FULL REPLACE MODE (no children mutation)
                token.children = newTokens;
            });
        }
    );

    return md;
}

export function getHljsThemeUrl(isDark: boolean) {
    const theme = isDark ? 'vs2015' : 'vs';
    return `https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.8.0/styles/${theme}.min.css`;
}
