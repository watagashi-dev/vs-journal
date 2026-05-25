declare function acquireVsCodeApi(): any;
const VIRTUAL_TAG = document.body.getAttribute('data-virtual-tag') ?? '';

(function () {
    // =========================================================
    // VSCode API
    // =========================================================
    const vscode = acquireVsCodeApi();

    type VsCodeMessage =
        | { type: 'openExternal'; url: string }
        | { type: 'jumpToLine'; filePath: string; line: number }
        | { type: 'jumpToFile'; filePath: string }
        | { type: 'closePreview' }
        | { type: 'edit' };

    type VirtualMatch = {
        filePath: string;
        line: number;
        start: number;
        end: number;
    };

    function postMessage(msg: VsCodeMessage): void {
        vscode.postMessage(msg);
    }

    // =========================================================
    // State
    // =========================================================
    type State = {
        hideTimer: ReturnType<typeof setTimeout> | null;
        lastMouseMove: number;
    };

    const state: State = {
        hideTimer: null,
        lastMouseMove: 0
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

    function getLineElement(fileBlock: Element, line: number): HTMLElement | null {
        return fileBlock.querySelector<HTMLElement>(
            `.vjs-line[data-line="${line}"]`
        );
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
            if (href?.startsWith('http')) {
                e.preventDefault();
                postMessage({ type: 'openExternal', url: href });
            }
            return;
        }

        const lineEl = target.closest('.vjs-line');
        if (lineEl) {
            const lineStr = lineEl.getAttribute('data-line');
            const file = lineEl.closest('[data-file]');
            const filePath = file?.getAttribute('data-file');

            if (lineStr && filePath) {
                postMessage({
                    type: 'jumpToLine',
                    filePath,
                    line: parseInt(lineStr, 10)
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
    function runHighlight(): void {
        const hljs = (window as any).hljs;
        if (!hljs) { return; }
        hljs.highlightAll();
        applyVirtualTagHighlight();
    }

    function applyVirtualTagHighlight(): void {
        const raw = document.body.dataset.rules;
        if (!raw) {
            return;
        }

        let rules: Array<{
            keyword: string;
            className: string;
            caseSensitive: boolean;
        }> = [];

        try {
            rules = JSON.parse(decodeURIComponent(raw));
        } catch {
            return;
        }

        if (!rules || rules.length === 0) {
            return;
        }

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

    const nav = document.getElementById('vjs-nav');
    const counter = document.getElementById('vjs-counter');
    const prevBtn = document.getElementById('vjs-prev');
    const nextBtn = document.getElementById('vjs-next');

    let matches: VirtualMatch[] = [];
    let currentIndex = 0;

    function updateUI() {
        if (!nav || !counter) { return; }

        const m = matches.length;

        if (m < 2) {
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
        if (!highlightElements.length) return;

        if (lockedTargetIndex !== null) {
            const el = highlightElements[lockedTargetIndex];
            if (!el) return;

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

            if (visible) return;
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
        if (matches.length === 0) { return; }

        currentIndex = (currentIndex + 1) % matches.length;
        scrollToMatch(currentIndex);
        updateUI();
    }

    function movePrev() {
        if (matches.length === 0) { return; }

        currentIndex =
            (currentIndex - 1 + matches.length) % matches.length;

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

    let highlightElements: HTMLElement[] = [];

    // theme変更対応（旧コードで消えがちな部分）
    function setupMessageHandler(): void {
        window.addEventListener('message', (event) => {
            const msg = event.data;

            if (msg?.type === 'themeChanged') {
                const link = document.getElementById('hljs-theme') as HTMLLinkElement | null;
                if (link && msg.themeUrl) {
                    link.href = msg.themeUrl;
                    runHighlight();
                }
            }

            if (msg?.type === 'scrollToTop') {
                window.scrollTo({ top: 0, behavior: 'auto' });
            }

            if (msg?.type === 'scrollToLine') {
                const fileBlock = getFileBlock(msg.filePath);
                const target = fileBlock && getLineElement(fileBlock, msg.line);

                target?.scrollIntoView({ block: 'center' });
            }

            if (msg.type === 'setPreviewCount') {
                setPreviewFileCount(msg.count);
                return;
            }

            if (msg.type === 'setMatches') {
                matches = msg.matches || [];
                currentIndex = 0;
                highlightElements = Array.from(
                    document.querySelectorAll('.vjs-virtual-tag')
                ) as HTMLElement[];
                updateUI();
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
    }

    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();
