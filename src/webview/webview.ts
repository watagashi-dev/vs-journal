import hljs from 'highlight.js';
import { log, syslog } from './languages/log';
import asm from './languages/asm';
import shasm from './languages/shasm';
import verilog from './languages/verilog';
import vhdl from './languages/vhdl';
import makefile from './languages/makefile';

declare function acquireVsCodeApi(): any;
hljs.registerLanguage('log', log);
hljs.registerLanguage('syslog', syslog);
hljs.registerLanguage('asm', asm);
hljs.registerLanguage('shasm', shasm);
hljs.registerLanguage('verilog', verilog);
hljs.registerLanguage('vhdl', vhdl);
hljs.registerLanguage('makefile', makefile);

(function () {
    // =========================================================
    // VSCode API
    // =========================================================
    const vscode = acquireVsCodeApi();

    type VsCodeMessage =
        | { type: 'openExternal'; url: string }
        | { type: 'openLocalLink'; path: string }
        | { type: 'jumpToLine'; filePath: string; line: number; character?: number }
        | { type: 'setTaskListItem'; filePath: string; line: number; checked: boolean }
        | { type: 'jumpToFile'; filePath: string }
        | { type: 'closePreview' }
        | { type: 'edit' };

    function postMessage(msg: VsCodeMessage): void {
        vscode.postMessage(msg);
    }

    // =========================================================
    // State
    // =========================================================
    type State = {
        hideTimer: ReturnType<typeof setTimeout> | null;
        lastMouseMove: number;
        domReady: boolean;
        pendingScroll: {
            filePath: string;
            line: number;
        } | null;
    };

    const state: State = {
        hideTimer: null,
        lastMouseMove: 0,
        domReady: false,
        pendingScroll: null
    };

    const HIDE_DELAY = 1500;

    let previewFileCount = 0;

    function setPreviewFileCount(count: number): void {
        previewFileCount = count;
    }

    // =========================================================
    // DOM
    // =========================================================
    const header = document.querySelector('.edit-hint') as HTMLElement | null;

    function getFileBlock(filePath: string): HTMLElement | undefined {
        return Array.from(document.querySelectorAll<HTMLElement>('.file-block'))
            .find((el) => el.getAttribute('data-file') === filePath);
    }

    // =========================================================
    // Header
    // =========================================================
    function resetHeaderTimer(): void {
        if (!header) { return; }

        header.classList.remove('hidden');

        if (state.hideTimer) {
            clearTimeout(state.hideTimer);
        }

        state.hideTimer = setTimeout(() => {
            header.classList.add('hidden');
        }, HIDE_DELAY);
    }

    // =========================================================
    // Click
    // =========================================================
    function getCodeClickPosition(
        target: HTMLElement,
        clientX: number,
        clientY: number,
        sourceStartLine: number
    ): { line: number; character: number } | undefined {
        const lineElement = target.closest<HTMLElement>('.vjs-line');
        const lineContent = lineElement?.querySelector<HTMLElement>('.vjs-line-content');
        const code = lineElement?.parentElement;
        if (!lineElement || !lineContent || code?.tagName !== 'CODE') {
            return undefined;
        }

        const lines = Array.from(code.querySelectorAll<HTMLElement>(':scope > .vjs-line'));
        const displayedLine = lines.indexOf(lineElement);
        if (displayedLine < 0) {
            return undefined;
        }

        let character = 0;
        const doc = document as Document & {
            caretPositionFromPoint?: (x: number, y: number) => {
                offsetNode: Node;
                offset: number;
            } | null;
            caretRangeFromPoint?: (x: number, y: number) => Range | null;
        };
        const caret = doc.caretPositionFromPoint?.(clientX, clientY);
        const range = caret
            ? document.createRange()
            : doc.caretRangeFromPoint?.(clientX, clientY);

        if (caret && range && lineContent.contains(caret.offsetNode)) {
            range.setStart(lineContent, 0);
            range.setEnd(caret.offsetNode, caret.offset);
            character = range.toString().length;
        } else if (range?.startContainer && lineContent.contains(range.startContainer)) {
            const endRange = document.createRange();
            endRange.setStart(lineContent, 0);
            endRange.setEnd(range.startContainer, range.startOffset);
            character = endRange.toString().length;
        }

        return {
            line: sourceStartLine + displayedLine + 1,
            character
        };
    }

    function getApproximateTextCharacter(
        block: HTMLElement,
        clientX: number,
        clientY: number
    ): number | undefined {
        const doc = document as Document & {
            caretPositionFromPoint?: (x: number, y: number) => {
                offsetNode: Node;
                offset: number;
            } | null;
            caretRangeFromPoint?: (x: number, y: number) => Range | null;
        };
        const caret = doc.caretPositionFromPoint?.(clientX, clientY);
        const caretRange = caret
            ? undefined
            : doc.caretRangeFromPoint?.(clientX, clientY);
        const node = caret?.offsetNode ?? caretRange?.startContainer;
        const offset = caret?.offset ?? caretRange?.startOffset;
        if (!node || offset === undefined || !block.contains(node)) {
            return undefined;
        }

        const range = document.createRange();
        range.setStart(block, 0);
        range.setEnd(node, offset);
        const renderedOffset = range.toString().length;
        const renderedLength = (block.textContent ?? '').length;
        if (renderedLength === 0) {
            return 0;
        }

        const sourceLine = Number(block.getAttribute('data-start-line'));
        const fileBlock = block.closest<HTMLElement>('.file-block');
        const lineLengthsText = fileBlock?.getAttribute('data-source-line-lengths');
        if (!Number.isInteger(sourceLine) || !lineLengthsText) {
            return renderedOffset;
        }

        try {
            const lineLengths = JSON.parse(lineLengthsText) as number[];
            const sourceLength = lineLengths[sourceLine];
            if (!Number.isFinite(sourceLength)) {
                return renderedOffset;
            }

            return Math.round(
                renderedOffset / renderedLength * sourceLength
            );
        } catch {
            return renderedOffset;
        }
    }

    function handleClick(e: MouseEvent): void {
        const target = e.target as HTMLElement | null;
        if (!target) { return; }

        const checkbox = target.closest<HTMLInputElement>(
            'input.task-list-item-checkbox[type="checkbox"]'
        );
        if (checkbox) {
            const listItem = checkbox.closest<HTMLElement>('[data-start-line]');
            const file = checkbox.closest<HTMLElement>('[data-file]');
            const filePath = file?.getAttribute('data-file');
            const line = Number(listItem?.getAttribute('data-start-line'));
            if (filePath && Number.isInteger(line) && line >= 0) {
                postMessage({
                    type: 'setTaskListItem',
                    filePath,
                    line,
                    checked: checkbox.checked
                });
            }
            e.stopPropagation();
            return;
        }

        const link = target.closest('a');
        if (link) {
            const href = link.getAttribute('data-href');
            if (href) {
                e.preventDefault();

                if (
                    href.startsWith('http://') ||
                    href.startsWith('https://')
                ) {
                    postMessage({
                        type: 'openExternal',
                        url: href
                    });
                } else {
                    postMessage({
                        type: 'openLocalLink',
                        path: href
                    });
                }
            }
            return;
        }

        const blockEl = target.closest<HTMLElement>('[data-start-line]');
        if (blockEl) {
            const file = blockEl.closest('[data-file]');
            const filePath = file?.getAttribute('data-file');

            const start = Number(blockEl.getAttribute('data-start-line'));
            const end = Number(blockEl.getAttribute('data-end-line') ?? start);

            if (filePath && Number.isFinite(start)) {
                const codePosition = getCodeClickPosition(
                    target,
                    e.clientX,
                    e.clientY,
                    start
                );
                const character = codePosition?.character ??
                    getApproximateTextCharacter(blockEl, e.clientX, e.clientY) ??
                    0;
                postMessage({
                    type: 'jumpToLine',
                    filePath,
                    line: codePosition?.line ?? start,
                    character
                    // NOTE: range-based system (end currently unused for click)
                });
            }
            return;
        }

        const fileRoot = target.closest('[data-file]');
        if (fileRoot) {
            const filePath = fileRoot.getAttribute('data-file');
            if (filePath) {
                postMessage({ type: 'jumpToFile', filePath });
            }
        }
    }

    let mouseDownPosition: { x: number; y: number } | undefined;
    let suppressNextClick = false;

    function setupClickHandler(): void {
        document.body.addEventListener('mousedown', (e: MouseEvent) => {
            mouseDownPosition = {
                x: e.clientX,
                y: e.clientY
            };
            suppressNextClick = false;
        });

        document.body.addEventListener('mouseup', (e: MouseEvent) => {
            if (!mouseDownPosition) {
                return;
            }

            const dx = e.clientX - mouseDownPosition.x;
            const dy = e.clientY - mouseDownPosition.y;
            const threshold = 5;

            suppressNextClick =
                Math.sqrt(dx * dx + dy * dy) >= threshold;

            mouseDownPosition = undefined;
        });

        document.body.addEventListener('click', (e: MouseEvent) => {
            if (suppressNextClick) {
                suppressNextClick = false;
                e.preventDefault();
                e.stopPropagation();
                return;
            }

            handleClick(e);
        });
    }

    //    function setupClickHandler(): void {
    //        document.body.addEventListener('click', handleClick);
    //    }

    // =========================================================
    // Keyboard
    // =========================================================
    function setupKeyHandler(): void {
        window.addEventListener('keydown', (e) => {
            // Ctrl + Up / Down: jump between virtual tags
            if (e.ctrlKey && e.key === 'ArrowDown') {
                e.preventDefault();
                moveNext();
                return;
            }

            if (e.ctrlKey && e.key === 'ArrowUp') {
                e.preventDefault();
                movePrev();
                return;
            }

            if (e.key === 'Enter' || e.key === 'Escape') {
                if (previewFileCount > 1) {
                    postMessage({ type: 'closePreview' });
                }
                else {
                    postMessage({ type: 'edit' });
                }
            }

            if (
                ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(e.key)
            ) {
                resetHeaderTimer();
            }
        });
    }

    // =========================================================
    // Window
    // =========================================================

    let isScrollLocked = false;
    function setupWindowHandlers(): void {
        let virtualTagScrollTimer: ReturnType<typeof setTimeout> | undefined;

        window.addEventListener('scroll', resetHeaderTimer, { passive: true });
        window.addEventListener('wheel', resetHeaderTimer, { passive: true });

        window.addEventListener('scroll', () => {
            if (virtualTagScrollTimer !== undefined) {
                clearTimeout(virtualTagScrollTimer);
            }

            virtualTagScrollTimer = setTimeout(() => {
                virtualTagScrollTimer = undefined;
                if (isScrollLocked) {
                    isScrollLocked = false;
                    return;
                }
                updateCurrentVirtualTagMatch();
            }, 100);
        }, { passive: true });

        window.addEventListener('mousemove', () => {
            const now = Date.now();
            if (now - state.lastMouseMove > 200) {
                resetHeaderTimer();
                state.lastMouseMove = now;
            }
        });
    }

    // =========================================================
    // Highlight.js (including type workaround)
    // =========================================================
    function decorateCodeBlocks(): void {
        document
            .querySelectorAll<HTMLElement>('pre > code')
            .forEach(code => {
                const hasDiff =
                    code.dataset.diff === 'true';
                const hasLineNumber =
                    code.dataset.linenumber === 'true';

                const splitNode = (node: Node): DocumentFragment[] => {
                    if (node.nodeType === Node.TEXT_NODE) {
                        const parts = (node.textContent ?? '').split('\n');
                        return parts.map(part => {
                            const fragment = document.createDocumentFragment();
                            if (part !== '') {
                                fragment.appendChild(
                                    document.createTextNode(part)
                                );
                            }
                            return fragment;
                        });
                    }

                    if (node.nodeType !== Node.ELEMENT_NODE) {
                        const fragment = document.createDocumentFragment();
                        fragment.appendChild(node.cloneNode(true));
                        return [fragment];
                    }

                    const element = node as HTMLElement;
                    const childLines: DocumentFragment[] = [];

                    Array.from(element.childNodes).forEach(child => {
                        const lines = splitNode(child);

                        if (childLines.length === 0) {
                            childLines.push(...lines);
                            return;
                        }

                        childLines[childLines.length - 1].appendChild(lines[0]);

                        for (let i = 1; i < lines.length; i++) {
                            childLines.push(lines[i]);
                        }
                    });

                    if (childLines.length === 0) {
                        const fragment = document.createDocumentFragment();
                        fragment.appendChild(element.cloneNode(false));
                        return [fragment];
                    }

                    return childLines.map(line => {
                        const fragment = document.createDocumentFragment();
                        const clone = element.cloneNode(false) as HTMLElement;
                        clone.appendChild(line);
                        fragment.appendChild(clone);
                        return fragment;
                    });
                };

                const lines: DocumentFragment[] = [];

                Array.from(code.childNodes).forEach(node => {
                    const nodeLines = splitNode(node);

                    if (lines.length === 0) {
                        lines.push(...nodeLines);
                        return;
                    }

                    lines[lines.length - 1].appendChild(nodeLines[0]);

                    for (let i = 1; i < nodeLines.length; i++) {
                        lines.push(nodeLines[i]);
                    }
                });

                if (
                    lines.length > 0 &&
                    lines.at(-1)?.textContent === ''
                ) {
                    lines.pop();
                }

                const digits =
                    String(lines.length).length;

                const result = document.createDocumentFragment();

                lines.forEach((line, index) => {
                    const lineText = line.textContent ?? '';
                    let className = '';

                    if (hasDiff) {
                        if (lineText.startsWith('+')) {
                            className = 'vjs-diff-added';
                        }
                        if (lineText.startsWith('-')) {
                            className = 'vjs-diff-removed';
                        }
                    }

                    const lineElement =
                        document.createElement('span');
                    lineElement.className = 'vjs-line';

                    if (hasLineNumber) {
                        const numberElement =
                            document.createElement('span');
                        numberElement.className =
                            'vjs-line-number';
                        numberElement.textContent =
                            String(index + 1).padStart(digits, ' ');

                        lineElement.appendChild(numberElement);
                    }

                    const contentElement =
                        document.createElement('span');
                    contentElement.className =
                        'vjs-line-content' +
                        (className ? ` ${className}` : '');

                    if (line.childNodes.length === 0) {
                        contentElement.textContent = '\u200B';
                    } else {
                        contentElement.appendChild(line);
                    }

                    lineElement.appendChild(contentElement);
                    result.appendChild(lineElement);
                });

                code.replaceChildren(result);
            });
    }

    function runHighlight(): void {
        document
            .querySelectorAll<HTMLElement>('code[class*="language-"]')
            .forEach(code => {
                hljs.highlightElement(code);
            });

        document
            .querySelectorAll<HTMLElement>('.vjs-code-tab[data-language]')
            .forEach(tab => {
                const language = tab.dataset.language;

                if (language && !hljs.getLanguage(language)) {
                    tab.classList.add('vjs-code-tab-unsupported');
                }
            });

        decorateCodeBlocks();
        applyVirtualTagHighlight();
    }

    interface VirtualTagRule {
        keyword: string;
        className: string;
        caseSensitive: boolean;
    }

    function matchesRule(
        text: string,
        rule: VirtualTagRule
    ): boolean {
        if (!rule.keyword) {
            return false;
        }

        return rule.caseSensitive
            ? text.includes(rule.keyword)
            : text.toLowerCase().includes(rule.keyword.toLowerCase());
    }

    function applyCodeVirtualTags(
        rules: VirtualTagRule[]
    ): void {
        const codeBlocks = document.querySelectorAll('code');

        codeBlocks.forEach((block) => {
            const walker = document.createTreeWalker(
                block,
                NodeFilter.SHOW_TEXT,
                null
            );

            const textNodes: Text[] = [];
            let current: Node | null;

            while ((current = walker.nextNode())) {
                textNodes.push(current as Text);
            }

            textNodes.forEach((node) => {
                let text = node.nodeValue;
                if (!text) {
                    return;
                }

                let replaced = false;

                rules.forEach((rule) => {
                    const { keyword, className, caseSensitive } = rule;

                    if (!keyword) {
                        return;
                    }

                    if (caseSensitive) {
                        if (!text!.includes(keyword)) {
                            return;
                        }

                        const parts = text!.split(keyword);
                        if (parts.length <= 1) {
                            return;
                        }

                        const frag = document.createDocumentFragment();

                        parts.forEach((part, i) => {
                            if (i > 0) {
                                const span = document.createElement('span');
                                span.className = className;
                                span.dataset.virtual = 'true';
                                span.textContent = keyword;
                                frag.appendChild(span);
                            }
                            if (part) {
                                frag.appendChild(document.createTextNode(part));
                            }
                        });

                        node.parentNode?.replaceChild(frag, node);
                        replaced = true;
                    } else {
                        const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                        const regex = new RegExp(escaped, 'gi');

                        if (!regex.test(text!)) {
                            return;
                        }

                        const frag = document.createDocumentFragment();
                        let lastIndex = 0;

                        text!.replace(regex, (match, offset) => {
                            const before = text!.slice(lastIndex, offset);
                            if (before) {
                                frag.appendChild(document.createTextNode(before));
                            }

                            const span = document.createElement('span');
                            span.className = className;
                            span.dataset.virtual = 'true';
                            span.textContent = match;
                            frag.appendChild(span);

                            lastIndex = offset + match.length;
                            return match;
                        });

                        const tail = text!.slice(lastIndex);
                        if (tail) {
                            frag.appendChild(document.createTextNode(tail));
                        }

                        node.parentNode?.replaceChild(frag, node);
                        replaced = true;
                    }
                });

                if (replaced) {
                    // do nothing (node already replaced)
                }
            });
        });
    }

    function applyKatexVirtualTags(
        rules: VirtualTagRule[]
    ): void {
        document
            .querySelectorAll('annotation[encoding="application/x-tex"]')
            .forEach((annotation) => {
                const tex = annotation.textContent ?? '';

                for (const rule of rules) {
                    if (!matchesRule(tex, rule)) {
                        continue;
                    }

                    const katex = annotation.closest('.katex');

                    if (katex instanceof HTMLElement) {
                        katex.dataset.virtual = 'true';
                    }

                    break;
                }
            });
    }

    function applyVirtualTagHighlight(): void {
        const raw = document.body.dataset.rules;

        if (!raw) {
            return;
        }

        let rules: VirtualTagRule[] = [];

        try {
            rules = JSON.parse(decodeURIComponent(raw));
        } catch {
            return;
        }

        if (rules.length === 0) {
            return;
        }

        applyCodeVirtualTags(rules);
        applyKatexVirtualTags(rules);
    }

    const nav = document.getElementById('vjs-nav');
    const counter = document.getElementById('vjs-counter');
    const prevBtn = document.getElementById('vjs-prev');
    const nextBtn = document.getElementById('vjs-next');

    let currentIndex = 0;
    type VirtualTagMatchPosition = {
        filePath: string;
        line: number;
    };

    const matchesElement = document.getElementById('virtual-tag-matches');
    const virtualTagMatches: VirtualTagMatchPosition[] = matchesElement?.textContent
        ? JSON.parse(matchesElement.textContent) as VirtualTagMatchPosition[]
        : [];
    let virtualTagTotalMatches = virtualTagMatches.length;

    function navigateVirtualTagMatch(delta: number): void {
        const totalMatches = virtualTagMatches.length;
        if (totalMatches === 0) {
            return;
        }

        currentIndex = (currentIndex + delta + totalMatches) % totalMatches;

        const match = virtualTagMatches[currentIndex];
        updateUI();
        isScrollLocked = true;
        executeScrollToLine(match.filePath, match.line);
    }

    function updateUI() {
        if (!nav || !counter) { return; }

        const m = virtualTagTotalMatches;

        if (m < 1) {
            nav.classList.add('hidden');
            return;
        }

        nav.classList.remove('hidden');
        counter.textContent = `${currentIndex + 1} / ${m}`;
    }

    function updateCurrentVirtualTagMatch(): void {
        const position = getCurrentSourcePosition();
        if (!position || virtualTagMatches.length === 0) {
            return;
        }

        let nearestIndex = -1;
        let minDistance = Infinity;

        virtualTagMatches.forEach((match, index) => {
            if (match.filePath !== position.filePath) {
                return;
            }

            const distance = Math.abs(match.line - position.line);
            if (distance < minDistance) {
                minDistance = distance;
                nearestIndex = index;
            }
        });

        if (nearestIndex >= 0 && nearestIndex !== currentIndex) {
            currentIndex = nearestIndex;
            updateUI();
        }
    }

    function moveNext() {
        navigateVirtualTagMatch(1);
    }

    function movePrev() {
        navigateVirtualTagMatch(-1);
    }

    function setupNavButtons() {
        if (nav) {
            nav.addEventListener('click', (e) => {
                e.stopPropagation();
            });
        }

        if (prevBtn) {
            prevBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                movePrev();
            });
        }

        if (nextBtn) {
            nextBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                moveNext();
            });
        }
    }

    function executeScrollToLine(
        filePath: string,
        line: number
    ): void {
        const fileBlock = getFileBlock(filePath);

        if (!fileBlock) {
            return;
        }

        const elements = Array.from(
            fileBlock.querySelectorAll<HTMLElement>(
                "[data-start-line]"
            )
        );

        let target: HTMLElement | null = null;
        let targetStart = 0;
        let targetEnd = 0;

        let nearest: HTMLElement | null = null;
        let nearestStart = 0;
        let nearestEnd = 0;
        let nearestDistance = Number.MAX_SAFE_INTEGER;

        for (const el of elements) {
            const start = Number(el.getAttribute("data-start-line"));
            const end = Number(
                el.getAttribute("data-end-line")
                ?? el.getAttribute("data-start-line")
            );

            if (line >= start && line <= end) {
                target = el;
                targetStart = start;
                targetEnd = end;
                break;
            }

            const distance =
                line < start
                    ? start - line
                    : line - end;

            if (distance < nearestDistance) {
                nearestDistance = distance;
                nearest = el;
                nearestStart = start;
                nearestEnd = end;
            }
        }

        if (!target) {
            target = nearest;
            targetStart = nearestStart;
            targetEnd = nearestEnd;
        }

        if (!target) {
            return;
        }

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                const range =
                    Math.max(
                        1,
                        targetEnd - targetStart
                    );

                const ratio =
                    Math.max(
                        0,
                        Math.min(
                            1,
                            (line - targetStart) / range
                        )
                    );

                const container =
                    document.scrollingElement
                    ?? document.documentElement;

                const rect =
                    target.getBoundingClientRect();

                const targetTop =
                    rect.top +
                    container.scrollTop;

                const offset =
                    target.offsetHeight * ratio;

                container.scrollTo({
                    top:
                        targetTop +
                        offset -
                        (window.innerHeight / 2),
                    behavior: 'auto'
                });
            });
        });
    }

    function getCurrentSourcePosition(): {
        filePath: string;
        line: number;
    } | undefined {
        const container =
            document.scrollingElement ??
            document.documentElement;

        const viewportY =
            container.scrollTop +
            window.innerHeight / 2;

        const fileBlocks = Array.from(
            document.querySelectorAll<HTMLElement>(
                '[data-file]'
            )
        );

        let nearestPosition: {
            filePath: string;
            line: number;
            distance: number;
        } | undefined;

        for (const fileBlock of fileBlocks) {
            const filePath =
                fileBlock.getAttribute('data-file');

            if (!filePath) {
                continue;
            }

            const elements = Array.from(
                fileBlock.querySelectorAll<HTMLElement>(
                    '[data-start-line]'
                )
            );

            for (const el of elements) {
                const start = Number(
                    el.getAttribute('data-start-line')
                );
                const end = Number(
                    el.getAttribute('data-end-line')
                    ?? el.getAttribute('data-start-line')
                );

                if (
                    !Number.isFinite(start) ||
                    !Number.isFinite(end)
                ) {
                    continue;
                }

                const rect = el.getBoundingClientRect();

                const top =
                    rect.top + container.scrollTop;
                const bottom =
                    rect.bottom + container.scrollTop;

                const distance =
                    viewportY < top
                        ? top - viewportY
                        : viewportY > bottom
                            ? viewportY - bottom
                            : 0;

                if (
                    viewportY < top ||
                    viewportY > bottom
                ) {
                    if (
                        !nearestPosition ||
                        distance < nearestPosition.distance
                    ) {
                        nearestPosition = {
                            filePath,
                            line: viewportY < top ? start : end - 1,
                            distance
                        };
                    }
                    continue;
                }

                const height = Math.max(1, rect.height);
                const ratio =
                    Math.max(
                        0,
                        Math.min(
                            1,
                            (viewportY - top) / height
                        )
                    );

                const lineCount =
                    Math.max(1, end - start);

                const line =
                    start +
                    Math.min(
                        lineCount - 1,
                        Math.floor(ratio * lineCount)
                    );

                return {
                    filePath,
                    line
                };
            }
        }

        if (nearestPosition) {
            return {
                filePath: nearestPosition.filePath,
                line: nearestPosition.line
            };
        }
        return undefined;
    }

    let highlightElements: HTMLElement[] = [];

    // Handle theme changes (this was often lost in the old code)
    function setupMessageHandler(): void {
        window.addEventListener('message', (event) => {
            const msg = event.data;

            if (msg?.type === 'themeChanged') {
                const link = document.getElementById('hljs-theme') as HTMLLinkElement | null;
                if (link && msg.themeUrl) {
                    link.href = msg.themeUrl;
                }
            }

            if (msg?.type === 'scrollToTop') {
                window.scrollTo({ top: 0, behavior: 'auto' });
            }

            if (msg?.type === 'scrollToLine') {
                if (!state.domReady) {
                    state.pendingScroll = {
                        filePath: msg.filePath,
                        line: msg.line
                    };
                    return;
                }

                executeScrollToLine(
                    msg.filePath,
                    msg.line
                );
            }

            if (msg.type === 'setPreviewCount') {
                setPreviewFileCount(msg.count);
                return;
            }
        });
    }

    // =========================================================
    // Warning animation
    // =========================================================
    function initWarningBehavior(): void {
        const warning = document.querySelector('.vjs-limit-warning');
        if (!warning) { return; }

        const observer = new IntersectionObserver((entries) => {
            for (const entry of entries) {
                if (entry.isIntersecting) {
                    requestAnimationFrame(() => {
                        warning.classList.add('show');
                    });
                    observer.disconnect();
                }
            }
        }, { threshold: 0.3 });

        observer.observe(warning);
    }

    function refreshVirtualTagMatches() {
        highlightElements = Array.from(
            document.querySelectorAll('[data-virtual="true"]')
        ) as HTMLElement[];

        currentIndex = 0;
    }

    function initializeVirtualTagNavigation() {
        refreshVirtualTagMatches();
        updateUI();
    }

    // =========================================================
    // Init
    // =========================================================
    function init(): void {
        setupClickHandler();
        setupKeyHandler();
        setupWindowHandlers();
        setupMessageHandler();
        setupNavButtons();
        initWarningBehavior();
    }

    function start() {
        init();
        runHighlight();

        state.domReady = true;

        if (state.domReady) {
            initializeVirtualTagNavigation();
        }

        if (state.pendingScroll) {
            const scroll = state.pendingScroll;
            state.pendingScroll = null;

            setTimeout(() => {
                executeScrollToLine(
                    scroll.filePath,
                    scroll.line
                );
            }, 100);
        }
    }

    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();
