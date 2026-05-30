import * as vscode from 'vscode';
import MarkdownIt from 'markdown-it';
import taskLists from 'markdown-it-task-lists';

import {
    getTagRangesForDisplay,
    isTaggableTextToken,
} from '../services/tagLogic';

export function createMarkdownIt(webview: vscode.Webview, baseUri: vscode.Uri | undefined) {
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

    const addLineAttr = (tokens: any[], idx: number, env: any) => {
        const token = tokens[idx];
        if (!token.map) {
            return;
        }
        const line = token.map[0];
        if (!token.attrGet("data-line")) {
            token.attrSet("data-line", String(line));
        }
        token.attrJoin("class", "vjs-line");
    };

    md.renderer.rules.table_open = (tokens, idx, options, env, self) => {
        const token = tokens[idx];

        // Existing processing (adding line numbers, etc.)
        addLineAttr(tokens, idx, env);

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
        addLineAttr(tokens, idx, env);
        return self.renderToken(tokens, idx, options);
    };
    md.renderer.rules.tbody_open = (tokens, idx, options, env, self) => {
        addLineAttr(tokens, idx, env);
        return self.renderToken(tokens, idx, options);
    };

    const defaultFence = md.renderer.rules.fence;
    md.renderer.rules.fence = (tokens, idx, options, env, self) => {
        const token = tokens[idx];
        if (token.map) {
            token.attrSet("data-line", String(token.map[0]));
            token.attrJoin("class", "vjs-line");
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
            const line = token.map[0];
            let attr = `data-line="${line}" class="vjs-line"`;
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

                if (/^https?:\/\//.test(href)) {
                    // Remove href
                    token.attrs.splice(hrefIndex, 1);

                    // Replace with data-href
                    token.attrPush(["data-href", href]);
                }
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

        return applyRules(
            escaped,
            rules
        );
    };

    md.renderer.rules.vjs_tag = (
        tokens,
        idx
    ) => {
        const token = tokens[idx];

        const className =
            token.meta?.heading
                ? 'vjs-heading-tag'
                : 'vjs-user-tag';
        return `
<span class="${className}">
${token.content}
</span>
`;
    };

    md.core.ruler.after(
        'inline',
        'vjs-tag-mark',
        (state) => {

            state.tokens.forEach((token, index) => {

                if (token.type !== 'inline') {
                    return;
                }
                const prevType = state.tokens[index - 1]?.type;
                const isHeading =
                    prevType === 'heading_open';

                // table除外
                if (
                    prevType === 'td_open' ||
                    prevType === 'th_open'
                ) {
                    return;
                }

                // list除外
                if (
                    prevType === 'paragraph_open' &&
                    state.tokens[index - 2]?.type === 'list_item_open'
                ) {
                    return;
                }

                if (!token.content.includes('#')) {
                    return;
                }
                // -----------------------------
                // B FULL MODEL: AST-aware inline processing
                // -----------------------------

                const content = token.content;

                const context = {
                    isHeading: isHeading
                };

                // NOTE:
                // unsafe structure detection is now delegated to tagLogic
                const valid = isTaggableTextToken(
                    content,
                    context
                );

                if (!valid) {
                    return;
                }

                const ranges = getTagRangesForDisplay(content);

                if (ranges.length === 0) {
                    return;
                }

                const newTokens: any[] = [];

                let lastIndex = 0;

                for (const range of ranges) {

                    const before = content.slice(
                        lastIndex,
                        range.start
                    );

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

                    const tagText = content.slice(
                        range.start,
                        range.end
                    );

                    const tagToken =
                        new state.Token(
                            'vjs_tag',
                            '',
                            0
                        );

                    tagToken.content = tagText;

                    tagToken.meta = {
                        userTag: true,
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

                // FULL REPLACE MODE (no cildren mutation)
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
