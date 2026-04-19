declare function acquireVsCodeApi(): any;

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
    }

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
        initWarningBehavior();
    }

    init();

    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', runHighlight);
    } else {
        runHighlight();
    }
})();
