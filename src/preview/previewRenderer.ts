import * as vscode from 'vscode';
import MarkdownIt from 'markdown-it';

export function createMarkdownIt(webview: vscode.Webview, baseUri: vscode.Uri | undefined) {
    const md = new MarkdownIt({
        html: true,
        linkify: true,
        typographer: true
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
        if (!src || !baseUri) {
            return defaultImageRule ? defaultImageRule(tokens, idx, options, env, self) : "";
        }

        try {
            const imageUri = vscode.Uri.joinPath(baseUri, "..", src);
            const webviewUri = webview.asWebviewUri(imageUri);
            token.attrSet("src", webviewUri.toString());
        } catch {
            return "";
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
        addLineAttr(tokens, idx, env);
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
                    // href 削除
                    token.attrs.splice(hrefIndex, 1);

                    // data-href に置き換え
                    token.attrPush(["data-href", href]);
                }
            }
        }

        return defaultLinkOpen(tokens, idx, options, env, self);
    };

    return md;
}

export function getHljsThemeUrl(isDark: boolean) {
    const theme = isDark ? 'vs2015' : 'vs';
    return `https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.8.0/styles/${theme}.min.css`;
}
