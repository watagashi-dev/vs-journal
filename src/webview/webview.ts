declare function acquireVsCodeApi(): any;

(function () {
    // =========================================================
    // VSCode API
    // =========================================================
    const vscode = acquireVsCodeApi();

    type VsCodeMessage =
        | { type: 'openExternal'; url: string }
        | { type: 'openLocalLink'; path: string }
        | { type: 'jumpToLine'; filePath: string; line: number }
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
    function handleClick(e: MouseEvent): void {
        const target = e.target as HTMLElement | null;
        if (!target) { return; }

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

        const blockEl = target.closest('[data-start-line]');
        if (blockEl) {
            const file = blockEl.closest('[data-file]');
            const filePath = file?.getAttribute('data-file');

            const start = Number(blockEl.getAttribute('data-start-line'));
            const end = Number(blockEl.getAttribute('data-end-line') ?? start);

            if (filePath && Number.isFinite(start)) {
                postMessage({
                    type: 'jumpToLine',
                    filePath,
                    line: start
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

    function setupClickHandler(): void {
        document.body.addEventListener('click', handleClick);
    }

    // =========================================================
    // Keyboard
    // =========================================================
    function setupKeyHandler(): void {
        window.addEventListener('keydown', (e) => {
            // Ctrl + ↑ / ↓ → 仮想タグジャンプ
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
    function setupWindowHandlers(): void {
        window.addEventListener('scroll', updateCurrentIndexFromScroll, { passive: true });
        window.addEventListener('scroll', resetHeaderTimer, { passive: true });
        window.addEventListener('wheel', resetHeaderTimer, { passive: true });

        window.addEventListener('mousemove', () => {
            const now = Date.now();
            if (now - state.lastMouseMove > 200) {
                resetHeaderTimer();
                state.lastMouseMove = now;
            }
        });
    }

    // =========================================================
    // Highlight.js（型問題回避込み）
    // =========================================================
    function decorateCodeBlocks(): void {
        document
            .querySelectorAll<HTMLElement>('pre > code')
            .forEach(code => {
                const lines = code.innerHTML.split('\n');
                if (lines.length > 0 && lines.at(-1) === '') {
                    lines.pop();
                }
                const hasDiff =
                    code.dataset.diff === 'true';
                const hasLineNumber =
                    code.dataset.linenumber === 'true';

                const digits =
                    String(lines.length).length;
                code.innerHTML = lines.map((line, index) => {
                    let className = '';
                    if (hasDiff) {
                        if (line.startsWith('+')) {
                            className = `vjs-diff-added`;
                        }
                        if (line.startsWith('-')) {
                            className = `vjs-diff-removed`;
                        }
                    }

                    if (hasLineNumber) {
                        const lineClass = className ? ` ${className}` : '';

                        line =
                            `<span class="vjs-line"><span class="vjs-line-number">${String(index + 1).padStart(digits, ' ')}</span><span class="vjs-line-content${lineClass}">${line}</span></span>`;
                    } else {
                        const lineClass = className ? ` ${className}` : '';
                        const content = line === '' ? '&#8203;' : line;

                        line =
                            `<span class="vjs-line"><span class="vjs-line-content${lineClass}">${content}</span></span>`;
                    }
                    return line;
                    //}).join(hasLineNumber ? '' : '\n');
                }).join('');
            });
    }

    function runHighlight(): void {
        const hljs = (window as any).hljs;
        if (!hljs) { return; }
        hljs.highlightAll();
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

    function updateUI() {
        if (!nav || !counter) { return; }

        const m = highlightElements.length;

        if (m < 1) {
            nav.classList.add('hidden');
            return;
        }

        nav.classList.remove('hidden');
        counter.textContent = `${currentIndex + 1} / ${m}`;
    }

    let lockedTargetIndex: number | null = null;

    function scrollToMatch(index: number) {
        const el = highlightElements[index];
        if (!el) { return; }

        lockedTargetIndex = index;

        const rect = el.getBoundingClientRect();
        const top = window.scrollY + rect.top - 80;

        window.scrollTo({
            top,
            behavior: 'smooth'
        });
    }

    function updateCurrentIndexFromScroll() {
        if (!highlightElements.length) {
            return;
        }

        if (lockedTargetIndex !== null) {
            const el = highlightElements[lockedTargetIndex];
            if (!el) {
                return;
            }

            const rect = el.getBoundingClientRect();
            const visible =
                rect.top < window.innerHeight &&
                rect.bottom > 0;

            if (visible) {
                currentIndex = lockedTargetIndex;
                lockedTargetIndex = null;
                updateUI();
            }

            return;
        }

        // ===== 通常スクロール時 =====

        const currentEl = highlightElements[currentIndex];

        // 今のがまだ見えてるなら何もしない
        if (currentEl) {
            const rect = currentEl.getBoundingClientRect();
            const visible =
                rect.top < window.innerHeight &&
                rect.bottom > 0;

            if (visible) {
                return;
            }
        }

        const center = window.innerHeight / 2;

        let closestIndex = currentIndex;
        let minDistance = Infinity;

        highlightElements.forEach((el, index) => {
            const rect = el.getBoundingClientRect();
            const elCenter = rect.top + rect.height / 2;

            const dist = Math.abs(elCenter - center);

            if (dist < minDistance) {
                minDistance = dist;
                closestIndex = index;
            }
        });

        if (closestIndex !== currentIndex) {
            currentIndex = closestIndex;
            updateUI();
        }
    }

    function moveNext() {
        if (highlightElements.length === 0) { return; }

        let nextIndex = currentIndex;

        const currentEl = highlightElements[currentIndex];
        if (currentEl) {
            const rect = currentEl.getBoundingClientRect();
            const threshold = window.innerHeight * 0.9;

            if (rect.top <= threshold) {
                nextIndex = (currentIndex + 1) % highlightElements.length;
            }
        }
        currentIndex = nextIndex;
        scrollToMatch(currentIndex);
        updateUI();
    }

    function movePrev() {
        if (highlightElements.length === 0) { return; }

        let prevIndex = currentIndex;

        const currentEl = highlightElements[currentIndex];
        if (currentEl) {
            const rect = currentEl.getBoundingClientRect();
            const threshold = window.innerHeight * 0.1;

            if (rect.top < threshold) {
                prevIndex =
                    (currentIndex - 1 + highlightElements.length) %
                    highlightElements.length;
            }
        }

        currentIndex = prevIndex;

        scrollToMatch(currentIndex);
        updateUI();
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

    let highlightElements: HTMLElement[] = [];

    // theme変更対応（旧コードで消えがちな部分）
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
