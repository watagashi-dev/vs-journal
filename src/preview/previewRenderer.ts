import * as vscode from 'vscode';
import MarkdownIt from 'markdown-it';
import taskLists from 'markdown-it-task-lists';

import {
    getTagRanges,
    getTagNodeContext
} from '../services/tagLogic';
import {
    matchesPreviewVirtualTag,
    buildTagSegments
} from '../services/virtualTagService';

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
        const hit = token.meta?.hit;

        if (hit?.virtual) {
            token.attrJoin("class", "vjs-virtual-image-hit");
            token.attrSet("data-virtual", "true");
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
                let href = token.attrs[hrefIndex][1];
                href = decodeURIComponent(href);

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

    md.renderer.rules.vjs_text_span = (tokens, idx) => {
        const token = tokens[idx];
        const cls = token.meta?.className ?? '';
        return `<span class="${cls}" data-virtual="true">${token.content}</span>`;
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
<span class="${baseClassName} data-virtual="true">
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
                    return `<span class="vjs-virtual-tag" data-virtual="true">${segment.text}</span>`;
                }

                return segment.text;
            })
            .join('');

        const html = `
<span class="${baseClassName} data-virtual="true">
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
                if (token.type !== 'inline' || !token.children) {
                    return;
                }

                const context = getTagNodeContext(state.tokens, index);
                if (!context.isTarget) {
                    return;
                }

                const isHeading = context.isHeading;
                const rules = state.env?.rules ?? [];
                const newChildren: any[] = [];

                for (const child of token.children) {
                    // ======================================================
                    // ① LINK / IMAGE META
                    // ======================================================
                    if (child.type === 'link_open') {
                        const hrefIndex = child.attrIndex("href");
                        const href =
                            hrefIndex >= 0
                                ? (child.attrs?.[hrefIndex]?.[1] ?? '')
                                : '';
                        const title = child.attrGet('title') ?? '';

                        child.meta = {
                            ...(child.meta || {}),
                            hit: {
                                virtual: matchesPreviewVirtualTag(
                                    [href, title],
                                    options?.highlightKeyword,
                                    options?.caseSensitive ?? false
                                )
                            }
                        };

                        newChildren.push(child);
                        continue;
                    }

                    if (child.type === 'image') {
                        const src = child.attrGet("src") ?? '';
                        const alt = child.content ?? '';
                        const title = child.attrGet("title") ?? '';

                        child.meta = {
                            ...(child.meta || {}),
                            hit: {
                                virtual: matchesPreviewVirtualTag(
                                    [src, alt, title],
                                    options?.highlightKeyword,
                                    options?.caseSensitive ?? false
                                )
                            }
                        };

                        newChildren.push(child);
                        continue;
                    }

                    // ======================================================
                    // ② TAG生成（構造変換）
                    // ======================================================
                    if (child.type === 'text') {
                        const content = child.content;
                        const ranges = getTagRanges(content);

                        if (ranges.length > 0) {
                            let lastIndex = 0;
                            for (const range of ranges) {
                                const before = content.slice(lastIndex, range.start);
                                if (before) {
                                    const t = new state.Token('text', '', 0);
                                    t.content = before;
                                    newChildren.push(t);
                                }

                                const tagText = content.slice(range.start, range.end);
                                const tagToken = new state.Token('vjs_tag', '', 0);
                                tagToken.content = tagText;

                                tagToken.meta = {
                                    userTag: true,
                                    heading: isHeading,

                                    virtualTag: matchesPreviewVirtualTag(
                                        tagText.slice(1),
                                        options?.highlightKeyword,
                                        options?.caseSensitive ?? false
                                    ),

                                    segments: buildTagSegments(
                                        tagText,
                                        options?.highlightKeyword,
                                        options?.caseSensitive ?? false
                                    )
                                };

                                newChildren.push(tagToken);
                                lastIndex = range.end;
                            }

                            const tail = content.slice(lastIndex);
                            if (tail) {
                                const t = new state.Token('text', '', 0);
                                t.content = tail;
                                newChildren.push(t);
                            }

                            continue;
                        }
                    }

                    // ======================================================
                    // ③ TEXT HIGHLIGHT
                    // ======================================================
                    if (child.type === 'text') {
                        const text = child.content;
                        let lastIndex = 0;
                        const segments: any[] = [];

                        for (const rule of rules) {
                            const { keyword, className, caseSensitive } = rule;
                            if (!keyword) {
                                continue;
                            }

                            const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                            const regex = caseSensitive
                                ? new RegExp(escaped, 'g')
                                : new RegExp(escaped, 'gi');

                            let match;
                            while ((match = regex.exec(text)) !== null) {
                                const before = text.slice(lastIndex, match.index);
                                if (before) {
                                    const t = new state.Token('text', '', 0);
                                    t.content = before;
                                    segments.push(t);
                                }
                                const span = new state.Token('vjs_text_span', '', 0);
                                span.content = match[0];
                                span.meta = { className };
                                segments.push(span);

                                lastIndex = match.index + match[0].length;
                            }
                        }

                        const tail = text.slice(lastIndex);

                        if (tail) {
                            const t = new state.Token('text', '', 0);
                            t.content = tail;
                            segments.push(t);
                        }

                        newChildren.push(...segments);
                        continue;
                    }

                    // ======================================================
                    // ④ その他
                    // ======================================================
                    newChildren.push(child);
                }

                token.children = newChildren;
            });
        }
    );

    return md;
}

export function getHljsThemeUrl(isDark: boolean) {
    const theme = isDark ? 'vs2015' : 'vs';
    return `https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.8.0/styles/${theme}.min.css`;
}
